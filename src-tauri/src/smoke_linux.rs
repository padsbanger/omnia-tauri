//! Local test transport, compiled out of release builds. No web-facing command.
use gtk::prelude::*;
use javascriptcore::ValueExt;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    os::unix::{fs::PermissionsExt, net::UnixListener},
    time::Duration,
};
use tauri::Manager;
use webkit2gtk::{WebViewExt, WebsiteDataManagerExt};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    op: String,
    #[serde(default)]
    label: String,
    #[serde(default)]
    script: String,
}

pub fn start(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    if std::env::var("OMNIA_SMOKE").as_deref() != Ok("1") {
        return Ok(());
    }
    let Some(directory) = std::env::var_os("OMNIA_SMOKE_CONTROL") else {
        return Ok(());
    };
    let directory = std::path::PathBuf::from(directory);
    let metadata = std::fs::symlink_metadata(&directory)?;
    if !metadata.is_dir() || metadata.permissions().mode() & 0o077 != 0 {
        return Err("Smoke control directory must be private (0700)".into());
    }
    for (variable, child) in [
        ("XDG_DATA_HOME", "data"),
        ("XDG_CONFIG_HOME", "config"),
        ("XDG_CACHE_HOME", "cache"),
    ] {
        if std::env::var_os(variable).map(std::path::PathBuf::from) != Some(directory.join(child)) {
            return Err("Smoke control requires isolated XDG storage".into());
        }
    }
    let listener = UnixListener::bind(directory.join("control.sock"))?;
    std::fs::set_permissions(
        directory.join("control.sock"),
        std::fs::Permissions::from_mode(0o600),
    )?;
    let app = app.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { break };
            let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
            let mut line = String::new();
            let result = BufReader::new(&stream)
                .take(65537)
                .read_line(&mut line)
                .map_err(|e| e.to_string())
                .and_then(|_| {
                    if line.len() > 65536 {
                        return Err("Request too large".into());
                    }
                    serde_json::from_str::<Request>(&line).map_err(|e| e.to_string())
                })
                .and_then(|r| execute(&app, r));
            let response = match result {
                Ok(value) => json!({"value":value}),
                Err(error) => json!({"error":error}),
            };
            let _ = writeln!(stream, "{response}");
        }
    });
    Ok(())
}

fn execute(app: &tauri::AppHandle, request: Request) -> Result<Value, String> {
    if request.op == "autostart" {
        let config = app.path().config_dir().map_err(|e| e.to_string())?;
        let executable = std::env::current_exe().map_err(|e| e.to_string())?;
        crate::autostart_linux::set(&config, &executable, true)?;
        let path = config.join("autostart/com.strielok.omnia.tauri.desktop");
        let entry = std::fs::read_to_string(&path).map_err(|e| e.to_string());
        crate::autostart_linux::set(&config, &executable, false)?;
        return Ok(json!({"enabled":entry.is_ok(),"disabled":!path.exists(),"entry":entry?}));
    }
    if request.op == "exit" {
        app.exit(0);
        return Ok(Value::Null);
    }
    if request.op == "list" {
        return Ok(json!(app.webviews().keys().collect::<Vec<_>>()));
    }
    let view = app.get_webview(&request.label).ok_or("View unavailable")?;
    let (tx, rx) = std::sync::mpsc::channel();
    view.with_webview(move |native| {
        let view = native.inner();
        if request.op == "inspect" {
            let context = view.context();
            let manager = view.website_data_manager();
            let allocation = view.allocation();
            let _ = tx.send(Ok(json!({
                "visible":view.is_visible(), "mapped":view.is_mapped(), "focus":view.has_focus(),
                "x":allocation.x(), "y":allocation.y(), "width":allocation.width(), "height":allocation.height(),
                "scale":view.scale_factor(), "zoom":view.zoom_level(),
                "widthRequest":view.width_request(), "heightRequest":view.height_request(),
                "displayBackend":view.display().type_().name(),
                "playingAudio":view.is_playing_audio(),
                "context":context.map(|c| format!("{:p}", c.as_ptr())),
                "manager":manager.as_ref().map(|m| format!("{:p}", m.as_ptr())),
                "directory":manager.and_then(|m| m.base_data_directory()).map(|p|p.to_string()),
            })));
        } else if request.op == "eval" {
            // The source comes exclusively from the local private socket, never page data.
            view.call_async_javascript_function(
                &request.script, None, None, None, None::<&webkit2gtk::gio::Cancellable>,
                move |result| {
                    let value = result.map_err(|e| e.to_string()).and_then(|v| {
                        serde_json::from_str(&v.to_str()).map_err(|e|e.to_string())
                    });
                    let _ = tx.send(value);
                },
            );
        } else {
            let _ = tx.send(Err("Unknown smoke operation".into()));
        }
    }).map_err(|e|e.to_string())?;
    rx.recv_timeout(Duration::from_secs(30))
        .map_err(|e| e.to_string())?
}
