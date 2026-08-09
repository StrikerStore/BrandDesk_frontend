import { useState, useEffect } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import {
  fetchSettings, updateSettings, testAutoAck, testAutoResolve,
  fetchUsers, createUser, deactivateUser, updateCurrentUser, errorMessage,
} from '../../utils/api.js';
import { useToast } from '../../ui/ToastProvider.jsx';
import ConfirmDialog from '../../ui/ConfirmDialog.jsx';
import Icon from '../../ui/Icon.jsx';
import styles from './Settings.module.css';

const TABS = [
  { slug: 'account',    label: 'My account' },
  { slug: 'automation', label: 'Automation' },
  { slug: 'team',       label: 'Team', adminOnly: true },
];

/**
 * Split into routed tabs. Personal credentials, global system automation and
 * team management used to share one scroll and one "Save settings" footer
 * button that saved only the automation object — an admin who changed the
 * recall window and added an agent reasonably believed Save covered both.
 */
export default function Settings({ user }) {
  const { tab } = useParams();
  const isAdmin = user?.role === 'admin';
  const visible = TABS.filter(t => !t.adminOnly || isAdmin);

  if (!tab) return <Navigate to="/settings/account" replace />;
  if (!visible.some(t => t.slug === tab)) return <Navigate to="/settings/account" replace />;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.pageHead}>
          <h1 className={styles.pageTitle}>Settings</h1>
          <nav className={styles.tabs} aria-label="Settings sections">
            {visible.map(t => (
              <NavLink
                key={t.slug}
                to={`/settings/${t.slug}`}
                className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
        </header>

        {tab === 'account'    && <AccountTab user={user} />}
        {tab === 'automation' && <AutomationTab isAdmin={isAdmin} />}
        {tab === 'team'       && isAdmin && <TeamTab user={user} />}
      </div>
    </div>
  );
}

// ── My account ───────────────────────────────────────────────────────────────

function AccountTab({ user }) {
  const toast = useToast();
  const [form, setForm]   = useState({ current_password: '', new_password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!form.current_password)            next.current_password = 'Enter your current password';
    if (form.new_password.length < 8)      next.new_password = 'Must be at least 8 characters';
    if (form.new_password !== form.confirm) next.confirm = 'Passwords do not match';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      await updateCurrentUser({ current_password: form.current_password, new_password: form.new_password });
      setForm({ current_password: '', new_password: '', confirm: '' });
      toast.success('Password changed');
    } catch (err) {
      toast.error("Couldn't change your password", { detail: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.panel}>
      <Section title="Signed in as" desc={`${user?.name} · ${user?.email}`}>
        <span className={`${styles.rolePill} ${user?.role === 'admin' ? styles.rolePillAdmin : ''}`}>
          {user?.role}
        </span>
      </Section>

      <form className={styles.section} onSubmit={submit}>
        <div className={styles.sectionTitle}>Change password</div>
        <div className={styles.sectionDesc}>You will stay signed in on this device.</div>
        <div className={styles.subSettings}>
          <Field id="pw-current" label="Current password" error={errors.current_password}>
            <input id="pw-current" className={styles.addUserInput} type="password"
              autoComplete="current-password" value={form.current_password}
              onChange={e => setForm(f => ({ ...f, current_password: e.target.value }))} />
          </Field>
          <Field id="pw-new" label="New password" hint="At least 8 characters" error={errors.new_password}>
            <input id="pw-new" className={styles.addUserInput} type="password"
              autoComplete="new-password" value={form.new_password}
              onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))} />
          </Field>
          <Field id="pw-confirm" label="Confirm new password" error={errors.confirm}>
            <input id="pw-confirm" className={styles.addUserInput} type="password"
              autoComplete="new-password" value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} />
          </Field>
          {/* Saves on its own — it is not covered by any other Save button. */}
          <button className={styles.primaryBtn} type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Automation ───────────────────────────────────────────────────────────────

