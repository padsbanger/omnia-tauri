mod client;
mod crypto;
mod settings;
use crate::{runtime::Native, security};
use rand::RngCore;
use serde::Serialize;
use std::time::{Duration, Instant};
use tauri::Manager;
use zeroize::Zeroizing;

#[derive(Default)]
pub struct Vault {
    revision: u64,
    session: Option<Session>,
    selection: Option<Target>,
    busy: bool,
}
struct Session {
    owner: String,
    until: Instant,
    vault: client::OpenVault,
}
struct Target {
    ticket: String,
    label: String,
    url: String,
    owner: String,
    until: Instant,
}
#[derive(Default)]
pub struct Service(pub tokio::sync::Mutex<Vault>);
impl Vault {
    pub fn lock(&mut self) {
        self.revision = self.revision.wrapping_add(1);
        self.session = None;
        self.selection = None;
    }
    fn session(&mut self, owner: &str) -> Result<&Session, String> {
        if self
            .session
            .as_ref()
            .is_some_and(|s| s.owner != owner || Instant::now() >= s.until)
        {
            self.lock();
        }
        self.session
            .as_ref()
            .ok_or("Vault is locked. Unlock to fill a login.".into())
    }
}
fn random_id() -> String {
    let mut b = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut b);
    hex::encode(b)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    server: Option<String>,
    unlocked: bool,
    skipped: usize,
}
#[tauri::command]
pub async fn vault_status(
    webview: tauri::Webview,
    state: tauri::State<'_, Native>,
    vault: tauri::State<'_, Service>,
) -> Result<Status, String> {
    security::trusted(&webview)?;
    let rt = state.0.lock().await;
    let server = settings::load(&rt.root, &rt.owner)?;
    let mut v = vault.0.lock().await;
    let session = v.session(&rt.owner).ok();
    Ok(Status {
        server,
        unlocked: session.is_some(),
        skipped: session.map_or(0, |s| s.vault.skipped),
    })
}
#[tauri::command]
pub async fn vault_configure(
    webview: tauri::Webview,
    state: tauri::State<'_, Native>,
    vault: tauri::State<'_, Service>,
    server: String,
) -> Result<(), String> {
    security::trusted(&webview)?;
    let rt = state.0.lock().await;
    let mut v = vault.0.lock().await;
    settings::save(&rt.root, &rt.owner, &server)?;
    v.lock();
    Ok(())
}
#[tauri::command]
pub async fn vault_lock(
    webview: tauri::Webview,
    vault: tauri::State<'_, Service>,
) -> Result<(), String> {
    security::trusted(&webview)?;
    vault.0.lock().await.lock();
    Ok(())
}
#[tauri::command]
pub async fn vault_unlock(
    webview: tauri::Webview,
    state: tauri::State<'_, Native>,
    vault: tauri::State<'_, Service>,
    input: client::Unlock,
) -> Result<(), String> {
    security::trusted(&webview)?;
    let (owner, device, server, revision) = {
        let rt = state.0.lock().await;
        if rt.owner.is_empty() {
            return Err("Sign in to Omnia first".into());
        }
        let server =
            settings::load(&rt.root, &rt.owner)?.ok_or("Set your Vaultwarden server URL first")?;
        let path = rt
            .root
            .join("vault-devices")
            .join(format!("{}.json", crate::profiles::key(&rt.owner, &server)));
        let device = match crate::persistence::read::<String>(&path)? {
            Some(id) if id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit()) => id,
            _ => {
                let id = random_id();
                crate::persistence::write(&path, &id)?;
                id
            }
        };
        let mut v = vault.0.lock().await;
        if v.busy {
            return Err("A vault unlock is already running".into());
        }
        v.lock();
        v.busy = true;
        (rt.owner.clone(), device, server, v.revision)
    };
    let result = client::unlock(input, &device, &server).await;
    let current = state.0.lock().await.owner.clone();
    let mut v = vault.0.lock().await;
    v.busy = false;
    if v.revision != revision || current != owner {
        return Err("Vault unlock cancelled".into());
    }
    v.session = Some(Session {
        owner,
        until: Instant::now() + Duration::from_secs(300),
        vault: result?,
    });
    Ok(())
}
pub fn expire(app: &tauri::AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;
            let state = app.state::<Service>();
            let mut v = state.0.lock().await;
            if v.session
                .as_ref()
                .is_some_and(|s| Instant::now() >= s.until)
            {
                v.lock();
            }
        }
    });
}
fn origin(raw: &str) -> Option<String> {
    let url = security::website(raw).ok()?;
    if url.scheme() != "https" {
        return None;
    }
    Some(url.origin().ascii_serialization())
}
fn matches(saved: &str, actual: &str, mode: Option<u32>) -> bool {
    // Never broaden saved matching rules. Domain/host/default are tightened to exact origin.
    if !matches!(mode, None | Some(0..=3))
        || origin(saved).is_none()
        || origin(saved) != origin(actual)
    {
        return false;
    }
    match mode {
        Some(2) => actual.starts_with(saved),
        Some(3) => actual == saved,
        _ => true,
    }
}
fn item_key(cipher: &client::Cipher, key: &[u8]) -> Result<Zeroizing<Vec<u8>>, String> {
    match &cipher.key {
        Some(k) => crypto::decrypt(k, key),
        None => Ok(Zeroizing::new(key.to_vec())),
    }
}
fn item_matches(cipher: &client::Cipher, key: &[u8], url: &str) -> Result<bool, String> {
    let Some(login) = &cipher.login else {
        return Ok(false);
    };
    for uri in login.uris.iter().flatten() {
        let saved = crypto::text(uri.uri.as_deref(), key)?;
        if matches(&saved, url, uri.matching) {
            return Ok(true);
        }
    }
    Ok(false)
}
#[derive(Serialize)]
pub struct Entry {
    id: String,
    name: String,
    username: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Availability {
    unlocked: bool,
    has_matches: bool,
}
#[tauri::command]
pub async fn vault_availability(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    state: tauri::State<'_, Native>,
    vault: tauri::State<'_, Service>,
    id: Option<String>,
) -> Result<Availability, String> {
    security::trusted(&webview)?;
    let rt = state.0.lock().await;
    let mut v = vault.0.lock().await;
    let Ok(session) = v.session(&rt.owner) else {
        return Ok(Availability {
            unlocked: false,
            has_matches: false,
        });
    };
    let url = id
        .as_ref()
        .and_then(|id| rt.live.get(id))
        .and_then(|label| app.get_webview(label))
        .and_then(|view| view.url().ok());
    let has_matches = url.is_some_and(|url| {
        session.vault.ciphers.iter().any(|cipher| {
            let Ok(key) = item_key(cipher, &session.vault.key) else {
                return false;
            };
            item_matches(cipher, &key, url.as_str()).unwrap_or(false)
        })
    });
    // Read-only hint: never replace the single-use selection ticket while polling.
    Ok(Availability {
        unlocked: true,
        has_matches,
    })
}
#[derive(Serialize)]
pub struct Matches {
    ticket: String,
    origin: String,
    entries: Vec<Entry>,
    skipped: usize,
}
#[tauri::command]
pub async fn vault_matches(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    state: tauri::State<'_, Native>,
    vault: tauri::State<'_, Service>,
    id: String,
) -> Result<Matches, String> {
    security::trusted(&webview)?;
    let rt = state.0.lock().await;
    rt.route(&id)?;
    let label = rt
        .live
        .get(&id)
        .ok_or("Restore the route before filling")?
        .clone();
    let view = app.get_webview(&label).ok_or("Route is closed")?;
    let url = view.url().map_err(|_| "Cannot read route URL")?.to_string();
    let origin = origin(&url).ok_or("Autofill requires an HTTPS website")?;
    let mut v = vault.0.lock().await;
    let session = v.session(&rt.owner)?;
    let mut entries = vec![];
    let mut skipped = session.vault.skipped;
    for cipher in &session.vault.ciphers {
        let entry = (|| {
            let key = item_key(cipher, &session.vault.key)?;
            if !item_matches(cipher, &key, &url)? {
                return Ok(None);
            }
            let login = cipher.login.as_ref().ok_or("Not a login")?;
            Ok::<_, String>(Some(Entry {
                id: cipher.id.clone(),
                name: crypto::text(Some(&cipher.name), &key)?.to_string(),
                username: crypto::text(login.username.as_deref(), &key)?.to_string(),
            }))
        })();
        match entry {
            Ok(Some(e)) => entries.push(e),
            Ok(None) => (),
            Err(_) => skipped += 1,
        }
    }
    let ticket = random_id();
    v.selection = Some(Target {
        ticket: ticket.clone(),
        label,
        url,
        owner: rt.owner.clone(),
        until: Instant::now() + Duration::from_secs(60),
    });
    Ok(Matches {
        ticket,
        origin,
        entries,
        skipped,
    })
}
#[tauri::command]
pub async fn vault_fill(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    state: tauri::State<'_, Native>,
    vault: tauri::State<'_, Service>,
    ticket: String,
    entry: String,
) -> Result<String, String> {
    security::trusted(&webview)?;
    let rt = state.0.lock().await;
    let mut v = vault.0.lock().await;
    let target = v.selection.take().ok_or("Choose a login again")?;
    if target.ticket != ticket
        || target.owner != rt.owner
        || Instant::now() >= target.until
        || !rt.live.values().any(|l| l == &target.label)
    {
        return Err("Fill selection expired; choose a login again".into());
    }
    let view = app.get_webview(&target.label).ok_or("Route is closed")?;
    if view.url().map_err(|_| "Cannot read route URL")?.as_str() != target.url {
        return Err("Website changed; choose a login again".into());
    }
    let session = v.session(&rt.owner)?;
    let cipher = session
        .vault
        .ciphers
        .iter()
        .find(|c| c.id == entry)
        .ok_or("Unknown vault entry")?;
    let key = item_key(cipher, &session.vault.key)?;
    if !item_matches(cipher, &key, &target.url)? {
        return Err("Login does not match this website".into());
    }
    let login = cipher.login.as_ref().ok_or("Not a login")?;
    let username = crypto::text(login.username.as_deref(), &key)?;
    let password = crypto::text(login.password.as_deref(), &key)?;
    #[derive(Serialize)]
    struct Payload<'a> {
        url: &'a str,
        origin: String,
        username: &'a str,
        password: &'a str,
    }
    // JSON serialization provides data literals, never raw executable interpolation.
    let data = Zeroizing::new(
        serde_json::to_string(&Payload {
            url: &target.url,
            origin: origin(&target.url).ok_or("HTTPS required")?,
            username: &username,
            password: &password,
        })
        .map_err(|_| "Cannot prepare fill")?,
    );
    let script = format!("{}({})", include_str!("fill.js"), data.as_str());
    let (tx, rx) = tokio::sync::oneshot::channel();
    let tx = std::sync::Mutex::new(Some(tx));
    view.eval_with_callback(script, move |result| {
        if let Some(tx) = tx.lock().expect("Fill callback").take() {
            let _ = tx.send(result);
        }
    })
    .map_err(|_| "Cannot fill this view")?;
    drop(v);
    drop(rt);
    let result = tokio::time::timeout(Duration::from_secs(5), rx)
        .await
        .map_err(|_| "Fill timed out; inspect the page before retrying")?
        .map_err(|_| "Fill interrupted")?;
    let result: String = serde_json::from_str(&result).map_err(|_| "No fill result from page")?;
    match result.as_str() {
        "filled" => Ok("Login filled. Submit the form when ready.".into()),
        "username-only" => {
            Ok("Username filled. Continue to the password step, then fill again.".into())
        }
        "changed" => Err("Website changed; choose a login again".into()),
        "unsafe-form" => Err("Refused a form that submits to a different origin".into()),
        "ambiguous" => Err("Multiple password fields; fill this form manually".into()),
        _ => Err(
            "No supported visible login form found. Frames and shadow DOM are not supported yet."
                .into(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn matching_never_crosses_origins_or_weakens_explicit_rules() {
        for url in [
            "http://example.com",
            "https://example.com.evil.test",
            "https://sub.example.com",
            "https://example.com:444",
            "https://user@example.com",
        ] {
            assert!(!matches("https://example.com", url, None));
        }
        assert!(matches(
            "https://example.com/a",
            "https://example.com/b",
            None
        ));
        assert!(!matches(
            "https://example.com/a",
            "https://example.com/b",
            Some(3)
        ));
        assert!(!matches(
            "https://example.com",
            "https://example.com",
            Some(5)
        ));
        assert!(!matches(
            "https://example.com",
            "https://example.com",
            Some(4)
        ));
        assert!(matches(
            "https://example.com/a",
            "https://example.com/abc",
            Some(2)
        ));
    }
    #[test]
    fn lock_invalidates_pending_work_and_clears_selection() {
        let mut vault = Vault::default();
        let revision = vault.revision;
        vault.lock();
        assert_ne!(revision, vault.revision);
        assert!(vault.session("owner").is_err());
        assert!(vault.selection.is_none());
    }
    #[test]
    fn expiry_and_owner_change_drop_the_key() {
        let session = |owner: &str, until| Session {
            owner: owner.into(),
            until,
            vault: client::OpenVault {
                key: Zeroizing::new(vec![42; 64]),
                ciphers: vec![],
                skipped: 0,
            },
        };
        let mut vault = Vault {
            session: Some(session("alice", Instant::now() - Duration::from_secs(1))),
            ..Default::default()
        };
        assert!(vault.session("alice").is_err());
        assert!(vault.session.is_none());
        vault.session = Some(session("alice", Instant::now() + Duration::from_secs(300)));
        assert!(vault.session("bob").is_err());
        assert!(vault.session.is_none());
    }
}
