import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Route } from "../common/routes";
import type { WindowLayout } from "../common/drawer";
import type { AppSettings, StartupOpenMode } from "../common/settings";

export type User = { id: string; email: string; name?: string };
type NativeRoute = Omit<Route, "path" | "partition" | "faviconUrl"> & {
  faviconUrl?: string | null;
};
export type Workspace = {
  user: User | null;
  routes: Route[];
  isOffline: boolean;
  activeTab: string | null;
  windowLayout: WindowLayout;
  warning: string | null;
};
export type Unread = {
  total: number;
  revision: number;
  unreadCounts: { routeId: string; count: number }[];
};
export type DownloadStatus = {
  routeId: string;
  fileName: string;
  state: "started" | "finished" | "failed";
};
export type Placement = {
  routeId: string;
  bounds: { x: number; y: number; width: number; height: number };
};
export type Action =
  | "refresh"
  | "focus"
  | "hibernate"
  | "restore"
  | "clear_session"
  | "zoom_in"
  | "zoom_out";
export const toRoute = (route: NativeRoute): Route => ({
  ...route,
  faviconUrl: route.faviconUrl ?? undefined,
  path: `/${encodeURIComponent(route.id)}`,
  partition: "",
});
export const message = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error)
    return String(error.message);
  return String(error);
};
async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new Error(message(error));
  }
}
let revision = Date.now();
export const native = {
  async bootstrap(): Promise<Workspace> {
    const s = await call<Omit<Workspace, "routes"> & { routes: NativeRoute[] }>(
      "workspace_bootstrap",
    );
    return { ...s, routes: s.routes.map(toRoute) };
  },
  login: () => call<void>("auth_login"),
  cancelLogin: () => call<void>("auth_cancel"),
  logout: () => call<void>("auth_logout"),
  async create(route: Route, order: number) {
    return (
      await call<NativeRoute[]>("route_create", {
        route: {
          name: route.label,
          url: route.loadURL,
          icon: route.icon,
          order,
          metadata: { openExternalLinksInBrowser: true },
        },
      })
    ).map(toRoute);
  },
  async update(id: string, update: { name?: string; order?: number }) {
    return (await call<NativeRoute[]>("route_update", { id, update })).map(
      toRoute,
    );
  },
  async remove(id: string) {
    return (await call<NativeRoute[]>("route_delete", { id })).map(toRoute);
  },
  async action(id: string, action: Action) {
    return toRoute(await call<NativeRoute>("route_action", { id, action }));
  },
  layout: (placements: Placement[], drawer: boolean) =>
    call<boolean>("layout_views", { revision: ++revision, placements, drawer }),
  preferences: (
    activeTab: string | null,
    windowLayout: WindowLayout,
    order: string[],
  ) => call<void>("workspace_preferences", { activeTab, windowLayout, order }),
  unread: () => call<Unread>("unread_snapshot"),
  settings: () =>
    call<
      AppSettings & {
        autostartAvailable: boolean;
        websitePermissions?: boolean;
      }
    >("app_settings"),
  startup: (mode: StartupOpenMode) =>
    call<AppSettings>("set_startup", { mode }),
  onFavicon: (
    callback: (value: { routeId: string; faviconUrl: string }) => void,
  ) =>
    listen<{ routeId: string; faviconUrl: string }>("favicon", (e) =>
      callback(e.payload),
    ),
  onUnread: (callback: (value: Unread) => void) =>
    listen<Unread>("unread", (e) => callback(e.payload)),
  onSession: (callback: (value: { Ok?: null; Err?: string }) => void) =>
    listen<{ Ok?: null; Err?: string }>("session-changed", (e) =>
      callback(e.payload),
    ),
  onDownload: (callback: (value: DownloadStatus) => void) =>
    listen<DownloadStatus>("download-status", (e) => callback(e.payload)),
};
