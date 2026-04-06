import { type ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="w-1 h-8 rounded-full bg-gradient-to-b from-fuchsia-500 to-purple-600" />
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  color?: 'blue' | 'green' | 'amber' | 'purple' | 'slate' | 'red';
}

const colorMap = {
  blue:   'bg-gradient-to-br from-blue-50 to-blue-100/60 border-blue-200/80 text-blue-700 dark:from-blue-950/60 dark:to-blue-900/30 dark:border-blue-800/50 dark:text-blue-300',
  green:  'bg-gradient-to-br from-emerald-50 to-emerald-100/60 border-emerald-200/80 text-emerald-700 dark:from-emerald-950/60 dark:to-emerald-900/30 dark:border-emerald-800/50 dark:text-emerald-300',
  amber:  'bg-gradient-to-br from-amber-50 to-amber-100/60 border-amber-200/80 text-amber-700 dark:from-amber-950/60 dark:to-amber-900/30 dark:border-amber-800/50 dark:text-amber-300',
  purple: 'bg-gradient-to-br from-purple-50 to-purple-100/60 border-purple-200/80 text-purple-700 dark:from-purple-950/60 dark:to-purple-900/30 dark:border-purple-800/50 dark:text-purple-300',
  slate:  'bg-gradient-to-br from-slate-50 to-slate-100/60 border-slate-200/80 text-slate-700 dark:from-slate-800/60 dark:to-slate-700/30 dark:border-slate-600/50 dark:text-slate-300',
  red:    'bg-gradient-to-br from-red-50 to-red-100/60 border-red-200/80 text-red-700 dark:from-red-950/60 dark:to-red-900/30 dark:border-red-800/50 dark:text-red-300',
};

export function StatCard({ label, value, sub, color = 'blue' }: StatCardProps) {
  return (
    <div className={`rounded-xl border p-5 shadow-sm hover:shadow-md transition-shadow ${colorMap[color]}`}>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-sm font-medium mt-1">{label}</div>
      {sub && <div className="text-xs mt-1 opacity-70">{sub}</div>}
    </div>
  );
}

interface BadgeProps {
  label: string;
  variant?: 'default' | 'active' | 'won' | 'lost' | 'onhold' | 'planned' | 'inprogress' | 'completed' | 'cancelled' | 'low' | 'medium' | 'high';
}

const badgeVariants: Record<string, string> = {
  default:    'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
  active:     'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-800',
  won:        'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800',
  lost:       'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-800',
  onhold:     'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800',
  planned:    'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
  inprogress: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-800',
  completed:  'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800',
  cancelled:  'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-800',
  low:        'bg-slate-100 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
  medium:     'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800',
  high:       'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-800',
};

export function Badge({ label, variant = 'default' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeVariants[variant] ?? badgeVariants.default}`}>
      {label}
    </span>
  );
}

export function statusVariant(status: string): BadgeProps['variant'] {
  const map: Record<string, BadgeProps['variant']> = {
    'Active':           'active',
    'Won':              'won',
    'Lost':             'lost',
    'On Hold':          'onhold',
    'Committed':        'won',
    'Not Active':       'cancelled',
    'Blocked':          'cancelled',
    'To Do':            'planned',
    'Planned':          'planned',
    'In Progress':      'inprogress',
    'Completed':        'completed',
    'Cancelled':        'cancelled',
    'Follow Up':        'planned',
    'Not Started':      'planned',
    'Low':              'low',
    'Medium':           'medium',
    'High':             'high',
  };
  return map[status] ?? 'default';
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}

const btnVariants = {
  primary:   'bg-fuchsia-600 hover:bg-fuchsia-700 active:bg-fuchsia-800 text-white shadow-sm focus:ring-2 focus:ring-fuchsia-500 focus:ring-offset-1',
  secondary: 'bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-600 shadow-sm',
  danger:    'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-sm',
  ghost:     'bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-600 dark:hover:bg-slate-700/60 dark:text-slate-300',
};

const btnSizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
};

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-lg font-medium transition-all active:scale-[0.97] disabled:opacity-50 cursor-pointer focus:outline-none ${btnVariants[variant]} ${btnSizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center h-32">
      <div className="w-8 h-8 border-2 border-slate-200 dark:border-slate-700 border-t-fuchsia-500 rounded-full animate-spin" />
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
      <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
      </div>
      <div>
        <div className="text-slate-500 dark:text-slate-400 text-base font-medium">{title}</div>
        {description && <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">{description}</p>}
      </div>
    </div>
  );
}
