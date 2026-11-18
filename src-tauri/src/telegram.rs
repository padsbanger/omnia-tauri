//! Telegram Web A detects Tauri and calls its own desktop link command.
//! Adapt its two link entry points to the existing route navigation policy.
//! The inline `shell` plugin below implements ONLY safe URL opening, never
//! process execution, arbitrary application selection or filesystem access.
use crate::{navigation_trace::Trace, runtime::Native, security};
use url::Url;

pub fn link_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("shell")
        .invoke_handler(tauri::generate_handler![open])
        .build()
}

#[tauri::command]
async fn open(
    webview: tauri::Webview,
    state: tauri::State<'_, Native>,
    path: String,
    with: Option<String>,
) -> Result<bool, String> {
    // Match Telegram's plugin-shell API without installing that plugin or
    // honoring its optional program selector. The input is always a URL.
    if with.is_some() {
        return Err("Application selection is not supported".into());
    }
    open_new_window_cmd(webview, state, path).await
}

fn link(origin: &Url, raw: &str) -> Result<Url, String> {
    if origin.origin().ascii_serialization() != "https://web.telegram.org"
        || !origin.username().is_empty()
        || origin.password().is_some()
    {
        return Err("Not a Telegram web origin".into());
    }
    if raw.len() > 8192 {
        return Err("Link too long".into());
    }
    let url = Url::parse(raw).map_err(|_| "Invalid link")?;
    if !matches!(url.scheme(), "https" | "http" | "mailto" | "tel")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Unsupported link".into());
    }
    Ok(url)
}

#[tauri::command]
pub async fn open_new_window_cmd(
    webview: tauri::Webview,
    state: tauri::State<'_, Native>,
    url: String,
) -> Result<bool, String> {
    let rt = state.0.lock().await;
    // Exact live labels also reject popups and destroyed view generations.
    let id = rt
        .live
        .iter()
        .find(|(_, label)| label.as_str() == webview.label())
        .map(|(id, _)| id)
        .ok_or("Untrusted link origin")?;
    let route = rt.route(id)?;
    let target = link(&webview.url().map_err(|e| e.to_string())?, &url)?;
    let mut hosts = route.internal_hosts;
    hosts.push(
        security::website(&route.url)?
            .host_str()
            .unwrap_or_default()
            .into(),
    );
    let trace = Trace::new(&rt.root, webview.label());
    if trace.navigate(&target, &hosts) {
        webview.navigate(target).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn telegram_link_origin_and_destination_are_restricted() {
        let origin = Url::parse("https://web.telegram.org/a/").unwrap();
        for url in [
            "https://www.linkedin.com/jobs/view/123",
            "https://jobs.zaton.net",
            "http://localhost:7890",
            "mailto:test@example.com",
            "tel:+123",
        ] {
            assert!(link(&origin, url).is_ok());
        }
        for raw in [
            "https://web.telegram.org.evil.test",
            "http://web.telegram.org",
            "https://web.telegram.org:444",
            "https://user@web.telegram.org",
            "https://example.com",
            "tauri://localhost",
        ] {
            assert!(link(&Url::parse(raw).unwrap(), "https://example.com").is_err());
        }
        for raw in [
            "javascript:alert(1)",
            "file:///C:/test",
            "data:text/html,test",
            "omnia://auth/callback",
            "https://user:pass@example.com",
            "not a url",
        ] {
            assert!(link(&origin, raw).is_err());
        }
        assert!(link(
            &origin,
            &format!("https://example.com/{}", "x".repeat(8192))
        )
        .is_err());
    }
}
