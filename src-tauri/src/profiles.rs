use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

pub fn key(owner: &str, id: &str) -> String {
    let mut h = Sha256::new();
    h.update(owner.as_bytes());
    h.update([0]);
    h.update(id.as_bytes());
    hex::encode(h.finalize())
}
pub fn directory(root: &Path, owner: &str, id: &str, epoch: u64) -> PathBuf {
    root.join("profiles")
        .join(key(owner, id))
        .join(epoch.to_string())
}
// Only internally derived paths are accepted, never a frontend path.
pub fn cleanup(root: &Path, path: &Path) -> Result<(), String> {
    let base = root
        .join("profiles")
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !path.exists() {
        return Ok(());
    }
    let resolved = path.canonicalize().map_err(|e| e.to_string())?;
    if resolved == base || !resolved.starts_with(&base) {
        return Err("Profile cleanup escaped its root".into());
    }
    std::fs::remove_dir_all(resolved).map_err(|e| format!("Profile cleanup pending: {e}"))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn identity_is_scoped_and_safe() {
        assert_ne!(key("alice", "one"), key("bob", "one"));
        assert_ne!(key("alice", "one"), key("alice", "two"));
        assert!(key("../../", "../").chars().all(|c| c.is_ascii_hexdigit()));
    }
}
