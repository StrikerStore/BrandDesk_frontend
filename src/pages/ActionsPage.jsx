import { useNavigate } from 'react-router-dom';
import ActionsView from '../components/Actions/ActionsView.jsx';

// Was an absolutely-positioned overlay anchored to the sidebar's pixel width.
// It's a destination, so it's a route now — the rail stays, Back works, and
// /actions is linkable.
export default function ActionsPage() {
  const navigate = useNavigate();
  return (
    <ActionsView
      onSelectThread={(threadId) => navigate(`/inbox/t/${threadId}`)}
    />
  );
}
