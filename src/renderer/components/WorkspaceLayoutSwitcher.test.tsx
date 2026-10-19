// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkspaceLayoutSwitcher from "./WorkspaceLayoutSwitcher";

vi.mock("@heroui/react", () => {
  const Button = ({
    children,
    isDisabled,
    isIconOnly: _isIconOnly,
    size: _size,
    ...props
  }: React.PropsWithChildren<
    React.ButtonHTMLAttributes<HTMLButtonElement> & {
      isDisabled?: boolean;
      isIconOnly?: boolean;
      size?: string;
    }
  >) => (
    <button disabled={isDisabled} {...props}>
      {children}
    </button>
  );
  const Tooltip = Object.assign(
    ({ children }: React.PropsWithChildren) => <>{children}</>,
    { Content: ({ children }: React.PropsWithChildren) => <>{children}</> },
  );
  return { Button, Tooltip };
});

describe("WorkspaceLayoutSwitcher", () => {
  afterEach(cleanup);

  it("selects each layout and exposes the current selection", () => {
    const onWindowLayoutChange = vi.fn();
    render(
      <WorkspaceLayoutSwitcher
        onWindowLayoutChange={onWindowLayoutChange}
        routeCount={3}
        windowLayout="matrix"
      />,
    );

    expect(screen.getByRole("group", { name: "Window layout" })).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Matrix layout" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Single layout" })
        .getAttribute("aria-pressed"),
    ).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Single layout" }));
    fireEvent.click(screen.getByRole("button", { name: "Columns layout" }));
    fireEvent.click(screen.getByRole("button", { name: "Matrix layout" }));

    expect(onWindowLayoutChange).toHaveBeenNthCalledWith(1, "single");
    expect(onWindowLayoutChange).toHaveBeenNthCalledWith(2, "spread");
    expect(onWindowLayoutChange).toHaveBeenNthCalledWith(3, "matrix");
  });

  it("disables multi-pane layouts until another route is available", () => {
    render(
      <WorkspaceLayoutSwitcher
        onWindowLayoutChange={vi.fn()}
        routeCount={1}
        windowLayout="single"
      />,
    );

    expect(
      (
        screen.getByRole("button", {
          name: "Single layout",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(
      (
        screen.getByRole("button", {
          name: "Columns layout",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Matrix layout",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("stays hidden until the first route is added", () => {
    const { container } = render(
      <WorkspaceLayoutSwitcher
        onWindowLayoutChange={vi.fn()}
        routeCount={0}
        windowLayout="single"
      />,
    );

    expect(container.innerHTML).toBe("");
  });
});
