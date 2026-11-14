import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@heroui/react";
import VaultServerForm from "./VaultServerForm";
import { native, message, type VaultStatus } from "../native";

export default function VaultSettings() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const refresh = () =>
      void native
        .vaultStatus()
        .then((s) => {
          if (!alive.current) return;
          setStatus(s);
        })
        .catch((e) => {
          if (alive.current) setNotice(message(e));
        });
    refresh();
    const timer = window.setInterval(refresh, 10000);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
    };
  }, []);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setNotice("");
    try {
      await operation();
    } catch (e) {
      if (alive.current) setNotice(message(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const unlock = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Passwords are transient uncontrolled inputs, never React/Zustand state or storage.
    const form = e.currentTarget;
    const fields = form.elements;
    const value = (name: string) =>
      (fields.namedItem(name) as HTMLInputElement).value;
    const input = {
      email: value("email"),
      password: value("password"),
      code: value("code"),
    };
    (fields.namedItem("password") as HTMLInputElement).value = "";
    (fields.namedItem("code") as HTMLInputElement).value = "";
    void run(async () => {
      const pending = native.vaultUnlock(input);
      input.password = "";
      input.code = "";
      await pending;
      const next = await native.vaultStatus();
      if (alive.current) setStatus(next);
      window.dispatchEvent(new Event("vault-changed"));
    });
  };
  const lock = () => {
    void run(async () => {
      await native.vaultLock();
      const next = await native.vaultStatus();
      if (alive.current) setStatus(next);
      window.dispatchEvent(new Event("vault-changed"));
    });
  };
  const saveServer = (server: string) => {
    void run(async () => {
      await native.vaultConfigure(server);
      const next = await native.vaultStatus();
      if (alive.current) setStatus(next);
      window.dispatchEvent(new Event("vault-changed"));
    });
  };
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 text-slate-950">
      <header className="flex items-center justify-between">
        <h3 className="font-semibold">Vaultwarden</h3>
      </header>
      <VaultServerForm status={status} busy={busy} save={saveServer} />
      <p className="text-sm text-slate-500">
        Unlock lasts five minutes. Only personal logins for the exact HTTPS
        origin are offered. Omnia never submits the form.
      </p>
      {notice && (
        <p role="status" className="rounded bg-slate-100 p-3 text-sm">
          {notice}
        </p>
      )}
      {!status && <p>Checking vault…</p>}
      {status && !status.unlocked && (
        <form
          key={status.server}
          onSubmit={unlock}
          className="flex flex-col gap-3"
        >
          <label>
            Email
            <input
              className="w-full rounded border p-2"
              name="email"
              type="email"
              autoComplete="username"
              required
            />
          </label>
          <label>
            Master password
            <input
              className="w-full rounded border p-2"
              name="password"
              type="password"
              autoComplete="off"
              required
            />
          </label>
          <label>
            Authenticator code (if enabled)
            <input
              className="w-full rounded border p-2"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={16}
            />
          </label>
          <Button type="submit" isDisabled={busy || !status.server}>
            Unlock vault
          </Button>
          <p className="text-xs text-slate-500">
            SSO, security-key 2FA and email challenges are not supported yet.
          </p>
        </form>
      )}
      {status?.unlocked && (
        <>
          <div className="flex gap-2">
            <Button onClick={lock} isDisabled={busy}>
              Lock vault
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Lock and unlock to refresh the vault. Shared, deleted, non-login and
            master-password-reprompt entries are omitted.
          </p>
          <p className="text-sm">
            Vault unlocked. Use the sidebar vault icon when matching logins are
            available.
          </p>
        </>
      )}
    </section>
  );
}
