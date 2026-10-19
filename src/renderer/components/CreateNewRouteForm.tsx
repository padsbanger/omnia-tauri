import { useMemo, useState, FormEvent } from "react";

import { Button } from "@heroui/react";
import { Route } from "../../common/routes";
import {
  getRouteNavigationConfig,
  normalizeRouteUrl,
} from "../../common/routeMapping";

type CreateNewRouteFormProps = {
  closeDrawer: () => void;
  onCreateRoute?: (route: Route) => Promise<boolean>;
};

type ApplicationKey =
  | "claude"
  | "chatgpt"
  | "gmail"
  | "discord"
  | "facebook"
  | "tradingview"
  | "twitter"
  | "spotify"
  | "slack"
  | "telegram"
  | "whatsapp"
  | "teams"
  | "link";

const APPLICATION_DEFAULTS: Record<
  ApplicationKey,
  { label: string; url: string }
> = {
  claude: { label: "Claude", url: "https://claude.ai/" },
  chatgpt: { label: "ChatGPT", url: "https://chatgpt.com/" },
  gmail: { label: "Gmail", url: "https://mail.google.com" },
  discord: { label: "Discord", url: "https://discord.com/channels/@me" },
  facebook: { label: "Messenger", url: "https://facebook.com/messages" },
  tradingview: { label: "TradingView", url: "https://www.tradingview.com" },
  twitter: { label: "Twitter", url: "https://twitter.com/home" },
  spotify: { label: "Spotify", url: "https://open.spotify.com/home" },
  slack: { label: "Slack", url: "https://app.slack.com/client" },
  telegram: { label: "Telegram", url: "https://web.telegram.org/a/" },
  whatsapp: { label: "WhatsApp", url: "https://web.whatsapp.com" },
  teams: { label: "Microsoft Teams", url: "https://teams.microsoft.com" },
  link: { label: "Custom Website", url: "" },
};

const buildRouteId = (label: string) =>
  `${label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`;

const getHostname = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

const buildRoute = (
  label: string,
  application: ApplicationKey,
  loadURL: string,
  hostname: string,
): Route => {
  const navigationConfig = getRouteNavigationConfig(application, hostname);
  const routeId = buildRouteId(label);

  return {
    id: routeId,
    label: label.trim(),
    icon: application,
    path: `/${routeId}`,
    loadURL,
    partition: `persist:user-${routeId}`,
    isHibernated: false,
    internalHosts: navigationConfig.internalHosts,
    openExternalLinksInBrowser: navigationConfig.openExternalLinksInBrowser,
  };
};

const CreateNewRouteForm = ({
  closeDrawer,
  onCreateRoute,
}: CreateNewRouteFormProps) => {
  const [label, setLabel] = useState("");
  const [application, setApplication] = useState<ApplicationKey>("gmail");
  const [url, setUrl] = useState(APPLICATION_DEFAULTS.gmail.url);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => label.trim().length > 0 && url.trim().length > 0 && !isSubmitting,
    [isSubmitting, label, url],
  );

  const handleApplicationChange = (value: ApplicationKey) => {
    setApplication(value);
    setUrl(APPLICATION_DEFAULTS[value].url);
  };

  const createRouteInWorkspace = (route: Route) => {
    if (!onCreateRoute) throw new Error("Route creation is unavailable.");
    return onCreateRoute(route);
  };

  const handleCreateRoute = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedUrl = normalizeRouteUrl(url);
    if (!normalizedUrl) return;

    const hostname = /^https?:\/\//.test(normalizedUrl)
      ? getHostname(normalizedUrl)
      : null;
    if (!hostname) {
      setError("Enter a valid URL.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const route = buildRoute(label, application, normalizedUrl, hostname);

    try {
      const wasCreated = await createRouteInWorkspace(route);
      if (wasCreated) {
        closeDrawer();
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to save route.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-white text-slate-950">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-950">Add route</h2>
      </div>
      <form
        className="flex flex-1 flex-col gap-4 p-5"
        onSubmit={handleCreateRoute}
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
          Label
          <input
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Work Gmail"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
          Application
          <select
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            value={application}
            onChange={(event) =>
              handleApplicationChange(event.target.value as ApplicationKey)
            }
          >
            <option value="claude">Claude</option>
            <option value="chatgpt">ChatGPT</option>
            <option value="gmail">Gmail</option>
            <option value="discord">Discord</option>
            <option value="facebook">Facebook</option>
            <option value="twitter">Twitter</option>
            <option value="tradingview">TradingView</option>
            <option value="spotify">Spotify</option>
            <option value="slack">Slack</option>
            <option value="telegram">Telegram</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="teams">Microsoft Teams</option>
            <option value="link">Custom Website</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
          URL
          <input
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="mail.google.com"
            required
          />
        </label>
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="mt-auto flex gap-2 justify-end pt-2">
          <Button
            type="button"
            className="border border-slate-200 bg-white text-slate-700"
            onClick={closeDrawer}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="bg-blue-600 font-medium text-white"
            isDisabled={!canSubmit}
          >
            {isSubmitting ? "Saving..." : "Save route"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CreateNewRouteForm;
