// Runs against the AppImage's libraries/plugins, never a user's browser profile.
// This verifies packaged WebKit Web Audio, not Telegram account compatibility.
#include <gst/gst.h>
#include <webkit2/webkit2.h>

static int result = 1;

static gboolean timeout_cb(gpointer unused) {
    (void)unused;
    g_printerr("FAIL: packaged Web Audio timed out\n");
    gtk_main_quit();
    return G_SOURCE_REMOVE;
}

static void terminated(WebKitWebView *view, WebKitWebProcessTerminationReason reason,
                       gpointer unused) {
    (void)view;
    (void)unused;
    g_printerr("FAIL: packaged WebKit process terminated (%d)\n", reason);
    gtk_main_quit();
}

static void title_changed(WebKitWebView *view, GParamSpec *spec, gpointer unused) {
    (void)spec;
    (void)unused;
    const char *title = webkit_web_view_get_title(view);
    if (g_strcmp0(title, "MEDIA_PASS") == 0) {
        result = 0;
        g_print("PASS: packaged HTML audio ended and three Web Audio contexts advanced/closed\n");
        gtk_main_quit();
    } else if (title && g_str_has_prefix(title, "MEDIA_FAIL")) {
        g_printerr("FAIL: %s\n", title);
        gtk_main_quit();
    }
}

int main(int argc, char **argv) {
    gst_init(&argc, &argv);
    char *gst_version = gst_version_string();
    g_print("%s; WebKit %u.%u.%u\n", gst_version,
            webkit_get_major_version(), webkit_get_minor_version(), webkit_get_micro_version());
    g_free(gst_version);
    // --skip-plugin-check isolates the native crash in an old, broken bundle.
    if (argc < 2 || g_strcmp0(argv[1], "--skip-plugin-check") != 0) {
        const char *elements[] = {"appsrc", "appsink", "autoaudiosink", "audioconvert",
                                  "audioresample", "volume", "wavparse", NULL};
        for (int i = 0; elements[i]; i++) {
            GstElementFactory *factory = gst_element_factory_find(elements[i]);
            if (!factory) {
                g_printerr("FAIL: missing packaged GStreamer element %s\n", elements[i]);
                return 1;
            }
            GstPlugin *plugin = gst_plugin_feature_get_plugin(GST_PLUGIN_FEATURE(factory));
            const char *filename = plugin ? gst_plugin_get_filename(plugin) : NULL;
            char *prefix = g_strconcat(g_getenv("APPDIR"), "/", NULL);
            gboolean bundled = filename && g_str_has_prefix(filename, prefix);
            g_free(prefix);
            if (plugin) gst_object_unref(plugin);
            gst_object_unref(factory);
            if (!bundled) {
                g_printerr("FAIL: %s resolved outside the package\n", elements[i]);
                return 1;
            }
            g_print("PASS: bundled %s\n", elements[i]);
        }
    }
    gtk_init(&argc, &argv);
    GtkWidget *window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    WebKitWebContext *context = webkit_web_context_new_ephemeral();
    WebKitWebsitePolicies *policies = webkit_website_policies_new_with_policies(
        "autoplay", WEBKIT_AUTOPLAY_ALLOW, NULL);
    GtkWidget *view = g_object_new(WEBKIT_TYPE_WEB_VIEW, "web-context", context,
                                  "website-policies", policies, NULL);
    g_object_unref(policies);
    g_object_unref(context);
    webkit_settings_set_media_playback_requires_user_gesture(
        webkit_web_view_get_settings(WEBKIT_WEB_VIEW(view)), FALSE);
    g_signal_connect(view, "web-process-terminated", G_CALLBACK(terminated), NULL);
    g_signal_connect(view, "notify::title", G_CALLBACK(title_changed), NULL);
    gtk_container_add(GTK_CONTAINER(window), view);
    gtk_widget_show_all(window);
    webkit_web_view_load_html(WEBKIT_WEB_VIEW(view),
        "<html><title>Media probe</title><script>(async()=>{try {"
        // A deterministic silent PCM WAV exercises the media player's sink.
        "const b=new Uint8Array(8044),d=new DataView(b.buffer);"
        "const s=(p,t)=>{for(let i=0;i<t.length;i++)b[p+i]=t.charCodeAt(i)};"
        "s(0,'RIFF');d.setUint32(4,8036,true);s(8,'WAVEfmt ');"
        "d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);"
        "d.setUint32(24,16000,true);d.setUint32(28,32000,true);"
        "d.setUint16(32,2,true);d.setUint16(34,16,true);s(36,'data');d.setUint32(40,8000,true);"
        "const a=new Audio('data:audio/wav;base64,'+btoa(String.fromCharCode(...b)));"
        "await new Promise((resolve,reject)=>{a.onended=resolve;"
        "a.onerror=()=>reject(Error('HTML audio failed'));a.play().catch(reject)});"
        "if(a.currentTime<=0)throw Error('HTML audio clock stalled');"
        "for(let i=0;i<3;i++){const c=new AudioContext();"
        "const o=c.createOscillator(),g=c.createGain();g.gain.value=0;"
        "o.connect(g);g.connect(c.destination);o.start();await c.resume();"
        "const t=c.currentTime;await new Promise(r=>setTimeout(r,300));"
        "if(c.state!=='running'||c.currentTime<=t)throw Error('Audio clock stalled');"
        "o.stop();await c.close();}document.title='MEDIA_PASS';"
        "}catch(e){document.title='MEDIA_FAIL: '+e.message}})()</script></html>",
        "http://127.0.0.1/");
    g_timeout_add_seconds(20, timeout_cb, NULL);
    gtk_main();
    gtk_widget_destroy(window);
    return result;
}
