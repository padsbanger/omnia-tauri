import { describe, expect, it } from "vitest";
import {
  CHATGPT_HOSTS,
  CLAUDE_HOSTS,
  FACEBOOK_HOSTS,
  GOOGLE_HOSTS,
  MICROSOFT_TEAMS_HOSTS,
  SLACK_HOSTS,
  SPOTIFY_HOSTS,
  TELEGRAM_HOSTS,
  TRADINGVIEW_HOSTS,
  TWITTER_HOSTS,
  WHATSAPP_HOSTS,
} from "./auth_hosts";
import {
  createLocalRoute,
  getRouteNavigationConfig,
  normalizeRouteUrl,
} from "./routeMapping";

describe("getRouteNavigationConfig", () => {
  it.each([
    ["claude", "example.com", CLAUDE_HOSTS],
    ["link", "www.anthropic.com", CLAUDE_HOSTS],
    ["chatgpt", "example.com", CHATGPT_HOSTS],
    ["link", "auth.openai.com", CHATGPT_HOSTS],
    ["gmail", "mail.google.com", GOOGLE_HOSTS],
    ["link", "accounts.google.com", GOOGLE_HOSTS],
    ["discord", "example.com", ["discord.com", "discordapp.com"]],
    ["link", "community.discord.com", ["discord.com", "discordapp.com"]],
    ["slack", "example.com", [...SLACK_HOSTS, ...GOOGLE_HOSTS]],
    ["link", "workspace.slack.com", [...SLACK_HOSTS, ...GOOGLE_HOSTS]],
    ["telegram", "example.com", TELEGRAM_HOSTS],
    ["link", "t.me", TELEGRAM_HOSTS],
    ["whatsapp", "example.com", WHATSAPP_HOSTS],
    ["link", "wa.me", WHATSAPP_HOSTS],
    ["teams", "example.com", MICROSOFT_TEAMS_HOSTS],
    ["link", "login.microsoftonline.com", MICROSOFT_TEAMS_HOSTS],
    ["facebook", "example.com", FACEBOOK_HOSTS],
    ["link", "www.messenger.com", FACEBOOK_HOSTS],
    ["tradingview", "example.com", TRADINGVIEW_HOSTS],
    ["link", "www.tradingview.com", TRADINGVIEW_HOSTS],
    ["twitter", "example.com", [...TWITTER_HOSTS, ...GOOGLE_HOSTS]],
    ["link", "mobile.x.com", [...TWITTER_HOSTS, ...GOOGLE_HOSTS]],
    ["spotify", "example.com", SPOTIFY_HOSTS],
    ["link", "open.spotify.com", SPOTIFY_HOSTS],
  ])(
    "uses the matching hosts for %s at %s",
    (icon, hostname, internalHosts) => {
      expect(getRouteNavigationConfig(icon, hostname)).toEqual({
        internalHosts,
        openExternalLinksInBrowser: true,
      });
    },
  );

  it("preserves an unknown host as the only allowed internal host", () => {
    expect(getRouteNavigationConfig("link", "intranet.example")).toEqual({
      internalHosts: ["intranet.example"],
      openExternalLinksInBrowser: true,
    });
  });
});

describe("route mapping helpers", () => {
  it("normalizes bare URLs without changing explicit HTTP URLs", () => {
    expect(normalizeRouteUrl(" open.spotify.com ")).toBe(
      "https://open.spotify.com",
    );
    expect(normalizeRouteUrl("http://intranet.example")).toBe(
      "http://intranet.example",
    );
    expect(normalizeRouteUrl("   ")).toBe("");
  });

  it("creates a route with a normalized URL and matching navigation policy", () => {
    expect(
      createLocalRoute("work-slack", " Work Slack ", "slack", "app.slack.com"),
    ).toMatchObject({
      id: "work-slack",
      label: "Work Slack",
      path: "/work-slack",
      loadURL: "https://app.slack.com",
      partition: "persist:user-work-slack",
      internalHosts: [...SLACK_HOSTS, ...GOOGLE_HOSTS],
      openExternalLinksInBrowser: true,
    });
  });
});
