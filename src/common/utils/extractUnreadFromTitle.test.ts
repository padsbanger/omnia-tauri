import { describe, expect, it } from "vitest";
import extractUnreadFromTitle, {
  findUnreadInTitle,
  MAX_UNREAD_COUNT,
  parseUnreadCount,
} from "./extractUnreadFromTitle";

describe("parseUnreadCount", () => {
  it("parses regular, localized, and compact values", () => {
    expect(parseUnreadCount("1,234")).toBe(1234);
    expect(parseUnreadCount("1.5k")).toBe(1500);
    expect(parseUnreadCount("2\u00a0000")).toBe(2000);
  });

  it("clamps large values and rejects strings without digits", () => {
    expect(parseUnreadCount("12k")).toBe(MAX_UNREAD_COUNT);
    expect(parseUnreadCount("none")).toBeNull();
  });
});

describe("findUnreadInTitle", () => {
  it.each([
    ["(12) Inbox", 12],
    ["3 new messages", 3],
    ["Unread 1.5k", 1500],
    ["Telegram (45)", 45],
    ["15 Telegram", 15],
  ])("finds %i unread items in %s", (title, expectedCount) => {
    expect(findUnreadInTitle(title)).toBe(expectedCount);
  });

  it("returns null when no unread count is present", () => {
    expect(findUnreadInTitle("Inbox")).toBeNull();
    expect(extractUnreadFromTitle("Inbox")).toBe(0);
  });
});
