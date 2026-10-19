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
        && (url
            .host_str()
            .is_some_and(|h| hosts.iter().any(|a| matches_host(h, a)))
            || (google_account_url(url)
                && hosts.iter().any(|h| matches_host("accounts.google.com", h))))
}

fn google_account_url(url: &Url) -> bool {
    static HOSTS: std::sync::OnceLock<Vec<String>> = std::sync::OnceLock::new();
    let hosts = HOSTS.get_or_init(|| {
        #[derive(serde::Deserialize)]
        struct AccountHosts {
            hosts: Vec<String>,
        }
        serde_json::from_str::<AccountHosts>(include_str!(
            "../../src/common/google_account_hosts.json"
        ))
        .expect("Pinned Google account hosts")
        .hosts
    });
    url.scheme() == "https"
        && url.port_or_known_default() == Some(443)
        && url.username().is_empty()
        && url.password().is_none()
        && url.host_str().is_some_and(|h| hosts.iter().any(|a| a == h))
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
    // OAuth continuation/callback parameters are part of the authentication
    // request, not link-wrapper destinations to launch before authentication.
    if google_popup(url) {
        return None;
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
pub fn google_popup(url: &Url) -> bool {
    google_account_url(url)
        || (url.scheme() == "https"
            && url.port_or_known_default() == Some(443)
            && url.username().is_empty()
            && url.password().is_none()
            && url.host_str().is_some_and(|h| {
                ["google.com", "googleapis.com", "googleusercontent.com"]
                    .iter()
                    .any(|a| matches_host(h, a))
            })
            && (["/o/oauth2/", "/gsi/", "RotateCookiesPage"]
                .iter()
                .any(|p| url.path().contains(p))))
}
pub fn preserve_popup(url: &Url, hosts: &[String]) -> bool {
    (google_popup(url) && internal(url, hosts))
        || (url.as_str() == "about:blank"
            && internal(&Url::parse("https://accounts.google.com").unwrap(), hosts))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn regional_google_account_steps_are_exact_secure_and_route_scoped() {
        let hosts = crate::workspace::hosts("gmail", "https://mail.google.com");
        let pinned: serde_json::Value =
            serde_json::from_str(include_str!("../../src/common/google_account_hosts.json"))
                .unwrap();
        for host in pinned["hosts"].as_array().unwrap() {
            let url = Url::parse(&format!(
                "https://{}/accounts/SetSID?continue=https%3A%2F%2Fcallback.example%2Fcomplete",
                host.as_str().unwrap()
            ))
            .unwrap();
            assert!(internal(&url, &hosts));
            assert!(preserve_popup(&url, &hosts));
            assert!(external_target(&url, &hosts).is_none());
            assert!(!internal(&url, &["example.com".into()]));
            assert!(!preserve_popup(&url, &["example.com".into()]));
        }
        for raw in [
            "http://accounts.google.pl/accounts/SetSID",
            "https://accounts.google.pl:444/accounts/SetSID",
            "https://user@accounts.google.pl/accounts/SetSID",
            "https://:password@accounts.google.pl/accounts/SetSID",
            "https://accounts.google.pl.evil.test/accounts/SetSID",
            "https://evilaccounts.google.pl/accounts/SetSID",
            "https://sub.accounts.google.pl/accounts/SetSID",
            "https://accounts.google.invalid/accounts/SetSID",
            "https://www.google.pl/accounts/SetSID",
        ] {
            let url = Url::parse(raw).unwrap();
            assert!(!internal(&url, &hosts), "{raw}");
            assert!(!preserve_popup(&url, &hosts), "{raw}");
        }
        let mut login = Url::parse("https://mail.google.com/mail/").unwrap();
        login.query_pairs_mut().append_pair("continue", "https://accounts.google.pl/accounts/SetSID?continue=https%3A%2F%2Fmail.google.com%2Fmail%2Fu%2F0%2F");
        assert!(external_target(&login, &hosts).is_none());
    }
    #[test]
    fn gmail_session_continuation_does_not_leave_its_profile() {
        let hosts = crate::workspace::hosts("gmail", "https://mail.google.com");
        let inbox = Url::parse("https://mail.google.com/mail/u/0/#inbox").unwrap();
        let mut session = Url::parse("https://accounts.youtube.com/accounts/SetSID").unwrap();
        session
            .query_pairs_mut()
            .append_pair("continue", inbox.as_str());
        let mut login = Url::parse("https://mail.google.com/mail/").unwrap();
        login
            .query_pairs_mut()
            .append_pair("continue", session.as_str());
        for url in [&login, &session, &inbox] {
            assert!(internal(url, &hosts));
            assert!(external_target(url, &hosts).is_none());
        }
        for raw in [
            "https://www.youtube.com/watch?v=fixture",
            "https://accounts.youtube.com.evil.test/accounts/SetSID",
            "https://evilaccounts.youtube.com/accounts/SetSID",
        ] {
            let url = Url::parse(raw).unwrap();
            assert!(!internal(&url, &hosts));
            assert_eq!(external_target(&url, &hosts), Some(url));
        }
        assert_eq!(
            external_target(&session, &["example.com".into()]),
            Some(session)
        );
    }
    #[test]
    fn gmail_login_keeps_popup_and_oauth_parameters_in_route_context() {
        let hosts = vec!["google.com".into()];
        for path in [
            "ServiceLogin",
            "AccountChooser",
            "v3/signin/identifier",
            "o/oauth2/v2/auth",
        ] {
            let url = Url::parse(&format!("https://accounts.google.com/{path}?continue=https%3A%2F%2Fcallback.example%2Fcomplete&redirect_uri=https%3A%2F%2Fcallback.example%2Foauth")).unwrap();
            assert!(preserve_popup(&url, &hosts));
            assert!(external_target(&url, &hosts).is_none());
        }
        assert!(preserve_popup(&Url::parse("about:blank").unwrap(), &hosts));
        assert!(!preserve_popup(
            &Url::parse("about:blank").unwrap(),
            &["example.com".into()]
        ));
        for raw in [
            "https://accounts.google.com.evil.test/ServiceLogin",
            "https://evilgoogle.com/o/oauth2/auth",
            "http://accounts.google.com/ServiceLogin",
            "https://accounts.google.com:444/ServiceLogin",
            "https://user:pass@accounts.google.com/ServiceLogin",
        ] {
            assert!(!preserve_popup(&Url::parse(raw).unwrap(), &hosts));
        }
        let wrapped =
            Url::parse("https://www.google.com/url?url=https://external.example/").unwrap();
        assert_eq!(
            external_target(&wrapped, &hosts).unwrap().host_str(),
            Some("external.example")
        );
        assert!(!preserve_popup(
            &Url::parse("https://accounts.google.com/ServiceLogin").unwrap(),
            &["example.com".into()]
        ));
    }
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
