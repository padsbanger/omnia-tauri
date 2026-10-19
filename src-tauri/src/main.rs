#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod api;
mod auth;
mod config;
mod layout;
mod permissions;
mod persistence;
mod platform;
mod profiles;
mod runtime;
mod security;
mod unread;
mod workspace;

use tauri::Manager;
#[tauri::command]
async fn smoke_inspect(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    state: tauri::State<'_, runtime::Native>,
) -> Result<serde_json::Value, String> {
    security::trusted(&webview)?;
    if !cfg!(debug_assertions) || std::env::var_os("OMNIA_SMOKE").is_none() {
        return Err("Smoke mode disabled".into());
    }
    let rt = state.0.lock().await;
    let window = app.get_window("main").ok_or("Missing window")?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let mut views = vec![];
    for (id, label) in &rt.live {
        if let Some(v) = app.get_webview(label) {
            let p = v.position().map_err(|e| e.to_string())?;
            let size = v.size().map_err(|e| e.to_string())?;
            #[cfg(target_os = "windows")]
            let visible = {
                let (tx, rx) = std::sync::mpsc::channel();
                v.with_webview(move |w| {
                    let mut visible = windows::core::BOOL::default();
                    let result = unsafe { w.controller().IsVisible(&mut visible) };
                    let _ = tx.send(result.map(|_| visible.as_bool()).map_err(|e| e.to_string()));
                })
                .map_err(|e| e.to_string())?;
                Some(
                    rx.recv_timeout(std::time::Duration::from_secs(5))
                        .map_err(|e| e.to_string())??,
                )
            };
            #[cfg(not(target_os = "windows"))]
            let visible: Option<bool> = None;
            views.push(serde_json::json!({"id":id,"label":label,"x":p.x,"y":p.y,"width":size.width,"height":size.height,"visible":visible}));
        }
    }
    Ok(serde_json::json!({"scale":scale,"views":views}))
}
#[tauri::command]
async fn spike_seed(
    webview: tauri::Webview,
    state: tauri::State<'_, runtime::Native>,
) -> Result<Vec<runtime::Route>, String> {
    security::trusted(&webview)?;
    if !cfg!(debug_assertions) || std::env::var_os("OMNIA_SMOKE").is_none() {
        return Err("Smoke mode disabled".into());
    }
    let mut rt = state.0.lock().await;
    rt.owner = "native-fixture".into();
    rt.layout_revision = 0;
    rt.routes = ["fixture-a", "fixture-b"]
        .iter()
        .map(|id| runtime::Route {
            id: (*id).into(),
            label: (*id).into(),
            icon: "link".into(),
            url: "http://127.0.0.1:7890/".into(),
            internal_hosts: vec!["127.0.0.1".into()],
            is_hibernated: false,
            zoom_level: 0.,
            epoch: 0,
            favicon_url: None,
        })
        .collect();
    Ok(rt.routes.clone())
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            auth::dispatch_callbacks(app, args);
            if let Some(w) = app.get_window("main") {
                let _ = w.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("Omnia Tauri")
                .arg("--from-autostart")
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            spike_seed,
            smoke_inspect,
            runtime::layout_views,
            runtime::route_action,
            runtime::unread_snapshot,
            runtime::page_signal,
            runtime::page_favicon,
            auth::auth_login,
            auth::auth_cancel,
            workspace::auth_logout,
            workspace::workspace_bootstrap,
            workspace::route_create,
            workspace::route_update,
            workspace::route_delete,
            workspace::workspace_preferences,
            platform::app_settings,
            platform::set_startup
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let version = std::process::Command::new("/usr/bin/sw_vers")
                    .arg("-productVersion")
                    .output()?;
                let major = String::from_utf8_lossy(&version.stdout)
                    .split('.')
                    .next()
                    .and_then(|s| s.parse::<u32>().ok())
                    .unwrap_or(0);
                if major < 14 {
                    return Err(std::io::Error::other(
                        "Omnia requires macOS 14+ for isolated persistent website stores",
                    )
                    .into());
                }
            }
            let mut root = app.path().app_local_data_dir()?;
            if cfg!(debug_assertions) {
                root = root.join("development");
            }
            if cfg!(debug_assertions) && std::env::var_os("OMNIA_SMOKE").is_some() {
                root = root.join("smoke");
            }
            std::fs::create_dir_all(&root)?;
            let config = config::Config::load(&root).map_err(std::io::Error::other)?;
            app.manage(auth::Service(
                tokio::sync::Mutex::new(auth::Auth::new(config)),
                tokio::sync::Notify::new(),
            ));
            workspace::recover_cleanup(&root).map_err(std::io::Error::other)?;
            workspace::recover_epochs(&root).map_err(std::io::Error::other)?;
            app.manage(runtime::Native(tokio::sync::Mutex::new(
                runtime::Runtime::new(root.clone()),
            )));
            let window = tauri::window::WindowBuilder::new(app, "main")
                .title("Omnia Tauri")
                .inner_size(1200., 800.)
                .build()?;
            let mut shell = tauri::webview::WebviewBuilder::new(
                "shell",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .data_directory(root.join("shell"))
            .on_navigation(security::shell_url)
            .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny);
            if cfg!(debug_assertions) && std::env::var_os("OMNIA_SMOKE").is_some() {
                shell = shell.additional_browser_args("--remote-debugging-port=9222");
            }
            window.add_child(
                shell,
                tauri::LogicalPosition::new(0., 0.),
                tauri::LogicalSize::new(1200., 800.),
            )?;
            auth::dispatch_callbacks(app.handle(), std::env::args().collect());
            if std::env::args().any(|a| a == "--from-autostart")
                && matches!(
                    platform::load(&root).map(|s| s.startup_open_mode),
                    Ok(platform::Startup::Minimized)
                )
            {
                window.minimize()?;
            }
            let handle = app.handle().clone();
            window.on_window_event(move |e| {
                if matches!(e, tauri::WindowEvent::CloseRequested { .. }) {
                    // The workspace owns its login and hosted-popup windows.
                    // Closing it must not leave those windows or background views running.
                    handle.exit(0);
                }
                if let tauri::WindowEvent::Resized(size) = e {
                    if let Some(shell) = handle.get_webview("shell") {
                        let _ = shell.set_size(*size);
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Omnia native runtime failed")
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                auth::dispatch_callbacks(_app, urls.into_iter().map(|u| u.to_string()).collect());
            }
        });
}
