use crate::{persistence, runtime::Native, security};
use serde::{Deserialize, Serialize};
use tauri::Manager;
#[cfg(not(target_os = "linux"))]
use tauri_plugin_autostart::ManagerExt;
#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Startup {
    Yes,
    #[default]
    No,
    Minimized,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub version: u32,
    pub startup_open_mode: Startup,
    pub autostart_available: bool,
    pub website_permissions: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            version: 1,
            startup_open_mode: Startup::No,
            autostart_available: !cfg!(debug_assertions),
            website_permissions: cfg!(target_os = "windows"),
        }
    }
}
pub fn load(root: &std::path::Path) -> Result<Settings, String> {
    let mut s: Settings = persistence::read(&root.join("settings.json"))?.unwrap_or_default();
    if s.version != 1 {
        return Err("Unknown settings version".into());
    }
    s.autostart_available = !cfg!(debug_assertions);
    s.website_permissions = cfg!(target_os = "windows");
    Ok(s)
}
#[tauri::command]
pub async fn app_settings(
    webview: tauri::Webview,
    state: tauri::State<'_, Native>,
) -> Result<Settings, String> {
    security::trusted(&webview)?;
    let rt = state.0.lock().await;
    load(&rt.root)
}
#[tauri::command]
pub async fn set_startup(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    state: tauri::State<'_, Native>,
    mode: Startup,
) -> Result<Settings, String> {
    security::trusted(&webview)?;
    if cfg!(debug_assertions) {
        return Err("Autostart is unavailable in development builds".into());
    }
    let rt = state.0.lock().await;
    #[cfg(target_os = "linux")]
    {
        let executable = app
            .env()
            .appimage
            .map(std::path::PathBuf::from)
            .unwrap_or(std::env::current_exe().map_err(|e| e.to_string())?);
        crate::autostart_linux::set(
            &app.path().config_dir().map_err(|e| e.to_string())?,
            &executable,
            !matches!(mode, Startup::No),
        )?;
    }
    #[cfg(not(target_os = "linux"))]
    {
        let manager = app.autolaunch();
        match mode {
            Startup::No => manager.disable(),
            _ => manager.enable(),
        }
        .map_err(|e| e.to_string())?;
    }
    let s = Settings {
        startup_open_mode: mode,
        ..Settings::default()
    };
    persistence::write(&rt.root.join("settings.json"), &s)?;
    Ok(s)
}
pub fn badge(app: &tauri::AppHandle, count: u32) {
    let Some(window) = app.get_window("main") else {
        return;
    };
    let _ = window.set_title(&if count > 0 {
        format!("({count}) Omnia")
    } else {
        "Omnia".into()
    });
    #[cfg(target_os = "windows")]
    {
        if count == 0 {
            let _ = window.set_overlay_icon(None);
        } else {
            let _ = window.set_overlay_icon(Some(tauri::image::Image::new_owned(
                badge_pixels(count),
                16,
                16,
            )));
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = window.set_badge_count((count > 0).then_some(i64::from(count)));
    }
}
#[cfg(any(target_os = "windows", test))]
fn badge_pixels(count: u32) -> Vec<u8> {
    let glyphs = [
        [7, 5, 5, 5, 7],
        [2, 6, 2, 2, 7],
        [7, 1, 7, 4, 7],
        [7, 1, 7, 1, 7],
        [5, 5, 7, 1, 1],
        [7, 4, 7, 1, 7],
        [7, 4, 7, 5, 7],
        [7, 1, 1, 1, 1],
        [7, 5, 7, 5, 7],
        [7, 5, 7, 1, 7],
    ];
    let label = if count > 99 {
        "99+".into()
    } else {
        count.to_string()
    };
    let scale = if label.len() > 2 { 1 } else { 2 };
    let width = label.len() * (3 * scale + 1) - 1;
    let left = (16 - width) / 2;
    let top = (16 - 5 * scale) / 2;
    let mut pixels = vec![0; 16 * 16 * 4];
    for y in 0i32..16 {
        for x in 0i32..16 {
            if (x * 2 - 15).pow(2) + (y * 2 - 15).pow(2) <= 256 {
                let i = (y * 16 + x) as usize * 4;
                pixels[i..i + 4].copy_from_slice(&[255, 32, 86, 255]);
            }
        }
    }
    for (i, c) in label.chars().enumerate() {
        let glyph = if c == '+' {
            [2, 2, 7, 2, 2]
        } else {
            glyphs[c.to_digit(10).unwrap_or(0) as usize]
        };
        for (y, row) in glyph.iter().enumerate() {
            for x in 0..3 {
                if row & (1 << (2 - x)) != 0 {
                    for dy in 0..scale {
                        for dx in 0..scale {
                            let p = ((top + y * scale + dy) * 16
                                + left
                                + i * (3 * scale + 1)
                                + x * scale
                                + dx)
                                * 4;
                            pixels[p..p + 4].copy_from_slice(&[255; 4]);
                        }
                    }
                }
            }
        }
    }
    pixels
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn badge_has_transparent_corners_and_opaque_pixels() {
        for count in [1, 50, 9999] {
            let p = badge_pixels(count);
            assert_eq!(p.len(), 1024);
            assert_eq!(p[3], 0);
            assert!(p.chunks(4).any(|c| c == [255, 255, 255, 255]));
        }
    }
}
