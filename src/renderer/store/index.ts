import { create } from "zustand";
import type { Route } from "../../common/routes";
import type { DrawerKind, WindowLayout } from "../../common/drawer";
import type { User, Workspace } from "../native";

type AppState = {
  routes: Route[];
  activeTab: string | null;
  activeDrawer: DrawerKind | null;
  windowLayout: WindowLayout;
  isOffline: boolean;
  unreadCounts: Record<string, number>;
  error: string | null;
  apply: (workspace: Workspace) => void;
  replaceRoutes: (routes: Route[]) => void;
  setActiveTab: (id: string | null) => void;
  setActiveDrawer: (drawer: DrawerKind | null) => void;
  setWindowLayout: (layout: WindowLayout) => void;
  replaceUnreadCounts: (counts: Record<string, number>) => void;
  setError: (error: string | null) => void;
  updateRoute: (route: Route) => void;
  clearRoutes: () => void;
};
export const useAppStore = create<AppState>((set) => ({
  routes: [],
  activeTab: null,
  activeDrawer: null,
  windowLayout: "single",
  isOffline: false,
  unreadCounts: {},
  error: null,
  apply: (workspace) =>
    set({
      routes: workspace.routes,
      activeTab: workspace.activeTab,
      windowLayout: workspace.windowLayout,
      isOffline: workspace.isOffline,
      error: workspace.warning,
    }),
  replaceRoutes: (routes) =>
    set((state) => ({
      routes,
      activeTab: routes.some((r) => r.id === state.activeTab)
        ? state.activeTab
        : (routes[0]?.id ?? null),
    })),
  setActiveTab: (activeTab) => set({ activeTab }),
  setActiveDrawer: (activeDrawer) => set({ activeDrawer }),
  setWindowLayout: (windowLayout) => set({ windowLayout }),
  replaceUnreadCounts: (unreadCounts) => set({ unreadCounts }),
  setError: (error) => set({ error }),
  updateRoute: (route) =>
    set((state) => ({
      routes: state.routes.map((r) => (r.id === route.id ? route : r)),
    })),
  clearRoutes: () =>
    set({
      routes: [],
      activeTab: null,
      activeDrawer: null,
      unreadCounts: {},
      error: null,
    }),
}));
export const useAuthStore = create<{
  user: User | null;
  setUser: (user: User | null) => void;
}>((set) => ({ user: null, setUser: (user) => set({ user }) }));
