import TemplateEditor from '../components/Templates/TemplateEditor.jsx';

// Template editing was reachable only from a button inside the reply toolbar,
// nested two overlays deep. It's a library, not a per-reply action.
export default function TemplatesPage() {
  return <TemplateEditor />;
}
