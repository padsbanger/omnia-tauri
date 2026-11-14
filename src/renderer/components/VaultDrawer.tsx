import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { native, message, type VaultMatches } from "../native";

export default function VaultDrawer({
  routeId,
  closeDrawer,
}: {
  routeId: string | null;
  closeDrawer: () => void;
}) {
  const [matches, setMatches] = useState<VaultMatches | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const find = async () => {
    const revision = ++sequence.current;
    setMatches(null);
    setNotice("");
    setBusy(true);
    try {
      if (!routeId) throw new Error("Select a route first.");
      const next = await native.vaultMatches(routeId);
      if (sequence.current === revision) setMatches(next);
    } catch (e) {
      if (sequence.current === revision) setNotice(message(e));
    } finally {
      if (sequence.current === revision) setBusy(false);
    }
  };
  useEffect(() => {
    void find();
    return () => {
      sequence.current++;
    };
  }, [routeId]);
  const fill = async (id: string) => {
    if (!matches) return;
    const revision = sequence.current;
    const ticket = matches.ticket;
    setMatches(null);
    setBusy(true);
    try {
      const result = await native.vaultFill(ticket, id);
      if (sequence.current === revision) setNotice(result);
    } catch (e) {
      if (sequence.current === revision) setNotice(message(e));
    } finally {
      if (sequence.current === revision) setBusy(false);
    }
  };
  return (
    <section className="flex h-full flex-col gap-4 overflow-y-auto bg-white p-5 text-slate-950">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Fill login</h2>
        <Button onClick={closeDrawer}>Close</Button>
      </header>
      <p className="text-sm text-slate-500">
        Choose a login for this website. Vault connection and unlock controls
        are in Settings.
      </p>
      {notice && <p role="status">{notice}</p>}
      <Button onClick={() => void find()} isDisabled={busy}>
        Refresh logins
      </Button>
      <VaultEntries
        matches={matches}
        busy={busy}
        fill={(id) => void fill(id)}
      />
    </section>
  );
}

function VaultEntries({
  matches,
  busy,
  fill,
}: {
  matches: VaultMatches | null;
  busy: boolean;
  fill: (id: string) => void;
}) {
  if (!matches) return null;
  return (
    <>
      <p className="break-all text-sm">
        Fill into <strong>{matches.origin}</strong>
      </p>
      {matches.entries.length === 0 && (
        <p>
          No matching personal logins. Check the saved website URL in
          Vaultwarden.
        </p>
      )}
      {matches.entries.map((entry) => (
        <button
          key={entry.id}
          aria-label={`Fill ${entry.name} ${entry.username}`}
          disabled={busy}
          onClick={() => fill(entry.id)}
          className="rounded border p-3 text-left hover:bg-slate-50"
        >
          <span className="block font-medium">{entry.name}</span>
          <span className="block text-sm text-slate-500">{entry.username}</span>
          <span className="text-sm text-blue-600">Fill this login</span>
        </button>
      ))}
      {matches.skipped > 0 && (
        <p className="text-xs">
          {matches.skipped} unsupported, protected or non-login entries omitted.
        </p>
      )}
    </>
  );
}