function AutomationTab({ isAdmin }) {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [initial, setInitial]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(null);

  useEffect(() => {
    fetchSettings()
      .then(({ data }) => { setSettings(data); setInitial(data); })
      .catch(err => toast.error("Couldn't load settings", { detail: errorMessage(err) }))
      .finally(() => setLoading(false));
  }, [toast]);

  const set = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));
  const dirty = !!settings && !!initial && JSON.stringify(settings) !== JSON.stringify(initial);

  // Warn before losing edits on navigation away.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await updateSettings(settings);
      setSettings(data); setInitial(data);
      toast.success('Automation settings saved');
    } catch (err) {
      toast.error("Couldn't save settings", { detail: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const runTest = async (type) => {
    setTesting(type);
    try {
      const { data } = await (type === 'ack' ? testAutoAck() : testAutoResolve());
      toast.success(data.message || 'Done');
    } catch (err) {
      toast.error('Test run failed', { detail: errorMessage(err) });
    } finally {
      setTesting(null);
    }
  };

  if (loading) return <div className={styles.panel}><div className={styles.loading}>Loading settings…</div></div>;

  return (
    <div className={styles.panel}>
      {/* Agents saw editable controls, hit Save, and got an error. Now the
          state of the system is visible but the controls are inert. */}
      {!isAdmin && (
        <div className={styles.readOnlyNote} role="note">
          <Icon name="lock" size={13} active />
          These are workspace-wide settings. Ask an admin to change them.
        </div>
      )}

      <Section
        title="Auto-acknowledgement"
        desc={'Sends the "Acknowledgement" template to new tickets after a delay, only if no manual reply went out first.'}
        control={
          <Toggle
            value={settings?.auto_ack_enabled === 'true'}
            disabled={!isAdmin}
            onChange={v => set('auto_ack_enabled', v ? 'true' : 'false')}
          />
        }
      >
        {settings?.auto_ack_enabled === 'true' && (
          <div className={styles.subSettings}>
            <NumberRow
              id="ack-delay" label="Send after" unit="minutes after the ticket arrives"
              min={1} max={60} disabled={!isAdmin}
              value={settings?.auto_ack_delay_minutes || 5}
              onChange={v => set('auto_ack_delay_minutes', v)}
            />
            <p className={styles.fieldNote}>
              Requires a template titled “Acknowledgement”. <code>{'{{customer_name}}'}</code>,{' '}
              <code>{'{{brand}}'}</code> and <code>{'{{ticket_id}}'}</code> are filled in automatically.
            </p>
            {isAdmin && (
              <button className={styles.testBtn} onClick={() => runTest('ack')} disabled={testing === 'ack'}>
                {testing === 'ack' ? 'Running…' : 'Send acks to pending tickets now'}
              </button>
            )}
          </div>
        )}
      </Section>

      <Section
        title="Auto-resolve stale tickets"
        desc="Resolves in-progress tickets where we replied but the customer never came back. Runs daily at 1 AM and leaves a system note."
        control={
          <Toggle
            value={settings?.auto_resolve_enabled === 'true'}
            disabled={!isAdmin}
            onChange={v => set('auto_resolve_enabled', v ? 'true' : 'false')}
          />
        }
      >
        {settings?.auto_resolve_enabled === 'true' && (
          <div className={styles.subSettings}>
            <NumberRow
              id="resolve-days" label="Resolve after" unit="days with no customer reply"
              min={1} max={90} disabled={!isAdmin}
              value={settings?.auto_resolve_days || 7}
              onChange={v => set('auto_resolve_days', v)}
            />
            {isAdmin && (
              <button className={styles.testBtn} onClick={() => runTest('resolve')} disabled={testing === 'resolve'}>
                {testing === 'resolve' ? 'Running…' : 'Run auto-resolve now'}
              </button>
            )}
          </div>
        )}
      </Section>

      <Section
        title="Recall window"
        desc="Holds outgoing customer email briefly so a reply can be pulled back. Applies to replies and new tickets; internal notes are never delayed."
      >
        <div className={styles.subSettings}>
          <NumberRow
            id="recall" label="Hold for" unit="seconds before the email actually sends"
            min={0} max={120} disabled={!isAdmin}
            value={settings?.recall_window_seconds ?? 30}
            onChange={v => set('recall_window_seconds', v)}
          />
          <p className={styles.fieldNote}>
            <code>0</code> sends immediately and disables undo. Customers wait this long for every
            reply, so keep it short.
          </p>
        </div>
      </Section>

      {/* Read-only reference, visually distinct from the editable sections
          above — it used to look identical to them while being hardcoded. */}
      <div className={styles.infoCard}>
        <div className={styles.infoHead}>
          <Icon name="clock" size={14} />
          <span>How SLA is calculated</span>
          <span className={styles.infoTag}>Not configurable</span>
        </div>
        <ul className={styles.infoList}>
          <li><strong>Business hours</strong> — Mon–Sat, 10 AM – 8 PM IST. Reply within <strong>4 hours</strong>.</li>
          <li><strong>Outside hours</strong> — deadline is the next business day at 12 PM IST.</li>
          <li><strong>Sunday</strong> — off; tickets carry over to Monday 12 PM IST.</li>
        </ul>
      </div>

      {isAdmin && (
        <div className={styles.stickyFooter}>
          <span className={styles.dirtyHint}>{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
          <button className={styles.primaryBtn} onClick={save} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save automation settings'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Team ─────────────────────────────────────────────────────────────────────

function TeamTab({ user }) {
  const toast = useToast();
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [newUser, setNewUser]     = useState({ name: '', email: '', password: '', role: 'agent' });
  const [adding, setAdding]       = useState(false);
  const [errors, setErrors]       = useState({});
  const [confirmOff, setConfirmOff] = useState(null);

  useEffect(() => {
    fetchUsers()
      .then(({ data }) => setUsers(data || []))
      .catch(err => toast.error("Couldn't load the team", { detail: errorMessage(err) }))
      .finally(() => setLoading(false));
  }, [toast]);

  const add = async (e) => {
    e.preventDefault();
    const next = {};
    if (!newUser.name.trim())            next.name = 'Required';
    if (!newUser.email.includes('@'))    next.email = 'Enter a valid email';
    if (newUser.password.length < 8)     next.password = 'At least 8 characters';
    setErrors(next);
    if (Object.keys(next).length) return;

    setAdding(true);
    try {
      const { data } = await createUser(newUser);
      setUsers(prev => [...prev, data]);
      setNewUser({ name: '', email: '', password: '', role: 'agent' });
      setShowAdd(false);
      toast.success(`${data.name} can now sign in`);
    } catch (err) {
      toast.error("Couldn't create that user", { detail: errorMessage(err) });
    } finally {
      setAdding(false);
    }
  };

  const deactivate = async (target) => {
    try {
      await deactivateUser(target.id);
      setUsers(prev => prev.map(u => u.id === target.id ? { ...u, is_active: 0 } : u));
      setConfirmOff(null);
      toast.success(`${target.name} deactivated`);
    } catch (err) {
      toast.error("Couldn't deactivate this user", { detail: errorMessage(err) });
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Team</div>
            <div className={styles.sectionDesc}>Who can sign in to BrandDesk.</div>
          </div>
          <button className={styles.testBtn} onClick={() => setShowAdd(v => !v)} aria-expanded={showAdd}>
            {showAdd ? 'Cancel' : '+ Add agent'}
          </button>
        </div>

        {showAdd && (
          <form className={styles.subSettings} onSubmit={add}>
            <Field id="nu-name" label="Full name" error={errors.name}>
              <input id="nu-name" className={styles.addUserInput} value={newUser.name}
                onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))} />
            </Field>
            <Field id="nu-email" label="Email" error={errors.email}>
              <input id="nu-email" className={styles.addUserInput} type="email" value={newUser.email}
                onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} />
            </Field>
            <Field id="nu-pw" label="Temporary password" hint="At least 8 characters" error={errors.password}>
              <input id="nu-pw" className={styles.addUserInput} type="password" value={newUser.password}
                onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} />
            </Field>
            <Field id="nu-role" label="Role">
              <select id="nu-role" className={styles.addUserInput} value={newUser.role}
                onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
                <option value="agent">Agent</option>
                <option value="admin">Admin — can change workspace settings</option>
              </select>
            </Field>
            <button className={styles.primaryBtn} type="submit" disabled={adding}>
              {adding ? 'Creating…' : 'Create user'}
            </button>
          </form>
        )}

        {loading ? (
          <div className={styles.loading}>Loading team…</div>
        ) : (
          <div className={styles.userList}>
            {users.map(u => (
              <div key={u.id} className={`${styles.userRow} ${!u.is_active ? styles.userRowInactive : ''}`}>
                <div className={styles.userRowLeft}>
                  <div className={styles.userAvatar}>{u.name[0]?.toUpperCase()}</div>
                  <div>
                    <div className={styles.userRowName}>
                      {u.name} {u.id === user.id && <span className={styles.youBadge}>you</span>}
                    </div>
                    <div className={styles.userRowEmail}>{u.email}</div>
                  </div>
                </div>
                <div className={styles.userRowRight}>
                  <span className={`${styles.userRole} ${u.role === 'admin' ? styles.userRoleAdmin : ''}`}>{u.role}</span>
                  {!u.is_active && <span className={styles.inactiveBadge}>Inactive</span>}
                  {u.is_active && u.id !== user.id && (
                    <button className={styles.deactivateBtn} onClick={() => setConfirmOff(u)}
                      aria-label={`Deactivate ${u.name}`} title="Deactivate">✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmOff && (
        <ConfirmDialog
          title="Deactivate this user?"
          message={`${confirmOff.name} · ${confirmOff.email}`}
          consequence="They will be signed out and unable to log in. Their past replies and resolutions stay on record."
          confirmLabel="Deactivate"
          onConfirm={() => deactivate(confirmOff)}
          onCancel={() => setConfirmOff(null)}
        />
      )}
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function Section({ title, desc, control, children }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <div className={styles.sectionTitle}>{title}</div>
          {desc && <div className={styles.sectionDesc}>{desc}</div>}
        </div>
        {control}
      </div>
      {children}
    </div>
  );
}

function Field({ id, label, hint, error, children }) {
  return (
    <div className={styles.fieldWrap}>
      <label className={styles.fieldLabelBlock} htmlFor={id}>{label}</label>
      {children}
      {error
        ? <span className={styles.fieldError} role="alert">{error}</span>
        : hint && <span className={styles.fieldHint}>{hint}</span>}
    </div>
  );
}

function NumberRow({ id, label, unit, value, onChange, min, max, disabled }) {
  return (
    <div className={styles.fieldRow}>
      <label className={styles.fieldLabel} htmlFor={id}>{label}</label>
      <div className={styles.fieldInput}>
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          disabled={disabled}
          className={styles.numInput}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        <span className={styles.fieldUnit}>{unit}</span>
      </div>
    </div>
  );
}

function Toggle({ value, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      className={`${styles.toggle} ${value ? styles.toggleOn : ''}`}
      onClick={() => onChange(!value)}
      title={disabled ? 'Admins only' : value ? 'Enabled — click to disable' : 'Disabled — click to enable'}
    >
      <span className={styles.toggleThumb} />
    </button>
  );
}
