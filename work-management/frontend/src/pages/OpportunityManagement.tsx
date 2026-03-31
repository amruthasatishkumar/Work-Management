import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable, closestCenter,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { PageHeader, Badge, statusVariant, Spinner } from '../components/ui';
import type { Opportunity, Account } from '../lib/types';

type MgmtStatus = 'Unassigned' | 'Targeted' | 'In Progress' | 'Committed';

const BOARD_COLUMNS: { status: MgmtStatus; label: string; color: string; darkColor: string }[] = [
  { status: 'Targeted',    label: 'Targeted',    color: 'bg-blue-50 border-blue-200',       darkColor: 'dark:bg-blue-900/30 dark:border-blue-800' },
  { status: 'In Progress', label: 'In Progress', color: 'bg-amber-50 border-amber-200',     darkColor: 'dark:bg-amber-900/30 dark:border-amber-800' },
  { status: 'Committed',   label: 'Committed',   color: 'bg-emerald-50 border-emerald-200', darkColor: 'dark:bg-emerald-900/30 dark:border-emerald-800' },
];

// ─── Board card ────────────────────────────────────────────────────────────────

function BoardOppCard({ opp, onMoveToUnassigned, isDragging }: {
  opp: Opportunity; onMoveToUnassigned: () => void; isDragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: `board-opp-${opp.id}`,
    data: { type: 'board-opp', oppId: opp.id },
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 p-3 shadow-sm group">
      <div className="flex items-start gap-2">
        <button
          {...attributes} {...listeners}
          className="text-slate-300 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-300 mt-0.5 cursor-grab active:cursor-grabbing shrink-0"
        >
          <GripVertical size={14} />
        </button>
        <div className="flex-1 min-w-0">
          <Badge label={opp.status} variant={statusVariant(opp.status)} />
          <Link
            to={`/opportunities/${opp.id}`}
            className="block text-sm font-medium text-slate-700 dark:text-slate-200 mt-1 leading-snug line-clamp-2 hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
          >
            {opp.title}
          </Link>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{opp.account_name}</p>
        </div>
        <button
          onClick={onMoveToUnassigned}
          title="Move back to Unassigned"
          className="text-slate-300 hover:text-red-500 shrink-0 cursor-pointer mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Sidebar card (draggable) ──────────────────────────────────────────────────

function SidebarOppCard({ opp }: { opp: Opportunity }) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: `sidebar-opp-${opp.id}`,
    data: { type: 'sidebar-opp', oppId: opp.id },
  });

  return (
    <div
      ref={setNodeRef} {...attributes} {...listeners}
      style={{
        opacity: isDragging ? 0.4 : 1,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      className="bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 p-3 cursor-grab active:cursor-grabbing hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 dark:hover:border-blue-600 transition-colors select-none"
    >
      <Badge label={opp.status} variant={statusVariant(opp.status)} />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mt-1 leading-snug line-clamp-2">{opp.title}</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{opp.account_name}</p>
    </div>
  );
}

// ─── Column ────────────────────────────────────────────────────────────────────

function Column({ column, boardOpps, onMoveToUnassigned, activeId }: {
  column: typeof BOARD_COLUMNS[0];
  boardOpps: Opportunity[];
  onMoveToUnassigned: (id: number) => void;
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border ${column.color} ${column.darkColor} min-h-64 transition-all ${isOver ? 'ring-2 ring-blue-400 ring-offset-1' : ''} w-full min-w-0`}
    >
      <div className="flex items-center px-4 py-3 border-b border-inherit">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{column.label}</span>
        <span className="ml-2 text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-full px-1.5 py-0.5 text-slate-500 dark:text-slate-400 font-medium">
          {boardOpps.length}
        </span>
      </div>
      <SortableContext items={boardOpps.map(o => `board-opp-${o.id}`)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 p-3 flex-1">
          {boardOpps.map(opp => (
            <BoardOppCard
              key={opp.id}
              opp={opp}
              onMoveToUnassigned={() => onMoveToUnassigned(opp.id)}
              isDragging={activeId === `board-opp-${opp.id}`}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function OpportunityManagement() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'sidebar-opp' | 'board-opp' | null>(null);
  const [sidebarAccount, setSidebarAccount] = useState('');

  const { data: opportunities = [], isLoading } = useQuery<Opportunity[]>({
    queryKey: queryKeys.opportunities.all(),
    queryFn: () => api.opportunities.list(),
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: queryKeys.accounts.all(),
    queryFn: () => api.accounts.list(),
  });

  const patchMgmt = useMutation({
    mutationFn: ({ id, mgmt_status, mgmt_position }: { id: number; mgmt_status: string; mgmt_position: number }) =>
      api.opportunities.patchMgmtStatus(id, mgmt_status, mgmt_position),
    onMutate: async ({ id, mgmt_status, mgmt_position }) => {
      await qc.cancelQueries({ queryKey: ['opportunities'] });
      const snapshot = qc.getQueriesData<Opportunity[]>({ queryKey: ['opportunities'] });
      qc.setQueriesData<Opportunity[]>({ queryKey: ['opportunities'] }, old =>
        old?.map(o => o.id === id ? { ...o, mgmt_status: mgmt_status as MgmtStatus, mgmt_position } : o)
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx: any) => {
      ctx?.snapshot?.forEach(([key, data]: any) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['opportunities'] }),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const getMgmt = (o: Opportunity): MgmtStatus => (o.mgmt_status ?? 'Unassigned') as MgmtStatus;

  const boardOppsByStatus = (status: MgmtStatus) =>
    opportunities.filter(o => getMgmt(o) === status)
                 .sort((a, b) => (a.mgmt_position ?? 0) - (b.mgmt_position ?? 0));

  const sidebarOpps = opportunities.filter(o =>
    getMgmt(o) === 'Unassigned' &&
    (!sidebarAccount || o.account_id === Number(sidebarAccount))
  );

  function getTargetStatus(overId: string): MgmtStatus | null {
    const col = BOARD_COLUMNS.find(c => c.status === overId);
    if (col) return col.status;
    if (overId.startsWith('board-opp-')) {
      const oppId = Number(overId.replace('board-opp-', ''));
      const opp = opportunities.find(o => o.id === oppId);
      const s = getMgmt(opp!);
      return s !== 'Unassigned' ? s : null;
    }
    return null;
  }

  function handleDragStart({ active }: DragStartEvent) {
    const data = active.data.current as any;
    setActiveId(String(active.id));
    setActiveType(data?.type === 'board-opp' ? 'board-opp' : 'sidebar-opp');
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    setActiveType(null);
    if (!over) return;

    const activeData = active.data.current as any;

    if (activeData.type === 'sidebar-opp') {
      const targetStatus = getTargetStatus(String(over.id));
      if (!targetStatus) return;
      const colItems = boardOppsByStatus(targetStatus);
      const overOppId = String(over.id).startsWith('board-opp-')
        ? Number(String(over.id).replace('board-opp-', '')) : null;
      const overIndex = overOppId != null ? colItems.findIndex(o => o.id === overOppId) : -1;
      const newPosition = overIndex >= 0 ? overIndex : colItems.length;
      patchMgmt.mutate({ id: activeData.oppId, mgmt_status: targetStatus, mgmt_position: newPosition });
    } else {
      const oppId = activeData.oppId as number;
      const draggedOpp = opportunities.find(o => o.id === oppId);
      if (!draggedOpp) return;

      const targetStatus = getTargetStatus(String(over.id)) ?? getMgmt(draggedOpp);
      if (targetStatus === 'Unassigned') return;

      const colItems = boardOppsByStatus(targetStatus);
      const overOppId = String(over.id).startsWith('board-opp-')
        ? Number(String(over.id).replace('board-opp-', '')) : null;

      if (getMgmt(draggedOpp) === targetStatus && overOppId != null) {
        const oldIndex = colItems.findIndex(o => o.id === oppId);
        const newIndex = colItems.findIndex(o => o.id === overOppId);
        if (oldIndex === newIndex) return;
        const reordered = arrayMove(colItems, oldIndex, newIndex);
        reordered.forEach((o, i) => {
          if ((o.mgmt_position ?? 0) !== i) {
            patchMgmt.mutate({ id: o.id, mgmt_status: targetStatus, mgmt_position: i });
          }
        });
      } else {
        const itemsWithoutDragged = colItems.filter(o => o.id !== oppId);
        const overIndex = overOppId != null ? itemsWithoutDragged.findIndex(o => o.id === overOppId) : -1;
        const newPosition = overIndex >= 0 ? overIndex : itemsWithoutDragged.length;
        patchMgmt.mutate({ id: oppId, mgmt_status: targetStatus, mgmt_position: newPosition });
      }
    }
  }

  const activeSidebarOpp = activeType === 'sidebar-opp'
    ? opportunities.find(o => `sidebar-opp-${o.id}` === activeId) : null;
  const activeBoardOpp = activeType === 'board-opp'
    ? opportunities.find(o => `board-opp-${o.id}` === activeId) : null;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Opportunity Management"
        subtitle="Drag opportunities from the sidebar onto columns · Click × to move back to Unassigned"
        action={null}
      />

      {isLoading ? <Spinner /> : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex flex-1 overflow-hidden">
            {/* Kanban board */}
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="grid grid-cols-3 gap-4 h-full">
                {BOARD_COLUMNS.map(col => (
                  <Column
                    key={col.status}
                    column={col}
                    boardOpps={boardOppsByStatus(col.status)}
                    onMoveToUnassigned={id => patchMgmt.mutate({ id, mgmt_status: 'Unassigned', mgmt_position: 0 })}
                    activeId={activeId}
                  />
                ))}
              </div>
            </div>

            {/* Unassigned sidebar */}
            <aside className="w-56 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden shrink-0">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Unassigned</h3>
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
                {sidebarOpps.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-8">
                    {opportunities.filter(o => getMgmt(o) === 'Unassigned').length === 0
                      ? 'All opportunities are assigned'
                      : 'No opportunities match the filter'}
                  </p>
                )}
                {sidebarOpps.map(opp => (
                  <SidebarOppCard key={opp.id} opp={opp} />
                ))}
              </div>
              <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700">
                <p className="text-xs text-slate-400 dark:text-slate-500">Drag an opportunity onto a column to assign it</p>
              </div>
            </aside>
          </div>

          <DragOverlay>
            {activeSidebarOpp && (
              <div className="bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 p-3 shadow-lg opacity-90 w-52">
                <Badge label={activeSidebarOpp.status} variant={statusVariant(activeSidebarOpp.status)} />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mt-1 line-clamp-2">{activeSidebarOpp.title}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{activeSidebarOpp.account_name}</p>
              </div>
            )}
            {activeBoardOpp && (
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 p-3 shadow-lg opacity-90 w-52">
                <Badge label={activeBoardOpp.status} variant={statusVariant(activeBoardOpp.status)} />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mt-1 line-clamp-2">{activeBoardOpp.title}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{activeBoardOpp.account_name}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
