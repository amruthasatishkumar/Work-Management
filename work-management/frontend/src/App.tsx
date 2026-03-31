import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Territories from './pages/Territories';
import Accounts from './pages/Accounts';
import AccountDetail from './pages/AccountDetail';
import Opportunities from './pages/Opportunities';
import OpportunityDetail from './pages/OpportunityDetail';
import OpportunityMilestones from './pages/OpportunityMilestones';
import Activities from './pages/Activities';
import ActivityDetail from './pages/ActivityDetail';
import Tasks from './pages/Tasks';
import OpportunityManagement from './pages/OpportunityManagement';
import SEWork from './pages/SEWork';
import Chat from './pages/Chat';
import MSXImport from './pages/MSXImport';

export default function App() {
  return (
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
          <Route path="activities" element={<Activities />} />
          <Route path="activities/:id" element={<ActivityDetail />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="opportunity-management" element={<OpportunityManagement />} />
          <Route path="se-work" element={<SEWork />} />
          <Route path="chat" element={<Chat />} />
          <Route path="msx-import" element={<MSXImport />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
