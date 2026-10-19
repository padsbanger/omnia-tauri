import { routeAction } from "../actions";
import { Button, Description, Label, Tooltip } from "@heroui/react";
import {
  MdAdd,
  MdDeleteOutline,
  MdDeleteSweep,
  MdEdit,
  MdOutlineBedtime,
  MdPlayArrow,
  MdRefresh,
  MdRemove,
} from "react-icons/md";
import { Route } from "../../common/routes";
import { WindowIcon } from "./WindowIcon";

type ManageRouteCardProps = {
  route: Route;
  isEditing: boolean;
  editingLabel: string;
  isSaving: boolean;
  labelError: string | null;
  isOffline: boolean;
  isActive: boolean;
  zoomLevel: number;
  onBeginEditing: (route: Route) => void;
  onCancelEditing: () => void;
  onChangeLabel: (label: string) => void;
  onCommitLabel: (route: Route) => void;
  onDelete: (routeId: string) => void;
  onToggleHibernation: (routeId: string) => void;
  onZoomRoute: (route: Route, direction: "in" | "out") => void;
};

const ROUTE_ACTION_BUTTON_CLASS =
  "h-8 min-h-8 w-8 min-w-8 rounded-lg border border-slate-200/80 bg-white p-0 text-slate-500 shadow-none transition-all hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800";
const ZOOM_BUTTON_CLASS =
  "h-7 min-h-7 w-7 min-w-7 rounded-md bg-transparent p-0 text-slate-500 shadow-none hover:bg-white hover:text-slate-900";

const getZoomPercentage = (zoomLevel: number) =>
  `${Math.round(100 * 1.2 ** zoomLevel)}%`;

const RouteStatus = ({ route }: Pick<ManageRouteCardProps, "route">) => {
  if (route.isHibernated) {
    return (
      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
        Hibernated
      </span>
    );
  }
  return null;
};

type ActionButtonProps = {
  children: React.ReactNode;
  className?: string;
  isDisabled?: boolean;
  label: string;
  onClick: () => void;
  tooltip: string;
};

const ActionButton = ({
  children,
  className = ROUTE_ACTION_BUTTON_CLASS,
  isDisabled,
  label,
  onClick,
  tooltip,
}: ActionButtonProps) => (
  <Tooltip>
    <Button
      aria-label={label}
      className={className}
      isDisabled={isDisabled}
      isIconOnly
      onClick={onClick}
      size="sm"
    >
      {children}
    </Button>
    <Tooltip.Content offset={8} placement="top">
      <p>{tooltip}</p>
    </Tooltip.Content>
  </Tooltip>
);

const RouteEditor = ({
  editingLabel,
  isSaving,
  labelError,
  onCancelEditing,
  onChangeLabel,
  onCommitLabel,
  route,
}: Pick<
  ManageRouteCardProps,
  | "editingLabel"
  | "isSaving"
  | "labelError"
  | "onCancelEditing"
  | "onChangeLabel"
  | "onCommitLabel"
  | "route"
>) => (
  <>
    <input
      autoFocus
      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      onChange={(event) => onChangeLabel(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onCancelEditing();
          return;
        }
        if (event.key === "Enter") onCommitLabel(route);
      }}
      value={editingLabel}
    />
    <div className="flex flex-wrap items-center gap-2">
      <Button
        className="bg-blue-600 text-white"
        isDisabled={!editingLabel.trim().length}
        isPending={isSaving}
        onClick={() => onCommitLabel(route)}
        size="sm"
      >
        Save
      </Button>
      <Button
        className="border border-slate-200 bg-white text-slate-700"
        onClick={onCancelEditing}
        size="sm"
      >
        Cancel
      </Button>
      {labelError ? (
        <Description className="text-red-700">{labelError}</Description>
      ) : null}
    </div>
  </>
);

