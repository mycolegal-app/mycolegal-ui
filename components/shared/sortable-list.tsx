"use client";

import * as React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock } from "lucide-react";
import { cn } from "../../lib/utils";

export interface SortableListProps<TItem> {
  items: TItem[];
  /** Unique & stable key per item, used both as dnd-kit id and React key. */
  itemKey: (item: TItem) => string;
  renderItem: (args: {
    item: TItem;
    isDragging: boolean;
    /** Renders the drag handle inline — render wherever the UI needs it. */
    handle: React.ReactNode;
  }) => React.ReactNode;
  /**
   * Called with the new ordered array after a successful drop. The caller
   * is responsible for persisting; this component only manages the visual
   * order during the interaction.
   */
  onReorder: (newItems: TItem[]) => void;
  /**
   * Mark items as non-reorderable. Locked items keep their visual position
   * (dnd-kit still renders them but their id is ignored as drag source &
   * drop target). The caller must enforce the business rule server-side.
   */
  isItemLocked?: (item: TItem) => boolean;
  /** Extra classes on the list container (ul). */
  className?: string;
}

/**
 * Generic accessible sortable list. Uses @dnd-kit for mouse + keyboard
 * drag (Space to pick, arrows to move, Space again to drop, Escape to
 * cancel). Locked items render a lock icon instead of the grip and
 * cannot be moved nor can other items cross over them (the caller
 * decides the semantics server-side; client just refuses the drop).
 */
export function SortableList<TItem>({
  items,
  itemKey,
  renderItem,
  onReorder,
  isItemLocked,
  className,
}: SortableListProps<TItem>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = items.map(itemKey);
  const locked = new Set(
    isItemLocked ? items.filter(isItemLocked).map(itemKey) : [],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    if (locked.has(String(active.id)) || locked.has(String(over.id))) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className={cn("space-y-1", className)} role="list">
          {items.map((item) => {
            const id = itemKey(item);
            const isLocked = locked.has(id);
            return (
              <SortableRow
                key={id}
                id={id}
                isLocked={isLocked}
                render={(args) => renderItem({ item, ...args })}
              />
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

interface SortableRowProps {
  id: string;
  isLocked: boolean;
  render: (args: { isDragging: boolean; handle: React.ReactNode }) => React.ReactNode;
}

function SortableRow({ id, isLocked, render }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: isLocked,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
  };

  const handle = isLocked ? (
    <span
      aria-hidden
      className="inline-flex h-6 w-6 items-center justify-center text-gray-300"
      title="Elemento bloqueado"
    >
      <Lock className="h-3.5 w-3.5" />
    </span>
  ) : (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label="Reordenar — Espacio para coger, flechas para mover"
      className="inline-flex h-6 w-6 cursor-grab items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan active:cursor-grabbing"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

  return (
    <li ref={setNodeRef} style={style}>
      {render({ isDragging, handle })}
    </li>
  );
}
