import { Button } from "@heroui/react";
import type { VaultStatus } from "../native";

export default function VaultServerForm({
  status,
  busy,
  save,
}: {
  status: VaultStatus | null;
  busy: boolean;
  save: (server: string) => void;
}) {
  if (!status) return null;
  return (
    <form
      key={status.server}
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const input = event.currentTarget.elements.namedItem(
          "server",
        ) as HTMLInputElement;
        save(input.value);
      }}
    >
      <label>
        Vaultwarden server URL
        <input
          className="w-full rounded border p-2"
          name="server"
          type="url"
          placeholder="https://vault.example.com"
          defaultValue={status.server ?? ""}
          autoComplete="off"
          disabled={busy}
        />
      </label>
      <p className="text-xs text-slate-500">
        Saved only on this device for your Omnia account. Saving locks the
        vault. Leave blank to disconnect.
      </p>
      <Button type="submit" isDisabled={busy}>
        Save server
      </Button>
    </form>
  );
}
