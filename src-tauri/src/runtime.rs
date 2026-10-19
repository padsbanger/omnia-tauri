use crate::{layout::Bounds, profiles, security, unread::Unread};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{
    webview::{NewWindowResponse, WebviewBuilder},
    Emitter, Manager, WebviewUrl,
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Route {
    pub id: String,
    pub label: String,
    pub icon: String,
    #[serde(rename = "loadURL")]
    pub url: String,
    #[serde(default)]
    pub internal_hosts: Vec<String>,
    #[serde(default)]
    pub is_hibernated: bool,
    #[serde(default)]
    pub zoom_level: f64,
    #[serde(default)]
    pub epoch: u64,
    #[serde(default)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favicon_url: Option<String>,
}
#[derive(Default)]
pub struct Signals {
    pub generations: HashMap<String, u64>,
    pub unread: Unread,
    pub last: HashMap<String, Instant>,
    pub favicons: std::collections::HashSet<String>,
}
pub struct Runtime {
    pub active_tab: Option<String>,
    pub window_layout: String,
    pub offline: bool,
    pub root: PathBuf,
    pub owner: String,
    pub routes: Vec<Route>,
    pub live: HashMap<String, String>,
    pub signals: Arc<Mutex<Signals>>,
    pub serial: u64,
    pub layout_revision: u64,
    pub drawer_open: bool,
}
impl Runtime {
    pub fn new(root: PathBuf) -> Self {
        Self {
            active_tab: None,
            window_layout: "single".into(),
            offline: false,
            root,
            owner: String::new(),
            routes: vec![],
            live: HashMap::new(),
            signals: Arc::default(),
            serial: 0,
            layout_revision: 0,
            drawer_open: false,
        }
    }
    pub fn route(&self, id: &str) -> Result<Route, String> {
        self.routes
            .iter()
            .find(|r| r.id == id)
            .cloned()
            .ok_or("Unknown route".into())
    }
    pub fn create(&mut self, app: &tauri::AppHandle, id: &str) -> Result<(), String> {
        if self.live.contains_key(id) {
            return Ok(());
        }
        let route = self.route(id)?;
        let url = security::website(&route.url)?;
        if self.owner.is_empty() {
            return Err("No workspace owner".into());
        }
        self.serial += 1;
        let generation = self.serial;
        let label = format!(
            "route-{}-{generation}",
            &profiles::key(&self.owner, id)[..24]
        );
        let profile = profiles::directory(&self.root, &self.owner, id, route.epoch);
        std::fs::create_dir_all(&profile).map_err(|e| e.to_string())?;
        let mut hosts = route.internal_hosts.clone();
        hosts.push(url.host_str().unwrap_or_default().into());
        let nav_hosts = hosts.clone();
        let popup_hosts = hosts.clone();
        let popup_app = app.clone();
        let popup_label = label.clone();
        let popup_profile = profile.clone();
        let signals = self.signals.clone();
        let route_id = id.to_string();
        let title_app = app.clone();
        let trace = crate::navigation_trace::Trace::new(&self.root, &label);
        let nav_trace = trace.clone();
        trace.record("route_created", &url);
        let mut builder = WebviewBuilder::new(&label, WebviewUrl::External(url))
            .data_directory(profile)
            .on_navigation(move |url| nav_trace.navigate(url, &nav_hosts))
            .on_new_window(move |url, features| {
                trace.record("popup_requested", &url);
                let preserve = security::preserve_popup(&url, &popup_hosts);
                if !preserve && !trace.navigate(&url, &popup_hosts) {
                    return NewWindowResponse::Deny;
                }
                if !preserve {
                    trace.record("popup_redirected_to_parent", &url);
                    if let Some(view) = popup_app.get_webview(&popup_label) {
                        let _ = view.navigate(url);
                    }
                    return NewWindowResponse::Deny;
                }
                let popup_nav = popup_hosts.clone();
                let popup_trace = trace.popup();
                let nested_trace = popup_trace.clone();
                let p = tauri::WebviewWindowBuilder::new(
                    &popup_app,
                    format!("{popup_label}-popup"),
                    WebviewUrl::External("about:blank".parse().unwrap()),
                )
                .window_features(features)
                .data_directory(popup_profile.clone())
                .title("Omnia — service sign-in")
                .on_navigation(move |u| {
                    u.as_str() == "about:blank" || popup_trace.navigate(u, &popup_nav)
                })
                .on_new_window(move |u, _| {
                    nested_trace.record("nested_popup_denied", &u);
                    NewWindowResponse::Deny
                })
                .on_permission_request(|_, _| tauri::webview::PermissionResponse::Deny)
                .build();
                match p {
                    Ok(window) => {
                        trace.record("popup_created", &url);
                        NewWindowResponse::Create { window }
                    }
                    Err(_) => {
                        trace.record("popup_creation_failed", &url);
                        NewWindowResponse::Deny
                    }
                }
            })
            .on_permission_request(|_, _| tauri::webview::PermissionResponse::Deny)
            .on_document_title_changed(move |_, title| {
                let mut s = signals.lock().unwrap();
                if s.generations.get(&route_id) != Some(&generation) {
                    return;
                }
                let count = title
                    .strip_prefix('(')
                    .and_then(|t| t.split(')').next())
                    .and_then(|s| s.parse::<u32>().ok())
                    .unwrap_or(0);
                s.unread.update(&route_id, count, "title");
                crate::platform::badge(&title_app, s.unread.snapshot().total);
                if let Some(shell) = title_app.get_webview("shell") {
                    let _ = shell.emit("unread", s.unread.snapshot());
                }
            })
            .initialization_script(include_str!("route_signal.js"));
        #[cfg(target_os = "macos")]
        {
            let hash =
                hex::decode(profiles::key(&self.owner, &format!("{id}:{}", route.epoch))).unwrap();
            let mut store = [0u8; 16];
            store.copy_from_slice(&hash[..16]);
            builder = builder.data_store_identifier(store);
        }
        if cfg!(debug_assertions) && std::env::var_os("OMNIA_SMOKE").is_some() {
            let port = if id == "fixture-a" {
                if self.owner == "native-fixture" {
                    9223 + route.epoch * 2
                } else {
                    9323 + route.epoch * 2
                }
            } else {
                if self.owner == "native-fixture" {
                    9224 + route.epoch * 2
                } else {
                    9324 + route.epoch * 2
                }
            };
            builder = builder.additional_browser_args(&format!("--remote-debugging-port={port}"));
        }
        self.signals
            .lock()
            .unwrap()
            .generations
            .insert(id.into(), generation);
        let window = app.get_window("main").ok_or("Main window unavailable")?;
        let view = window
            .add_child(
                builder,
                tauri::LogicalPosition::new(108., 100.),
                tauri::LogicalSize::new(400., 400.),
            )
            .map_err(|e| e.to_string())?;
        crate::permissions::install(&view, route.url.clone(), route.icon == "gmail")?;
        #[cfg(target_os = "linux")]
        crate::geometry_linux::bounds(
            &view,
            Bounds {
                x: 108.,
                y: 100.,
                width: 400.,
                height: 400.,
            },
        )?;
        view.hide().map_err(|e| e.to_string())?;
        view.set_zoom(1.2_f64.powf(route.zoom_level))
            .map_err(|e| e.to_string())?;
        self.live.insert(id.into(), label);
        if let Some(r) = self.routes.iter_mut().find(|r| r.id == id) {
            r.is_hibernated = false;
        }
        Ok(())
    }
    pub fn close(&mut self, app: &tauri::AppHandle, id: &str) -> Result<(), String> {
        {
            let mut s = self.signals.lock().unwrap();
            s.generations.remove(id);
            s.last.remove(id);
            s.favicons.remove(id);
            s.unread.remove(id);
            crate::platform::badge(app, s.unread.snapshot().total);
            if let Some(shell) = app.get_webview("shell") {
                let _ = shell.emit("unread", s.unread.snapshot());
            }
        }
        if let Some(label) = self.live.remove(id) {
            if let Some(p) = app.get_webview_window(&format!("{label}-popup")) {
                p.close().map_err(|e| e.to_string())?;
            }
            if let Some(v) = app.get_webview(&label) {
                v.close().map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }
    pub fn close_all(&mut self, app: &tauri::AppHandle) -> Result<(), String> {
        let ids: Vec<_> = self.live.keys().cloned().collect();
        for id in ids {
            self.close(app, &id)?;
        }
        Ok(())
    }
}
pub struct Native(pub tokio::sync::Mutex<Runtime>);
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Placement {
    pub route_id: String,
    pub bounds: Bounds,
}
#[tauri::command]
pub async fn layout_views(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    state: tauri::State<'_, Native>,
    revision: u64,
    placements: Vec<Placement>,
    drawer: bool,
) -> Result<bool, String> {
    security::trusted(&webview)?;
    if placements.len() > 64 {
        return Err("Too many views".into());
    }
    let mut rt = state.0.lock().await;
    if revision < rt.layout_revision {
        return Ok(crate::drawer_layer::LIVE_BACKDROP);
    }
    rt.layout_revision = revision;
    for p in &placements {
        p.bounds.validate()?;
        rt.route(&p.route_id)?;
    }
    let hide_for_drawer = drawer && !crate::drawer_layer::LIVE_BACKDROP;
    for (id, label) in &rt.live {
        if hide_for_drawer || !placements.iter().any(|p| p.route_id == *id) {
            if let Some(v) = app.get_webview(label) {
                v.hide().map_err(|e| e.to_string())?;
            }
        }
    }
    if hide_for_drawer {
        webview.set_focus().map_err(|e| e.to_string())?;
        rt.drawer_open = true;
        return Ok(false);
    }
    let awake: Vec<_> = rt
        .routes
        .iter()
        .filter(|r| !r.is_hibernated)
        .map(|r| r.id.clone())
        .collect();
    for id in awake {
        rt.create(&app, &id)?;
    }
    for p in placements {
        if rt.route(&p.route_id)?.is_hibernated {
            continue;
        }
        rt.create(&app, &p.route_id)?;
        if let Some(v) = rt
            .live
            .get(&p.route_id)
            .and_then(|label| app.get_webview(label))
        {
            #[cfg(target_os = "linux")]
            crate::geometry_linux::bounds(&v, p.bounds)?;
            #[cfg(not(target_os = "linux"))]
            v.set_bounds(tauri::Rect {
                position: tauri::LogicalPosition::new(p.bounds.x, p.bounds.y).into(),
                size: tauri::LogicalSize::new(p.bounds.width, p.bounds.height).into(),
            })
            .map_err(|e| e.to_string())?;
            v.show().map_err(|e| e.to_string())?;
        }
    }
    crate::drawer_layer::set_open(&app, drawer).await?;
    if drawer != rt.drawer_open {
        if drawer {
            webview.set_focus().map_err(|e| e.to_string())?;
        } else if let Some(view) = rt
            .active_tab
            .as_ref()
            .and_then(|id| rt.live.get(id))
            .and_then(|label| app.get_webview(label))
        {
            view.set_focus().map_err(|e| e.to_string())?;
        }
    }
    rt.drawer_open = drawer;
    Ok(crate::drawer_layer::LIVE_BACKDROP)
}
#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Refresh,
    Focus,
    Hibernate,
    Restore,
    ClearSession,
    ZoomIn,
    ZoomOut,
}
#[tauri::command]
pub async fn route_action(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    state: tauri::State<'_, Native>,
    id: String,
    action: Action,
) -> Result<Route, String> {
    security::trusted(&webview)?;
    let mut rt = state.0.lock().await;
    let route = rt.route(&id)?;
    match action {
        Action::Hibernate => {
            rt.close(&app, &id)?;
            rt.routes
                .iter_mut()
                .find(|r| r.id == id)
                .unwrap()
                .is_hibernated = true;
        }
        Action::ClearSession => {
            rt.create(&app, &id)?;
            if let Some(v) = rt.live.get(&id).and_then(|l| app.get_webview(l)) {
                v.clear_all_browsing_data().map_err(|e| e.to_string())?;
            }
            rt.close(&app, &id)?;
            rt.routes.iter_mut().find(|r| r.id == id).unwrap().epoch += 1;
            crate::workspace::save(&rt)?;
            crate::workspace::cleanup_epoch(&rt, &route)?;
            crate::workspace::cleanup_closed_profiles(&rt.root)?;
            rt.create(&app, &id)?;
        }
        Action::Restore => {
            rt.create(&app, &id)?;
        }
        Action::Refresh | Action::Focus | Action::ZoomIn | Action::ZoomOut => {
            rt.create(&app, &id)?;
            let v = rt
                .live
                .get(&id)
                .and_then(|l| app.get_webview(l))
                .ok_or("View unavailable")?;
            match action {
                Action::Refresh => v.reload().map_err(|e| e.to_string())?,
                Action::Focus => v.set_focus().map_err(|e| e.to_string())?,
                _ => {
                    let delta = if matches!(action, Action::ZoomIn) {
                        0.5
                    } else {
                        -0.5
                    };
                    let level = (route.zoom_level + delta).clamp(-3., 3.);
                    v.set_zoom(1.2_f64.powf(level)).map_err(|e| e.to_string())?;
                    rt.routes
                        .iter_mut()
                        .find(|r| r.id == id)
                        .unwrap()
                        .zoom_level = level;
                }
            }
        }
    }
    crate::workspace::save(&rt)?;
    rt.route(&id)
}
#[tauri::command]
pub async fn unread_snapshot(
    webview: tauri::Webview,
    state: tauri::State<'_, Native>,
) -> Result<crate::unread::Snapshot, String> {
    security::trusted(&webview)?;
    let rt = state.0.lock().await;
    let s = rt.signals.lock().unwrap().unread.snapshot();
    Ok(s)
}
#[tauri::command]
pub async fn page_signal(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    state: tauri::State<'_, Native>,
    count: u32,
    source: String,
) -> Result<(), String> {
    if source.len() > 48
        || !matches!(
            source.as_str(),
            "title" | "gmail-title" | "gmail-dom" | "telegram-app-badge" | "telegram-dom" | "dom"
        )
    {
        return Err("Invalid signal".into());
    }
    let rt = state.0.lock().await;
    let id = rt
        .live
        .iter()
        .find(|(_, l)| l.as_str() == webview.label())
        .map(|(id, _)| id.clone())
        .ok_or("Untrusted signal origin")?;
    let mut s = rt.signals.lock().unwrap();
    if s.last
        .get(&id)
        .is_some_and(|t| t.elapsed() < Duration::from_millis(200))
    {
        return Err("Unread update rate limited; retry".into());
    }
    s.last.insert(id.clone(), Instant::now());
    s.unread.update(&id, count, &source);
    crate::platform::badge(&app, s.unread.snapshot().total);
    if let Some(shell) = app.get_webview("shell") {
        shell
            .emit("unread", s.unread.snapshot())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
pub async fn page_favicon(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    state: tauri::State<'_, Native>,
    url: String,
) -> Result<(), String> {
    if url.len() > 4096 {
        return Err("Favicon too long".into());
    }
    security::website(&url)?;
    let mut rt = state.0.lock().await;
    let id = rt
        .live
        .iter()
        .find(|(_, l)| l.as_str() == webview.label())
        .map(|(id, _)| id.clone())
        .ok_or("Untrusted favicon origin")?;
    if rt.route(&id)?.icon != "link" || !rt.signals.lock().unwrap().favicons.insert(id.clone()) {
        return Ok(());
    }
    rt.routes
        .iter_mut()
        .find(|r| r.id == id)
        .unwrap()
        .favicon_url = Some(url.clone());
    crate::workspace::save(&rt)?;
    if let Some(shell) = app.get_webview("shell") {
        shell
            .emit(
                "favicon",
                serde_json::json!({"routeId":id,"faviconUrl":url}),
            )
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
