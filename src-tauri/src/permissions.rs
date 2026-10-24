#[cfg(any(target_os = "windows", test))]
use url::Url;
#[cfg(any(target_os = "windows", test))]
pub fn trusted_origin(raw: &str, route_url: &str, gmail: bool) -> bool {
    let Ok(url) = Url::parse(raw) else {
        return false;
    };
    let Ok(route) = Url::parse(route_url) else {
        return false;
    };
    if url.scheme() != "https"
        && !(url.scheme() == "http"
            && matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))
            && url.origin() == route.origin())
    {
        return false;
    }
    url.origin() == route.origin()
        || (gmail
            && url.scheme() == "https"
            && matches!(
                url.host_str(),
                Some("mail.google.com" | "chat.google.com" | "meet.google.com")
            )
            && url.port_or_known_default() == Some(443))
}
#[cfg(target_os = "windows")]
pub fn install(view: &tauri::Webview, route_url: String, gmail: bool) -> Result<(), String> {
    use webview2_com::{
        take_pwstr, Microsoft::Web::WebView2::Win32::*, PermissionRequestedEventHandler,
    };
    use windows::core::PWSTR;
    let (sender, receiver) = std::sync::mpsc::channel();
    view.with_webview(move |native| {
        let result = (|| -> windows::core::Result<()> {
            // SAFETY: Tauri executes this closure on the webview UI thread. COM callback
            // arguments are used only in the callback; owned strings outlive it.
            unsafe {
                let webview = native.controller().CoreWebView2()?;
                let mut token = 0;
                webview.add_PermissionRequested(
                    &PermissionRequestedEventHandler::create(Box::new(move |source, args| {
                        let (Some(source), Some(args)) = (source, args) else {
                            return Ok(());
                        };
                        let mut uri = PWSTR::null();
                        args.Uri(&mut uri)?;
                        let requester = take_pwstr(uri);
                        let mut top = PWSTR::null();
                        source.Source(&mut top)?;
                        let top = take_pwstr(top);
                        let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                        args.PermissionKind(&mut kind)?;
                        let allowed_kind = matches!(
                            kind,
                            COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
                                | COREWEBVIEW2_PERMISSION_KIND_CAMERA
                                | COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS
                                | COREWEBVIEW2_PERMISSION_KIND_MULTIPLE_AUTOMATIC_DOWNLOADS
                        );
                        let allow = allowed_kind
                            && trusted_origin(&requester, &route_url, gmail)
                            && trusted_origin(&top, &route_url, gmail);
                        args.SetState(if allow {
                            COREWEBVIEW2_PERMISSION_STATE_ALLOW
                        } else {
                            COREWEBVIEW2_PERMISSION_STATE_DENY
                        })?;
                        Ok(())
                    })),
                    &mut token,
                )?;
            }
            Ok(())
        })();
        let _ = sender.send(result.map_err(|e| e.to_string()));
    })
    .map_err(|e| e.to_string())?;
    receiver
        .recv_timeout(std::time::Duration::from_secs(5))
        .map_err(|_| "Permission handler setup timed out".to_string())?
}
#[cfg(not(target_os = "windows"))]
pub fn install(_view: &tauri::Webview, _route_url: String, _gmail: bool) -> Result<(), String> {
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_trusted_requester_and_embedder_origins() {
        assert!(trusted_origin(
            "https://mail.google.com/inbox",
            "https://mail.google.com",
            true
        ));
        assert!(trusted_origin(
            "https://meet.google.com",
            "https://mail.google.com",
            true
        ));
        for u in [
            "https://evilmail.google.com",
            "https://mail.google.com.evil.test",
            "http://mail.google.com",
            "https://mail.google.com:444",
        ] {
            assert!(!trusted_origin(u, "https://mail.google.com", true));
        }
        assert!(trusted_origin(
            "http://127.0.0.1:7890",
            "http://127.0.0.1:7890",
            false
        ));
        assert!(!trusted_origin(
            "http://127.0.0.1:7891",
            "http://127.0.0.1:7890",
            false
        ));
    }
}
