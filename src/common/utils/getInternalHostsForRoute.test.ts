import { describe, expect, it } from "vitest";
import { GOOGLE_HOSTS, TWITTER_HOSTS } from "../auth_hosts";
import type { Route } from "../routes";
import getInternalHostsForRoute from "./getInternalHostsForRoute";

const createRoute = (overrides: Partial<Route> = {}): Route => ({
  id: "route-id",
  path: "/route-id",
  icon: "link",
  label: "Route",
  loadURL: "https://Example.com/app",
  partition: "persist:route-id",
  ...overrides,
});

describe("getInternalHostsForRoute", () => {
  it("uses and normalizes configured internal hosts", () => {
    expect(
      getInternalHostsForRoute(
        createRoute({ internalHosts: ["Example.com", "EXAMPLE.com"] }),
      ),
    ).toEqual(["example.com"]);
  });

  it("uses the route URL host when no internal hosts are configured", () => {
    expect(getInternalHostsForRoute(createRoute())).toEqual(["example.com"]);
  });

  it("adds Twitter and Google hosts for Twitter routes", () => {
    expect(getInternalHostsForRoute(createRoute({ icon: "twitter" }))).toEqual(
      expect.arrayContaining([
        "example.com",
        ...TWITTER_HOSTS,
        ...GOOGLE_HOSTS,
      ]),
    );
  });

  it("adds Google hosts for TradingView routes", () => {
    expect(
      getInternalHostsForRoute(createRoute({ icon: "tradingview" })),
    ).toEqual(expect.arrayContaining(["example.com", ...GOOGLE_HOSTS]));
  });
});
