use crate::{
    config::{secure_endpoint, Config},
    security,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
#[derive(Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Pending {
    state: String,
    verifier: String,
    created: u64,
    redirect: String,
}
#[derive(Clone, Serialize, Deserialize)]
struct Saved {
    refresh: String,
    user: User,
}
#[derive(Clone, Deserialize)]
struct Discovery {
    authorization_endpoint: String,
    token_endpoint: String,
    userinfo_endpoint: String,
}
#[derive(Deserialize)]
struct Tokens {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
}
#[derive(Deserialize)]
struct Claims {
    sub: String,
    email: String,
    name: Option<String>,
    preferred_username: Option<String>,
}
#[derive(Clone, Serialize, Debug)]
pub struct Error {
    pub message: String,
    pub status: Option<u16>,
}
impl From<String> for Error {
    fn from(message: String) -> Self {
        Self {
            message,
            status: None,
        }
    }
}
impl From<&str> for Error {
    fn from(s: &str) -> Self {
        s.to_string().into()
    }
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}
impl std::error::Error for Error {}
pub type Result<T> = std::result::Result<T, Error>;
pub struct Auth {
    pub config: Config,
    pub client: reqwest::Client,
    pub user: Option<User>,
    access: Option<String>,
    refresh: Option<String>,
    expires: u64,
    discovery: Option<Discovery>,
    vault: String,
    pending: Option<Pending>,
}
pub struct Service(pub tokio::sync::Mutex<Auth>, pub tokio::sync::Notify);
fn random() -> String {
    let mut b = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut b);
    URL_SAFE_NO_PAD.encode(b)
}
pub fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}
pub fn callback_code(raw: &str, p: &Pending, time: u64) -> Result<String> {
    let u = url::Url::parse(raw).map_err(|_| Error::from("Invalid callback"))?;
    let expected = url::Url::parse(&p.redirect).map_err(|_| Error::from("Invalid redirect"))?;
    if u.scheme() != expected.scheme()
        || u.host_str() != expected.host_str()
        || u.port() != expected.port()
        || u.path() != expected.path()
        || !u.username().is_empty()
        || u.password().is_some()
        || u.fragment().is_some()
        || time.saturating_sub(p.created) > 600
        || time < p.created
    {
        return Err("Unsolicited or expired callback".into());
    }
    let params: Vec<_> = u.query_pairs().collect();
    let states: Vec<_> = params.iter().filter(|(k, _)| k == "state").collect();
    let codes: Vec<_> = params.iter().filter(|(k, _)| k == "code").collect();
    if states.len() != 1
        || states[0].1 != p.state
        || codes.len() != 1
        || codes[0].1.is_empty()
        || params.iter().any(|(k, _)| k == "error")
    {
        return Err("Authentication response rejected".into());
    }
    Ok(codes[0].1.to_string())
}
impl Auth {
    pub fn new(config: Config) -> Self {
        let scope = crate::profiles::key(
            &config.discovery_url,
            &format!("{}:{}", config.client_id, config.api_base_url),
        );
        let mode = if cfg!(debug_assertions) {
            "development"
        } else {
            "release"
        };
        let vault = format!("com.strielok.omnia.tauri.{mode}.{}", &scope[..16]);
        Self {
            config,
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(20))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .expect("HTTP client"),
            user: None,
            access: None,
            refresh: None,
            expires: 0,
            discovery: None,
            vault,
            pending: None,
        }
    }
    fn entry(&self, name: &str) -> Result<keyring::Entry> {
        keyring::Entry::new(&self.vault, name).map_err(|_| "OS credential store unavailable".into())
    }
    fn secret<T: for<'de> Deserialize<'de>>(&self, name: &str) -> Result<Option<T>> {
        match self.entry(name)?.get_password() {
            Ok(s) => serde_json::from_str(&s)
                .map(Some)
                .map_err(|_| "Invalid credential record".into()),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("OS credential store is locked or unavailable".into()),
        }
    }
    fn save<T: Serialize>(&self, name: &str, value: &T) -> Result<()> {
        self.entry(name)?
            .set_password(
                &serde_json::to_string(value)
                    .map_err(|_| Error::from("Credential encoding failed"))?,
            )
            .map_err(|_| "Cannot save to OS credential store; no plaintext fallback is used".into())
    }
    fn remove(&self, name: &str) -> Result<()> {
        match self.entry(name)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("Cannot remove credential from OS store".into()),
        }
    }
    pub fn load(&mut self) -> Result<()> {
        if self.user.is_none() {
            if let Some(s) = self.secret::<Saved>("session")? {
                self.user = Some(s.user);
                self.refresh = Some(s.refresh);
            }
        }
        Ok(())
    }
    pub fn owner(&self) -> Option<String> {
        // OIDC subjects are unique within an issuer, not across configured backends.
        self.user
            .as_ref()
            .map(|user| crate::profiles::key(&self.vault, &user.id))
    }
    pub fn logout(&mut self) -> Result<()> {
        self.access = None;
        self.refresh = None;
        self.user = None;
        self.pending = None;
        self.remove("session")?;
        self.remove("pending")
    }
    async fn json<T: for<'de> Deserialize<'de>>(
        &self,
        request: reqwest::RequestBuilder,
    ) -> Result<T> {
        let r = request
            .send()
            .await
            .map_err(|_| Error::from("Network unavailable or request timed out"))?;
        let status = r.status();
        if !status.is_success() {
            return Err(Error {
                message: format!("Authentication HTTP {}", status.as_u16()),
                status: Some(status.as_u16()),
            });
        }
        r.json()
            .await
            .map_err(|_| "Invalid authentication response".into())
    }
    async fn discover(&mut self) -> Result<Discovery> {
        if let Some(d) = &self.discovery {
            return Ok(d.clone());
        }
        let mut result = Err(Error::from("Discovery failed"));
        for delay in [0, 750, 2000] {
            if delay > 0 {
                tokio::time::sleep(Duration::from_millis(delay)).await;
            }
            result = self
                .json::<Discovery>(self.client.get(&self.config.discovery_url))
                .await;
            if result.is_ok() {
                break;
            }
        }
        let d = result?;
        for u in [
            &d.authorization_endpoint,
            &d.token_endpoint,
            &d.userinfo_endpoint,
        ] {
            secure_endpoint(u)?;
        }
        self.discovery = Some(d.clone());
        Ok(d)
    }
    pub async fn begin(&mut self) -> Result<String> {
        let d = self.discover().await?;
        let p = Pending {
            state: random(),
            verifier: random(),
            created: now(),
            redirect: self.config.redirect_uri.clone(),
        };
        let mut u = secure_endpoint(&d.authorization_endpoint)?;
        u.query_pairs_mut().extend_pairs([
            ("client_id", self.config.client_id.as_str()),
            ("code_challenge", &challenge(&p.verifier)),
            ("code_challenge_method", "S256"),
            ("redirect_uri", &p.redirect),
            ("response_type", "code"),
            ("scope", "openid email profile offline_access"),
            ("state", &p.state),
        ]);
        self.save("pending", &p)?;
        self.pending = Some(p);
        Ok(u.to_string())
    }
    pub async fn complete(&mut self, raw: &str) -> Result<User> {
        let p = self
            .pending
            .clone()
            .or(self.secret::<Pending>("pending")?)
            .ok_or("Unsolicited callback")?;
        let code = callback_code(raw, &p, now())?;
        self.pending = None;
        self.remove("pending")?; // consume before exchanging; never replay codes
        let d = self.discover().await?;
        let t: Tokens = self
            .json(self.client.post(&d.token_endpoint).form(&[
                ("client_id", self.config.client_id.as_str()),
                ("code", &code),
                ("code_verifier", &p.verifier),
                ("grant_type", "authorization_code"),
                ("redirect_uri", &p.redirect),
            ]))
            .await?;
        let c: Claims = self
            .json(
                self.client
                    .get(&d.userinfo_endpoint)
                    .bearer_auth(&t.access_token),
            )
            .await?;
        if c.sub.is_empty() || c.email.is_empty() {
            return Err("Required user claims missing".into());
        }
        let user = User {
            id: c.sub,
            email: c.email,
            name: c.name.or(c.preferred_username),
        };
        let refresh = t
            .refresh_token
            .ok_or("Identity provider did not return an offline refresh credential")?;
        self.save(
            "session",
            &Saved {
                refresh: refresh.clone(),
                user: user.clone(),
            },
        )?;
        self.user = Some(user.clone());
        self.refresh = Some(refresh);
        self.access = Some(t.access_token);
        self.expires = now() + t.expires_in.unwrap_or(300);
        Ok(user)
    }
    // All callers hold Service's async mutex, including persistence of rotated refresh tokens.
    pub async fn token(&mut self) -> Result<String> {
        if self.expires > now() + 60 {
            if let Some(a) = &self.access {
                return Ok(a.clone());
            }
        }
        let refresh = self.refresh.clone().ok_or("Sign in required")?;
        let d = self.discover().await?;
        let result: Result<Tokens> = self
            .json(self.client.post(&d.token_endpoint).form(&[
                ("client_id", self.config.client_id.as_str()),
                ("grant_type", "refresh_token"),
                ("refresh_token", &refresh),
            ]))
            .await;
        let t = match result {
            Err(e) if matches!(e.status, Some(400 | 401 | 403)) => {
                self.logout()?;
                return Err(e);
            }
            other => other?,
        };
        let rotated = t.refresh_token.unwrap_or(refresh);
        let user = self.user.clone().ok_or("Sign in required")?;
        self.save(
            "session",
            &Saved {
                refresh: rotated.clone(),
                user,
            },
        )?;
        self.refresh = Some(rotated);
        self.expires = now() + t.expires_in.unwrap_or(300);
        self.access = Some(t.access_token.clone());
        Ok(t.access_token)
    }
    pub async fn verify(&mut self) -> Result<User> {
        let token = self.token().await?;
        let d = self.discover().await?;
        let c: Claims = match self
            .json(self.client.get(&d.userinfo_endpoint).bearer_auth(token))
            .await
        {
            Err(e) if matches!(e.status, Some(401 | 403)) => {
                self.logout()?;
                return Err(e);
            }
            other => other?,
        };
        let user = self.user.clone().ok_or("Sign in required")?;
        if c.sub != user.id {
            self.logout()?;
            return Err("User identity changed".into());
        }
        Ok(user)
    }
}
pub async fn handle_callback(app: tauri::AppHandle, url: String) {
    let service = app.state::<Service>();
    let mut auth = service.0.lock().await;
    let result = tokio::select! { result=auth.complete(&url)=>result, _=service.1.notified()=>Err("Sign-in cancelled".into()) };
    drop(auth);

    if let Some(w) = app.get_webview_window("auth") {
        let _ = w.close();
    }
    if let Some(shell) = app.get_webview("shell") {
        let message = result.map(|_| ()).map_err(|e| e.message);
        let _ = shell.emit("session-changed", message);
    }
}
#[tauri::command]
pub async fn auth_login(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    state: tauri::State<'_, Service>,
) -> Result<()> {
    security::trusted(&webview)?;
    let mut auth = state.0.lock().await;
    let u = tokio::select! { result=auth.begin()=>result?, _=state.1.notified()=>return Err("Sign-in cancelled".into()) };
    if auth.config.system_browser {
        open::that_detached(u).map_err(|_| Error::from("Cannot open system browser"))?;
    } else {
        if let Some(w) = app.get_webview_window("auth") {
            w.close().map_err(|e| e.to_string())?;
        }
        let a = app.clone();
        let redirect = auth.config.redirect_uri.clone();
        tauri::WebviewWindowBuilder::new(
            &app,
            "auth",
            tauri::WebviewUrl::External(
                u.parse()
                    .map_err(|_| Error::from("Invalid authorization URL"))?,
            ),
        )
        .title("Sign in to Omnia")
        .inner_size(520., 700.)
        .incognito(true)
        .on_navigation(move |url| {
            if url.as_str().starts_with(&redirect) {
                let a = a.clone();
                let raw = url.to_string();
                tauri::async_runtime::spawn(async move {
                    handle_callback(a, raw).await;
                });
                false
            } else {
                url.scheme() == "https"
                    || (url.scheme() == "http" && url.host_str() == Some("127.0.0.1"))
            }
        })
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .build()
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
pub async fn auth_cancel(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    state: tauri::State<'_, Service>,
) -> Result<()> {
    security::trusted(&webview)?;
    state.1.notify_waiters();
    let mut a = state.0.lock().await;
    a.pending = None;
    a.remove("pending")?;
    if let Some(w) = app.get_webview_window("auth") {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
pub fn dispatch_callbacks(app: &tauri::AppHandle, args: Vec<String>) {
    for raw in args.into_iter().filter(|s| s.starts_with("omnia://")) {
        let a = app.clone();
        tauri::async_runtime::spawn(async move {
            handle_callback(a, raw).await;
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn equal_subjects_from_different_backends_cannot_share_workspace() {
        let config = Config::default();
        let mut alternate = config.clone();
        alternate.api_base_url = "https://other.example.com".into();
        let user = User {
            id: "same-subject".into(),
            email: "fixture@example.invalid".into(),
            name: None,
        };
        let mut first = Auth::new(config);
        let mut second = Auth::new(alternate);
        first.user = Some(user.clone());
        second.user = Some(user);
        assert_ne!(first.owner(), second.owner());
    }
    #[test]
    fn pkce_rfc7636() {
        assert_eq!(
            challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }
    #[test]
    fn callback_exact_state_and_expiry() {
        let p = Pending {
            state: "s".into(),
            verifier: "v".into(),
            created: 100,
            redirect: "omnia://auth/callback".into(),
        };
        assert_eq!(
            callback_code("omnia://auth/callback?state=s&code=c", &p, 120).unwrap(),
            "c"
        );
        for u in [
            "omnia://evil/callback?state=s&code=c",
            "omnia://auth/callback/extra?state=s&code=c",
            "omnia://auth/callback?state=x&code=c",
            "omnia://auth/callback?state=s&state=s&code=c",
            "omnia://auth/callback?state=s&code=c#x",
        ] {
            assert!(callback_code(u, &p, 120).is_err());
        }
        assert!(callback_code("omnia://auth/callback?state=s&code=c", &p, 701).is_err());
    }
}
