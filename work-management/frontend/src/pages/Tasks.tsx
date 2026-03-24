import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable, closestCorners,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { PageHeader, Badge, Spinner } from '../components/ui';
import type { Activity, Account } from '../lib/types';

const BOARD_COLUMNS: { status: Activity['status']; label: string; color: string; darkColor: string }[] = [
  { status: 'In Progress', label: 'In Progress', color: 'bg-blue-50 border-blue-200',     darkColor: 'dark:bg-blue-900/30 dark:border-blue-800' },
  { status: 'Completed',   label: 'Completed',   color: 'bg-emerald-50 border-emerald-200', darkColor: 'dark:bg-emerald-900/30 dark:border-emerald-800' },
  { status: 'Blocked',     label: 'Blocked',     color: 'bg-red-50 border-red-200',        darkColor: 'dark:bg-red-900/30 dark:border-red-800' },
];

// ─── Activity card on the board ────────────────────────────────────────────────

function BoardActivityCard({ act, onMoveToToDo, isDragging }: { act: Activity; onMoveToToDo: () => void; isDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: `board-act-${act.id}`,
    data: { type: 'board-activity', activityId: act.id },
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 p-3 shadow-sm group">
      <div className="flex items-start gap-2">
        <button {...attributes} {...listeners} className="text-slate-300 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-300 mt-0.5 cursor-grab active:cursor-grabbing shrink-0">
          <GripVertical size={14} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge label={act.type} variant="default" />
            <span className="text-xs text-slate-400 dark:text-slate-500">{act.date}</span>
          </div>
          <Link to={`/activities/${act.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-200 mt-1 leading-snug line-clamp-2 hover:text-blue-600 dark:hover:text-blue-400 hover:underline">{act.purpose}</Link>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{act.account_name}</p>
        </div>
        <button onClick={onMoveToToDo}
                title="Move back to To Do"
                className="text-slate-300 hover:text-red-500 shrink-0 cursor-pointer mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Sidebar activity card (draggable) ────────────────────────────────────────

function SidebarActivityCard({ act }: { act: Activity }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sidebar-act-${act.id}`,
    data: { type: 'sidebar-activity', activityId: act.id },
  });

  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
         style={{ opacity: isDragging ? 0.4 : 1 }}
         className="bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 p-3 cursor-grab active:cursor-grabbing hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 dark:hover:border-blue-600 transition-colors select-none">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <Badge label={act.type} variant="default" />
        <span className="text-xs text-slate-400 dark:text-slate-500">{act.date}</span>
      </div>
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-snug line-clamp-2">{act.purpose}</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{act.account_name}</p>
    </div>
  );
}

// ─── Column ────────────────────────────────────────────────────────────────────

