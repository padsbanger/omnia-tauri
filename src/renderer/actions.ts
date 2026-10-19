import { native, message, type Action } from "./native";
import { useAppStore, useAuthStore } from "./store";
export async function routeAction(id: string, action: Action) {
  const store = useAppStore.getState();
  try {
    const route = await native.action(id, action);
    store.updateRoute(route);
    return route;
  } catch (error) {
    store.setError(message(error));
    throw error;
  }
}
export async function signOut() {
  try {
    await native.logout();
  } finally {
    useAppStore.getState().clearRoutes();
    useAuthStore.getState().setUser(null);
  }
}
export async function reorder(ids: string[]) {
  const store = useAppStore.getState();
  const next = ids
    .map((id) => store.routes.find((r) => r.id === id)!)
    .filter(Boolean);
  store.replaceRoutes(next);
  await native.preferences(store.activeTab, store.windowLayout, ids);
  if (store.isOffline) return;
  try {
    for (const [order, id] of ids.entries()) await native.update(id, { order });
  } catch (error) {
    store.setError(
      `Some route positions may have been saved. Reconnect to reconcile: ${message(error)}`,
    );
  }
}
