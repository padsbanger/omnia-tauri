use serde::{Deserialize, Serialize};
use std::path::Path;
#[derive(Clone, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct Config {
    pub api_base_url: String,
    pub client_id: String,
    pub redirect_uri: String,
    pub discovery_url: String,
    pub system_browser: bool,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            api_base_url: "https://omnia.pripyat.cloud".into(),
            client_id: "kSYcRwghR9ItrtPB5opL0lvWYPpFZfUtXFtzAv22".into(),
            redirect_uri: "omnia://auth/callback".into(),
            discovery_url:
                "https://auth.pripyat.cloud/application/o/omnia/.well-known/openid-configuration"
                    .into(),
            system_browser: false,
        }
    }
}
impl Config {
    pub fn load(root: &Path) -> Result<Self, String> {
        let path = root.join("config.json");
        let mut c: Self = if path.exists() {
            serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?
        } else {
            Self::default()
        };
        for (name, value) in [
            ("OMNIA_API_BASE_URL", &mut c.api_base_url),
            ("AUTHENTIK_CLIENT_ID", &mut c.client_id),
            ("AUTHENTIK_REDIRECT_URI", &mut c.redirect_uri),
            ("AUTHENTIK_DISCOVERY_URL", &mut c.discovery_url),
        ] {
            if let Ok(v) = std::env::var(name) {
                *value = v;
            }
        }
        for raw in [&c.api_base_url, &c.discovery_url] {
            secure_endpoint(raw)?;
        }
        let u = url::Url::parse(&c.redirect_uri).map_err(|_| "Invalid redirect URI")?;
        if u.scheme() != "omnia"
            || u.host_str() != Some("auth")
            || u.path() != "/callback"
            || u.query().is_some()
            || u.fragment().is_some()
        {
            return Err("Redirect must preserve omnia://auth/callback".into());
        }
        Ok(c)
    }
}
pub fn secure_endpoint(raw: &str) -> Result<url::Url, String> {
    let u = crate::security::website(raw)?;
    if u.scheme() != "https" && !matches!(u.host_str(), Some("127.0.0.1" | "localhost" | "[::1]")) {
        return Err("Backend endpoints require HTTPS (except loopback fixtures)".into());
    }
    Ok(u)
}
