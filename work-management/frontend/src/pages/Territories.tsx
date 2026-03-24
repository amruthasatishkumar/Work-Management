import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Map, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { PageHeader, Button, Badge, Spinner, EmptyState } from '../components/ui';
import { Modal, FormField, Input, Textarea } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Territory } from '../lib/types';

function TerritoryForm({ initial, onSubmit, onClose, loading }: {
  initial?: Partial<Territory>;
  onSubmit: (d: any) => void;
  onClose: () => void;
  loading?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ name, description }); }}
          className="flex flex-col gap-4">
      <FormField label="Territory Name" required>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. West Coast" required />
      </FormField>
      <FormField label="Description">
        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description..." />
      </FormField>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={loading}>{initial?.id ? 'Update' : 'Create'}</Button>
      </div>
    </form>
  );
}

export default function Territories() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Territory | null>(null);
  const [deleting, setDeleting] = useState<Territory | null>(null);

  const { data = [], isLoading } = useQuery<Territory[]>({
    queryKey: queryKeys.territories.all,
    queryFn: api.territories.list,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.territories.all });

  const create = useMutation({ mutationFn: api.territories.create, onSuccess: () => { invalidate(); setShowForm(false); } });
  const update = useMutation({ mutationFn: ({ id, data }: any) => api.territories.update(id, data), onSuccess: () => { invalidate(); setEditing(null); } });
  const del = useMutation({ mutationFn: api.territories.delete, onSuccess: () => { invalidate(); setDeleting(null); } });

  return (
    <div>
      <PageHeader
        title="Territories"
        subtitle="Your two sales territories"
        action={<Button onClick={() => setShowForm(true)}><Plus size={14} /> Add Territory</Button>}
      />

      {isLoading && <Spinner />}

      {!isLoading && data.length === 0 && (
        <EmptyState title="No territories yet" description="Add your first territory to get started." />
      )}

      <div className="p-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((t) => (
          <div key={t.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Map size={18} className="text-blue-500 shrink-0" />
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t.name}</h3>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setEditing(t)} className="text-slate-400 hover:text-blue-600 p-1 cursor-pointer"><Pencil size={14} /></button>
                <button onClick={() => setDeleting(t)} className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"><Trash2 size={14} /></button>
              </div>
            </div>
            {t.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{t.description}</p>}
            <div className="flex items-center justify-between mt-3">
              <Badge label={`${t.account_count ?? 0} accounts`} />
              <Link
                to={`/accounts?territory=${t.id}`}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                View accounts <ChevronRight size={13} />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal title="New Territory" onClose={() => setShowForm(false)}>
          <TerritoryForm onSubmit={(d) => create.mutate(d)} onClose={() => setShowForm(false)} loading={create.isPending} />
        </Modal>
      )}

      {editing && (
        <Modal title="Edit Territory" onClose={() => setEditing(null)}>
          <TerritoryForm initial={editing} onSubmit={(d) => update.mutate({ id: editing.id, data: d })} onClose={() => setEditing(null)} loading={update.isPending} />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          message={`Delete territory "${deleting.name}"? This will also delete all associated accounts, opportunities, and activities.`}
          onConfirm={() => del.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
          loading={del.isPending}
        />
      )}
    </div>
  );
}
