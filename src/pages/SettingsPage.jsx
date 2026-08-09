import Settings from '../components/Settings/Settings.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

export default function SettingsPage() {
  const { user } = useAuth();
  return <Settings user={user} />;
}
