//! Main-window preferences, independent of account and hosted website profiles.
use crate::persistence;
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Mutex};
use tauri::{Manager, Window};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
pub struct Saved {
    version: u8,
    pub width: f64,
    pub height: f64,
    pub maximized: bool,
}

impl Default for Saved {
    fn default() -> Self {
        Self {
            version: 1,
            width: 1200.,
            height: 800.,
            maximized: false,
        }
    }
}

impl Saved {
    fn valid(&self) -> bool {
        self.version == 1 && valid_size(self.width, self.height)
    }

    fn observe(
        &mut self,
        width: f64,
        height: f64,
        maximized: bool,
        minimized: bool,
        fullscreen: bool,
    ) {
        // Minimizing must not discard the last maximized state or normal bounds.
        // Fullscreen is a separate OS mode; do not save its monitor-sized bounds.
        if minimized || fullscreen || !valid_size(width, height) {
            return;
        }
        self.maximized = maximized;
        if !maximized {
            self.width = width;
            self.height = height;
        }
    }
}

fn valid_size(width: f64, height: f64) -> bool {
    (320. ..=32768.).contains(&width) && (240. ..=32768.).contains(&height)
}

pub struct Service {
    path: PathBuf,
    saved: Mutex<Saved>,
}

impl Service {
    pub fn load(root: &std::path::Path) -> Self {
        let path = root.join("window-state.json");
        let saved = match persistence::read::<Saved>(&path) {
            Ok(saved) => saved.filter(Saved::valid).unwrap_or_default(),
            Err(error) => {
                eprintln!("Window preferences unavailable; using defaults: {error}");
                Saved::default()
            }
        };
        Self {
            path,
            saved: Mutex::new(saved),
        }
    }

    pub fn snapshot(&self) -> Saved {
        *self.saved.lock().unwrap()
    }

    pub fn observe(&self, window: &Window) {
        if let (Ok(size), Ok(scale), Ok(maximized), Ok(minimized), Ok(fullscreen)) = (
            window.inner_size(),
            window.scale_factor(),
            window.is_maximized(),
            window.is_minimized(),
            window.is_fullscreen(),
        ) {
            let size = size.to_logical::<f64>(scale);
            self.saved.lock().unwrap().observe(
                size.width,
                size.height,
                maximized,
                minimized,
                fullscreen,
            );
        }
    }

    pub fn save(&self) {
        if let Err(error) = persistence::write(&self.path, &self.snapshot()) {
            eprintln!("Could not save window preferences: {error}");
        }
    }
}

pub fn save(app: &tauri::AppHandle) {
    if let Some(service) = app.try_state::<Service>() {
        if let Some(window) = app.get_window("main") {
            service.observe(&window);
        }
        service.save();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn restart_preserves_normal_bounds_and_maximized_state_even_when_minimized() {
        let root = tempfile::tempdir().unwrap();
        let service = Service::load(root.path());
        {
            let mut saved = service.saved.lock().unwrap();
            saved.observe(1000., 700., false, false, false);
            saved.observe(1920., 1080., true, false, false);
            saved.observe(0., 0., false, true, false);
        }
        service.save();
        let restored = Service::load(root.path());
        assert_eq!(
            restored.snapshot(),
            Saved {
                width: 1000.,
                height: 700.,
                maximized: true,
                ..Saved::default()
            }
        );
        restored
            .saved
            .lock()
            .unwrap()
            .observe(1000., 700., false, false, false);
        restored.save();
        assert!(!Service::load(root.path()).snapshot().maximized);
    }

    #[test]
    fn invalid_preferences_and_transient_sizes_do_not_break_startup() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("window-state.json");
        for data in [
            "invalid",
            r#"{"version":2,"width":1000,"height":700,"maximized":true}"#,
            r#"{"version":1,"width":0,"height":700,"maximized":true}"#,
        ] {
            std::fs::write(&path, data).unwrap();
            assert_eq!(Service::load(root.path()).snapshot(), Saved::default());
        }
        let mut saved = Saved::default();
        saved.observe(f64::NAN, 700., false, false, false);
        saved.observe(1920., 1080., false, false, true);
        assert_eq!(saved, Saved::default());
    }
}
