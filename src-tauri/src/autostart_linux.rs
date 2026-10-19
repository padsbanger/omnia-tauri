//! XDG autostart; unlike auto-launch 0.6, respects XDG_CONFIG_HOME.
use std::path::Path;

pub fn set(config: &Path, executable: &Path, enabled: bool) -> Result<(), String> {
    let directory = config.join("autostart");
    let file = directory.join("com.strielok.omnia.tauri.desktop");
    if !enabled {
        return match std::fs::remove_file(file) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        };
    }
    let path = executable
        .to_str()
        .ok_or("Autostart executable must be UTF-8")?;
    if !executable.is_absolute() || path.contains(['\n', '\r', '\0', '=', '\t']) {
        return Err("Invalid autostart executable".into());
    }
    // Desktop Entry Exec quoting is not shell quoting. Escape reserved characters
    // inside quotes, then escape backslashes for the desktop-file string parser.
    let quoted = path
        .replace('%', "%%")
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('`', "\\`")
        .replace('$', "\\$")
        .replace('\\', "\\\\");
    let contents = format!("[Desktop Entry]\nType=Application\nVersion=1.0\nName=Omnia Tauri\nExec=\"{quoted}\" --from-autostart\nTerminal=false\nX-GNOME-Autostart-enabled=true\n");
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let mut temporary = tempfile::NamedTempFile::new_in(&directory).map_err(|e| e.to_string())?;
    use std::io::Write;
    temporary
        .write_all(contents.as_bytes())
        .map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    temporary.persist(file).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn isolated_xdg_entry_is_atomic_quoted_and_removable() {
        let root = tempfile::tempdir().unwrap();
        let file = root
            .path()
            .join("autostart/com.strielok.omnia.tauri.desktop");
        set(root.path(), Path::new("/tmp/Omnia App%/omnia"), true).unwrap();
        let text = std::fs::read_to_string(&file).unwrap();
        assert!(text.contains("Exec=\"/tmp/Omnia App%%/omnia\" --from-autostart\n"));
        set(root.path(), Path::new("/tmp/omnia"), true).unwrap();
        set(root.path(), Path::new("/tmp/omnia"), false).unwrap();
        assert!(!file.exists());
        set(root.path(), Path::new("/tmp/omnia"), false).unwrap();
        assert!(set(root.path(), Path::new("/tmp/bad\nExec=evil"), true).is_err());
    }
}
