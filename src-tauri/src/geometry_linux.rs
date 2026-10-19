//! Tauri 2.12.4 packs Linux WindowChild views into a vertical GtkBox, where
//! Wry set_bounds is a no-op. Reparent those same native views into one GtkLayout.
//! Layout clips children without imposing their requested size on the window.
use crate::layout::Bounds;
use gtk::prelude::*;

pub fn bounds(view: &tauri::Webview, bounds: Bounds) -> Result<(), String> {
    bounds.validate()?;
    view.with_webview(move |native| {
        let widget = native.inner();
        let Some(parent) = widget.parent() else {
            return;
        };
        let layer = if let Ok(layer) = parent.clone().downcast::<gtk::Layout>() {
            layer
        } else if let Ok(container) = parent.downcast::<gtk::Box>() {
            let layer = container
                .children()
                .into_iter()
                .find_map(|child| child.downcast::<gtk::Layout>().ok())
                .unwrap_or_else(|| {
                    let layer =
                        gtk::Layout::new(None::<&gtk::Adjustment>, None::<&gtk::Adjustment>);
                    layer.set_hexpand(true);
                    layer.set_vexpand(true);
                    container.pack_start(&layer, true, true, 0);
                    layer.show();
                    layer
                });
            container.remove(&widget);
            layer.put(&widget, 0, 0);
            layer
        } else {
            return;
        };
        let x = bounds.x.round() as i32;
        let y = bounds.y.round() as i32;
        let width = bounds.width.round().max(1.) as i32;
        let height = bounds.height.round().max(1.) as i32;
        layer.move_(&widget, x, y);
        widget.set_size_request(width, height);
        widget.queue_resize();
        layer.queue_resize();
    })
    .map_err(|e| e.to_string())
}
