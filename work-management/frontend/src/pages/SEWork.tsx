import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, pointerWithin, closestCenter,
  type DragStartEvent, type DragOverEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { PageHeader, Button, Badge, statusVariant, Spinner } from '../components/ui';
import { Modal, FormField, Input, Select } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { SEWorkItem } from '../lib/types';

const SE_COLUMNS: { status: SEWorkItem['status']; label: string; color: string; darkColor: string }[] = [
  { status: 'Not Started', label: 'Not Started',  color: 'bg-slate-100 border-slate-200',    darkColor: 'dark:bg-slate-700/50 dark:border-slate-600' },
  { status: 'In Progress', label: 'In Progress',  color: 'bg-blue-50 border-blue-200',       darkColor: 'dark:bg-blue-900/30 dark:border-blue-800' },
  { status: 'Completed',   label: 'Completed',    color: 'bg-emerald-50 border-emerald-200', darkColor: 'dark:bg-emerald-900/30 dark:border-emerald-800' },
  { status: 'Blocked',     label: 'Blocked',      color: 'bg-red-50 border-red-200',         darkColor: 'dark:bg-red-900/30 dark:border-red-800' },
];

// â”€â”€â”€ Form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SEWorkForm({ initial, defaultStatus, onSubmit, onClose, loading }: {
  initial?: Partial<SEWorkItem>;
  defaultStatus?: SEWorkItem['status'];
  onSubmit: (d: any) => void;
  onClose: () => void;
  loading?: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [due_date, setDueDate] = useState(initial?.due_date ?? '');
  const [completion_date, setCompletionDate] = useState(initial?.completion_date ?? '');
  const [status, setStatus] = useState<SEWorkItem['status']>(initial?.status ?? defaultStatus ?? 'Not Started');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ title, due_date: due_date || null, completion_date: completion_date || null, status });
      }}
      className="flex flex-col gap-4"
    >
      <FormField label="Task Title" required>
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs to be done?" required />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Due Date">
          <Input type="date" value={due_date} onChange={e => setDueDate(e.target.value)} />
        </FormField>
        <FormField label="Completion Date">
          <Input type="date" value={completion_date} onChange={e => setCompletionDate(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Status">
        <Select value={status} onChange={e => setStatus(e.target.value as SEWorkItem['status'])}>
          {SE_COLUMNS.map(c => <option key={c.status}>{c.status}</option>)}
        </Select>
      </FormField>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={loading || !title.trim()}>{initial?.id ? 'Update' : 'Create'}</Button>
      </div>
    </form>
  );
}

