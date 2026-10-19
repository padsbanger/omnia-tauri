//! Native stacking for the trusted shell. No additional privileged webview.
#[cfg(target_os = "windows")]
use tauri::Manager;

pub const LIVE_BACKDROP: bool = cfg!(target_os = "windows");

#[cfg(target_os = "windows")]
pub async fn set_open(app: &tauri::AppHandle, open: bool) -> Result<(), String> {
    use windows::Win32::{
        Foundation::HWND,
        UI::WindowsAndMessaging::{
            SetWindowPos, HWND_BOTTOM, HWND_TOP, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        },
    };
    let shell = app.get_webview("shell").ok_or("Missing shell")?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    shell
        .with_webview(move |view| {
            // Wry owns a distinct child HWND for every add_child webview. Move
            // only the trusted shell container within the main window's siblings.
            let result = unsafe {
                let mut hwnd = HWND::default();
                view.controller().ParentWindow(&mut hwnd).and_then(|()| {
                    SetWindowPos(
                        hwnd,
                        Some(if open { HWND_TOP } else { HWND_BOTTOM }),
                        0,
                        0,
                        0,
                        0,
                        SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE,
                    )
                })
            };
            let _ = tx.send(result.map_err(|e| e.to_string()));
        })
        .map_err(|e| e.to_string())?;
    rx.await.map_err(|e| e.to_string())?
}

#[cfg(not(target_os = "windows"))]
pub async fn set_open(_app: &tauri::AppHandle, _open: bool) -> Result<(), String> {
    // Retain the verified hide/show path until native compositing is tested
    // for WebKitGTK/WKWebView. CSS stacking alone is not sufficient.
    Ok(())
}
