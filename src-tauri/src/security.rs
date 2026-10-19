use tauri::Webview;
use url::Url;

pub fn trusted(view: &Webview) -> Result<(), String> {
    let url = view.url().map_err(|e| e.to_string())?;
    if view.label() == "shell" && shell_url(&url) {
        Ok(())
    } else {
        Err("Untrusted caller".into())
    }
}
pub fn shell_url(url: &Url) -> bool {
    (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"))
        || (cfg!(debug_assertions) && url.origin().ascii_serialization() == "http://127.0.0.1:1420")
}
pub fn matches_host(host: &str, allowed: &str) -> bool {
    host == allowed || host.ends_with(&format!(".{allowed}"))
}
pub fn website(raw: &str) -> Result<Url, String> {
    if raw.len() > 8192 {
        return Err("Website URL exceeds 8192 bytes".into());
    }
    let url = Url::parse(raw).map_err(|_| "Invalid URL")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Only HTTP(S) websites without embedded credentials are supported".into());
    }
    Ok(url)
}
pub fn internal(url: &Url, hosts: &[String]) -> bool {
    matches!(url.scheme(), "http" | "https")
        && url
            .host_str()
            .is_some_and(|h| hosts.iter().any(|a| matches_host(h, a)))
}
pub fn external_target(url: &Url, hosts: &[String]) -> Option<Url> {
    if matches!(url.scheme(), "mailto" | "tel") {
        return Some(url.clone());
    }
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return None;
    }
    if !internal(url, hosts) {
        return Some(url.clone());
    }
    for (key, value) in url.query_pairs() {
        if [
            "url",
            "u",
            "q",
            "target",
            "dest",
            "destination",
            "redirect",
            "redirect_url",
            "redirect_uri",
            "continue",
        ]
        .contains(&key.as_ref())
        {
            if let Ok(target) = Url::parse(&value) {
                if matches!(target.scheme(), "http" | "https" | "mailto" | "tel")
                    && !internal(&target, hosts)
                    && target.username().is_empty()
                    && target.password().is_none()
                {
                    return Some(target);
                }
            }
        }
    }
    None
}
pub fn navigate(url: &Url, hosts: &[String]) -> bool {
    if let Some(target) = external_target(url, hosts) {
        if !(cfg!(debug_assertions) && std::env::var_os("OMNIA_SMOKE").is_some()) {
            let _ = open::that_detached(target.as_str());
        }
        false
    } else {
        internal(url, hosts)
    }
}
pub fn google_popup(url: &Url) -> bool {
    url.scheme() == "https"
        && url.host_str().is_some_and(|h| {
            ["google.com", "googleapis.com", "googleusercontent.com"]
                .iter()
                .any(|a| matches_host(h, a))
        })
        && ["/o/oauth2/", "/gsi/", "RotateCookiesPage"]
            .iter()
            .any(|p| url.path().contains(p))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn host_boundaries() {
        assert!(matches_host("mail.google.com", "google.com"));
        assert!(!matches_host("evilgoogle.com", "google.com"));
        assert!(!matches_host("google.com.evil.test", "google.com"));
    }
    #[test]
    fn reject_executable_urls() {
        for u in [
            "javascript:alert(1)",
            "file:///C:/test",
            "omnia://auth/callback",
            "https://user:pass@example.com",
        ] {
            assert!(website(u).is_err());
        }
        assert!(website("http://127.0.0.1:7890").is_ok());
    }
    #[test]
    fn shell_boundary() {
        assert!(!shell_url(&Url::parse("https://tauri.localhost").unwrap()));
        assert!(!shell_url(&Url::parse("http://127.0.0.1:7890").unwrap()));
    }
}
