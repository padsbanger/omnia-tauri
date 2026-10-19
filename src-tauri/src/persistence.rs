use serde::{de::DeserializeOwned, Serialize};
use std::{io::Write, path::Path};
pub fn read<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, String> {
    match std::fs::read(path) {
        Ok(v) => serde_json::from_slice(&v)
            .map(Some)
            .map_err(|e| format!("Invalid saved state: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
pub fn write<T: Serialize>(path: &Path, data: &T) -> Result<(), String> {
    let parent = path.parent().ok_or("Missing parent")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    file.write_all(&serde_json::to_vec(data).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn atomic_replace_and_invalid_state() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("state.json");
        write(&p, &vec![1]).unwrap();
        write(&p, &vec![2]).unwrap();
        assert_eq!(read::<Vec<i32>>(&p).unwrap(), Some(vec![2]));
        std::fs::write(&p, "bad").unwrap();
        assert!(read::<Vec<i32>>(&p).is_err());
    }
}
