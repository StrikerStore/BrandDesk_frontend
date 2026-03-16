import { useState, useEffect } from 'react';
import { fetchSettings, updateSettings, testAutoAck, testAutoClose, fetchUsers, createUser, updateUser, deactivateUser, updateCurrentUser } from '../../utils/api.js';
import styles from './Settings.module.css';

export default function Settings({ onClose, user }) {
  const [settings, setSettings]   = useState(null);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [testing, setTesting]     = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading]     = useState(true);
  // Change password
  const [pwForm, setPwForm]       = useState({ current_password: '', new_password: '', confirm: '' });
  const [pwSaving, setPwSaving]   = useState(false);
  const [pwMsg, setPwMsg]         = useState(null); // { ok, text }
  // Team management (admin only)
  const [users, setUsers]         = useState([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser]     = useState({ name: '', email: '', password: '', role: 'agent' });
  const [addingUser, setAddingUser] = useState(false);
  const [userError, setUserError] = useState('');

  useEffect(() => {
    fetchSettings()
      .then(({ data }) => { setSettings(data); setLoading(false); })
      .catch(() => setLoading(false));

    // Load team if admin
    if (user?.role === 'admin') {
      fetchUsers().then(({ data }) => setUsers(data || [])).catch(() => {});
    }

    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleAddUser = async () => {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password) return;
    setAddingUser(true);
    setUserError('');
    try {
      const { data } = await createUser(newUser);
      setUsers(prev => [...prev, data]);
      setNewUser({ name: '', email: '', password: '', role: 'agent' });
      setShowAddUser(false);
    } catch (err) {
      setUserError(err.response?.data?.error || 'Failed to create user');
    } finally {
      setAddingUser(false);
    }
  };

  const handleDeactivate = async (id) => {
    if (!confirm('Deactivate this user? They will no longer be able to log in.')) return;
    try {
      await deactivateUser(id);
      setUsers(prev => prev.map(u => u.id === id ? { ...u, is_active: 0 } : u));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to deactivate');
    }
  };

  const handleChangePassword = async () => {
    if (!pwForm.current_password) { setPwMsg({ ok: false, text: 'Enter your current password' }); return; }
    if (pwForm.new_password.length < 8) { setPwMsg({ ok: false, text: 'New password must be at least 8 characters' }); return; }
    if (pwForm.new_password !== pwForm.confirm) { setPwMsg({ ok: false, text: 'New passwords do not match' }); return; }
    setPwSaving(true);
    setPwMsg(null);
    try {
      await updateCurrentUser({ current_password: pwForm.current_password, new_password: pwForm.new_password });
      setPwMsg({ ok: true, text: 'Password changed successfully' });
      setPwForm({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      setPwMsg({ ok: false, text: err.response?.data?.error || 'Failed to change password' });
    } finally {
      setPwSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await updateSettings(settings);
      setSettings(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (type) => {
    setTesting(type);
    setTestResult(null);
    try {
      const fn = type === 'ack' ? testAutoAck : testAutoClose;
      const { data } = await fn();
      setTestResult({ ok: true, msg: data.message });
    } catch (err) {
      setTestResult({ ok: false, msg: err.response?.data?.error || err.message });
    } finally {
      setTesting(null);
    }
  };

  const set = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Settings</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div className={styles.loading}>Loading settings…</div>
        ) : (
          <div className={styles.body}>

            {/* My account — change password */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <div className={styles.sectionTitle}>My account</div>
                  <div className={styles.sectionDesc}>{user?.name} · {user?.email}</div>
                </div>
              </div>
              <div className={styles.subSettings}>
                <input
                  className={styles.addUserInput}
                  type="password"
                  placeholder="Current password"
                  value={pwForm.current_password}
                  onChange={e => setPwForm(p => ({ ...p, current_password: e.target.value }))}
                  autoComplete="current-password"
                />
                <input
                  className={styles.addUserInput}
                  type="password"
                  placeholder="New password (min 8 chars)"
                  value={pwForm.new_password}
                  onChange={e => setPwForm(p => ({ ...p, new_password: e.target.value }))}
                  autoComplete="new-password"
                />
                <input
                  className={styles.addUserInput}
                  type="password"
                  placeholder="Confirm new password"
                  value={pwForm.confirm}
                  onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                  autoComplete="new-password"
                />
                {pwMsg && (
                  <div className={`${styles.testResult} ${pwMsg.ok ? styles.testOk : styles.testErr}`}>
                    {pwMsg.ok ? '✅' : '❌'} {pwMsg.text}
                  </div>
                )}
                <button
                  className={styles.testBtn}
                  onClick={handleChangePassword}
                  disabled={pwSaving || !pwForm.current_password || !pwForm.new_password || !pwForm.confirm}
                >
                  {pwSaving ? 'Saving…' : 'Change password'}
                </button>
              </div>
            </div>

            {/* Auto-acknowledgement */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <div className={styles.sectionTitle}>Auto-acknowledgement</div>
                  <div className={styles.sectionDesc}>
                    Automatically send the "Acknowledgement" template to new tickets after a delay.
                    Sends only if no manual reply has been sent yet.
                  </div>
                </div>
                <Toggle
                  value={settings?.auto_ack_enabled === 'true'}
                  onChange={v => set('auto_ack_enabled', v ? 'true' : 'false')}
                />
              </div>

              {settings?.auto_ack_enabled === 'true' && (
                <div className={styles.subSettings}>
                  <div className={styles.fieldRow}>
                    <label className={styles.fieldLabel}>Send after</label>
                    <div className={styles.fieldInput}>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        className={styles.numInput}
                        value={settings?.auto_ack_delay_minutes || 5}
                        onChange={e => set('auto_ack_delay_minutes', e.target.value)}
                      />
                      <span className={styles.fieldUnit}>minutes after ticket arrives</span>
                    </div>
                  </div>
                  <div className={styles.fieldNote}>
                    Make sure you have a template titled "Acknowledgement" in your template library.
                    Variables <code>{'{{customer_name}}'}</code>, <code>{'{{brand}}'}</code>,
                    <code>{'{{ticket_id}}'}</code> will be auto-filled.
                  </div>
                  <button
                    className={styles.testBtn}
                    onClick={() => handleTest('ack')}
                    disabled={testing === 'ack'}
                  >
                    {testing === 'ack' ? 'Running…' : 'Test now — send ack to pending tickets'}
                  </button>
                </div>
              )}
            </div>

            {/* Auto-close */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <div className={styles.sectionTitle}>Auto-close stale resolved tickets</div>
                  <div className={styles.sectionDesc}>
                    Archive resolved tickets where the customer hasn't replied after N days.
                    Runs daily at midnight.
                  </div>
                </div>
                <Toggle
                  value={settings?.auto_close_enabled === 'true'}
                  onChange={v => set('auto_close_enabled', v ? 'true' : 'false')}
                />
              </div>

              {settings?.auto_close_enabled === 'true' && (
                <div className={styles.subSettings}>
                  <div className={styles.fieldRow}>
                    <label className={styles.fieldLabel}>Close after</label>
                    <div className={styles.fieldInput}>
                      <input
                        type="number"
                        min="1"
                        max="90"
                        className={styles.numInput}
                        value={settings?.auto_close_days || 7}
                        onChange={e => set('auto_close_days', e.target.value)}
                      />
                      <span className={styles.fieldUnit}>days with no customer reply</span>
                    </div>
                  </div>
                  <button
                    className={styles.testBtn}
                    onClick={() => handleTest('close')}
                    disabled={testing === 'close'}
                  >
                    {testing === 'close' ? 'Running…' : 'Test now — close eligible tickets'}
                  </button>
                </div>
              )}
            </div>

            {/* SLA target */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <div className={styles.sectionTitle}>SLA configuration</div>
                  <div className={styles.sectionDesc}>
                    SLA is based on business hours: <strong>Mon–Sat, 10 AM – 8 PM IST</strong>. Sundays off.
                  </div>
                </div>
              </div>
              <div className={styles.subSettings}>
                <div className={styles.slaRules}>
                  <div className={styles.slaRule}>
                    <span className={styles.slaRuleIcon}>🕙</span>
                    <div>
                      <div className={styles.slaRuleTitle}>During business hours</div>
                      <div className={styles.slaRuleDesc}>Ticket must be replied within <strong>4 hours</strong></div>
                    </div>
                  </div>
                  <div className={styles.slaRule}>
                    <span className={styles.slaRuleIcon}>🌙</span>
                    <div>
                      <div className={styles.slaRuleTitle}>Outside business hours</div>
                      <div className={styles.slaRuleDesc}>SLA deadline is <strong>next business day 12 PM IST</strong></div>
                    </div>
                  </div>
                  <div className={styles.slaRule}>
                    <span className={styles.slaRuleIcon}>📅</span>
                    <div>
                      <div className={styles.slaRuleTitle}>Sunday</div>
                      <div className={styles.slaRuleDesc}>Off — tickets carry over to Monday 12 PM IST</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {testResult && (
              <div className={`${styles.testResult} ${testResult.ok ? styles.testOk : styles.testErr}`}>
                {testResult.ok ? '✅' : '❌'} {testResult.msg}
              </div>
            )}

            {/* Team management — admin only */}
            {user?.role === 'admin' && (
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div>
                    <div className={styles.sectionTitle}>Team</div>
                    <div className={styles.sectionDesc}>Manage who can log in to BrandDesk.</div>
                  </div>
                  <button className={styles.testBtn} onClick={() => setShowAddUser(v => !v)}>
                    + Add agent
                  </button>
                </div>

                {showAddUser && (
                  <div className={styles.subSettings}>
                    <div className={styles.addUserForm}>
                      <input className={styles.addUserInput} placeholder="Full name" value={newUser.name}
                        onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))} />
                      <input className={styles.addUserInput} placeholder="Email" type="email" value={newUser.email}
                        onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} />
                      <input className={styles.addUserInput} placeholder="Password (min 8 chars)" type="password" value={newUser.password}
                        onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} />
                      <select className={styles.addUserInput} value={newUser.role}
                        onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
                        <option value="agent">Agent</option>
                        <option value="admin">Admin</option>
                      </select>
                      {userError && <div className={styles.userError}>{userError}</div>}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className={styles.viewSaveBtn} onClick={handleAddUser}
                          disabled={addingUser || !newUser.name || !newUser.email || !newUser.password}>
                          {addingUser ? 'Creating…' : 'Create'}
                        </button>
                        <button className={styles.viewCancelBtn} onClick={() => { setShowAddUser(false); setUserError(''); }}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}

                <div className={styles.userList}>
                  {users.map(u => (
                    <div key={u.id} className={`${styles.userRow} ${!u.is_active ? styles.userRowInactive : ''}`}>
                      <div className={styles.userRowLeft}>
                        <div className={styles.userAvatar}>{u.name[0]?.toUpperCase()}</div>
                        <div>
                          <div className={styles.userRowName}>{u.name} {u.id === user.id && <span className={styles.youBadge}>you</span>}</div>
                          <div className={styles.userRowEmail}>{u.email}</div>
                        </div>
                      </div>
                      <div className={styles.userRowRight}>
                        <span className={`${styles.userRole} ${u.role === 'admin' ? styles.userRoleAdmin : ''}`}>{u.role}</span>
                        {!u.is_active && <span className={styles.inactiveBadge}>Inactive</span>}
                        {u.is_active && u.id !== user.id && (
                          <button className={styles.deactivateBtn} onClick={() => handleDeactivate(u.id)} title="Deactivate">
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={`${styles.saveBtn} ${saved ? styles.saveBtnSaved : ''}`}
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      className={`${styles.toggle} ${value ? styles.toggleOn : ''}`}
      onClick={() => onChange(!value)}
      title={value ? 'Enabled — click to disable' : 'Disabled — click to enable'}
    >
      <span className={styles.toggleThumb} />
    </button>
  );
}