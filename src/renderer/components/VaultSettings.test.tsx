import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VaultSettings from "./VaultSettings";
import { native } from "../native";
vi.mock("../native", async (importOriginal) => {
  const original = await importOriginal<typeof import("../native")>();
  return {
    ...original,
    native: {
      ...original.native,
      vaultStatus: vi.fn(),
      vaultConfigure: vi.fn(),
      vaultUnlock: vi.fn(),
      vaultLock: vi.fn(),
      vaultMatches: vi.fn(),
      vaultFill: vi.fn(),
    },
  };
});
const locked = {
  server: "https://vault.example.com",
  unlocked: false,
  skipped: 0,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(native.vaultStatus).mockResolvedValue(locked);
  vi.mocked(native.vaultConfigure).mockResolvedValue(undefined);
  vi.mocked(native.vaultLock).mockResolvedValue(undefined);
  vi.mocked(native.vaultUnlock).mockResolvedValue(undefined);
  vi.mocked(native.vaultFill).mockResolvedValue(
    "Login filled. Submit the form when ready.",
  );
});
it("unlocks and locks from settings, clears secret fields and notifies the sidebar", async () => {
  let received: unknown;
  vi.mocked(native.vaultUnlock).mockImplementation(async (input) => {
    received = { ...input };
  });
  const changed = vi.fn();
  window.addEventListener("vault-changed", changed);
  render(<VaultSettings />);
  await screen.findByLabelText("Master password");
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "alice@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Master password"), {
    target: { value: "private" },
  });
  vi.mocked(native.vaultStatus).mockResolvedValue({
    ...locked,
    unlocked: true,
  });
  fireEvent.submit(screen.getByLabelText("Master password").closest("form")!);
  await screen.findByText(/Vault unlocked/);
  expect(received).toEqual({
    email: "alice@example.com",
    password: "private",
    code: "",
  });
  expect(changed).toHaveBeenCalledOnce();
  expect(screen.queryByText("Find matching logins")).toBeNull();
  vi.mocked(native.vaultStatus).mockResolvedValue(locked);
  fireEvent.click(screen.getByText("Lock vault"));
  await screen.findByLabelText("Master password");
  expect(native.vaultLock).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenCalledTimes(2);
  window.removeEventListener("vault-changed", changed);
});
it("shows unlock failures without retaining secrets", async () => {
  vi.mocked(native.vaultUnlock).mockRejectedValue(
    new Error("Authenticator code required"),
  );
  render(<VaultSettings />);
  await screen.findByLabelText("Master password");
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "a@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Master password"), {
    target: { value: "private" },
  });
  fireEvent.submit(screen.getByLabelText("Master password").closest("form")!);
  await screen.findByText("Authenticator code required");
  expect(
    (screen.getByLabelText("Master password") as HTMLInputElement).value,
  ).toBe("");
});
it("reports status errors and ignores responses after closing", async () => {
  vi.mocked(native.vaultStatus).mockRejectedValueOnce(new Error("Unavailable"));
  const first = render(<VaultSettings />);
  await screen.findByText("Unavailable");
  first.unmount();
  let resolve!: (value: typeof locked) => void;
  vi.mocked(native.vaultStatus).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const next = render(<VaultSettings />);
  next.unmount();
  resolve(locked);
});
it("requires a server and saves it before enabling unlock", async () => {
  vi.mocked(native.vaultStatus).mockResolvedValueOnce({
    ...locked,
    server: null,
  });
  render(<VaultSettings />);
  const user = userEvent.setup();
  const url = await screen.findByLabelText("Vaultwarden server URL");
  expect((url as HTMLInputElement).value).toBe("");
  expect(
    (screen.getByRole("button", { name: "Unlock vault" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await user.type(url, "https://vault.example.com");
  await user.click(screen.getByRole("button", { name: "Save server" }));
  expect(native.vaultConfigure).toHaveBeenCalledWith(
    "https://vault.example.com",
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Unlock vault",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  expect(native.vaultUnlock).not.toHaveBeenCalled();
});
it("surfaces invalid server errors without unlocking", async () => {
  vi.mocked(native.vaultConfigure).mockRejectedValue(new Error("Use HTTPS"));
  render(<VaultSettings />);
  const input = await screen.findByLabelText("Vaultwarden server URL");
  fireEvent.change(input, { target: { value: "http://vault.example.com" } });
  fireEvent.submit(input.closest("form")!);
  await screen.findByText("Use HTTPS");
  expect(native.vaultUnlock).not.toHaveBeenCalled();
});
