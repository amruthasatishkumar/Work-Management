import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, ChevronDown, ChevronUp, X, Upload, CheckCircle2, Trash2, UserPlus, UserCheck, UserMinus, Loader } from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { Button } from './ui';
import type { OpportunityComment } from '../lib/types';

const D365_BASE = 'https://microsoftsales.crm.dynamics.com/api/data/v9.2';
const OPPORTUNITY_TEAM_TEMPLATE_ID = 'cc923a9d-7651-e311-9405-00155db3ba1e';

type DealTeamStatus = 'unknown' | 'member' | 'not-member' | 'unavailable';

export function CommentsPanel({
  oppId,
  oppMsxId,
  defaultOpen = false,
}: {
  oppId: number;
  oppMsxId: string | null;
  defaultOpen?: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState('');
  const [pushingId, setPushingId] = useState<number | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Deal team state
  const [dealTeamStatus, setDealTeamStatus] = useState<DealTeamStatus>('unknown');
  const [dealTeamLoading, setDealTeamLoading] = useState(false);
  const [dealTeamError, setDealTeamError] = useState<string | null>(null);
  const cachedUserId = useRef<string | null>(null);

  const { data: comments = [] } = useQuery<OpportunityComment[]>({
    queryKey: queryKeys.opportunityComments.list(oppId),
    queryFn: () => api.opportunityComments.list(oppId),
    // No refetchInterval — comments reload on add/delete via invalidate().
    // Per-card polling was firing 20 simultaneous DB queries every 2 minutes.
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.opportunityComments.list(oppId) });

  const create = useMutation({
    mutationFn: (content: string) => api.opportunityComments.create(oppId, content),
    onSuccess: () => { invalidate(); setText(''); },
  });

  const del = useMutation({
    mutationFn: (commentId: number) => api.opportunityComments.delete(oppId, commentId),
    onSuccess: invalidate,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) create.mutate(text.trim());
  };

  // ── D365 helpers ─────────────────────────────────────────────────────

  async function getD365Headers(): Promise<{ headers: Record<string, string>; userId: string } | null> {
    const tokenData = await api.msx.tokenStatus().catch(() => null);
    if (!tokenData?.valid) return null;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${tokenData.accessToken}`,
      'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    };
    if (!cachedUserId.current) {
      const res = await fetch(`${D365_BASE}/WhoAmI`, { headers });
      if (!res.ok) return null;
      const { UserId } = await res.json();
      cachedUserId.current = UserId.toLowerCase();
    }
    return { headers, userId: cachedUserId.current! };
  }

  // ── Deal Team ─────────────────────────────────────────────────────────

  async function checkDealTeamStatus() {
    if (!oppMsxId) { setDealTeamStatus('not-member'); return; }
    try {
      const ctx = await getD365Headers();
      if (!ctx) { setDealTeamStatus('unavailable'); return; }
      const { headers, userId } = ctx;
      const cleanOppId = oppMsxId.replace(/[{}]/g, '').toLowerCase();
      const cleanUserId = userId.replace(/[{}]/g, '').toLowerCase();

      // Primary: check via teammembership_association (matches Dynamics UI behavior)
      const templateFilter = `teamtemplateid eq ${OPPORTUNITY_TEAM_TEMPLATE_ID} and teamtype eq 1 and _regardingobjectid_value eq ${cleanOppId}`;
      const primaryUrl = `${D365_BASE}/systemusers(${cleanUserId})/teammembership_association?$select=_regardingobjectid_value,teamid&$filter=${encodeURIComponent(templateFilter)}`;
      const primaryRes = await fetch(primaryUrl, { headers });

      if (primaryRes.status === 404) { setDealTeamStatus('unavailable'); return; }

      if (primaryRes.ok) {
        const primaryJson = await primaryRes.json();
        setDealTeamStatus(primaryJson.value?.length > 0 ? 'member' : 'not-member');
        return;
      }

      // Fallback: msp_dealteams with statecode filter
      const fallbackFilter = `_msp_dealteamuserid_value eq '${cleanUserId}' and _msp_parentopportunityid_value eq '${cleanOppId}' and statecode eq 0`;
      const fallbackUrl = `${D365_BASE}/msp_dealteams?$filter=${encodeURIComponent(fallbackFilter)}&$select=_msp_parentopportunityid_value`;
      const fallbackRes = await fetch(fallbackUrl, { headers });
      if (!fallbackRes.ok) { setDealTeamStatus('not-member'); return; }
      const fallbackJson = await fallbackRes.json();
      setDealTeamStatus(fallbackJson.value?.length > 0 ? 'member' : 'not-member');
    } catch {
      setDealTeamStatus('not-member');
    }
  }

  useEffect(() => {
    if (dealTeamStatus === 'unknown') {
      checkDealTeamStatus();
    }
  }, [oppMsxId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDealTeamToggle() {
    if (!oppMsxId) return;
    setDealTeamLoading(true);
    setDealTeamError(null);
    try {
      const ctx = await getD365Headers();
      if (!ctx) throw new Error('No valid MSX token. Run \'az login\' to sign in.');
      const { headers, userId } = ctx;
      const cleanOppId = oppMsxId.replace(/[{}]/g, '');
      const action = isMember
        ? 'Microsoft.Dynamics.CRM.RemoveUserFromRecordTeam'
        : 'Microsoft.Dynamics.CRM.AddUserToRecordTeam';
      const res = await fetch(`${D365_BASE}/systemusers(${userId})/${action}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          Record: {
            '@odata.type': 'Microsoft.Dynamics.CRM.opportunity',
            opportunityid: cleanOppId,
          },
          TeamTemplate: {
            '@odata.type': 'Microsoft.Dynamics.CRM.teamtemplate',
            teamtemplateid: OPPORTUNITY_TEAM_TEMPLATE_ID,
          },
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `HTTP ${res.status}`);
      }
      setDealTeamStatus(isMember ? 'not-member' : 'member');
    } catch (err: any) {
      setDealTeamError(err.message);
    } finally {
      setDealTeamLoading(false);
    }
  }

  // ── Push comment to MSX ───────────────────────────────────────────────

  async function deleteFromMsx(c: OpportunityComment) {
    if (!c.msx_id || !oppMsxId) return;
    setPushingId(c.id);
    setPushError(null);
    try {
      const ctx = await getD365Headers();
      if (!ctx) throw new Error('No valid MSX token. Sign in first with: az login');
      const { headers, userId } = ctx;

      // The msx_id format is `{USERID}:modifiedOn` — extract the comment author
      const [commentUserId] = c.msx_id.split(':');
      // Normalize: strip curly braces and lowercase for comparison
      const normalizedCommentUserId = commentUserId.replace(/[{}]/g, '').toLowerCase();
      const normalizedCurrentUserId = userId.replace(/[{}]/g, '').toLowerCase();

      if (normalizedCommentUserId !== normalizedCurrentUserId) {
        throw new Error('You can only delete comments you created in MSX.');
      }

      let currentComments: any[] = [];
      const commentsRes = await fetch(
        `${D365_BASE}/opportunities(${oppMsxId})/msp_forecastcommentsjsonfield`,
        { headers }
      );
      if (commentsRes.ok) {
        const commentsJson = await commentsRes.json();
        currentComments = JSON.parse(commentsJson.value ?? '[]');
      }

      const [existingUserId, ...rest] = c.msx_id.split(':');
      const existingModifiedOn = rest.join(':');
      const filtered = currentComments.filter(
        (x: any) => !(x.userId === existingUserId && x.modifiedOn === existingModifiedOn)
      );

      const patchRes = await fetch(`${D365_BASE}/opportunities(${oppMsxId})`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ msp_forecastcommentsjsonfield: JSON.stringify(filtered) }),
      });
      if (!patchRes.ok) {
        const e = await patchRes.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `HTTP ${patchRes.status}`);
      }

      await api.opportunityComments.saveMsxId(oppId, c.id, null);
      invalidate();
    } catch (err: any) {
      setPushError(err.message);
    } finally {
      setPushingId(null);
    }
  }

  async function pushComment(c: OpportunityComment) {
    setPushError(null);
    setPushingId(c.id);
    try {
      const ctx = await getD365Headers();
      if (!ctx) throw new Error('No valid MSX token. Sign in first with: az login');
      if (!oppMsxId) throw new Error('This opportunity has not been synced to MSX yet.');
      const { headers, userId } = ctx;
      const userIdFormatted = `{${userId.toUpperCase()}}`;

      let currentComments: any[] = [];
      const commentsRes = await fetch(
        `${D365_BASE}/opportunities(${oppMsxId})/msp_forecastcommentsjsonfield`,
        { headers }
      );
      if (commentsRes.ok) {
        const commentsJson = await commentsRes.json();
        currentComments = JSON.parse(commentsJson.value ?? '[]');
      }

      const now = new Date().toLocaleString('en-US');
      const newEntry = { userId: userIdFormatted, modifiedOn: now, comment: c.content };

      if (c.msx_id) {
        const [existingUserId, ...rest] = c.msx_id.split(':');
        const existingModifiedOn = rest.join(':');
        const idx = currentComments.findIndex(
          (x: any) => x.userId === existingUserId && x.modifiedOn === existingModifiedOn
        );
        if (idx >= 0) {
          currentComments[idx] = newEntry;
        } else {
          currentComments.push(newEntry);
          await api.opportunityComments.saveMsxId(oppId, c.id, null);
        }
      } else {
        currentComments.push(newEntry);
      }

      const patchRes = await fetch(`${D365_BASE}/opportunities(${oppMsxId})`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ msp_forecastcommentsjsonfield: JSON.stringify(currentComments) }),
      });
      if (!patchRes.ok) {
        const e = await patchRes.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `HTTP ${patchRes.status}`);
      }

      await api.opportunityComments.saveMsxId(oppId, c.id, `${userIdFormatted}:${now}`);
      invalidate();
    } catch (err: any) {
      setPushError(err.message);
    } finally {
      setPushingId(null);
    }
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso.replace(' ', 'T') + 'Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const isMember = dealTeamStatus === 'member';

  return (
    <div className="border-t border-slate-100 dark:border-slate-700 mt-3 pt-3">
      {/* Header row: Comments toggle left, Deal Team button right */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => { setOpen(o => !o); if (!open) setTimeout(() => textareaRef.current?.focus(), 100); }}
          className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
        >
          <MessageSquare size={13} />
          Comments ({comments.length})
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {oppMsxId && dealTeamStatus !== 'unavailable' && (
          <div className="flex flex-col items-end gap-0.5">
            <button
              onClick={handleDealTeamToggle}
              disabled={dealTeamLoading || dealTeamStatus === 'unknown'}
              title={isMember ? 'Leave Deal Team' : 'Join Deal Team'}
              className={`group flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-medium transition-colors cursor-pointer disabled:cursor-default disabled:opacity-70 ${
                isMember
                  ? 'border-emerald-400 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 hover:border-red-400 hover:text-red-500 dark:hover:text-red-400'
                  : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400'
              }`}
            >
              {dealTeamLoading || dealTeamStatus === 'unknown'
                ? <Loader size={11} className="animate-spin" />
                : isMember
                  ? <>
                      <UserCheck size={11} className="group-hover:hidden" />
                      <UserMinus size={11} className="hidden group-hover:block" />
                    </>
                  : <UserPlus size={11} />
              }
              Deal Team
            </button>
            {dealTeamError && (
              <p className="text-xs text-red-500 text-right max-w-sm break-words" title={dealTeamError}>
                {dealTeamError}
              </p>
            )}
          </div>
        )}
      </div>

      {open && (
        <div className="mt-3 rounded-xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/30 p-3 flex flex-col gap-2">
          <form onSubmit={handleSubmit} className="flex flex-col gap-2 pb-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Add a comment..."
              rows={2}
              className="w-full px-3 py-2 border border-indigo-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-700 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e as any); }}
            />
            <div className="flex justify-end">
              <Button size="sm" type="submit" disabled={!text.trim() || create.isPending}>
                Add Comment
              </Button>
            </div>
          </form>
          {pushError && (
            <p className="text-xs text-red-500 px-1">
              {pushError}{' '}
              <button onClick={() => setPushError(null)} className="underline cursor-pointer">Dismiss</button>
            </p>
          )}
          {comments.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic px-1">No comments yet.</p>
          )}
          {comments.length > 0 && (
            <div className="flex flex-col gap-2">
              {[...comments].reverse().map(c => (
                <div key={c.id} className="flex items-start gap-2 group">
                  <div className="flex-1 bg-white dark:bg-slate-800 border border-indigo-100 dark:border-slate-700 rounded-lg px-3 py-2 shadow-sm">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-xs text-indigo-400 font-medium">{formatDate(c.created_at)}</p>
                      {oppMsxId && (
                        <button
                          onClick={() => c.msx_id ? deleteFromMsx(c) : pushComment(c)}
                          disabled={pushingId === c.id}
                          className={`group flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md border transition-colors cursor-pointer disabled:opacity-40 ${
                            c.msx_id
                              ? 'border-emerald-400 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 hover:border-red-400 hover:text-red-500 dark:hover:text-red-400'
                              : 'border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                          }`}
                        >
                          {pushingId === c.id
                            ? <Loader size={11} className="animate-spin" />
                            : c.msx_id
                              ? <><CheckCircle2 size={11} className="group-hover:hidden" /><Trash2 size={11} className="hidden group-hover:block" /></>
                              : <Upload size={11} />
                          }
                          {pushingId === c.id ? 'Working…' : c.msx_id ? 'Synced to MSX' : 'Push to MSX'}
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{c.content}</p>
                  </div>
                  <button
                    onClick={() => del.mutate(c.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 cursor-pointer transition-opacity shrink-0 mt-1"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
