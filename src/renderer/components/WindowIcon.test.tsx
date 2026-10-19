// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WindowIcon } from "./WindowIcon";

describe("WindowIcon", () => {
  afterEach(cleanup);

  it("renders a safe favicon as a decorative, non-referring image", () => {
    const { container } = render(
      <WindowIcon faviconUrl="https://example.com/favicon.ico" icon="link" />,
    );

    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe("https://example.com/favicon.ico");
    expect(image?.getAttribute("alt")).toBe("");
    expect(image?.getAttribute("aria-hidden")).toBe("true");
    expect(image?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(image?.draggable).toBe(false);
  });

  it("falls back to the preset icon when the favicon URL is unsafe", () => {
    const { container } = render(
      <WindowIcon faviconUrl="javascript:alert(1)" icon="gmail" />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("falls back to the preset icon when the favicon cannot load", () => {
    const { container } = render(
      <WindowIcon faviconUrl="https://example.com/missing.png" icon="gmail" />,
    );

    fireEvent.error(container.querySelector("img")!);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("tries a new safe favicon after an earlier URL failed", () => {
    const { container, rerender } = render(
      <WindowIcon faviconUrl="https://example.com/missing.png" icon="link" />,
    );
    fireEvent.error(container.querySelector("img")!);

    rerender(
      <WindowIcon
        faviconUrl="https://example.com/replacement.png"
        icon="link"
      />,
    );

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/replacement.png",
    );
  });
});
