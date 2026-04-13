// Core data types

export interface Territory {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  account_count?: number;
}

export interface Account {
  id: number;
  territory_id: number;
  territory_name?: string;
  name: string;
  website: string | null;
  notes: string | null;
  description: string | null;
  tpid: number | null;
  msx_id: string | null;
  created_at: string;
  updated_at: string;
  opportunity_count?: number;
  activity_count?: number;
}

export interface Opportunity {
  id: number;
  account_id: number;
  account_name?: string;
  territory_name?: string;
  title: string;
  description: string | null;
  planning: string | null;
  link: string | null;
  status: 'Committed' | 'In Progress' | 'Active' | 'Not Active';
  msx_id: string | null;
  solution_play: string | null;
  created_at: string;
  updated_at: string;
  activity_count?: number;
}

export interface OpportunityComment {
  id: number;
  opportunity_id: number;
  content: string;
  msx_id: string | null;
  created_at: string;
}

export interface OpportunityNextStep {
  id: number;
  opportunity_id: number;
  title: string;
  done: number; // 0 | 1
  completion_date: string | null;
  created_at: string;
}

export interface Activity {
  id: number;
  account_id: number;
  account_name?: string;
  territory_name?: string;
  opportunity_id: number | null;
  opportunity_title?: string | null;
  opportunity_msx_id?: string | null;
  milestone_id?: number | null;
  milestone_name?: string | null;
  milestone_msx_id?: string | null;
  type: 'Demo' | 'Meeting' | 'POC' | 'Architecture Review' | 'Follow up Meeting' | 'Other';
  purpose: string;
  date: string;
  due_date: string | null;
  completed_date: string | null;
  status: 'To Do' | 'In Progress' | 'Completed' | 'Blocked';
  position: number;
  notes: string | null;
  msx_id: string | null;
  msx_entity_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: number;
  opportunity_id: number;
  msx_id: string | null;
  milestone_number: number | null;
  name: string;
  workload: string | null;
  commitment: string | null;
  category: string | null;
  monthly_use: number | null;
  milestone_date: string | null;
  status: string | null;
  owner: string | null;
  on_team: number; // 0 | 1
  opportunity_title?: string;
  account_name?: string;
  territory_name?: string;
}

export interface ActivityComment {
  id: number;
  activity_id: number;
  content: string;
  created_at: string;
}

export interface SEWorkItem {
  id: number;
  title: string;
  due_date: string | null;
  completion_date: string | null;
  status: 'Not Started' | 'In Progress' | 'Completed' | 'Blocked';
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: 'Todo' | 'In Progress' | 'Done';
  priority: 'Low' | 'Medium' | 'High';
  due_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface DashboardData {
  stats: {
    territories: number;
    accounts: number;
    opportunities_total: number;
    opportunities_active: number;
    activities_total: number;
    activities_upcoming: number;
    se_not_started: number;
    se_inprogress: number;
  };
  recent_activities: Activity[];
  remaining_activities: Activity[];
  active_opportunities: Opportunity[];
}
