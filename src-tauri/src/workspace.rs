use crate::{
    api,
    auth::{Error, Result, Service, User},
    persistence, profiles,
    runtime::{Native, Route, Runtime},
    security,
};
use serde::{Deserialize, Serialize};
use tauri::Manager;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cache {
    pub version: u32,
    pub owner: String,
    pub routes: Vec<Route>,
    pub active_tab: Option<String>,
    pub window_layout: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub user: Option<User>,
    pub routes: Vec<Route>,
    pub is_offline: bool,
    pub active_tab: Option<String>,
    pub window_layout: String,
    pub warning: Option<String>,
}
fn cache_path(rt: &Runtime) -> std::path::PathBuf {
    rt.root
        .join("workspaces")
        .join(format!("{}.json", profiles::key(&rt.owner, "workspace")))
}
pub fn save(rt: &Runtime) -> std::result::Result<(), String> {
    if rt.owner.is_empty() {
        return Ok(());
    }
    persistence::write(
        &cache_path(rt),
        &Cache {
            version: 1,
            owner: rt.owner.clone(),
            routes: rt.routes.clone(),
            active_tab: rt.active_tab.clone(),
            window_layout: rt.window_layout.clone(),
        },
    )
}
fn load(rt: &mut Runtime) -> Result<()> {
    if let Some(mut c) = persistence::read::<Cache>(&cache_path(rt))? {
        if c.version != 1 || c.owner != rt.owner || c.routes.len() > 64 {
            return Err("Saved workspace has invalid schema or ownership".into());
        }
        let mut ids = std::collections::HashSet::new();
        for r in &mut c.routes {
            validate_route(r)?;
            r.internal_hosts = hosts(&r.icon, &r.url);
            if !ids.insert(r.id.clone()) {
                return Err("Duplicate saved route identity".into());
            }
        }
        if !["single", "spread", "matrix"].contains(&c.window_layout.as_str()) {
            return Err("Invalid saved layout".into());
        }
        rt.routes = c.routes;
        rt.active_tab = c.active_tab;
        rt.window_layout = c.window_layout;
    }
    Ok(())
}
fn validate_route(r: &Route) -> Result<()> {
    if r.id.is_empty()
        || r.id.len() > 200
        || r.label.trim().is_empty()
        || r.label.len() > 200
        || !r.zoom_level.is_finite()
        || !(-3.0..=3.0).contains(&r.zoom_level)
    {
        return Err("Invalid route record".into());
    }
    security::website(&r.url)?;
    Ok(())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NavigationRule {
    icon: String,
    internal_hosts: Vec<String>,
    #[serde(default)]
    host_suffixes: Vec<String>,
    #[serde(default)]
    exact_hosts: Vec<String>,
}
pub(crate) fn hosts(icon: &str, url: &str) -> Vec<String> {
    let rules: Vec<NavigationRule> = serde_json::from_str(include_str!("navigation-rules.json"))
        .expect("Static navigation rules");
    let host = url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_owned))
        .unwrap_or_default();
    rules
        .into_iter()
        .find(|r| {
            r.icon == icon
                || r.host_suffixes
                    .iter()
                    .any(|suffix| security::matches_host(&host, suffix))
                || r.exact_hosts.contains(&host)
        })
        .map(|r| r.internal_hosts)
        .unwrap_or_else(|| vec![host])
}