// â”€â”€â”€ Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SEWorkCard({ item, onEdit, onDelete, isDragging }: {
  item: SEWorkItem; onEdit: () => void; onDelete: () => void; isDragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const isOverdue = item.due_date && item.status !== 'Completed' && new Date(item.due_date) < new Date();
  const fmt = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div ref={setNodeRef} style={style}
         className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 p-3 shadow-sm group">
      <div className="flex items-start gap-2">
        <button {...attributes} {...listeners}
                className="text-slate-300 hover:text-slate-500 mt-0.5 cursor-grab active:cursor-grabbing shrink-0">
          <GripVertical size={14} />
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug ${item.status === 'Completed' ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>
            {item.title}
          </p>
          <div className="flex flex-col gap-0.5 mt-1.5">
            {item.due_date && (
              <span className={`text-xs font-medium ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>
                Due: {fmt(item.due_date)}{isOverdue ? ' Â· Overdue' : ''}
              </span>
            )}
            {item.completion_date && (
              <span className="text-xs text-emerald-600">
                Done: {fmt(item.completion_date)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={onEdit} className="text-slate-400 hover:text-blue-600 p-1 cursor-pointer"><Pencil size={12} /></button>
          <button onClick={onDelete} className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"><Trash2 size={12} /></button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Column â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SEColumn({ column, items, onAddItem, onEditItem, onDeleteItem, activeId }: {
  column: typeof SE_COLUMNS[0];
  items: SEWorkItem[];
  onAddItem: () => void;
  onEditItem: (i: SEWorkItem) => void;
  onDeleteItem: (i: SEWorkItem) => void;
  activeId: number | null;
}) {
  // Use 'col-' prefix so column droppable IDs never collide with numeric card IDs
  const { setNodeRef, isOver } = useDroppable({ id: `col-${column.status}` });

  return (
    <div ref={setNodeRef}
         className={`flex flex-col rounded-xl border ${column.color} ${column.darkColor} h-full transition-all ${isOver ? 'ring-2 ring-blue-400 ring-offset-1' : ''} w-full min-w-0`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-inherit">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{column.label}</span>
          <span className="text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-full px-1.5 py-0.5 text-slate-500 dark:text-slate-400 font-medium">
            {items.length}
          </span>
        </div>
        <button onClick={onAddItem}
                className="text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer p-1 rounded hover:bg-white/60 dark:hover:bg-slate-700 transition-colors">
          <Plus size={15} />
        </button>
      </div>
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 p-3 flex-1 overflow-y-auto">
          {items.map(item => (
            <SEWorkCard
              key={item.id}
              item={item}
              onEdit={() => onEditItem(item)}
              onDelete={() => onDeleteItem(item)}
              isDragging={activeId === item.id}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// â”€â”€â”€ Main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function SEWork() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState<SEWorkItem['status']>('Not Started');
  const [editing, setEditing] = useState<SEWorkItem | null>(null);
  const [deleting, setDeleting] = useState<SEWorkItem | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [localItems, setLocalItems] = useState<SEWorkItem[]>([]);
  const isDraggingRef = useRef(false);

  const { data = [], isLoading } = useQuery<SEWorkItem[]>({
    queryKey: queryKeys.seWork.all(),
    queryFn: () => api.seWork.list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['se-work'] });

  // Sync from server only when not mid-drag. Use a ref (not activeId state)
  // to avoid the race where setActiveId(null) triggers this effect before
  // the patch mutations complete, snapping the item back to its old column.
  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalItems([...data].sort((a, b) => a.position - b.position));
    }
  }, [data]);

  const create = useMutation({ mutationFn: api.seWork.create, onSuccess: () => { invalidate(); setShowForm(false); } });
  const update = useMutation({ mutationFn: ({ id, data }: any) => api.seWork.update(id, data), onSuccess: () => { invalidate(); setEditing(null); } });
  const del = useMutation({ mutationFn: api.seWork.delete, onSuccess: () => { invalidate(); setDeleting(null); } });
  const patchStatus = useMutation({
    mutationFn: ({ id, status, position }: any) => api.seWork.patchStatus(id, status, position),
    onSettled: () => invalidate(),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const itemsByStatus = (status: SEWorkItem['status']) =>
    localItems.filter(i => i.status === status);

  function handleDragStart({ active }: DragStartEvent) {
    isDraggingRef.current = true;
    setActiveId(active.id as number);
    document.body.classList.add('is-dragging');
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over || active.id === over.id) return;
    const draggedId = active.id as number;
    const overId = String(over.id);

    setLocalItems(prev => {
      const draggedItem = prev.find(i => i.id === draggedId);
      if (!draggedItem) return prev;

      // over.id is either 'col-<Status>' (column droppable) or a numeric card id
      const isOverColumn = overId.startsWith('col-');
      const targetStatus: SEWorkItem['status'] = isOverColumn
        ? (overId.slice(4) as SEWorkItem['status'])
        : (prev.find(i => i.id === Number(overId))?.status ?? draggedItem.status);

      if (draggedItem.status === targetStatus) {
        // Same-column reorder — only meaningful when hovering over a specific card
        if (isOverColumn) return prev;
        const overCardId = Number(overId);
        const overItem = prev.find(i => i.id === overCardId);
        if (!overItem) return prev;
        const colItems = prev.filter(i => i.status === targetStatus);
        const oldIdx = colItems.findIndex(i => i.id === draggedId);
        const newIdx = colItems.findIndex(i => i.id === overCardId);
        if (oldIdx === newIdx) return prev;
        const reordered = arrayMove(colItems, oldIdx, newIdx);
        return [...prev.filter(i => i.status !== targetStatus), ...reordered];
      } else {
        // Cross-column move
        const without = prev.filter(i => i.id !== draggedId);
        const updated = { ...draggedItem, status: targetStatus };
        if (!isOverColumn) {
          const insertIdx = without.findIndex(i => i.id === Number(overId));
          if (insertIdx >= 0) {
            return [...without.slice(0, insertIdx), updated, ...without.slice(insertIdx)];
          }
        }
        return [...without, updated];
      }
    });
  }

  function handleDragEnd({ active }: DragEndEvent) {
    isDraggingRef.current = false;
    setActiveId(null);
    document.body.classList.remove('is-dragging');

    const draggedId = active.id as number;
    const finalItem = localItems.find(i => i.id === draggedId);
    if (!finalItem) { setLocalItems(data); return; }

    const originalItem = data.find(d => d.id === draggedId);
    const statusChanged = originalItem?.status !== finalItem.status;

    // Persist destination column — all positions in new order
    const destColItems = localItems.filter(i => i.status === finalItem.status);
    destColItems.forEach((item, idx) => {
      const orig = data.find(d => d.id === item.id);
      if (!orig || orig.status !== item.status || orig.position !== idx) {
        patchStatus.mutate({ id: item.id, status: item.status, position: idx });
      }
    });

    // If column changed, also re-persist source column positions
    if (statusChanged && originalItem) {
      localItems.filter(i => i.status === originalItem.status).forEach((item, idx) => {
        patchStatus.mutate({ id: item.id, status: item.status, position: idx });
      });
    }
  }

  const activeItem = data.find(i => i.id === activeId);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="SE Work"
        subtitle="SE tasks and follow-ups. Drag cards between columns to update status"
        action={<Button onClick={() => { setDefaultStatus('Not Started'); setShowForm(true); }}><Plus size={14} /> Add Task</Button>}
      />

      {isLoading ? <Spinner /> : (
          <DndContext
            sensors={sensors}
            collisionDetection={(args) => { const r = pointerWithin(args); return r.length ? r : closestCenter(args); }}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
          <div className="p-6 flex-1 overflow-hidden flex flex-col">
            <div className="grid grid-cols-4 gap-4 flex-1 min-h-0">
              {SE_COLUMNS.map(col => (
                <SEColumn
                  key={col.status}
                  column={col}
                  items={itemsByStatus(col.status)}
                  onAddItem={() => { setDefaultStatus(col.status); setShowForm(true); }}
                  onEditItem={setEditing}
                  onDeleteItem={setDeleting}
                  activeId={activeId}
                />
              ))}
            </div>
          </div>

          <DragOverlay>
            {activeItem && (
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-blue-300 dark:border-blue-600 p-3 shadow-xl w-60 rotate-1">
                <p className={`text-sm font-medium ${activeItem.status === 'Completed' ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>
                  {activeItem.title}
                </p>
                {activeItem.due_date && (
                  <p className="text-xs text-slate-400 mt-1">Due: {activeItem.due_date}</p>
                )}
                <div className="mt-1.5">
                  <Badge label={activeItem.status} variant={statusVariant(activeItem.status)} />
                </div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {showForm && (
        <Modal title="New SE Work Task" onClose={() => setShowForm(false)}>
          <SEWorkForm
            defaultStatus={defaultStatus}
            onSubmit={d => create.mutate(d)}
            onClose={() => setShowForm(false)}
            loading={create.isPending}
          />
        </Modal>
      )}
      {editing && (
        <Modal title="Edit Task" onClose={() => setEditing(null)}>
          <SEWorkForm
            initial={editing}
            onSubmit={d => update.mutate({ id: editing.id, data: d })}
            onClose={() => setEditing(null)}
            loading={update.isPending}
          />
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog
          message={`Delete "${deleting.title}"?`}
          onConfirm={() => del.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
          loading={del.isPending}
        />
      )}
    </div>
  );
}

