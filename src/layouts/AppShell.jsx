import { useState, useEffect, useCallback } from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import { fetchBrands, fetchStats, errorMessage } from '../utils/api.js';
import { useToast } from '../ui/ToastProvider.jsx';
import NavRail from '../ui/NavRail.jsx';
import CommandPalette from '../ui/CommandPalette.jsx';
import styles from './AppShell.module.css';

/**
 * Persistent chrome around every destination. The rail never unmounts, so
 * switching views no longer tears down and rebuilds the whole screen the way
 * the old boolean-overlay approach did.
 *
 * Brands and status counts are fetched once here instead of separately in the
 * Sidebar, Dashboard and NewTicketModal.
 */
export default function AppShell({ onFullSync, syncing }) {
  const toast = useToast();
  const [brands, setBrands] = useState([]);
  const [stats, setStats]   = useState({});
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K belongs to the whole app, not the inbox sidebar — it used to only
  // focus that one search field, and only when the inbox was mounted.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    fetchBrands()
      .then(({ data }) => setBrands(data))
      .catch(err => toast.error("Couldn't load brands", { detail: errorMessage(err) }));
  }, [toast]);

  // The endpoint returns `unread` and `urgent` alongside `byStatus`; keeping
  // only byStatus was throwing away the two counts the nav badge needs.
  const loadStats = useCallback(() => {
    fetchStats()
      .then(({ data }) => setStats({ ...(data.byStatus || {}), unread: data.unread, urgent: data.urgent }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadStats();
    const id = setInterval(loadStats, 30000);
    return () => clearInterval(id);
  }, [loadStats]);

  return (
    <div className={styles.shell}>
      <NavRail
        badges={{ inbox: stats.unread || 0 }}
        onFullSync={onFullSync}
        syncing={syncing}
      />
      <main className={styles.main}>
        <Outlet context={{ brands, stats, reloadStats: loadStats }} />
      </main>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

export function useShell() {
  return useOutletContext();
}