function Column({ column, boardActivities, onMoveToToDo, activeId }: {
  column: typeof BOARD_COLUMNS[0];
  boardActivities: Activity[];
  onMoveToToDo: (id: number) => void;
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });

  return (
    <div ref={setNodeRef}
         className={`flex flex-col rounded-xl border ${column.color} ${column.darkColor} min-h-64 transition-all ${isOver ? 'ring-2 ring-blue-400 ring-offset-1' : ''} w-full min-w-0`}>
      <div className="flex items-center px-4 py-3 border-b border-inherit">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{column.label}</span>
        <span className="ml-2 text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-full px-1.5 py-0.5 text-slate-500 dark:text-slate-400 font-medium">
          {boardActivities.length}
        </span>
      </div>
      <SortableContext items={boardActivities.map(a => `board-act-${a.id}`)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 p-3 flex-1">
          {boardActivities.map(act => (
            <BoardActivityCard
              key={act.id}
              act={act}
              onMoveToToDo={() => onMoveToToDo(act.id)}
              isDragging={activeId === `board-act-${act.id}`}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Tasks() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'sidebar-activity' | 'board-activity' | null>(null);
  const [sidebarAccount, setSidebarAccount] = useState('');

  const { data: activities = [], isLoading } = useQuery<Activity[]>({
    queryKey: queryKeys.activities.all(),
    queryFn: () => api.activities.list(),
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: queryKeys.accounts.all(),
    queryFn: () => api.accounts.list(),
  });

  const patchStatus = useMutation({
    mutationFn: ({ id, status, position }: { id: number; status: Activity['status']; position: number }) =>
      api.activities.patchKanban(id, status, position),
    onMutate: async ({ id, status, position }) => {
      await qc.cancelQueries({ queryKey: ['activities'] });
      const snapshot = qc.getQueriesData<Activity[]>({ queryKey: ['activities'] });
      qc.setQueriesData<Activity[]>({ queryKey: ['activities'] }, old =>
        old?.map(a => a.id === id ? { ...a, status, position } : a)
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx: any) => {
      ctx?.snapshot?.forEach(([key, data]: any) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['activities'] }),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const boardActivitiesByStatus = (status: Activity['status']) =>
    activities.filter(a => a.status === status).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const sidebarActivities = activities.filter(a => a.status === 'To Do' &&
    (!sidebarAccount || a.account_id === Number(sidebarAccount)));

  function getTargetStatus(overId: string): Activity['status'] | null {
    const col = BOARD_COLUMNS.find(c => c.status === overId);
    if (col) return col.status;
    if (overId.startsWith('board-act-')) {
      const actId = Number(overId.replace('board-act-', ''));
      const act = activities.find(a => a.id === actId);
      return (act?.status && act.status !== 'To Do') ? act.status : null;
    }
    return null;
  }

  function handleDragStart({ active }: DragStartEvent) {
    const data = active.data.current as any;
    setActiveId(String(active.id));
    setActiveType(data?.type === 'board-activity' ? 'board-activity' : 'sidebar-activity');
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    setActiveType(null);
    if (!over) return;

    const activeData = active.data.current as any;

    if (activeData.type === 'sidebar-activity') {
      // Dragged from To Do sidebar onto a board column or board card
      const targetStatus = getTargetStatus(String(over.id));
      if (!targetStatus) return;
      const colItems = boardActivitiesByStatus(targetStatus);
      const overActId = String(over.id).startsWith('board-act-')
        ? Number(String(over.id).replace('board-act-', '')) : null;
      const overIndex = overActId != null ? colItems.findIndex(a => a.id === overActId) : -1;
      const newPosition = overIndex >= 0 ? overIndex : colItems.length;
      patchStatus.mutate({ id: activeData.activityId, status: targetStatus, position: newPosition });
    } else {
      // Dragged from one board card to another position (same or different column)
      const actId = activeData.activityId as number;
      const draggedAct = activities.find(a => a.id === actId);
      if (!draggedAct) return;

      const targetStatus = getTargetStatus(String(over.id)) ?? draggedAct.status;
      const colItems = boardActivitiesByStatus(targetStatus);
      const overActId = String(over.id).startsWith('board-act-')
        ? Number(String(over.id).replace('board-act-', '')) : null;

      if (draggedAct.status === targetStatus && overActId != null) {
        // Same column reorder
        const oldIndex = colItems.findIndex(a => a.id === actId);
        const newIndex = colItems.findIndex(a => a.id === overActId);
        if (oldIndex === newIndex) return;
        const reordered = arrayMove(colItems, oldIndex, newIndex);
        reordered.forEach((a, i) => {
          if ((a.position ?? 0) !== i) {
            patchStatus.mutate({ id: a.id, status: targetStatus, position: i });
          }
        });
      } else {
        // Cross-column move
        const itemsWithoutDragged = colItems.filter(a => a.id !== actId);
        const overIndex = overActId != null ? itemsWithoutDragged.findIndex(a => a.id === overActId) : -1;
        const newPosition = overIndex >= 0 ? overIndex : itemsWithoutDragged.length;
        patchStatus.mutate({ id: actId, status: targetStatus, position: newPosition });
      }
    }
  }

  const activeSidebarAct = activeType === 'sidebar-activity'
    ? activities.find(a => `sidebar-act-${a.id}` === activeId) : null;
  const activeBoardAct = activeType === 'board-activity'
    ? activities.find(a => `board-act-${a.id}` === activeId) : null;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Activity Management"
        subtitle="Drag activities from the sidebar onto columns · Click × to move back to To Do"
        action={null}
      />

      {isLoading ? <Spinner /> : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex flex-1 overflow-hidden">
            {/* Kanban board */}
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="grid grid-cols-3 gap-4 h-full">
                {BOARD_COLUMNS.map(col => (
                  <Column
                    key={col.status}
                    column={col}
                    boardActivities={boardActivitiesByStatus(col.status)}
                    onMoveToToDo={id => patchStatus.mutate({ id, status: 'To Do', position: boardActivitiesByStatus('To Do').length })}
                    activeId={activeId}
                  />
                ))}
              </div>
            </div>

            {/* To Do sidebar */}
            <aside className="w-56 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden shrink-0">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">To Do</h3>
                <select
                  value={sidebarAccount}
                  onChange={e => setSidebarAccount(e.target.value)}
                  className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1.5 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All accounts</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {sidebarActivities.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
                    {activities.filter(a => a.status === 'To Do').length === 0
                      ? 'No activities with To Do status'
                      : 'No activities match the filter'}
                  </p>
                )}
                {sidebarActivities.map(act => (
                  <SidebarActivityCard key={act.id} act={act} />
                ))}
              </div>
              <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700">
                <p className="text-xs text-slate-400 dark:text-slate-500">Drag an activity onto a column to update its status</p>
              </div>
            </aside>
          </div>

          <DragOverlay>
            {(activeBoardAct || activeSidebarAct) && (() => {
              const act = activeBoardAct ?? activeSidebarAct!;
              return (
                <div className="bg-violet-50 rounded-lg border border-violet-300 p-3 shadow-xl w-64 rotate-1 opacity-95">
                  <Badge label={act.type} variant="default" />
                  <p className="text-sm font-medium text-slate-700 mt-1">{act.purpose}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{act.account_name}</p>
                </div>
              );
            })()}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
