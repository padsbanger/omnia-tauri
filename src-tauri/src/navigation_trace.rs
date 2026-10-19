//! Local, bounded diagnostics for hosted-site navigation. Never serialize raw URLs.
use std::{
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use url::Url;

const LIMIT: u64 = 256 * 1024;
static WRITER: Mutex<()> = Mutex::new(());

#[derive(Clone)]
pub struct Trace {
    file: Option<PathBuf>,
    view: String,
}
impl Trace {
    pub fn new(root: &Path, view: &str) -> Self {
        let enabled = match std::env::var("OMNIA_NAVIGATION_TRACE").as_deref() {
            Ok("1") => true,
            Ok("0") => false,
            _ => cfg!(debug_assertions),
        };
        Self {
            file: enabled.then(|| root.join("diagnostics/navigation.jsonl")),
            view: view.into(),
        }
    }
    pub fn popup(&self) -> Self {
        Self {
            file: self.file.clone(),
            view: format!("{}-popup", self.view),
        }
    }
    pub fn record(&self, event: &'static str, url: &Url) {
        let Some(file) = &self.file else { return };
        let entry = serde_json::json!({
            "timeMs": SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis(),
            "platform": std::env::consts::OS,
            "view": self.view,
            "event": event,
            "destination": destination(url),
        });
        // Diagnostics must never interrupt navigation, including on unwritable disks.
        let _ = append(file, &format!("{entry}\n"));
    }
    pub fn navigate(&self, url: &Url, hosts: &[String]) -> bool {
        if let Some(target) = crate::security::external_target(url, hosts) {
            self.record("external_requested_from", url);
            self.record("external_target", &target);
            if cfg!(debug_assertions) && std::env::var_os("OMNIA_SMOKE").is_some() {
                self.record("external_launch_suppressed_fixture", &target);
            } else {
                let event = if open::that_detached(target.as_str()).is_ok() {
                    "external_launch_requested"
                } else {
                    "external_launch_failed"
                };
                self.record(event, &target);
            }
            false
        } else {
            let allow = crate::security::internal(url, hosts);
            self.record(
                if allow {
                    "navigation_allowed"
                } else {
                    "navigation_denied"
                },
                url,
            );
            allow
        }
    }
}

fn destination(url: &Url) -> serde_json::Value {
    // Authentication codes can occur in paths as well as queries/fragments.
    // Keep only a small set of known Google page paths; redact every other path.
    let path = if url.host_str() == Some("accounts.google.com")
        && matches!(
            url.path(),
            "/ServiceLogin"
                | "/AccountChooser"
                | "/v3/signin/identifier"
                | "/v3/signin/challenge/pwd"
                | "/v3/signin/challenge/selection"
                | "/o/oauth2/v2/auth"
                | "/o/oauth2/auth"
                | "/Logout"
        ) {
        url.path()
    } else if url.as_str() == "about:blank" {
        "blank"
    } else {
        "<redacted>"
    };
    serde_json::json!({"scheme":url.scheme(), "host":url.host_str(), "port":url.port(), "path":path})
}

fn append(file: &Path, line: &str) -> std::io::Result<()> {
    let _guard = WRITER.lock().unwrap_or_else(|e| e.into_inner());
    if line.len() as u64 > LIMIT {
        return Ok(());
    }
    if let Some(parent) = file.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let truncate = file
        .metadata()
        .map(|m| m.len() + line.len() as u64 > LIMIT)
        .unwrap_or(false);
    OpenOptions::new()
        .create(true)
        .write(true)
        .append(!truncate)
        .truncate(truncate)
        .open(file)?
        .write_all(line.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn never_logs_url_secrets_or_arbitrary_paths() {
        for raw in [
            "https://user:password@accounts.google.com/v3/signin/challenge/pwd?code=secret#token",
            "https://login.example/secret?code=secret#token",
            "mailto:secret@example.com",
            "omnia://auth/secret?code=secret",
        ] {
            let value = destination(&Url::parse(raw).unwrap()).to_string();
            for secret in ["user", "password", "secret", "token", "code="] {
                assert!(!value.contains(secret), "{value}");
            }
        }
        assert_eq!(
            destination(
                &Url::parse("https://accounts.google.com/ServiceLogin?continue=secret").unwrap()
            )["path"],
            "/ServiceLogin"
        );
    }
    #[test]
    fn trace_is_bounded_and_keeps_latest_event() {
        let root = tempfile::tempdir().unwrap();
        let file = root.path().join("diagnostics/navigation.jsonl");
        append(&file, &"x".repeat(LIMIT as usize)).unwrap();
        append(&file, "latest\n").unwrap();
        assert_eq!(std::fs::read_to_string(file).unwrap(), "latest\n");
    }
}
