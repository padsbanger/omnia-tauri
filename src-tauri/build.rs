fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "spike_seed",
            "smoke_inspect",
            "layout_views",
            "route_action",
            "unread_snapshot",
            "page_signal",
            "page_favicon",
            "auth_login",
            "auth_cancel",
            "auth_logout",
            "workspace_bootstrap",
            "route_create",
            "route_update",
            "route_delete",
            "workspace_preferences",
            "app_settings",
            "set_startup",
        ]),
    ))
    .expect("Tauri build");
}
