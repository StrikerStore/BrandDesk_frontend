import { useState, useEffect } from 'react';
import { fetchTemplates, createTemplate, updateTemplate, deleteTemplate } from '../../utils/api.js';
import styles from './TemplateEditor.module.css';

const CATEGORIES = ['General', 'Shipping', 'Refunds', 'Exchanges'];
const VARIABLES = ['{{customer_name}}', '{{order_id}}', '{{ticket_id}}', '{{tracking_url}}', '{{tracking_link}}', '{{amount}}', '{{brand}}'];

export default function TemplateEditor({ onClose }) {
  const [templates, setTemplates]   = useState([]);
  const [grouped, setGrouped]       = useState({});
  const [editing, setEditing]       = useState(null); // null | 'new' | template obj
  const [form, setForm]             = useState({ title: '', category: 'General', body: '' });
  const [saving, setSaving]         = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = async () => {
    const { data } = await fetchTemplates();
    setTemplates(data.templates || []);
    setGrouped(data.grouped || {});
  };

  useEffect(() => { load(); }, []);

  const startNew = () => {
    setForm({ title: '', category: 'General', body: '' });
    setEditing('new');
  };

  const startEdit = (tpl) => {
    setForm({ title: tpl.title, category: tpl.category || 'General', body: tpl.body });
    setEditing(tpl);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      if (editing === 'new') {
        await createTemplate(form);
      } else {
        await updateTemplate(editing.id, form);
      }
      await load();
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    await deleteTemplate(id);
    await load();
    setDeleteConfirm(null);
    if (editing?.id === id) setEditing(null);
  };

  const insertVariable = (v) => {
    setForm(f => ({ ...f, body: f.body + v }));
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Template editor</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>
          {/* Left — template list */}
          <div className={styles.listPane}>
            <button className={styles.newBtn} onClick={startNew}>+ New template</button>
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat} className={styles.catGroup}>
                <div className={styles.catLabel}>{cat}</div>
                {items.map(tpl => (
                  <div
                    key={tpl.id}
                    className={`${styles.tplRow} ${editing?.id === tpl.id ? styles.tplRowActive : ''}`}
                    onClick={() => startEdit(tpl)}
                  >
                    <span className={styles.tplRowTitle}>{tpl.title}</span>
                    <button
                      className={styles.deleteBtn}
                      onClick={e => { e.stopPropagation(); setDeleteConfirm(tpl); }}
                    >✕</button>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Right — editor */}
          <div className={styles.editorPane}>
            {editing ? (
              <>
                <div className={styles.editorFields}>
                  <div className={styles.fieldRow}>
                    <label className={styles.fieldLabel}>Title</label>
                    <input
                      className={styles.fieldInput}
                      value={form.title}
                      onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="e.g. Shipping delay apology"
                    />
                  </div>
                  <div className={styles.fieldRow}>
                    <label className={styles.fieldLabel}>Category</label>
                    <select
                      className={styles.fieldSelect}
                      value={form.category}
                      onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className={styles.fieldRow}>
                    <label className={styles.fieldLabel}>Body</label>
                    <div className={styles.varRow}>
                      {VARIABLES.map(v => (
                        <button key={v} className={styles.varChip} onClick={() => insertVariable(v)}>{v}</button>
                      ))}
                    </div>
                    <textarea
                      className={styles.fieldTextarea}
                      rows={10}
                      value={form.body}
                      onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                      placeholder="Write your template here. Use variable chips above to insert dynamic values."
                    />
                  </div>
                </div>
                <div className={styles.editorActions}>
                  <button className={styles.cancelEditBtn} onClick={() => setEditing(null)}>Cancel</button>
                  <button
                    className={styles.saveBtn}
                    onClick={handleSave}
                    disabled={saving || !form.title.trim() || !form.body.trim()}
                  >
                    {saving ? 'Saving…' : editing === 'new' ? 'Create template' : 'Save changes'}
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.editorEmpty}>
                <p>Select a template to edit or create a new one</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <p className={styles.confirmText}>Delete <strong>{deleteConfirm.title}</strong>?</p>
            <p className={styles.confirmSub}>This cannot be undone.</p>
            <div className={styles.confirmActions}>
              <button className={styles.cancelEditBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className={styles.deleteConfirmBtn} onClick={() => handleDelete(deleteConfirm.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}