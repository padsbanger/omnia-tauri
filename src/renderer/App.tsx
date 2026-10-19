import { useCallback, useEffect, useRef, useState } from "react";
import { HashRouter } from "react-router-dom";
import { Spinner, Button } from "@heroui/react";
import AuthScreen from "./components/AuthScreen";
import Sidemenu from "./components/Sidemenu";
import CreateNewRouteForm from "./components/CreateNewRouteForm";
import ManageRoutesDrawer from "./components/ManageRoutesDrawer";
import SettingsDrawer from "./components/SettingsDrawer";
import { native, message, type Unread } from "./native";
import { useAppStore, useAuthStore } from "./store";
import { routeAction } from "./actions";
import { placements } from "./layout";

function useSession() {
  const [loading, setLoading] = useState(true);
  const attempts = useRef(0),
    running = useRef(false),
    alive = useRef(true);
  const retry = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const snapshot = await native.bootstrap();
      if (!alive.current) return;
      useAppStore.getState().apply(snapshot);
      useAuthStore.getState().setUser(snapshot.user);
      if (!snapshot.isOffline) attempts.current = 0;
    } catch (error) {
      if (alive.current) {
        useAuthStore.getState().setUser(null);
        useAppStore.getState().setError(message(error));
      }
    } finally {
      running.current = false;
      if (alive.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void retry();
    const subscription = native.onSession((result) => {
      if (result.Err) useAppStore.getState().setError(result.Err);
      else void retry();
    });
    const online = () => {
      attempts.current = 0;
      void retry();
    };
    window.addEventListener("online", online);
    const timer = window.setInterval(() => {
      if (useAppStore.getState().isOffline && attempts.current++ < 8)
        void retry();
    }, 15000);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener("online", online);
      void subscription.then((off) => off());
    };
  }, [retry]);
  return { loading, retry };
}

function WorkspacePlaceholder() {
  const { routes, activeTab, windowLayout, setActiveDrawer } = useAppStore();
  if (!routes.length)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
        <p>Add a service to your workspace.</p>
        <Button onClick={() => setActiveDrawer("create")}>Add route</Button>
      </div>
    );
  const route = routes.find((r) => r.id === activeTab);
  if (windowLayout !== "single" || !route?.isHibernated) return null;
  return (
    <div className="flex h-full items-center justify-center">
      <Button
        onClick={() => void routeAction(route.id, "restore").catch(() => {})}
      >
        Restore {route.label}
      </Button>
    </div>
  );
}

