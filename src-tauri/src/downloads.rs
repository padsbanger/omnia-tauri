use crate::navigation_trace::Trace;
use serde::Serialize;
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::{LazyLock, Mutex},
};
use tauri::{webview::DownloadEvent, Emitter, Manager};
use url::Url;

static RESERVED: LazyLock<Mutex<HashSet<PathBuf>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadStatus {
    route_id: String,
    file_name: String,
    state: &'static str,
}

pub fn directory(app: &tauri::AppHandle, data_root: &Path) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) && std::env::var_os("OMNIA_SMOKE").is_some() {
        return Ok(std::env::var_os("OMNIA_DOWNLOAD_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| data_root.join("smoke-downloads")));
    }
    app.path().download_dir().map_err(|e| e.to_string())
}

pub fn handle(
    app: &tauri::AppHandle,
    route_id: &str,
    directory: &Path,
    trace: &Trace,
    event: DownloadEvent<'_>,
) -> bool {
    match event {
        DownloadEvent::Requested { url, destination } => {
            trace.record("download_requested", &url);
            let Ok(path) = reserve_destination(directory, destination, &url) else {
                emit(app, route_id, "download", "failed");
                return false;
            };
            let file_name = display_name(&path);
            *destination = path;
            emit(app, route_id, &file_name, "started");
            true
        }
        DownloadEvent::Finished { url, path, success } => {
            trace.record(
                if success {
                    "download_finished"
                } else {
                    "download_failed"
                },
                &url,
            );
            if let Some(path) = &path {
                RESERVED
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .remove(path);
            }
            emit(
                app,
                route_id,
                path.as_deref()
                    .map(display_name)
                    .as_deref()
                    .unwrap_or("download"),
                if success { "finished" } else { "failed" },
            );
            true
        }
        _ => true,
    }
}

fn reserve_destination(
    directory: &Path,
    suggested: &Path,
    url: &Url,
) -> Result<PathBuf, std::io::Error> {
    std::fs::create_dir_all(directory)?;
    let suggested = suggested
        .file_name()
        .and_then(|name| name.to_str())
        .or_else(|| url.path_segments().and_then(|mut parts| parts.next_back()))
        .unwrap_or("download");
    let name = safe_name(suggested);
    let stem = Path::new(&name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("download");
    let extension = Path::new(&name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    let mut reserved = RESERVED.lock().unwrap_or_else(|e| e.into_inner());
    for index in 0..10_000 {
        let file_name = if index == 0 {
            name.clone()
        } else {
            format!("{stem} ({index}){extension}")
        };
        let candidate = directory.join(file_name);
        if !candidate.exists() && reserved.insert(candidate.clone()) {
            return Ok(candidate);
        }
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::AlreadyExists,
        "No free download filename",
    ))
}

fn safe_name(value: &str) -> String {
    let mut result: String = value
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
            {
                '_'
            } else {
                character
            }
        })
        .take(180)
        .collect();
    while result.ends_with([' ', '.']) {
        result.pop();
    }
    let reserved_stem = Path::new(&result)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("")
        .to_ascii_uppercase();
    if result.is_empty()
        || matches!(
            reserved_stem.as_str(),
            "CON"
                | "PRN"
                | "AUX"
                | "NUL"
                | "COM1"
                | "COM2"
                | "COM3"
                | "COM4"
                | "COM5"
                | "COM6"
                | "COM7"
                | "COM8"
                | "COM9"
                | "LPT1"
                | "LPT2"
                | "LPT3"
                | "LPT4"
                | "LPT5"
                | "LPT6"
                | "LPT7"
                | "LPT8"
                | "LPT9"
        )
    {
        "download".into()
    } else {
        result
    }
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("download")
        .to_string()
}

fn emit(app: &tauri::AppHandle, route_id: &str, file_name: &str, state: &'static str) {
    if let Some(shell) = app.get_webview("shell") {
        let _ = shell.emit(
            "download-status",
            DownloadStatus {
                route_id: route_id.into(),
                file_name: file_name.into(),
                state,
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn destination_is_confined_sanitized_and_collision_safe() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("report.pdf"), b"old").unwrap();
        let url = Url::parse("https://example.test/private/report.pdf?token=secret").unwrap();
        let first = reserve_destination(root.path(), Path::new("../report.pdf"), &url).unwrap();
        let second = reserve_destination(root.path(), Path::new("../report.pdf"), &url).unwrap();
        assert_eq!(first, root.path().join("report (1).pdf"));
        assert_eq!(second, root.path().join("report (2).pdf"));
        assert!(first.starts_with(root.path()));
    }

    #[test]
    fn unsafe_or_unusable_names_get_safe_basename() {
        assert_eq!(safe_name("a<b>:c?.txt"), "a_b__c_.txt");
        assert_eq!(safe_name("CON"), "download");
        assert_eq!(safe_name("CON.txt"), "download");
        assert_eq!(safe_name("..."), "download");
    }
}
