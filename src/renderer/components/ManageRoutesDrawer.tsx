import { useState } from "react";
import { routeAction } from "../actions";
import { Button } from "@heroui/react";
import { MdClose, MdMemory } from "react-icons/md";

import { WindowLayout } from "../../common/drawer";
import { Route } from "../../common/routes";
import { useAppStore } from "../store";
import ManageRouteCard from "./ManageRouteCard";
import RouteLayoutControls from "./RouteLayoutControls";

type ManageRoutesDrawerProps = {
  closeDrawer: () => void;
  routes?: Array<Route>;
  activeTab?: string | null;
  windowLayout?: WindowLayout;
  onDeleteRoute?: (routeId: string) => Promise<void>;
  onUpdateRouteLabel?: (routeId: string, label: string) => Promise<boolean>;
  onToggleHibernation?: (routeId: string) => Promise<void>;
  onWindowLayoutChange?: (windowLayout: WindowLayout) => Promise<void> | void;
  isOffline?: boolean;
};

const ManageRoutesDrawer = ({
  closeDrawer,
  routes: routesProp,
  activeTab: activeTabProp,
  windowLayout: windowLayoutProp,
  onDeleteRoute,
  onUpdateRouteLabel,
  onToggleHibernation,
  onWindowLayoutChange,
  isOffline = false,
}: ManageRoutesDrawerProps) => {
  const store = useAppStore();
  const routes = routesProp ?? store.routes;
  const activeTab = activeTabProp ?? store.activeTab;
  const windowLayout = windowLayoutProp ?? store.windowLayout;
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [savingRouteId, setSavingRouteId] = useState<string | null>(null);
  const [routeLabelError, setRouteLabelError] = useState<string | null>(null);
  const routeZoomLevels: Record<string, number> = {};
  const beginEditingRoute = (route: Route) => {
    setEditingRouteId(route.id);
    setEditingLabel(route.label);
    setRouteLabelError(null);
  };
  const cancelEditingRoute = () => {
    setEditingRouteId(null);
    setEditingLabel("");
    setRouteLabelError(null);
  };
  const commitRouteLabel = async (route: Route) => {
    if (!editingLabel.trim()) {
      setRouteLabelError("Route label cannot be empty.");
      return;
    }
    setSavingRouteId(route.id);
    try {
      if (await onUpdateRouteLabel?.(route.id, editingLabel.trim()))
        cancelEditingRoute();
    } catch (error) {
      setRouteLabelError(String(error));
    } finally {
      setSavingRouteId(null);
    }
  };
  const handleToggleHibernation = async (id: string) => {
    try {
      await onToggleHibernation?.(id);
    } catch (error) {
      store.setError(String(error));
    }
  };
  const handleDeleteRoute = async (id: string) => {
    try {
      await onDeleteRoute?.(id);
    } catch (error) {
      store.setError(String(error));
    }
  };
  const handleWindowLayoutChange = (layout: WindowLayout) =>
    onWindowLayoutChange?.(layout);
  const handleRouteZoom = (route: Route, direction: "in" | "out") =>
    routeAction(route.id, direction === "in" ? "zoom_in" : "zoom_out").catch(
      () => {},
    );

  return (
    <div className="flex h-full flex-col bg-slate-50/95 text-slate-950">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 py-4 backdrop-blur-xl">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600">
            Workspace
          </p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">
              Manage routes
            </h2>
            <span className="text-xs tabular-nums text-slate-400">
              {routes.length} routes
            </span>
          </div>
        </div>
        <Button
          aria-label="Close manage routes"
          className="h-9 min-h-9 w-9 min-w-9 rounded-xl border border-slate-200/80 bg-white p-0 text-slate-500 shadow-none hover:bg-slate-100 hover:text-slate-900"
          isIconOnly
          onClick={closeDrawer}
          size="sm"
        >
          <MdClose className="text-lg" />
        </Button>
      </div>
      <div className="omnia-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {isOffline && (
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
            Offline mode: saved routes are available, but adding, renaming, and
            deleting routes requires the Omnia backend.
          </div>
        )}
        {routes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-10 text-center">
            <p className="text-sm font-medium text-slate-600">No routes yet</p>
            <p className="mt-1 text-xs text-slate-400">
              Add your first service from the sidebar.
            </p>
          </div>
        ) : (
          routes.map((route) => (
            <ManageRouteCard
              editingLabel={editingLabel}
              isEditing={editingRouteId === route.id}
              isActive={activeTab === route.id}
              isOffline={isOffline}
              isSaving={savingRouteId === route.id}
              key={route.id}
              labelError={routeLabelError}
              onBeginEditing={beginEditingRoute}
              onCancelEditing={cancelEditingRoute}
              onChangeLabel={setEditingLabel}
              onCommitLabel={(item) => void commitRouteLabel(item)}
              onDelete={(routeId) => void handleDeleteRoute(routeId)}
              onToggleHibernation={(routeId) =>
                void handleToggleHibernation(routeId)
              }
              onZoomRoute={(route, direction) =>
                void handleRouteZoom(route, direction)
              }
              route={route}
              zoomLevel={routeZoomLevels[route.id] ?? route.zoomLevel ?? 0}
            />
          ))
        )}
        {routes.length > 0 && (
          <RouteLayoutControls
            onWindowLayoutChange={handleWindowLayoutChange}
            windowLayout={windowLayout}
          />
        )}
        <div className="mt-1 flex items-center justify-between rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2.5 text-xs text-slate-500">
          <span className="flex items-center gap-2">
            <MdMemory className="text-base text-slate-400" />
            Per-route memory
          </span>
          <span className="font-semibold tabular-nums text-slate-700">
            Unavailable in this engine
          </span>
        </div>
      </div>
    </div>
  );
};

export default ManageRoutesDrawer;
