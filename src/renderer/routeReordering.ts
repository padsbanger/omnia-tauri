import { useState, type DragEvent, type KeyboardEvent } from "react";
import { reorder } from "./actions";
import { message } from "./native";
import { useAppStore } from "./store";

type DropTarget = { id: string; after: boolean };

export function insertRoute(
  ids: string[],
  moving: string,
  target: DropTarget,
): string[] {
  if (moving === target.id || !ids.includes(moving) || !ids.includes(target.id))
    return ids;
  const next = ids.filter((id) => id !== moving);
  next.splice(next.indexOf(target.id) + Number(target.after), 0, moving);
  return next;
}

export function useRouteReordering(ids: string[]) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const busy = useAppStore((state) => state.isReordering);
  const clear = () => {
    setDragged(null);
    setTarget(null);
  };
  const commit = (next: string[]) => {
    if (next.every((id, i) => id === ids[i])) return;
    void reorder(next).catch((error) =>
      useAppStore.getState().setError(message(error)),
    );
  };
  const position = (event: DragEvent<HTMLElement>, id: string): DropTarget => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { id, after: event.clientY >= rect.top + rect.height / 2 };
  };
  const start = (event: DragEvent<HTMLElement>, id: string) => {
    if (busy) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-omnia-route", id);
    setDragged(id);
  };
  const over = (event: DragEvent<HTMLElement>, id: string) => {
    if (!dragged) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setTarget(position(event, id));
  };
  const drop = (event: DragEvent<HTMLElement>, id: string) => {
    if (!dragged) return;
    event.preventDefault();
    commit(insertRoute(ids, dragged, position(event, id)));
    clear();
  };
  const keyboard = (event: KeyboardEvent<HTMLElement>, id: string) => {
    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key) || busy)
      return;
    event.preventDefault();
    const after = event.key === "ArrowDown";
    const neighbor = ids[ids.indexOf(id) + (after ? 1 : -1)];
    if (neighbor) commit(insertRoute(ids, id, { id: neighbor, after }));
  };
  return {
    dragged,
    busy,
    start,
    clear,
    keyboard,
    dropProps: (id: string) => ({
      onDragOver: (event: DragEvent<HTMLDivElement>) => over(event, id),
      onDrop: (event: DragEvent<HTMLDivElement>) => drop(event, id),
      "data-drop-position":
        target?.id === id && dragged !== id
          ? target.after
            ? "after"
            : "before"
          : undefined,
    }),
  };
}