fn local(a: api::ApiRoute, _owner: &str, old: Option<&Route>) -> Result<Route> {
    // The backend may use an internal userId distinct from OIDC sub.
    // This record was obtained through the authenticated native client; cache ownership is OIDC-scoped.
    let icon = a.icon.unwrap_or("link".into());
    let route = Route {
        id: a.id,
        label: a.name,
        internal_hosts: hosts(&icon, &a.url),
        icon,
        url: a.url,
        is_hibernated: old.is_some_and(|r| r.is_hibernated),
        zoom_level: old.map_or(0., |r| r.zoom_level),
        epoch: old.map_or(0, |r| r.epoch),
        favicon_url: old.and_then(|r| r.favicon_url.clone()),
    };
    validate_route(&route)?;
    Ok(route)
}
fn snapshot(rt: &Runtime, user: Option<User>, offline: bool, warning: Option<String>) -> Snapshot {
    Snapshot {
        user,
        routes: rt.routes.clone(),
        is_offline: offline,
        active_tab: rt.active_tab.clone(),
        window_layout: rt.window_layout.clone(),
        warning,
    }
}
#[tauri::command]
pub async fn workspace_bootstrap(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    state: tauri::State<'_, Native>,
    auth: tauri::State<'_, Service>,
) -> Result<Snapshot> {
    security::trusted(&webview)?;
    let mut a = auth.0.lock().await;
    a.load()?;
    let mut rt = state.0.lock().await;
    let Some(user) = a.user.clone() else {
        rt.close_all(&app)?;
        rt.routes.clear();
        rt.owner.clear();
        return Ok(snapshot(&rt, None, false, None));
    };
    let owner = a.owner().ok_or("Missing workspace identity")?;
    if rt.owner != owner {
        rt.close_all(&app)?;
        rt.routes.clear();
        rt.owner = owner.clone();
        rt.active_tab = None;
        load(&mut rt)?;
    }
    let result = async {
        a.verify().await?;
        api::list(&mut a).await
    }
    .await;
    match result {
        Ok(routes) => {
            if routes.len() > 64 {
                return Err("Workspace route limit reached".into());
            }
            let next: Vec<Route> = routes
                .into_iter()
                .map(|r| {
                    let old = rt.routes.iter().find(|x| x.id == r.id);
                    local(r, &owner, old)
                })
                .collect::<Result<_>>()?;
            let removed: Vec<_> = rt
                .routes
                .iter()
                .filter(|r| !next.iter().any(|n| n.id == r.id))
                .cloned()
                .collect();
            for r in removed {
                rt.close(&app, &r.id)?;
                queue_cleanup(&rt, &r)?;
            }
            let changed: Vec<_> = rt
                .routes
                .iter()
                .filter(|r| {
                    next.iter().any(|n| {
                        n.id == r.id && (n.url != r.url || n.internal_hosts != r.internal_hosts)
                    })
                })
                .map(|r| r.id.clone())
                .collect();
            for id in changed {
                rt.close(&app, &id)?;
            }
            rt.routes = next;
            if !rt
                .routes
                .iter()
                .any(|r| Some(&r.id) == rt.active_tab.as_ref())
            {
                rt.active_tab = rt.routes.first().map(|r| r.id.clone());
            }
            rt.offline = false;
            save(&rt)?;
            Ok(snapshot(&rt, Some(user), false, None))
        }
        Err(e) => {
            if a.user.is_none() || matches!(e.status, Some(400 | 401 | 403)) {
                rt.close_all(&app)?;
                rt.routes.clear();
                rt.owner.clear();
                return Err(e);
            }
            if rt.routes.is_empty() {
                return Err(e);
            }
            rt.offline = true;
            Ok(snapshot(&rt, Some(user), true, Some(e.message)))
        }
    }
}
#[tauri::command]
pub async fn route_create(
    webview: tauri::Webview,
    state: tauri::State<'_, Native>,
    auth: tauri::State<'_, Service>,
    route: api::Create,
) -> Result<Vec<Route>> {
    security::trusted(&webview)?;
    security::website(&route.url)?;
    validate_name(&route.name)?;
    let mut a = auth.0.lock().await;
    let mut rt = state.0.lock().await;
    authorized(&a, &rt)?;
    if rt.routes.len() >= 64 {
        return Err("Workspace route limit reached".into());
    }
    let response = api::request(
        &mut a,
        reqwest::Method::POST,
        None,
        Some(serde_json::to_value(route).map_err(|e| e.to_string())?),
    )
    .await?;
    let created: api::OneRoute = serde_json::from_value(response)
        .map_err(|_| Error::from("Route created but response invalid; reconnect to reconcile"))?;
    let route = local(created.route, &rt.owner, None)?;
    rt.active_tab = Some(route.id.clone());
    rt.routes.push(route);
    save(&rt)?;
    Ok(rt.routes.clone())
}
fn authorized(a: &crate::auth::Auth, rt: &Runtime) -> Result<()> {
    if a.owner().as_deref() != Some(rt.owner.as_str()) || rt.offline {
        return Err("Online authenticated workspace required".into());
    }
    Ok(())
}
fn validate_name(name: &str) -> Result<()> {
    if name.trim().is_empty() || name.len() > 200 {
        return Err("Route name must be 1–200 bytes".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn route_update(
    webview: tauri::Webview,
    state: tauri::State<'_, Native>,
    auth: tauri::State<'_, Service>,
    id: String,
    mut update: api::Update,
) -> Result<Vec<Route>> {
    security::trusted(&webview)?;
    if let Some(name) = &mut update.name {
        *name = name.trim().into();
        validate_name(name)?;
    }
    if update.name.is_none() && update.order.is_none() {
        return Err("No route updates".into());
    }
    let mut a = auth.0.lock().await;
    let mut rt = state.0.lock().await;
    authorized(&a, &rt)?;
    let old = rt.route(&id)?;
    let response = api::request(
        &mut a,
        reqwest::Method::PATCH,
        Some(&id),
        Some(serde_json::to_value(&update).map_err(|e| e.to_string())?),
    )
    .await?;
    let updated: api::OneRoute = serde_json::from_value(response)
        .map_err(|_| Error::from("Route updated but response invalid; reconnect to reconcile"))?;
    if updated.route.id != id {
        return Err("Backend returned another route".into());
    }
    let route = local(updated.route, &rt.owner, Some(&old))?;
    let index = rt.routes.iter().position(|r| r.id == id).unwrap();
    rt.routes[index] = route;
    save(&rt)?;
    Ok(rt.routes.clone())
}
fn queue_cleanup(rt: &Runtime, r: &Route) -> Result<()> {
    let path = rt.root.join("cleanup.json");
    let mut pending: Vec<String> = persistence::read(&path)?.unwrap_or_default();
    let key = profiles::key(&rt.owner, &r.id);
    if !pending.contains(&key) {
        pending.push(key);
    }
    persistence::write(&path, &pending)?;
    Ok(())
}
pub fn recover_cleanup(root: &std::path::Path) -> std::result::Result<(), String> {
    let path = root.join("cleanup.json");
    let pending: Vec<String> = persistence::read(&path)?.unwrap_or_default();
    let mut remaining = vec![];
    for key in pending {
        if key.len() != 64 || !key.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err("Invalid cleanup journal".into());
        }
        let p = root.join("profiles").join(&key);
        if p.exists() && profiles::cleanup(root, &p).is_err() {
            remaining.push(key);
        }
    }
    persistence::write(&path, &remaining)
}
pub fn cleanup_epoch(rt: &Runtime, r: &Route) -> std::result::Result<(), String> {
    let path = rt.root.join("cleanup-epochs.json");
    let mut pending: Vec<(String, u64)> = persistence::read(&path)?.unwrap_or_default();
    pending.push((profiles::key(&rt.owner, &r.id), r.epoch));
    persistence::write(&path, &pending)
}
pub fn recover_epochs(root: &std::path::Path) -> std::result::Result<(), String> {
    let path = root.join("cleanup-epochs.json");
    let pending: Vec<(String, u64)> = persistence::read(&path)?.unwrap_or_default();
    let mut remaining = vec![];
    for (key, epoch) in pending {
        if key.len() != 64 || !key.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err("Invalid cleanup journal".into());
        }
        let p = root.join("profiles").join(&key).join(epoch.to_string());
        if p.exists() && profiles::cleanup(root, &p).is_err() {
            remaining.push((key, epoch));
        }
    }
    persistence::write(&path, &remaining)
}
#[tauri::command]
pub async fn route_delete(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    state: tauri::State<'_, Native>,
    auth: tauri::State<'_, Service>,
    id: String,
) -> Result<Vec<Route>> {
    security::trusted(&webview)?;
    let mut a = auth.0.lock().await;
    let mut rt = state.0.lock().await;
    authorized(&a, &rt)?;
    let route = rt.route(&id)?;
    api::request(&mut a, reqwest::Method::DELETE, Some(&id), None).await?;
    rt.close(&app, &id)?;
    rt.routes.retain(|r| r.id != id);
    if rt.active_tab.as_deref() == Some(&id) {
        rt.active_tab = rt.routes.first().map(|r| r.id.clone());
    }
    save(&rt)?;
    queue_cleanup(&rt, &route)?;
    recover_cleanup(&rt.root)?;
    Ok(rt.routes.clone())
}
#[tauri::command]
pub async fn workspace_preferences(
    webview: tauri::Webview,
    state: tauri::State<'_, Native>,
    active_tab: Option<String>,
    window_layout: String,
    order: Vec<String>,
) -> Result<()> {
    security::trusted(&webview)?;
    let mut rt = state.0.lock().await;
    if !["single", "spread", "matrix"].contains(&window_layout.as_str()) {
        return Err("Invalid layout".into());
    }
    if let Some(id) = &active_tab {
        rt.route(id)?;
    }
    if order.len() != rt.routes.len()
        || order.iter().collect::<std::collections::HashSet<_>>().len() != order.len()
    {
        return Err("Invalid route order".into());
    }
    let next = order
        .iter()
        .map(|id| rt.route(id))
        .collect::<std::result::Result<Vec<_>, _>>()?;
    rt.routes = next;
    rt.active_tab = active_tab;
    rt.window_layout = window_layout;
    save(&rt)?;
    Ok(())
}
#[tauri::command]
pub async fn auth_logout(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    state: tauri::State<'_, Native>,
    auth: tauri::State<'_, Service>,
) -> Result<()> {
    security::trusted(&webview)?;
    auth.1.notify_waiters();
    if let Some(window) = app.get_webview_window("auth") {
        window.close().map_err(|e| e.to_string())?;
    }
    let mut a = auth.0.lock().await;
    let mut rt = state.0.lock().await;
    rt.close_all(&app)?;
    let cleanup: Result<()> = (|| {
        for index in 0..rt.routes.len() {
            let route = rt.routes[index].clone();
            cleanup_epoch(&rt, &route)?;
            rt.routes[index].epoch = route
                .epoch
                .checked_add(1)
                .ok_or("Session epoch exhausted")?;
        }
        save(&rt)?;
        recover_epochs(&rt.root)?;
        Ok(())
    })();
    rt.routes.clear();
    rt.owner.clear();
    rt.active_tab = None;
    rt.layout_revision = 0;
    let logout = a.logout();
    logout?;
    cleanup
}

#[cfg(test)]
mod tests {
    use super::*;
    fn route() -> Route {
        Route {
            id: "stable-id".into(),
            label: "Work".into(),
            icon: "link".into(),
            url: "https://example.com".into(),
            internal_hosts: vec!["untrusted-cache.test".into()],
            is_hibernated: true,
            zoom_level: 0.5,
            epoch: 3,
            favicon_url: None,
        }
    }
    #[test]
    fn cache_is_account_scoped_and_rederives_navigation_policy() {
        let temp = tempfile::tempdir().unwrap();
        let mut first = Runtime::new(temp.path().into());
        first.owner = "alice".into();
        first.routes = vec![route()];
        save(&first).unwrap();
        let mut next = Runtime::new(temp.path().into());
        next.owner = "bob".into();
        load(&mut next).unwrap();
        assert!(next.routes.is_empty());
        next.owner = "alice".into();
        load(&mut next).unwrap();
        assert_eq!(next.routes[0].epoch, 3);
        assert!(next.routes[0].is_hibernated);
        assert_eq!(next.routes[0].internal_hosts, vec!["example.com"]);
    }
    #[test]
    fn cache_rejects_duplicate_identities_and_foreign_ownership() {
        let temp = tempfile::tempdir().unwrap();
        let mut rt = Runtime::new(temp.path().into());
        rt.owner = "alice".into();
        let mut cache = Cache {
            version: 1,
            owner: "bob".into(),
            routes: vec![route()],
            active_tab: None,
            window_layout: "single".into(),
        };
        persistence::write(&cache_path(&rt), &cache).unwrap();
        assert!(load(&mut rt).is_err());
        cache.owner = "alice".into();
        cache.routes.push(route());
        persistence::write(&cache_path(&rt), &cache).unwrap();
        assert!(load(&mut rt).is_err());
    }
    #[test]
    fn cleanup_rejects_untrusted_journal_paths() {
        let temp = tempfile::tempdir().unwrap();
        persistence::write(&temp.path().join("cleanup.json"), &vec!["../outside"]).unwrap();
        assert!(recover_cleanup(temp.path()).is_err());
    }
}
