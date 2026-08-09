import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

// Inbox filters live in the URL so a filtered list is shareable, survives a
// refresh, and restores on Back. Previously they were component state that
// vanished the moment anything remounted.
//
// URL:  /inbox?status=open&brand=Nike&q=refund&view=3
// Defaults are omitted from the URL so the common case stays clean.

const DEFAULTS = { brand: 'all', status: 'open' };

function read(params) {
  const filters = {
    brand:  params.get('brand')  || DEFAULTS.brand,
    status: params.get('status') || DEFAULTS.status,
  };
  const search = params.get('q');
  if (search) filters.search = search;
  return filters;
}

export function useFilters() {
  const [params, setParams] = useSearchParams();

  const filters   = useMemo(() => read(params), [params]);
  const viewId    = params.get('view') ? Number(params.get('view')) : null;

  // Accepts either an object or an updater, matching the setState-style API
  // the Sidebar already calls with.
  const setFilters = useCallback((next, { keepView = false } = {}) => {
    setParams(prev => {
      const resolved = typeof next === 'function' ? next(read(prev)) : next;
      const sp = new URLSearchParams();

      if (resolved.brand  && resolved.brand  !== DEFAULTS.brand)  sp.set('brand', resolved.brand);
      if (resolved.status && resolved.status !== DEFAULTS.status) sp.set('status', resolved.status);
      if (resolved.search) sp.set('q', resolved.search);
      // Touching a filter by hand detaches you from the saved view unless the
      // caller is the saved-view applier itself.
      if (keepView && prev.get('view')) sp.set('view', prev.get('view'));

      return sp;
      // replace: filter fiddling shouldn't bury the previous page in history
    }, { replace: true });
  }, [setParams]);

  const applyView = useCallback((view) => {
    const parsed = typeof view.filters === 'string' ? JSON.parse(view.filters) : view.filters;
    setParams(prev => {
      const sp = new URLSearchParams();
      if (parsed.brand  && parsed.brand  !== DEFAULTS.brand)  sp.set('brand', parsed.brand);
      if (parsed.status && parsed.status !== DEFAULTS.status) sp.set('status', parsed.status);
      sp.set('view', String(view.id));
      return sp;
    }, { replace: true });
  }, [setParams]);

  const clearAll = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  // Everything the user has narrowed by, as removable chips.
  const activeChips = useMemo(() => {
    const chips = [];
    if (filters.brand !== DEFAULTS.brand)   chips.push({ key: 'brand',  label: 'Brand',  value: filters.brand });
    if (filters.status !== DEFAULTS.status) chips.push({ key: 'status', label: 'Status', value: filters.status.replace('_', ' ') });
    if (filters.search)                     chips.push({ key: 'search', label: 'Search', value: `“${filters.search}”` });
    return chips;
  }, [filters]);

  const removeChip = useCallback((key) => {
    setFilters(f => ({ ...f, [key]: DEFAULTS[key] ?? undefined }));
  }, [setFilters]);

  return { filters, viewId, setFilters, applyView, clearAll, activeChips, removeChip };
}