function Workspace() {
  const store = useAppStore();
  const content = useRef<HTMLDivElement>(null);
  const [drawerReady, setDrawerReady] = useState(false);
  const [liveBackdrop, setLiveBackdrop] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("native-drawer-open", drawerReady && liveBackdrop);
    return () => document.documentElement.classList.remove("native-drawer-open");
  }, [drawerReady, liveBackdrop]);
  useEffect(() => setDrawerReady(false), [store.activeDrawer]);
  useEffect(() => {
    let disposed = false,
      frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = content.current?.getBoundingClientRect();
        if (!rect) return;
        const next = placements(
          store.routes.filter((r) => !r.isHibernated).map((r) => r.id),
          store.windowLayout,
          store.activeTab,
          rect,
        );
        void native
          .layout(next, !!store.activeDrawer)
          .then((live) => {
            if (!disposed) {
              setLiveBackdrop(live);
              setDrawerReady(!!store.activeDrawer);
            }
          })
          .catch((e) => store.setError(message(e)));
      });
    };
    const observer = new ResizeObserver(update);
    if (content.current) observer.observe(content.current);
    update();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [store.routes, store.activeTab, store.windowLayout, store.activeDrawer]);
  useEffect(() => {
    void native
      .preferences(
        store.activeTab,
        store.windowLayout,
        store.routes.map((r) => r.id),
      )
      .catch((e) => store.setError(message(e)));
  }, [store.activeTab, store.windowLayout, store.routes]);
  useEffect(() => {
    let disposed = false,
      latest = -1;
    const apply = (value: Unread) => {
      if (disposed || value.revision < latest) return;
      latest = value.revision;
      useAppStore
        .getState()
        .replaceUnreadCounts(
          Object.fromEntries(
            value.unreadCounts.map((r) => [r.routeId, r.count]),
          ),
        );
      document.title = value.total ? `(${value.total}) Omnia` : "Omnia";
    };
    const off = native.onUnread(apply);
    void native
      .unread()
      .then(apply)
      .catch((e) => store.setError(message(e)));
    return () => {
      disposed = true;
      void off.then((fn) => fn());
    };
  }, []);
  useEffect(() => {
    const off = native.onFavicon(({ routeId, faviconUrl }) => {
      const current = useAppStore.getState();
      const route = current.routes.find((r) => r.id === routeId);
      if (route) current.updateRoute({ ...route, faviconUrl });
    });
    return () => {
      void off.then((fn) => fn());
    };
  }, []);
  const close = () => store.setActiveDrawer(null);
  return (
    <div className="flex h-full w-full">
      <Sidemenu />
      <div ref={content} className="relative h-full min-w-0 flex-1">
        <WorkspacePlaceholder />
        {drawerReady && (
          <div
            className="absolute inset-0 z-30 bg-slate-950/50"
            data-testid="drawer-backdrop"
            onClick={close}
          >
            <div
              className="h-full max-w-full shadow-2xl"
              style={{ width: store.activeDrawer === "manage" ? 480 : 420 }}
              onClick={(e) => e.stopPropagation()}
            >
              {store.activeDrawer === "create" && (
                <CreateNewRouteForm
                  closeDrawer={close}
                  onCreateRoute={async (route) => {
                    const routes = await native.create(
                      route,
                      store.routes.length,
                    );
                    store.replaceRoutes(routes);
                    store.setActiveTab(routes.at(-1)?.id ?? null);
                    return true;
                  }}
                />
              )}
              {store.activeDrawer === "manage" && (
                <ManageRoutesDrawer
                  closeDrawer={close}
                  routes={store.routes}
                  activeTab={store.activeTab}
                  windowLayout={store.windowLayout}
                  isOffline={store.isOffline}
                  onDeleteRoute={async (id) =>
                    store.replaceRoutes(await native.remove(id))
                  }
                  onUpdateRouteLabel={async (id, name) => {
                    store.replaceRoutes(await native.update(id, { name }));
                    return true;
                  }}
                  onToggleHibernation={async (id) => {
                    const route = store.routes.find((r) => r.id === id);
                    await routeAction(
                      id,
                      route?.isHibernated ? "restore" : "hibernate",
                    );
                  }}
                  onWindowLayoutChange={store.setWindowLayout}
                />
              )}
              {store.activeDrawer === "settings" && (
                <SettingsDrawer closeDrawer={close} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { loading, retry } = useSession();
  const user = useAuthStore((s) => s.user);
  const error = useAppStore((s) => s.error);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        useAppStore.getState().setActiveDrawer("settings");
      }
      if (e.key === "Escape") useAppStore.getState().setActiveDrawer(null);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  return (
    <HashRouter>
      <div className="flex h-full w-full flex-col">
        {error && (
          <div
            role="alert"
            className="flex shrink-0 items-center gap-3 bg-amber-50 px-4 py-2 text-sm text-amber-900"
          >
            <span className="flex-1">{error}</span>
            <button onClick={() => void retry()}>Retry</button>
            <button
              aria-label="Dismiss message"
              onClick={() => useAppStore.getState().setError(null)}
            >
              ×
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner aria-label="Loading workspace" />
            </div>
          ) : user ? (
            <Workspace />
          ) : (
            <AuthScreen />
          )}
        </div>
      </div>
    </HashRouter>
  );
}
