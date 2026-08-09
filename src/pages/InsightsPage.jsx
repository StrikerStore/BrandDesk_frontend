import { useNavigate } from 'react-router-dom';
import Dashboard from '../components/Dashboard/Dashboard.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useShell } from '../layouts/AppShell.jsx';

export default function InsightsPage() {
  const { user } = useAuth();
  const { brands } = useShell();
  const navigate = useNavigate();

  return (
    <Dashboard
      user={user}
      brands={brands}
      // Every number on this page is a question about the inbox; let the
      // reader jump straight to the filtered answer.
      onDrillDown={(params) => navigate(`/inbox?${new URLSearchParams(params)}`)}
      onOpenThread={(threadId) => navigate(`/inbox/t/${threadId}`)}
    />
  );
}
