import { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { logoutUser } from '../utils/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import styles from './NavRail.module.css';
import logo from '../assets/logo.png';

// One navigation component for every screen size. It renders as a 64px left
// rail on wide screens and a bottom tab bar on narrow ones — same destinations,
// same labels, same order. Previously desktop had five unlabelled icon buttons
// buried in the inbox sidebar and mobile had a separate BottomNav with a
// different set.
const DESTINATIONS = [
  {
    to: '/inbox', label: 'Inbox', badgeKey: 'inbox', badgeSuffix: 'unread',
    icon: <><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8" /><path d="M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></>,
  },
  {
    to: '/actions', label: 'Actions',
    icon: <><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6M9 16h4" /></>,
  },
  {
    to: '/insights', label: 'Insights',
    icon: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
  },
  {
    to: '/templates', label: 'Templates',
    icon: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
  },
];

export default function NavRail({ badges = {}, onFullSync, syncing }) {
  const { user, onLogout, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey  = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const handleLogout = async () => { try { await logoutUser(); } catch {} onLogout(); };

  return (
    <nav className={styles.rail} aria-label="Main">
      <div className={styles.brand}>
        <img src={logo} alt="" width="26" height="26" className={styles.logo} />
      </div>

      <ul className={styles.list}>
        {DESTINATIONS.map(d => (
          <li key={d.to}>
            <NavLink
              to={d.to}
              className={({ isActive }) => `${styles.item} ${isActive ? styles.itemActive : ''}`}
            >
              <span className={styles.iconWrap}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  {d.icon}
                </svg>
                {badges[d.badgeKey] > 0 && (
                  <span className={styles.badge} aria-hidden="true">
                    {badges[d.badgeKey] > 99 ? '99+' : badges[d.badgeKey]}
                  </span>
                )}
              </span>
              {/* Labels are always rendered — the old icon-only rail relied on
                  a `title` tooltip nobody on touch could ever see. */}
              <span className={styles.label}>{d.label}</span>
              {badges[d.badgeKey] > 0 && (
                <span className="sr-only">{badges[d.badgeKey]} {d.badgeSuffix || 'items'}</span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className={styles.footer} ref={menuRef}>
        <NavLink
          to="/settings"
          className={({ isActive }) => `${styles.item} ${isActive ? styles.itemActive : ''}`}
        >
          <span className={styles.iconWrap}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          </span>
          <span className={styles.label}>Settings</span>
        </NavLink>

        <button
          className={`${styles.item} ${styles.avatarBtn}`}
          onClick={() => setMenuOpen(v => !v)}
          aria-label={`Account menu — ${user?.name || user?.email}`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <span className={styles.avatar} aria-hidden="true">
            {(user?.name || user?.email || '?')[0].toUpperCase()}
          </span>
          <span className={styles.label}>Account</span>
        </button>

        {menuOpen && (
          <div className={styles.menu} role="menu">
            <div className={styles.menuHead}>
              <div className={styles.menuName}>{user?.name}</div>
              <div className={styles.menuEmail}>{user?.email}</div>
              <span className={`${styles.role} ${isAdmin ? styles.roleAdmin : ''}`}>{user?.role}</span>
            </div>
            <div className={styles.menuDivider} />
            {isAdmin && (
              <button className={styles.menuItem} role="menuitem" disabled={syncing}
                onClick={() => { setMenuOpen(false); onFullSync?.(); }}>
                {syncing ? 'Importing…' : 'Re-import recent history'}
              </button>
            )}
            {isAdmin && (
              <a className={styles.menuItem} role="menuitem"
                href={`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/auth/google`}
                onClick={() => setMenuOpen(false)}>
                Connect Gmail
              </a>
            )}
            {/* Everyone gets this, so the divider above Sign out is no longer
                conditional — there is always something between them. */}
            <NavLink className={styles.menuItem} role="menuitem" to="/help"
              onClick={() => setMenuOpen(false)}>
              Help &amp; shortcuts
            </NavLink>
            <div className={styles.menuDivider} />
            <button className={styles.menuItemDanger} role="menuitem" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
