import { Button, Tooltip } from "@heroui/react";
import { MdCropSquare, MdGridView, MdViewColumn } from "react-icons/md";
import { WindowLayout } from "../../common/drawer";

type WorkspaceLayoutSwitcherProps = {
  routeCount: number;
  windowLayout: WindowLayout;
  onWindowLayoutChange: (windowLayout: WindowLayout) => void;
};

const LAYOUT_OPTIONS: Array<{
  icon: React.ReactNode;
  label: string;
  layout: WindowLayout;
}> = [
  {
    icon: <MdCropSquare className="text-base" />,
    label: "Single",
    layout: "single",
  },
  {
    icon: <MdViewColumn className="text-base" />,
    label: "Columns",
    layout: "spread",
  },
  {
    icon: <MdGridView className="text-base" />,
    label: "Matrix",
    layout: "matrix",
  },
];

const WorkspaceLayoutSwitcher = ({
  onWindowLayoutChange,
  routeCount,
  windowLayout,
}: WorkspaceLayoutSwitcherProps) => {
  if (routeCount === 0) {
    return null;
  }

  return (
    <div className="w-full shrink-0 border-t border-white/[0.06] px-1.5 py-2">
      <div
        aria-label="Window layout"
        className="grid grid-cols-3 gap-0.5 rounded-xl border border-white/[0.07] bg-white/[0.03] p-1"
        role="group"
      >
        {LAYOUT_OPTIONS.map(({ icon, label, layout }) => {
          const isActive = windowLayout === layout;
          const isDisabled = routeCount < 2 && layout !== "single";

          return (
            <Tooltip key={layout}>
              <Button
                aria-label={`${label} layout`}
                aria-pressed={isActive}
                className={`h-8 min-h-8 w-full min-w-0 rounded-lg px-0 shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-30 ${
                  isActive
                    ? "bg-blue-500 text-white hover:bg-blue-400"
                    : "bg-transparent text-slate-400 hover:bg-white/[0.09] hover:text-white"
                }`}
                isDisabled={isDisabled}
                isIconOnly
                onClick={() => onWindowLayoutChange(layout)}
                size="sm"
                type="button"
              >
                {icon}
              </Button>
              <Tooltip.Content offset={8} placement="top">
                <p>{label} layout</p>
              </Tooltip.Content>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};

export default WorkspaceLayoutSwitcher;
