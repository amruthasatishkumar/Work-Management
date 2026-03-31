const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---- Territories ----
export const api = {
  territories: {
    list: () => request<any[]>('/territories'),
    get: (id: number) => request<any>(`/territories/${id}`),
    create: (data: any) => request<any>('/territories', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/territories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/territories/${id}`, { method: 'DELETE' }),
  },
  accounts: {
    list: (territory_id?: number) => request<any[]>(`/accounts${territory_id ? `?territory_id=${territory_id}` : ''}`),
    get: (id: number) => request<any>(`/accounts/${id}`),
    create: (data: any) => request<any>('/accounts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/accounts/${id}`, { method: 'DELETE' }),
  },
  opportunities: {
    list: (params?: { territory_id?: number; account_id?: number; status?: string }) => {
      const qs = new URLSearchParams();
      if (params?.territory_id) qs.set('territory_id', String(params.territory_id));
      if (params?.account_id) qs.set('account_id', String(params.account_id));
      if (params?.status) qs.set('status', params.status);
      return request<any[]>(`/opportunities?${qs}`);
    },
    statuses: () => request<string[]>('/opportunities/statuses'),
    get: (id: number) => request<any>(`/opportunities/${id}`),
    create: (data: any) => request<any>('/opportunities', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/opportunities/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/opportunities/${id}`, { method: 'DELETE' }),
    patchMgmtStatus: (id: number, mgmt_status: string, mgmt_position?: number) =>
      request<any>(`/opportunities/${id}/mgmt-status`, { method: 'PATCH', body: JSON.stringify({ mgmt_status, mgmt_position }) }),
  },
  opportunityComments: {
    list: (oppId: number) => request<any[]>(`/opportunities/${oppId}/comments`),
    create: (oppId: number, content: string) =>
      request<any>(`/opportunities/${oppId}/comments`, { method: 'POST', body: JSON.stringify({ content }) }),
    delete: (oppId: number, commentId: number) =>
      request<void>(`/opportunities/${oppId}/comments/${commentId}`, { method: 'DELETE' }),
    saveMsxId: (oppId: number, commentId: number, msx_id: string | null) =>
      request<any>(`/opportunities/${oppId}/comments/${commentId}/msx-id`, { method: 'PATCH', body: JSON.stringify({ msx_id }) }),
  },
  opportunityNextSteps: {
    list: (oppId: number) => request<any[]>(`/opportunities/${oppId}/next-steps`),
    create: (oppId: number, title: string) =>
      request<any>(`/opportunities/${oppId}/next-steps`, { method: 'POST', body: JSON.stringify({ title }) }),
    toggleDone: (oppId: number, stepId: number, done: boolean, completion_date?: string | null) =>
      request<any>(`/opportunities/${oppId}/next-steps/${stepId}`, { method: 'PATCH', body: JSON.stringify({ done, completion_date }) }),
    delete: (oppId: number, stepId: number) =>
      request<void>(`/opportunities/${oppId}/next-steps/${stepId}`, { method: 'DELETE' }),
  },
  activities: {
    list: (params?: { account_id?: number; opportunity_id?: number; type?: string; status?: string }) => {
      const qs = new URLSearchParams();
      if (params?.account_id) qs.set('account_id', String(params.account_id));
      if (params?.opportunity_id) qs.set('opportunity_id', String(params.opportunity_id));
      if (params?.type) qs.set('type', params.type);
      if (params?.status) qs.set('status', params.status);
      return request<any[]>(`/activities?${qs}`);
    },
    get: (id: number) => request<any>(`/activities/${id}`),
    create: (data: any) => request<any>('/activities', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/activities/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/activities/${id}`, { method: 'DELETE' }),
    patchKanban: (id: number, status: string | null, position?: number) =>
      request<any>(`/activities/${id}/kanban`, { method: 'PATCH', body: JSON.stringify({ status, position }) }),
    saveMsxId: (id: number, msx_id: string | null) =>
      request<any>(`/activities/${id}/msx-id`, { method: 'PATCH', body: JSON.stringify({ msx_id }) }),
  },
  activityComments: {
    list: (actId: number) => request<any[]>(`/activities/${actId}/comments`),
    create: (actId: number, content: string) =>
      request<any>(`/activities/${actId}/comments`, { method: 'POST', body: JSON.stringify({ content }) }),
    delete: (actId: number, commentId: number) =>
      request<void>(`/activities/${actId}/comments/${commentId}`, { method: 'DELETE' }),
  },
  seWork: {
    list: (status?: string) => request<any[]>(`/se-work${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    create: (data: any) => request<any>('/se-work', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/se-work/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    patchStatus: (id: number, status: string, position: number) =>
      request<any>(`/se-work/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, position }) }),
    delete: (id: number) => request<void>(`/se-work/${id}`, { method: 'DELETE' }),
  },
  tasks: {
    list: () => request<any[]>('/tasks'),
    create: (data: any) => request<any>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: any) => request<any>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    patchStatus: (id: number, status: string, position: number) =>
      request<any>(`/tasks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, position }) }),
    delete: (id: number) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
  },
  dashboard: {
    get: () => request<any>('/dashboard'),
  },
  milestones: {
    list: (params?: { territory_id?: number; account_id?: number; opportunity_id?: number; on_team?: boolean }) => {
      const qs = new URLSearchParams();
      if (params?.territory_id) qs.set('territory_id', String(params.territory_id));
      if (params?.account_id) qs.set('account_id', String(params.account_id));
      if (params?.opportunity_id) qs.set('opportunity_id', String(params.opportunity_id));
      if (params?.on_team) qs.set('on_team', '1');
      return request<any[]>(`/milestones?${qs}`);
    },
  },
  msx: {
    tokenStatus: () => request<any>('/msx/token-status'),
    checkExisting: (oppMsxIds: string[]) => request<{ existing: string[] }>('/msx/check-existing', { method: 'POST', body: JSON.stringify({ oppMsxIds }) }),
    import: (data: any) => request<any>('/msx/import', { method: 'POST', body: JSON.stringify(data) }),
    refreshOpp: (data: { localOppId: number; comments: any[]; activities: any[]; milestones?: any[]; solutionPlay?: string | null }) =>
      request<any>('/msx/refresh-opp', { method: 'POST', body: JSON.stringify(data) }),
    fetchOpp: (oppId: string) =>
      request<{ account: any; tpid: number; opp: any }>('/msx/fetch-opp', { method: 'POST', body: JSON.stringify({ oppId }) }),
    dealTeamOpps: () =>
      request<Array<{ account: any; tpid: number; opp: any }>>('/msx/deal-team-opps', { method: 'POST', body: '{}' }),
  },
};
