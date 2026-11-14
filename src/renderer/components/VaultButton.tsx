import { useEffect, useState } from "react";
import { LuVault } from "react-icons/lu";
import { native, type VaultAvailability } from "../native";

export default function VaultButton({
  routeId,
  open,
}: {
  routeId: string | null;
  open: () => void;
}) {
  const [state, setState] = useState<
    (VaultAvailability & { routeId: string | null }) | null
  >(null);
  useEffect(() => {
    let disposed = false,
      running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const next = await native.vaultAvailability(routeId);
        if (!disposed) setState({ ...next, routeId });
      } catch {
        if (!disposed) setState(null);
      } finally {
        running = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    window.addEventListener("vault-changed", refresh);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("vault-changed", refresh);
    };
  }, [routeId]);
  if (!state?.unlocked) return null;
  const active = state.routeId === routeId && state.hasMatches;
  const label = active ? "Vault: matching logins" : "Vault: no matching logins";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!active}
      onClick={open}
      className={`my-2 flex h-10 w-10 items-center justify-center rounded-xl border ${active ? "border-blue-400/30 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30" : "border-white/5 text-slate-600"}`}
    >
      <LuVault aria-hidden="true" className="text-2xl" />
    </button>
  );
}
