import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import VaultButton from "./VaultButton";
import { native } from "../native";
vi.mock("../native", () => ({ native: { vaultAvailability: vi.fn() } }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(native.vaultAvailability)
    .mockReset()
    .mockResolvedValue({ unlocked: false, hasMatches: false });
});
afterEach(() => vi.useRealTimers());
const settle = () =>
  act(async () => {
    await Promise.resolve();
  });
it("hides while locked, enables for matches, disables without matches and hides on expiry", async () => {
  const open = vi.fn();
  render(<VaultButton routeId="a" open={open} />);
  await settle();
  expect(screen.queryByRole("button")).toBeNull();
  vi.mocked(native.vaultAvailability).mockResolvedValue({
    unlocked: true,
    hasMatches: true,
  });
  fireEvent(window, new Event("vault-changed"));
  await settle();
  fireEvent.click(
    screen.getByRole("button", { name: "Vault: matching logins" }),
  );
  expect(open).toHaveBeenCalledOnce();
  vi.mocked(native.vaultAvailability).mockResolvedValue({
    unlocked: true,
    hasMatches: false,
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  const disabled = screen.getByRole("button", {
    name: "Vault: no matching logins",
  }) as HTMLButtonElement;
  expect(disabled.disabled).toBe(true);
  fireEvent.click(disabled);
  expect(open).toHaveBeenCalledOnce();
  vi.mocked(native.vaultAvailability).mockResolvedValue({
    unlocked: false,
    hasMatches: false,
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(screen.queryByRole("button")).toBeNull();
});
it("disables stale route results immediately and ignores pending responses after route change", async () => {
  vi.mocked(native.vaultAvailability).mockResolvedValueOnce({
    unlocked: true,
    hasMatches: true,
  });
  const { rerender, unmount } = render(
    <VaultButton routeId="a" open={() => {}} />,
  );
  await settle();
  let resolve!: (v: { unlocked: boolean; hasMatches: boolean }) => void;
  vi.mocked(native.vaultAvailability).mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  rerender(<VaultButton routeId="b" open={() => {}} />);
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
  expect(native.vaultAvailability).toHaveBeenCalledTimes(2);
  rerender(<VaultButton routeId={null} open={() => {}} />);
  await settle();
  resolve({ unlocked: true, hasMatches: true });
  await settle();
  expect(screen.queryByRole("button")).toBeNull();
  unmount();
});
it("hides when availability fails", async () => {
  vi.mocked(native.vaultAvailability).mockRejectedValue(
    new Error("Unavailable"),
  );
  render(<VaultButton routeId="a" open={() => {}} />);
  await settle();
  expect(screen.queryByRole("button")).toBeNull();
});
