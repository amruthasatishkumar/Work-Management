export const queryKeys = {
  dashboard: ['dashboard'] as const,
  territories: {
    all: ['territories'] as const,
    detail: (id: number) => ['territories', id] as const,
  },
  accounts: {
    all: (territoryId?: number) => ['accounts', territoryId] as const,
    detail: (id: number) => ['accounts', 'detail', id] as const,
  },
  opportunities: {
    all: (params?: { territory_id?: number; account_id?: number; status?: string }) =>
      ['opportunities', params] as const,
    statuses: ['opportunities', 'statuses'] as const,
    detail: (id: number) => ['opportunities', 'detail', id] as const,
  },
  opportunityComments: {
    list: (oppId: number) => ['opp-comments', oppId] as const,
  },
  opportunityNextSteps: {
    list: (oppId: number) => ['opp-next-steps', oppId] as const,
  },
  activities: {
    all: (params?: { account_id?: number; opportunity_id?: number; type?: string; status?: string }) =>
      ['activities', params] as const,
    detail: (id: number) => ['activities', 'detail', id] as const,
  },
  activityComments: {
    list: (actId: number) => ['activity-comments', actId] as const,
  },
  tasks: {
    all: ['tasks'] as const,
  },
  seWork: {
    all: (status?: string) => ['se-work', status] as const,
  },
  milestones: {
    all: (params?: { territory_id?: number; account_id?: number; opportunity_id?: number; on_team?: boolean }) =>
      ['milestones', params] as const,
  },
};
