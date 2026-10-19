import { Button, Description, Label } from "@heroui/react";
import { MdGridView, MdViewColumn } from "react-icons/md";
import { WindowLayout } from "../../common/drawer";

type RouteLayoutControlsProps = {
  windowLayout: WindowLayout;
  onWindowLayoutChange: (windowLayout: WindowLayout) => void;
};

const layoutButtonClass = (isActive: boolean) =>
  isActive
    ? "bg-slate-950 text-white shadow-sm"
    : "bg-transparent text-slate-500 shadow-none hover:bg-white hover:text-slate-900";

const LayoutButton = ({
  currentLayout,
  icon,
  label,
  layout,
  onWindowLayoutChange,
}: {
  currentLayout: WindowLayout;
  label: string;
  layout: "spread" | "matrix";
  icon: React.ReactNode;
  onWindowLayoutChange: (windowLayout: WindowLayout) => void;
}) => (
  <Button
    aria-label={label}
    type="button"
    className={`${layoutButtonClass(currentLayout === layout)} h-9 flex-1 rounded-lg px-2 text-xs`}
    onClick={() =>
      onWindowLayoutChange(currentLayout === layout ? "single" : layout)
    }
  >
    {icon}
    <span>{label}</span>
  </Button>
);

const RouteLayoutControls = ({
  onWindowLayoutChange,
  windowLayout,
}: RouteLayoutControlsProps) => (
  <div className="mt-1 rounded-2xl border border-slate-200/80 bg-white/80 p-3.5 shadow-[0_8px_24px_rgba(15,23,42,0.03)]">
    <div className="flex flex-col gap-0.5">
      <Label className="text-sm font-semibold text-slate-900">
        Window layout
      </Label>
      <Description className="text-xs text-slate-400">
        Arrange every active route in one workspace.
      </Description>
    </div>
    <div className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1">
      <LayoutButton
        currentLayout={windowLayout}
        icon={<MdViewColumn className="text-base" />}
        label="Columns"
        layout="spread"
        onWindowLayoutChange={onWindowLayoutChange}
      />
      <LayoutButton
        currentLayout={windowLayout}
        icon={<MdGridView className="text-base" />}
        label="Matrix"
        layout="matrix"
        onWindowLayoutChange={onWindowLayoutChange}
      />
    </div>
  </div>
);

export default RouteLayoutControls;
