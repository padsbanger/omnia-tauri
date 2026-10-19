import { Route } from "./routes";

export type DrawerKind = "create" | "manage" | "settings";

export type WindowLayout = "single" | "spread" | "matrix";

export type DrawerStateSnapshot = {
  activeDrawer: DrawerKind | null;
  activeTab: string | null;
  routes: Array<Route>;
  windowLayout: WindowLayout;
  isOffline: boolean;
};
