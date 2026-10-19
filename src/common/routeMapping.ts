import {
  CHATGPT_HOSTS,
  CLAUDE_HOSTS,
  FACEBOOK_HOSTS,
  GOOGLE_HOSTS,
  MICROSOFT_TEAMS_HOSTS,
  SLACK_HOSTS,
  SPOTIFY_HOSTS,
  TELEGRAM_HOSTS,
  WHATSAPP_HOSTS,
  TRADINGVIEW_HOSTS,
  TWITTER_HOSTS,
} from "./auth_hosts";
import { Route } from "./routes";

export type ApiRoute = {
  id: string;
  userId: string;
  name: string;
  url: string;
  icon: string | null;
  order: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type RouteNavigationConfig = {
  internalHosts: string[];
  openExternalLinksInBrowser: boolean;
};

type NavigationRule = {
  icon: string;
  internalHosts: string[];
  hostSuffixes?: string[];
  exactHosts?: string[];
};

const ROUTE_NAVIGATION_RULES: NavigationRule[] = [
  {
    icon: "claude",
    internalHosts: CLAUDE_HOSTS,
    hostSuffixes: ["claude.ai", "anthropic.com"],
  },
  {
    icon: "chatgpt",
    internalHosts: CHATGPT_HOSTS,
    hostSuffixes: ["chatgpt.com", "openai.com"],
  },
  {
    icon: "gmail",
    internalHosts: GOOGLE_HOSTS,
    hostSuffixes: [
      "google.com",
      "gmail.com",
      "googleusercontent.com",
      "gstatic.com",
    ],
  },
  {
    icon: "discord",
    internalHosts: ["discord.com", "discordapp.com"],
    hostSuffixes: ["discord.com"],
  },
  {
    icon: "slack",
    internalHosts: [...SLACK_HOSTS, ...GOOGLE_HOSTS],
    hostSuffixes: ["slack.com"],
  },
  {
    icon: "telegram",
    internalHosts: TELEGRAM_HOSTS,
    hostSuffixes: ["telegram.org", "telegram.me", "telegra.ph"],
    exactHosts: ["t.me"],
  },
  {
    icon: "whatsapp",
    internalHosts: WHATSAPP_HOSTS,
    hostSuffixes: ["whatsapp.com", "whatsapp.net"],
    exactHosts: ["wa.me"],
  },
  {
    icon: "teams",
    internalHosts: MICROSOFT_TEAMS_HOSTS,
    hostSuffixes: [
      "teams.microsoft.com",
      "teams.live.com",
      "microsoftonline.com",
      "office.com",
    ],
  },
  {
    icon: "facebook",
    internalHosts: FACEBOOK_HOSTS,
    hostSuffixes: ["facebook.com", "messenger.com"],
  },
  {
    icon: "tradingview",
    internalHosts: TRADINGVIEW_HOSTS,
    hostSuffixes: ["tradingview.com"],
  },
  {
    icon: "twitter",
    internalHosts: [...TWITTER_HOSTS, ...GOOGLE_HOSTS],
    hostSuffixes: ["twitter.com", "x.com"],
  },
  {
    icon: "spotify",
    internalHosts: SPOTIFY_HOSTS,
    hostSuffixes: ["spotify.com"],
  },
];

const matchesRouteHost = (hostname: string, rule: NavigationRule) =>
  rule.hostSuffixes?.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  ) ||
  rule.exactHosts?.includes(hostname) ||
  false;

export const getRouteNavigationConfig = (
  icon: string,
  hostname: string,
): RouteNavigationConfig => {
  const lowerHost = hostname.toLowerCase();
  const matchingRule = ROUTE_NAVIGATION_RULES.find(
    (rule) => rule.icon === icon || matchesRouteHost(lowerHost, rule),
  );

  return {
    internalHosts: matchingRule?.internalHosts ?? [hostname],
    openExternalLinksInBrowser: true,
  };
};

export const normalizeRouteUrl = (rawValue: string) => {
  const trimmed = rawValue.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

export const createLocalRouteFromApiRoute = (apiRoute: ApiRoute): Route => {
  const icon = apiRoute.icon ?? "link";
  const hostname = new URL(apiRoute.url).hostname;
  const navigationConfig = getRouteNavigationConfig(icon, hostname);

  return {
    id: apiRoute.id,
    label: apiRoute.name,
    icon,
    path: `/${apiRoute.id}`,
    loadURL: apiRoute.url,
    partition: `persist:user-${apiRoute.id}`,
    isHibernated: false,
    internalHosts: navigationConfig.internalHosts,
    openExternalLinksInBrowser: navigationConfig.openExternalLinksInBrowser,
  };
};

export const createLocalRoute = (
  routeId: string,
  label: string,
  icon: string,
  url: string,
): Route => {
  const normalizedUrl = normalizeRouteUrl(url);
  const hostname = new URL(normalizedUrl).hostname;
  const navigationConfig = getRouteNavigationConfig(icon, hostname);

  return {
    id: routeId,
    label: label.trim(),
    icon,
    path: `/${routeId}`,
    loadURL: normalizedUrl,
    partition: `persist:user-${routeId}`,
    isHibernated: false,
    internalHosts: navigationConfig.internalHosts,
    openExternalLinksInBrowser: navigationConfig.openExternalLinksInBrowser,
  };
};