const RouteActions = ({
  isOffline,
  onBeginEditing,
  onDelete,
  onToggleHibernation,
  onZoomRoute,
  route,
  zoomLevel,
}: Pick<
  ManageRouteCardProps,
  | "isOffline"
  | "onBeginEditing"
  | "onDelete"
  | "onToggleHibernation"
  | "onZoomRoute"
  | "route"
  | "zoomLevel"
>) => (
  <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
    <div
      aria-label={`${route.label} zoom`}
      className="flex shrink-0 items-center rounded-lg border border-slate-200/80 bg-slate-100/70 p-0.5"
    >
      <ActionButton
        className={ZOOM_BUTTON_CLASS}
        isDisabled={route.isHibernated}
        label="Zoom out"
        onClick={() => onZoomRoute(route, "out")}
        tooltip="Zoom out for this route."
      >
        <MdRemove className="text-base" />
      </ActionButton>
      <span className="w-9 text-center text-[11px] font-semibold tabular-nums text-slate-500">
        {getZoomPercentage(zoomLevel)}
      </span>
      <ActionButton
        className={ZOOM_BUTTON_CLASS}
        isDisabled={route.isHibernated}
        label="Zoom in"
        onClick={() => onZoomRoute(route, "in")}
        tooltip="Zoom in for this route."
      >
        <MdAdd className="text-base" />
      </ActionButton>
    </div>
    <div className="flex min-w-0 items-center gap-1">
      <ActionButton
        label={route.isHibernated ? "Restore" : "Hibernate"}
        onClick={() => onToggleHibernation(route.id)}
        tooltip={
          route.isHibernated
            ? "Restore this route."
            : "Hibernate this route to free memory."
        }
      >
        {route.isHibernated ? (
          <MdPlayArrow className="text-base" />
        ) : (
          <MdOutlineBedtime className="text-base" />
        )}
      </ActionButton>
      <ActionButton
        isDisabled={route.isHibernated}
        label="Refresh route"
        onClick={() => routeAction(route.id, "refresh").catch(() => {})}
        tooltip="Refresh this route."
      >
        <MdRefresh className="text-base" />
      </ActionButton>
      <ActionButton
        isDisabled={route.isHibernated}
        label="Clear site data"
        onClick={() => routeAction(route.id, "clear_session").catch(() => {})}
        tooltip="Clear site data for this route."
      >
        <MdDeleteSweep className="text-base" />
      </ActionButton>
      <ActionButton
        isDisabled={isOffline}
        label="Rename"
        onClick={() => onBeginEditing(route)}
        tooltip="Rename this route."
      >
        <MdEdit className="text-base" />
      </ActionButton>
      <ActionButton
        className={`${ROUTE_ACTION_BUTTON_CLASS} text-red-500 hover:border-red-200 hover:bg-red-50`}
        isDisabled={isOffline}
        label="Delete route"
        onClick={() => onDelete(route.id)}
        tooltip="Delete this route."
      >
        <MdDeleteOutline className="text-base" />
      </ActionButton>
    </div>
  </div>
);

const ManageRouteCard = (props: ManageRouteCardProps) => (
  <div
    className={`group/card relative flex flex-col gap-2.5 overflow-hidden rounded-2xl border bg-white/90 p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_8px_24px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(15,23,42,0.08)] ${
      props.isActive
        ? "border-blue-200/90 ring-1 ring-blue-100"
        : "border-slate-200/80"
    }`}
  >
    {props.isActive ? (
      <span className="absolute inset-y-4 left-0 w-0.5 rounded-r-full bg-blue-500" />
    ) : null}
    <div className="flex min-w-0 items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900 ring-1 ring-slate-200/70">
        <WindowIcon
          className="text-2xl"
          faviconUrl={props.route.faviconUrl}
          icon={props.route.icon}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {props.isEditing ? (
          <RouteEditor {...props} />
        ) : (
          <>
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <Label className="truncate text-sm font-semibold text-slate-950">
                  {props.route.label}
                </Label>
                {props.isActive ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500 ring-2 ring-blue-100" />
                ) : null}
              </div>
              <RouteStatus route={props.route} />
            </div>
            <Description className="truncate text-[11px] text-slate-400">
              {props.route.loadURL}
            </Description>
          </>
        )}
      </div>
    </div>
    {props.isEditing ? null : <RouteActions {...props} />}
  </div>
);

export default ManageRouteCard;
