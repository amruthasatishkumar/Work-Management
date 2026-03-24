import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, ExternalLink, Building2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { PageHeader, Button, Badge, Spinner, EmptyState } from '../components/ui';
import { Modal, FormField, Input, Select, Textarea } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Account, Territory } from '../lib/types';

function AccountForm({ initial, territories, onSubmit, onClose, loading }: {
  initial?: Partial<Account>;
  territories: Territory[];
  onSubmit: (d: any) => void;
  onClose: () => void;
  loading?: boolean;
}) {
  const [territory_id, setTerritoryId] = useState(String(initial?.territory_id ?? ''));
  const [name, setName] = useState(initial?.name ?? '');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ territory_id: Number(territory_id), name, website: website || null, notes: notes || null }); }}
          className="flex flex-col gap-4">
      <FormField label="Territory" required>
        <Select value={territory_id} onChange={e => setTerritoryId(e.target.value)} required>
          <option value="">Select territory...</option>
          {territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </FormField>
      <FormField label="Company Name" required>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Contoso Ltd" required />
      </FormField>
      <FormField label="Website">
        <Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." type="url" />
      </FormField>
      <FormField label="Notes">
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any context about this account..." />
      </FormField>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={loading || !territory_id}>{initial?.id ? 'Update' : 'Create'}</Button>
      </div>
    </form>
  );
}

export default function Accounts() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const [filterTerritory, setFilterTerritory] = useState(() => searchParams.get('territory') ?? '');

  // Sync filter if URL param changes (e.g. navigating from territories page)
  useEffect(() => {
    const t = searchParams.get('territory');
    if (t) setFilterTerritory(t);
  }, [searchParams]);
  const [search, setSearch] = useState('');

  const { data: territories = [] } = useQuery<Territory[]>({
    queryKey: queryKeys.territories.all,
    queryFn: api.territories.list,
  });

  const territoryId = filterTerritory ? Number(filterTerritory) : undefined;
  const { data = [], isLoading } = useQuery<Account[]>({
    queryKey: queryKeys.accounts.all(territoryId),
    queryFn: () => api.accounts.list(territoryId),
  });

  const filtered = data.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase())
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['accounts'] });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard });
  };

  const create = useMutation({ mutationFn: api.accounts.create, onSuccess: () => { invalidate(); setShowForm(false); } });
  const update = useMutation({ mutationFn: ({ id, data }: any) => api.accounts.update(id, data), onSuccess: () => { invalidate(); setEditing(null); } });
  const del = useMutation({ mutationFn: api.accounts.delete, onSuccess: () => { invalidate(); setDeleting(null); } });

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="All companies across your territories"
        action={<Button onClick={() => setShowForm(true)}><Plus size={14} /> Add Account</Button>}
      />

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search accounts..." className="max-w-xs" />
        <Select value={filterTerritory} onChange={e => setFilterTerritory(e.target.value)} className="max-w-xs">
          <option value="">All territories</option>
          {territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </div>

      {isLoading && <Spinner />}
      {!isLoading && filtered.length === 0 && (
        <EmptyState title="No accounts found" description="Add your first account or adjust filters." />
      )}

      <div className="p-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((a) => (
          <div key={a.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 size={16} className="text-blue-500 shrink-0" />
                <Link to={`/accounts/${a.id}`} className="text-sm font-semibold text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 truncate">{a.name}</Link>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {a.website && <a href={a.website} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-600 p-1"><ExternalLink size={13} /></a>}
                <button onClick={() => setEditing(a)} className="text-slate-400 hover:text-blue-600 p-1 cursor-pointer"><Pencil size={13} /></button>
                <button onClick={() => setDeleting(a)} className="text-slate-400 hover:text-red-600 p-1 cursor-pointer"><Trash2 size={13} /></button>
              </div>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{a.territory_name}</p>
            {a.notes && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">{a.notes}</p>}
            <div className="flex items-center gap-2 mt-3">
              <Badge label={`${a.opportunity_count ?? 0} opps`} variant="active" />
              <Badge label={`${a.activity_count ?? 0} activities`} />
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <Modal title="New Account" onClose={() => setShowForm(false)}>
          <AccountForm territories={territories} onSubmit={(d) => create.mutate(d)} onClose={() => setShowForm(false)} loading={create.isPending} />
        </Modal>
      )}
      {editing && (
        <Modal title="Edit Account" onClose={() => setEditing(null)}>
          <AccountForm initial={editing} territories={territories} onSubmit={(d) => update.mutate({ id: editing.id, data: d })} onClose={() => setEditing(null)} loading={update.isPending} />
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog
          message={`Delete account "${deleting.name}"? All opportunities and activities will be deleted too.`}
          onConfirm={() => del.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
          loading={del.isPending}
        />
      )}
    </div>
  );
}
