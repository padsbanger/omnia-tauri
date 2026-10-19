import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HashRouter } from "react-router-dom";
import App from "./App";
import AuthScreen from "./components/AuthScreen";
import Sidemenu from "./components/Sidemenu";
import SettingsDrawer from "./components/SettingsDrawer";
import CreateNewRouteForm from "./components/CreateNewRouteForm";
import ManageRoutesDrawer from "./components/ManageRoutesDrawer";
import { native, type Workspace } from "./native";
import { useAppStore, useAuthStore } from "./store";
import { routeAction, reorder, signOut } from "./actions";
import type { Route } from "../common/routes";
import { insertRoute } from "./routeReordering";
function dragEvent(element: Element, type: string, clientY = 500) {
  fireEvent(
    element,
    Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
      clientY,
      dataTransfer: { setData: vi.fn(), effectAllowed: "", dropEffect: "" },
    }),
  );
}
vi.mock("./native", async (importOriginal) => {
  const original = await importOriginal<typeof import("./native")>();
  return {
    ...original,
    native: Object.fromEntries(
      Object.keys(original.native).map((key) => [key, vi.fn()]),
    ),
  };
});
const a: Route = {
  id: "a",
  label: "Work",
  icon: "gmail",
  loadURL: "https://mail.google.com",
  path: "/a",
  partition: "",
};
const b: Route = { ...a, id: "b", label: "Personal", path: "/b", icon: "link" };
const workspace: Workspace = {
  user: { id: "owner", email: "test@example.invalid" },
  routes: [a, b],
  isOffline: false,
  activeTab: "a",
  windowLayout: "single",
  warning: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  useAppStore.getState().clearRoutes();
  useAppStore.getState().apply(workspace);
  useAuthStore.getState().setUser(workspace.user);
  vi.mocked(native.bootstrap).mockResolvedValue(workspace);
  vi.mocked(native.layout).mockResolvedValue(true);
  for (const fn of [
    native.preferences,
    native.login,
    native.cancelLogin,
    native.logout,
  ])
    vi.mocked(fn).mockResolvedValue(undefined);
  vi.mocked(native.onUnread).mockResolvedValue(() => {});
  vi.mocked(native.onSession).mockResolvedValue(() => {});
  vi.mocked(native.onFavicon).mockResolvedValue(() => {});
  vi.mocked(native.unread).mockResolvedValue({
    total: 3,
    revision: 1,
    unreadCounts: [{ routeId: "a", count: 3 }],
  });
  vi.mocked(native.settings).mockResolvedValue({
    startupOpenMode: "no",
    autostartAvailable: true,
  });
  vi.mocked(native.startup).mockResolvedValue({ startupOpenMode: "yes" });
  vi.mocked(native.action).mockImplementation(async (id, action) => ({
    ...a,
    id,
    isHibernated: action === "hibernate",
    zoomLevel: action === "zoom_in" ? 0.5 : 0,
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: () => void) {}
      observe() {
        this.callback();
      }
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 100,
    y: 0,
    width: 1000,
    height: 700,
    top: 0,
    left: 100,
    bottom: 700,
    right: 1100,
    toJSON() {},
  });
});
describe("retained Omnia workflows", () => {
  it("enables live drawer transparency only after native layout and removes it on close", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: "Manage routes" }),
    );
    await screen.findByRole("heading", { name: "Manage routes" });
    await waitFor(() =>
      expect(
        document.documentElement.classList.contains("native-drawer-open"),
      ).toBe(true),
    );
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        document.documentElement.classList.contains("native-drawer-open"),
      ).toBe(false),
    );
  });
  it("retains an opaque shell on engines without live drawer compositing", async () => {
    vi.mocked(native.layout).mockResolvedValue(false);
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: "Manage routes" }),
    );
    await screen.findByRole("heading", { name: "Manage routes" });
    expect(
      document.documentElement.classList.contains("native-drawer-open"),
    ).toBe(false);
  });
  it("validates URLs before creating and preserves the form when a mutation fails", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    const create = vi.fn().mockResolvedValue(false);
    const view = render(
      <CreateNewRouteForm closeDrawer={close} onCreateRoute={create} />,
    );
    const form = view.container.querySelector("form")!;
    await user.type(screen.getByLabelText("Label"), "Work");
    await user.clear(screen.getByLabelText("URL"));
    fireEvent.submit(form);
    expect(create).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("URL"), "https://");
    fireEvent.submit(form);
    await screen.findByText("Enter a valid URL.");
    await user.clear(screen.getByLabelText("URL"));
    await user.type(screen.getByLabelText("URL"), "example.com");
    await user.click(screen.getByRole("button", { name: "Save route" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(close).not.toHaveBeenCalled();
    create.mockRejectedValue("failure");
    await user.click(screen.getByRole("button", { name: "Save route" }));
    await screen.findByText("Failed to save route.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).toHaveBeenCalled();
  });
  it("hydrates, synchronizes unread revisions, activates routes and keeps drawers clear of native views", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "Manage routes" });
    await waitFor(() => expect(document.title).toBe("(3) Omnia"));
    const unread = vi.mocked(native.onUnread).mock.calls[0][0];
    unread({ total: 1, revision: 0, unreadCounts: [] });
    expect(document.title).toBe("(3) Omnia");
    unread({ total: 0, revision: 2, unreadCounts: [] });
    expect(document.title).toBe("Omnia");
    await user.click(screen.getByRole("link", { name: "Personal" }));
    expect(useAppStore.getState().activeTab).toBe("b");
    await user.click(screen.getByRole("button", { name: "Matrix layout" }));
    expect(useAppStore.getState().windowLayout).toBe("matrix");
    await user.click(screen.getByRole("button", { name: "Manage routes" }));
    await screen.findByRole("heading", { name: "Manage routes" });
    expect(native.layout).toHaveBeenCalledWith(expect.any(Array), true);
    await user.click(screen.getAllByRole("button", { name: "Zoom in" })[0]);
    expect(native.action).toHaveBeenCalledWith("a", "zoom_in");
    await user.click(
      screen.getAllByRole("button", { name: "Refresh route" })[0],
    );
    await user.click(
      screen.getAllByRole("button", { name: "Clear site data" })[0],
    );
    await user.click(screen.getAllByRole("button", { name: "Hibernate" })[0]);
    await screen.findByRole("button", { name: "Restore" });
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await user.click(
      screen.getByRole("button", { name: "Close manage routes" }),
    );
    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    await screen.findByRole("heading", { name: "Settings" });
    await user.click(screen.getByLabelText(/Yes/));
    expect(native.startup).toHaveBeenCalledWith("yes");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Settings" })).toBeNull(),
    );
  });
  it("creates, renames and deletes through backend-aware handlers", async () => {
    const user = userEvent.setup();
    const c = { ...b, id: "c", label: "Custom", path: "/c" };
    vi.mocked(native.create).mockResolvedValue([a, b, c]);
    vi.mocked(native.update).mockResolvedValue([
      { ...a, label: "Renamed" },
      b,
      c,
    ]);
    vi.mocked(native.remove).mockResolvedValue([b, c]);
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Add route" }));
    await screen.findByRole("heading", { name: "Add route" });
    await user.type(screen.getByLabelText("Label"), "Custom");
    await user.selectOptions(screen.getByLabelText("Application"), "link");
    await user.type(screen.getByLabelText("URL"), "example.com");
    await user.click(screen.getByRole("button", { name: "Save route" }));
    await screen.findByRole("link", { name: "Custom" });
    expect(native.create).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Manage routes" }));
    await screen.findByRole("heading", { name: "Manage routes" });
    await user.click(screen.getAllByRole("button", { name: "Rename" })[0]);
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "Renamed");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(native.update).toHaveBeenCalledWith("a", { name: "Renamed" }),
    );
    await user.click(
      screen.getAllByRole("button", { name: "Delete route" })[0],
    );
    await waitFor(() =>
      expect(useAppStore.getState().routes.map((r) => r.id)).toEqual([
        "b",
        "c",
      ]),
    );
  });
  it("shows login and errors without retaining frontend credentials", async () => {
    vi.mocked(native.bootstrap).mockResolvedValue({
      ...workspace,
      user: null,
      routes: [],
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    expect(native.login).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel sign-in" }));
    expect(native.cancelLogin).toHaveBeenCalled();
    expect(Object.keys(useAuthStore.getState())).not.toContain("token");
    const session = vi.mocked(native.onSession).mock.calls[0][0];
    session({ Err: "Rejected state" });
    await screen.findByText("Rejected state");
    await user.click(screen.getByRole("button", { name: "Dismiss message" }));
    await waitFor(() =>
      expect(screen.queryByText("Rejected state")).toBeNull(),
    );
  });
  it("surfaces sign-in, create and settings failures", async () => {
    const user = userEvent.setup();
    vi.mocked(native.login).mockRejectedValue(new Error("No keyring"));
    const auth = render(
      <AuthScreen hasCachedRoutes onContinueOffline={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("No keyring");
    auth.unmount();
    const onCreate = vi.fn().mockRejectedValue(new Error("Offline"));
    const create = render(
      <CreateNewRouteForm closeDrawer={vi.fn()} onCreateRoute={onCreate} />,
    );
    await user.type(screen.getByLabelText("Label"), "Work");
    await user.click(screen.getByRole("button", { name: "Save route" }));
    await screen.findByText("Offline");
    create.unmount();
    vi.mocked(native.settings).mockRejectedValue(
      new Error("Settings unavailable"),
    );
    render(<SettingsDrawer closeDrawer={vi.fn()} />);
    await screen.findByRole("alert");
  });
  it("handles missing measurements, hibernated routes and offline controls honestly", async () => {
    const user = userEvent.setup();
    vi.mocked(native.bootstrap).mockResolvedValue({
      ...workspace,
      isOffline: true,
      routes: [{ ...a, isHibernated: true }, b],
    });
    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: "Restore Work" }),
    );
    await waitFor(() =>
      expect(native.action).toHaveBeenCalledWith("a", "restore"),
    );
    expect(
      (screen.getByRole("button", { name: "Add route" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Manage routes" }));
    await screen.findByRole("heading", { name: "Manage routes" });
    expect(
      (
        screen.getAllByRole("button", {
          name: "Delete route",
        })[0] as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("reports mutation errors and partial ordering without inventing a sync queue", async () => {
    vi.mocked(native.action).mockRejectedValue(new Error("Native view failed"));
    await expect(routeAction("a", "refresh")).rejects.toThrow();
    expect(useAppStore.getState().error).toContain("Native view failed");
    vi.mocked(native.update).mockRejectedValue(new Error("503"));
    await reorder(["b", "a"]);
    expect(useAppStore.getState().routes[0].id).toBe("b");
    expect(useAppStore.getState().error).toContain("Some route positions");
    useAppStore.setState({ isOffline: true });
    vi.mocked(native.update).mockClear();
    await reorder(["a", "b"]);
    expect(native.update).not.toHaveBeenCalled();
    await signOut();
    expect(useAuthStore.getState().user).toBeNull();
  });
  it("reorders by drag and handles rename validation/cancellation", async () => {
    const user = userEvent.setup();
    render(
      <HashRouter>
        <Sidemenu />
        <ManageRoutesDrawer
          closeDrawer={vi.fn()}
          onUpdateRouteLabel={vi
            .fn()
            .mockRejectedValue(new Error("Rename failed"))}
        />
      </HashRouter>,
    );
    const from = screen.getByRole("link", { name: "Work" }).parentElement!;
    const to = screen.getByRole("link", { name: "Personal" }).parentElement!;
    dragEvent(from, "dragstart");
    dragEvent(to, "dragover");
    dragEvent(to, "drop");
    await waitFor(() => expect(native.update).toHaveBeenCalled());
    await user.click(screen.getAllByRole("button", { name: "Rename" })[0]);
    const input = screen.getByRole("textbox");
    await user.clear(input);
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByText("Route label cannot be empty.");
    await user.type(input, "Changed");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Error: Rename failed");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("inserts before or after a target without losing routes", () => {
    expect(insertRoute(["a", "b", "c"], "a", { id: "c", after: true })).toEqual(
      ["b", "c", "a"],
    );
    expect(
      insertRoute(["a", "b", "c"], "c", { id: "a", after: false }),
    ).toEqual(["c", "a", "b"]);
    expect(insertRoute(["a", "b"], "a", { id: "a", after: true })).toEqual([
      "a",
      "b",
    ]);
    expect(
      insertRoute(["a", "b"], "unknown", { id: "a", after: false }),
    ).toEqual(["a", "b"]);
    expect(
      insertRoute(["a", "b"], "a", { id: "unknown", after: false }),
    ).toEqual(["a", "b"]);
  });
  it("reorders drawer cards with a handle, preserves selection and supports keyboard movement", async () => {
    const user = userEvent.setup();
    render(<ManageRoutesDrawer closeDrawer={vi.fn()} />);
    const handle = screen.getByRole("button", { name: "Reorder Personal" });
    const target = screen
      .getByRole("button", { name: "Reorder Work" })
      .closest(".route-reorder-item")!;
    dragEvent(handle, "dragstart");
    dragEvent(target, "dragover", 0);
    expect(target.getAttribute("data-drop-position")).toBe("before");
    dragEvent(target, "drop", 0);
    await waitFor(() =>
      expect(useAppStore.getState().isReordering).toBe(false),
    );
    expect(useAppStore.getState().routes.map((r) => r.id)).toEqual(["b", "a"]);
    expect(useAppStore.getState().activeTab).toBe("a");
    expect(native.preferences).toHaveBeenCalledWith("a", "single", ["b", "a"]);
    handle.focus();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    await waitFor(() =>
      expect(useAppStore.getState().routes.map((r) => r.id)).toEqual([
        "a",
        "b",
      ]),
    );
  });
  it("ignores external drops and cancelled drags", () => {
    render(
      <HashRouter>
        <Sidemenu />
      </HashRouter>,
    );
    const from = screen.getByRole("link", { name: "Work" }).parentElement!;
    const to = screen.getByRole("link", { name: "Personal" }).parentElement!;
    dragEvent(to, "dragover");
    dragEvent(to, "drop");
    expect(native.preferences).not.toHaveBeenCalled();
    dragEvent(from, "dragstart");
    dragEvent(to, "dragover");
    dragEvent(from, "dragend");
    expect(to.getAttribute("data-drop-position")).toBeNull();
    dragEvent(to, "drop");
    expect(native.preferences).not.toHaveBeenCalled();
  });
  it("rejects incomplete orders and prevents overlapping saves", async () => {
    await expect(reorder(["a", "a"])).rejects.toThrow("exactly once");
    let finish!: () => void;
    vi.mocked(native.preferences).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = reorder(["b", "a"]);
    expect(useAppStore.getState().isReordering).toBe(true);
    await reorder(["a", "b"]);
    expect(native.preferences).toHaveBeenCalledTimes(1);
    finish();
    await pending;
    expect(useAppStore.getState().isReordering).toBe(false);
    expect(useAppStore.getState().routes.map((r) => r.id)).toEqual(["b", "a"]);
  });
});
