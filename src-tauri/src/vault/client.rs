use super::crypto::{self, Kdf};
use reqwest::{Client, Response};
use serde::Deserialize;
use std::time::Duration;
use zeroize::{Zeroize, ZeroizeOnDrop, Zeroizing};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cipher {
    pub id: String,
    pub organization_id: Option<String>,
    pub deleted_date: Option<String>,
    pub reprompt: Option<u32>,
    pub key: Option<String>,
    pub name: String,
    pub login: Option<Login>,
    #[serde(rename = "type")]
    pub kind: u32,
}
#[derive(Deserialize)]
pub struct Login {
    pub username: Option<String>,
    pub password: Option<String>,
    pub uris: Option<Vec<Uri>>,
}
#[derive(Deserialize)]
pub struct Uri {
    pub uri: Option<String>,
    #[serde(rename = "match")]
    pub matching: Option<u32>,
}
#[derive(Deserialize)]
struct Sync {
    ciphers: Vec<Cipher>,
}
#[derive(Deserialize, Zeroize, ZeroizeOnDrop)]
struct Token {
    access_token: String,
    #[serde(alias = "Key")]
    key: String,
}
#[derive(Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Unlock {
    pub email: String,
    pub password: String,
    pub code: String,
}
pub struct OpenVault {
    pub key: Zeroizing<Vec<u8>>,
    pub ciphers: Vec<Cipher>,
    pub skipped: usize,
}
fn base(server: &str) -> String {
    // Debug fixture override only; release uses the validated locally configured endpoint.
    if cfg!(debug_assertions) && std::env::var_os("OMNIA_SMOKE").is_some() {
        return "http://127.0.0.1:7890/vault".into();
    }
    server.into()
}
async fn body(mut response: Response) -> Result<Zeroizing<Vec<u8>>, String> {
    let mut data = Zeroizing::new(Vec::new());
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Vault response failed")?
    {
        if data.len() + chunk.len() > 16 * 1024 * 1024 {
            return Err("Vault response too large".into());
        }
        data.extend_from_slice(&chunk);
    }
    Ok(data)
}
pub async fn unlock(input: Unlock, device: &str, server: &str) -> Result<OpenVault, String> {
    if input.email.len() > 320
        || !input.email.contains('@')
        || input.password.is_empty()
        || input.password.len() > 4096
        || input.code.len() > 16
    {
        return Err("Enter a valid email, master password and optional authenticator code".into());
    }
    let email = input.email.trim().to_lowercase();
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(25))
        .connect_timeout(Duration::from_secs(10))
        .user_agent("Omnia-Vault/0.1")
        .build()
        .map_err(|_| "Cannot initialize vault connection")?;
    let base = base(server);
    let mut response = client
        .post(format!("{base}/identity/accounts/prelogin/password"))
        .json(&serde_json::json!({"email":email}))
        .send()
        .await
        .map_err(|_| "Cannot reach Vaultwarden; check network and certificate")?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        response = client
            .post(format!("{base}/identity/accounts/prelogin"))
            .json(&serde_json::json!({"email":email}))
            .send()
            .await
            .map_err(|_| "Vault prelogin failed")?;
    }
    if !response.status().is_success() {
        return Err("Vault prelogin rejected; redirects and SSO are not supported".into());
    }
    let kdf: Kdf = serde_json::from_slice(&body(response).await?)
        .map_err(|_| "Unsupported vault prelogin response")?;
    let (input, key, hash) = tauri::async_runtime::spawn_blocking(move || {
        let key = crypto::derive(&input.password, &email, &kdf)?;
        let hash = crypto::password_hash(&*key, &input.password);
        Ok::<_, String>((input, key, hash))
    })
    .await
    .map_err(|_| "Vault key derivation interrupted")??;
    let mut form = vec![
        ("grant_type", "password"),
        ("client_id", "desktop"),
        ("scope", "api offline_access"),
        ("username", input.email.trim()),
        ("password", hash.as_str()),
        ("deviceType", "8"),
        ("deviceName", "Omnia"),
        ("deviceIdentifier", device),
    ];
    if !input.code.trim().is_empty() {
        form.extend([
            ("twoFactorProvider", "0"),
            ("twoFactorToken", input.code.trim()),
            ("twoFactorRemember", "0"),
        ]);
    }
    let response = client
        .post(format!("{base}/identity/connect/token"))
        .form(&form)
        .send()
        .await
        .map_err(|_| "Vault sign-in connection failed")?;
    let status = response.status();
    let bytes = body(response).await?;
    if !status.is_success() {
        let error: serde_json::Value = serde_json::from_slice(&bytes).unwrap_or_default();
        if error
            .get("TwoFactorProviders")
            .or_else(|| error.get("twoFactorProviders"))
            .is_some()
        {
            return Err("Vault requires two-factor authentication. Enter an authenticator code; other 2FA methods are not supported yet.".into());
        }
        return Err("Vault sign-in rejected. Check credentials and authenticator code. SSO and new-device email challenges are not supported yet.".into());
    }
    let token: Token =
        serde_json::from_slice(&bytes).map_err(|_| "Unsupported vault sign-in response")?;
    let user_key = crypto::decrypt(&token.key, &crypto::stretch(&*key)?)?;
    if user_key.len() != 64 {
        return Err("Unsupported vault user key".into());
    }
    let response = client
        .get(format!("{base}/api/sync?excludeDomains=true"))
        .bearer_auth(&token.access_token)
        .send()
        .await
        .map_err(|_| "Vault sync connection failed")?;
    if !response.status().is_success() {
        return Err("Vault sync rejected; unlock again".into());
    }
    let mut sync: Sync = serde_json::from_slice(&body(response).await?)
        .map_err(|_| "Unsupported vault sync response")?;
    if sync.ciphers.len() > 20_000 {
        return Err("Vault has too many entries".into());
    }
    let total = sync.ciphers.len();
    sync.ciphers.retain(|c| {
        c.kind == 1
            && c.organization_id.is_none()
            && c.deleted_date.is_none()
            && c.reprompt.unwrap_or(0) == 0
            && c.login.is_some()
    });
    Ok(OpenVault {
        key: user_key,
        skipped: total - sync.ciphers.len(),
        ciphers: sync.ciphers,
    })
}
