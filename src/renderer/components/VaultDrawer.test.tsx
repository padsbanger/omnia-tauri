import { beforeEach, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import VaultDrawer from "./VaultDrawer";
import { native } from "../native";
vi.mock("../native", async (original) => {
  const module = await original<typeof import("../native")>();
  return {
    ...module,
    native: { ...module.native, vaultMatches: vi.fn(), vaultFill: vi.fn() },
  };
});
const matches = {
  ticket: "one-use",
  origin: "https://example.com",
  entries: [{ id: "one", name: "Example", username: "alice" }],
  skipped: 1,
};
beforeEach(() => {
  vi.mocked(native.vaultMatches).mockReset().mockResolvedValue(matches);
  vi.mocked(native.vaultFill).mockReset().mockResolvedValue("Login filled.");
});
it.each([false, true])(
  "ignores a stale fill result after switching routes (failure=%s)",
  async (failure) => {
    let resolve!: (value: string) => void;
    let reject!: (reason: Error) => void;
    vi.mocked(native.vaultFill).mockReturnValueOnce(
      new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      }),
    );
    const { rerender } = render(
      <VaultDrawer routeId="a" closeDrawer={() => {}} />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Fill Example alice" }),
    );
    vi.mocked(native.vaultMatches).mockResolvedValue({
      ...matches,
      entries: [],
      skipped: 0,
    });
    rerender(<VaultDrawer routeId="b" closeDrawer={() => {}} />);
    await screen.findByText(/No matching personal logins/);
    await act(async () => {
      if (failure) reject(new Error("Old result"));
      else resolve("Old result");
    });
    expect(screen.queryByText("Old result")).toBeNull();
    expect(
      (screen.getByText("Refresh logins") as HTMLButtonElement).disabled,
    ).toBe(false);
  },
);
it("automatically finds entries and fills only the selected login; no configuration controls", async () => {
  const close = vi.fn();
  render(<VaultDrawer routeId="a" closeDrawer={close} />);
  await screen.findByText("alice");
  expect(native.vaultMatches).toHaveBeenCalledWith("a");
  expect(native.vaultFill).not.toHaveBeenCalled();
  expect(screen.queryByLabelText("Master password")).toBeNull();
  expect(screen.queryByLabelText("Vaultwarden server URL")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Fill Example alice" }));
  await screen.findByText("Login filled.");
  expect(native.vaultFill).toHaveBeenCalledWith("one-use", "one");
  expect(screen.queryByText("alice")).toBeNull();
  fireEvent.click(screen.getByText("Close"));
  expect(close).toHaveBeenCalledOnce();
});
it("ignores stale route matches and requests a new ticket on refresh", async () => {
  let resolve!: (value: typeof matches) => void;
  vi.mocked(native.vaultMatches).mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const { rerender } = render(
    <VaultDrawer routeId="a" closeDrawer={() => {}} />,
  );
  vi.mocked(native.vaultMatches).mockResolvedValue({
    ...matches,
    entries: [],
    skipped: 0,
  });
  rerender(<VaultDrawer routeId="b" closeDrawer={() => {}} />);
  await screen.findByText(/No matching personal logins/);
  resolve(matches);
  await waitFor(() => expect(screen.queryByText("alice")).toBeNull());
  fireEvent.click(screen.getByText("Refresh logins"));
  await waitFor(() => expect(native.vaultMatches).toHaveBeenCalledTimes(3));
});
it("shows missing-route, locked-vault and fill failures", async () => {
  const { rerender } = render(
    <VaultDrawer routeId={null} closeDrawer={() => {}} />,
  );
  await screen.findByText("Select a route first.");
  vi.mocked(native.vaultMatches).mockRejectedValueOnce(
    new Error("Vault is locked"),
  );
  rerender(<VaultDrawer routeId="a" closeDrawer={() => {}} />);
  await screen.findByText("Vault is locked");
  fireEvent.click(screen.getByText("Refresh logins"));
  await screen.findByText("alice");
  vi.mocked(native.vaultFill).mockRejectedValueOnce(
    new Error("Website changed"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Fill Example alice" }));
  await screen.findByText("Website changed");
});
