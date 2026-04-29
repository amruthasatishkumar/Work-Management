import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Component, type ReactNode } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Territories from './pages/Territories';
import Accounts from './pages/Accounts';
import AccountDetail from './pages/AccountDetail';
import Opportunities from './pages/Opportunities';
import OpportunityDetail from './pages/OpportunityDetail';
import OpportunityMilestones from './pages/OpportunityMilestones';
import MilestoneTasks from './pages/MilestoneTasks';
import Activities from './pages/Activities';
import ActivityDetail from './pages/ActivityDetail';
import Tasks from './pages/Tasks';
import SEWork from './pages/SEWork';
import Milestones from './pages/Milestones';
import Chat from './pages/Chat';
import MSXImport from './pages/MSXImport';
import MSXAccounts from './pages/MSXAccounts';
import MSXAccountDetail from './pages/MSXAccountDetail';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 p-8 gap-4">
          <p className="text-red-400 font-semibold text-lg">Something went wrong</p>
          <pre className="text-xs text-slate-400 bg-slate-800 rounded-lg p-4 max-w-2xl w-full overflow-auto whitespace-pre-wrap">
            {(this.state.error as Error).message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 cursor-pointer"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="territories" element={<Territories />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="accounts/:id" element={<AccountDetail />} />
            <Route path="opportunities" element={<Opportunities />} />
            <Route path="opportunities/:id" element={<OpportunityDetail />} />
            <Route path="opportunities/:id/milestones" element={<OpportunityMilestones />} />
            <Route path="opportunities/:id/milestones/:milestoneMsxId/tasks" element={<MilestoneTasks />} />
            <Route path="activities" element={<Activities />} />
            <Route path="activities/:id" element={<ActivityDetail />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="se-work" element={<SEWork />} />
            <Route path="milestones" element={<Milestones />} />
            <Route path="chat" element={<Chat />} />
            <Route path="msx-import" element={<MSXImport />} />
            <Route path="msx-accounts" element={<MSXAccounts />} />
            <Route path="msx-accounts/:accountId" element={<MSXAccountDetail />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
