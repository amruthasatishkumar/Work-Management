import { type ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
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
  blue:   'bg-blue-50 border-blue-200 text-blue-700',
  green:  'bg-emerald-50 border-emerald-200 text-emerald-700',
  amber:  'bg-amber-50 border-amber-200 text-amber-700',
  purple: 'bg-purple-50 border-purple-200 text-purple-700',
  slate:  'bg-slate-50 border-slate-200 text-slate-700',
  red:    'bg-red-50 border-red-200 text-red-700',
};

export function StatCard({ label, value, sub, color = 'blue' }: StatCardProps) {
  return (
    <div className={`rounded-lg border p-4 ${colorMap[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm font-medium mt-0.5">{label}</div>
      {sub && <div className="text-xs mt-1 opacity-70">{sub}</div>}
    </div>
  );
}

interface BadgeProps {
  label: string;
  variant?: 'default' | 'active' | 'won' | 'lost' | 'onhold' | 'planned' | 'inprogress' | 'completed' | 'cancelled' | 'low' | 'medium' | 'high';
}

const badgeVariants: Record<string, string> = {
  default:    'bg-slate-100 text-slate-600',
  active:     'bg-blue-100 text-blue-700',
  won:        'bg-emerald-100 text-emerald-700',
  lost:       'bg-red-100 text-red-700',
  onhold:     'bg-amber-100 text-amber-700',
  planned:    'bg-slate-100 text-slate-600',
  inprogress: 'bg-blue-100 text-blue-700',
  completed:  'bg-emerald-100 text-emerald-700',
  cancelled:  'bg-red-100 text-red-700',
  low:        'bg-slate-100 text-slate-500',
  medium:     'bg-amber-100 text-amber-700',
  high:       'bg-red-100 text-red-700',
};

export function Badge({ label, variant = 'default' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeVariants[variant] ?? badgeVariants.default}`}>
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
  primary:   'bg-blue-600 hover:bg-blue-700 text-white',
  secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 dark:border-slate-600',
  danger:    'bg-red-600 hover:bg-red-700 text-white',
  ghost:     'bg-transparent hover:bg-slate-100 text-slate-600 dark:hover:bg-slate-700 dark:text-slate-300',
};

const btnSizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
};

export function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 cursor-pointer ${btnVariants[variant]} ${btnSizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center h-32 text-slate-400 dark:text-slate-500">
      <div className="w-6 h-6 border-2 border-slate-300 dark:border-slate-600 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-center">
      <div className="text-slate-400 dark:text-slate-500 text-base font-medium">{title}</div>
      {description && <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">{description}</p>}
    </div>
  );
}
