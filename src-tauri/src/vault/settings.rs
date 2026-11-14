use crate::{persistence, profiles};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize)]
struct Settings {
    version: u32,
    server: Option<String>,
}
fn path(root: &Path, owner: &str) -> PathBuf {
    root.join("vault-settings")
        .join(format!("{}.json", profiles::key(owner, "server")))
}
pub fn normalize(raw: &str) -> Result<Option<String>, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Ok(None);
    }
    if raw.len() > 2048 || raw.chars().any(char::is_control) || raw.contains('\\') {
        return Err("Invalid vault server URL".into());
    }
    let url = url::Url::parse(raw).map_err(|_| "Enter a complete HTTPS server URL")?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Use HTTPS without credentials, query parameters or fragments".into());
    }
    Ok(Some(url.as_str().trim_end_matches('/').to_string()))
}
pub fn load(root: &Path, owner: &str) -> Result<Option<String>, String> {
    if owner.is_empty() {
        return Ok(None);
    }
    let Some(settings) = persistence::read::<Settings>(&path(root, owner))? else {
        return Ok(None);
    };
    if settings.version != 1 {
        return Err("Unsupported vault settings version".into());
    }
    normalize(settings.server.as_deref().unwrap_or_default())
}
pub fn save(root: &Path, owner: &str, server: &str) -> Result<(), String> {
    if owner.is_empty() {
        return Err("Sign in to Omnia first".into());
    }
    persistence::write(
        &path(root, owner),
        &Settings {
            version: 1,
            server: normalize(server)?,
        },
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn server_validation_and_subpath() {
        assert_eq!(
            normalize(" https://VAULT.example.com:443/bitwarden/ ")
                .unwrap()
                .as_deref(),
            Some("https://vault.example.com/bitwarden")
        );
        assert_eq!(normalize("").unwrap(), None);
        for value in [
            "http://vault.example.com",
            "vault.example.com",
            "https://user:secret@vault.example.com",
            "https://vault.example.com/?a=b",
            "https://vault.example.com/#login",
            "file:///vault",
            "https://vault.example.com/\npath",
        ] {
            assert!(normalize(value).is_err(), "{value}");
        }
    }
    #[test]
    fn settings_persist_per_owner_and_can_be_cleared() {
        let root = tempfile::tempdir().unwrap();
        assert!(load(root.path(), "alice").unwrap().is_none());
        save(root.path(), "alice", "https://vault.example.com").unwrap();
        assert_eq!(
            load(root.path(), "alice").unwrap().as_deref(),
            Some("https://vault.example.com")
        );
        assert!(load(root.path(), "bob").unwrap().is_none());
        save(root.path(), "alice", "").unwrap();
        assert!(load(root.path(), "alice").unwrap().is_none());
        assert!(save(root.path(), "", "https://vault.example.com").is_err());
    }
}
