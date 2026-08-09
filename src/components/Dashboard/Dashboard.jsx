import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchAnalyticsOverview, fetchAnalyticsVolume, fetchAnalyticsByBrand,
  fetchAnalyticsByIssue, fetchAnalyticsResponse, fetchAnalyticsSla,
  fetchAnalyticsActions, fetchAnalyticsAgents, fetchAnalyticsTemplates,
  downloadAnalyticsExport,
} from '../../utils/api.js';
import styles from './Dashboard.module.css';

const RANGE_OPTIONS = [
  { label: 'Today',   value: 1  },
  { label: '7 days',  value: 7  },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

const ACTION_LABELS = {
  exchange: '🔄 Exchange', return: '↩ Return', alternate_product: '🔁 Alternate',
  refund: '💰 Refund', change_size: '📏 Change Size', change_address: '📍 Change Address',
};

const toDateStr = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function formatMins(mins) {
  if (mins === null || mins === undefined || mins === '') return '—';
  mins = Number(mins);
  if (!mins) return '—';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// A raw count means little on its own — the delta against the equivalent
// preceding window is what makes it readable.
function delta(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (!prev) return null;                       // no baseline → no claim
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return { pct: 0, dir: 'flat' };
  return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : 'down' };
}

export default function Dashboard({ onClose, sidebarWidth, user, brands = [] }) {
  const isAdmin = user?.role === 'admin';

  const [range, setRange]     = useState(30);
  const [custom, setCustom]   = useState({ from: '', to: '' });
  const [brand, setBrand]     = useState('all');
  const [agent, setAgent]     = useState('all');

  const [overview, setOverview]   = useState(null);
  const [volume, setVolume]       = useState([]);
  const [byBrand, setByBrand]     = useState([]);
  const [byIssue, setByIssue]     = useState([]);
  const [response, setResponse]   = useState([]);
  const [agents, setAgents]       = useState([]);
  const [actions, setActions]     = useState([]);
  const [templates, setTemplates] = useState([]);
  const [sla, setSla]             = useState(null);

  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded]   = useState(null);   // issue category drill-down

  const usingCustom = !!(custom.from && custom.to);

  // Single filter object shared by every request and the export
  const params = useMemo(() => {
    const p = usingCustom ? { from: custom.from, to: custom.to } : { days: range };
    if (brand !== 'all') p.brand = brand;
    if (isAdmin && agent !== 'all') p.agent = agent;
    return p;
  }, [usingCustom, custom.from, custom.to, range, brand, agent, isAdmin]);

  const paramsKey = JSON.stringify(params);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = JSON.parse(paramsKey);
      const [ov, vol, br, iss, resp, slaD, act, ag, tpl] = await Promise.all([
        fetchAnalyticsOverview(p), fetchAnalyticsVolume(p), fetchAnalyticsByBrand(p),
        fetchAnalyticsByIssue(p), fetchAnalyticsResponse(p), fetchAnalyticsSla(p),
        fetchAnalyticsActions(p), fetchAnalyticsAgents(p), fetchAnalyticsTemplates(),
      ]);
      setOverview(ov.data);
      setVolume(vol.data || []);
      setByBrand(br.data || []);
      setByIssue(iss.data || []);
      setResponse(resp.data || []);
      setSla(slaD.data);
      setActions(act.data || []);
      setAgents(ag.data || []);
      setTemplates(tpl.data || []);
    } catch (err) {
      console.error('Analytics load error:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [paramsKey]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await downloadAnalyticsExport(JSON.parse(paramsKey));
      const disposition = res.headers['content-disposition'] || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = match?.[1] || 'BrandDesk-analytics.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const periodLabel = usingCustom
    ? `${custom.from} → ${custom.to}`
    : (range === 1 ? 'Today' : `Last ${range} days`);

  const selectRange = (v) => { setRange(v); setCustom({ from: '', to: '' }); };

  const setCustomFrom = (v) => setCustom(c => ({ from: v, to: c.to || toDateStr(new Date()) }));
  const setCustomTo   = (v) => setCustom(c => ({ from: c.from || v, to: v }));

  return (
    <div className={styles.root} style={{ left: sidebarWidth || 0 }}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Insights</h1>
          <span className={styles.periodLabel}>{periodLabel}</span>
        </div>
        <div className={styles.headerRight}>
          {isAdmin && (
            <button className={styles.exportBtn} onClick={handleExport} disabled={exporting || loading}
              title="Download this view as an Excel workbook">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              {exporting ? 'Preparing…' : 'Export Excel'}
            </button>
          )}
          <button className={styles.closeBtn} onClick={onClose} title="Back to inbox (Esc)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
            Close
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className={styles.filterBar}>
        <div className={styles.rangeToggle}>
          {RANGE_OPTIONS.map(o => (
            <button key={o.value}
              className={`${styles.rangeBtn} ${!usingCustom && range === o.value ? styles.rangeBtnActive : ''}`}
              onClick={() => selectRange(o.value)}
            >{o.label}</button>
          ))}
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>From</label>
          <input type="date" className={styles.dateInput} value={custom.from}
            max={custom.to || undefined}
            onChange={e => setCustomFrom(e.target.value)} />
          <label className={styles.filterLabel}>To</label>
          <input type="date" className={styles.dateInput} value={custom.to}
            min={custom.from || undefined}
            onChange={e => setCustomTo(e.target.value)} />
          {usingCustom && (
            <button className={styles.clearBtn} onClick={() => setCustom({ from: '', to: '' })} title="Back to preset ranges">✕</button>
          )}
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Brand</label>
          <select className={styles.filterSelect} value={brand} onChange={e => setBrand(e.target.value)}>
            <option value="all">All brands</option>
            {brands.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
          </select>
        </div>

        {isAdmin && (
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Agent</label>
            <select className={styles.filterSelect} value={agent} onChange={e => setAgent(e.target.value)}>
              <option value="all">All agents</option>
              {agents.filter(a => a.user_id !== 'null').map(a => (
                <option key={a.user_id} value={a.user_id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Loading analytics…</span>
        </div>
      ) : error ? (
        <div className={styles.loadingState}>
          <span style={{ color: 'var(--red)' }}>Failed to load: {error}</span>
          <button onClick={load} style={{ marginTop: 8, fontSize: 13, color: 'var(--accent)', cursor: 'pointer' }}>Retry</button>
        </div>
      ) : (
        <div className={styles.body}>

          {/* Headline metrics — activity is range-scoped, backlog is right now */}
          <div className={styles.cardGrid}>
            <StatCard label="New tickets" value={overview?.range_new} color="purple"
              delta={delta(overview?.range_new, overview?.prev_new)} />
            <StatCard label="Resolved" value={overview?.range_resolved} color="green"
              delta={delta(overview?.range_resolved, overview?.prev_resolved)} />
            <StatCard label="Avg first response" value={formatMins(overview?.range_avg_response_mins)} color="blue" isText
              delta={delta(overview?.range_avg_response_mins, overview?.prev_avg_response_mins)} lowerIsBetter />
            <StatCard label="Avg resolution" value={formatMins(overview?.avg_resolution_mins)} color="blue" isText
              sub={`median ${formatMins(overview?.median_resolution_mins)}`} />
            <StatCard label="SLA compliance"
              value={overview?.sla_compliance_pct === null ? '—' : `${overview?.sla_compliance_pct}%`}
              color={overview?.sla_compliance_pct >= 90 ? 'green' : overview?.sla_compliance_pct >= 70 ? 'amber' : 'red'}
              isText sub={`${overview?.sla_within}/${overview?.sla_measured} in 4 business hrs`} />
            <StatCard label="Open now" value={overview?.open} color="amber"
              sub={`${overview?.urgent || 0} urgent · ${overview?.in_progress || 0} in progress`} />
          </div>

          {/* SLA banner */}
          {sla && (
            <div className={`${styles.slaBanner} ${sla.breach > 0 ? styles.slaBannerAlert : ''}`}>
              <div className={styles.slaLeft}>
                <span className={styles.slaBannerTitle}>SLA Status · live backlog</span>
                <span className={styles.slaSub}>{sla.sla_description}</span>
              </div>
              <div className={styles.slaStats}>
                <div className={styles.slaStat}>
                  <span className={`${styles.slaNum} ${styles.slaNumGood}`}>{sla.on_track}</span>
                  <span className={styles.slaLabel}>On track</span>
                </div>
                <div className={styles.slaDivider} />
                <div className={styles.slaStat}>
                  <span className={`${styles.slaNum} ${styles.slaNumWarn}`}>{sla.at_risk}</span>
                  <span className={styles.slaLabel}>At risk</span>
                </div>
                <div className={styles.slaDivider} />
                <div className={styles.slaStat}>
                  <span className={`${styles.slaNum} ${styles.slaNumBad}`}>{sla.breach}</span>
                  <span className={styles.slaLabel}>Breached</span>
                </div>
              </div>
            </div>
          )}

          <div className={styles.twoCol}>
            <Panel title="Ticket volume" sub={periodLabel}>
              {volume.filter(d => d.total > 0).length === 0 ? (
                <Empty text="No ticket data for this period" />
              ) : (
                <BarChart data={volume} bars={[
                  { key: 'total',    label: 'Total',    cls: styles.barTotal },
                  { key: 'resolved', label: 'Resolved', cls: styles.barResolved },
                ]} />
              )}
            </Panel>

            <Panel title="Avg first response time" sub="minutes to first reply">
              {response.filter(d => d.avg_mins > 0).length === 0 ? (
                <Empty text="No response time data yet — send some replies first" />
              ) : (
                <LineChart data={response} yKey="avg_mins" formatY={formatMins} />
              )}
            </Panel>
          </div>

          <div className={styles.twoCol}>
            <Panel title="Backlog aging" sub="unresolved tickets by age">
              {!overview?.backlog_aging || Object.values(overview.backlog_aging).every(v => !v) ? (
                <Empty text="✓ No unresolved tickets" isGood />
              ) : (
                <HBarChart
                  data={[
                    { label: 'Under 1 day', total: overview.backlog_aging.under_1d },
                    { label: '1 – 3 days',  total: overview.backlog_aging.d1_3 },
                    { label: '3 – 7 days',  total: overview.backlog_aging.d3_7 },
                    { label: 'Over 7 days', total: overview.backlog_aging.over_7d },
                  ]}
                  labelKey="label" valueKey="total"
                />
              )}
            </Panel>

            <Panel title="Actions" sub="exchanges, returns and refunds opened in period">
              {actions.length === 0 ? <Empty text="No actions logged in this period" /> : (
                <table className={styles.table}>
                  <thead><tr><th>Type</th><th>Total</th><th>Open</th><th>Closed</th><th>Avg close</th></tr></thead>
                  <tbody>
                    {actions.map(a => (
                      <tr key={a.action_type}>
                        <td>{ACTION_LABELS[a.action_type] || a.action_type}</td>
                        <td><strong>{a.total}</strong></td>
                        <td>{a.open > 0 ? <span className={`${styles.badge} ${styles.badgeWarn}`}>{a.open}</span> : '—'}</td>
                        <td><span className={`${styles.badge} ${styles.badgeGood}`}>{a.closed}</span></td>
                        <td className={styles.muted}>{a.avg_days_to_close === null ? '—' : `${a.avg_days_to_close}d`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>

          <div className={styles.twoCol}>
            <Panel title="By brand" sub={periodLabel}>
              {byBrand.length === 0 ? <Empty text="No brand data" /> : (
                <table className={styles.table}>
                  <thead><tr>
                    <th>Brand</th><th>Total</th><th>Open</th><th>Resolved</th><th>Urgent</th><th>Avg response</th>
                  </tr></thead>
                  <tbody>
                    {byBrand.map(b => (
                      <tr key={b.brand}>
                        <td className={styles.brandCell}>{b.brand}</td>
                        <td><strong>{b.total}</strong></td>
                        <td><span className={`${styles.badge} ${styles.badgeWarn}`}>{b.open}</span></td>
                        <td><span className={`${styles.badge} ${styles.badgeGood}`}>{b.resolved}</span></td>
                        <td>{b.urgent > 0 ? <span className={`${styles.badge} ${styles.badgeBad}`}>{b.urgent}</span> : '—'}</td>
                        <td className={styles.muted}>{formatMins(b.avg_response_mins)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel title="Issue categories" sub="click a row to see sub-issues">
              {byIssue.length === 0 ? (
                <Empty text="No issue data for this period" />
              ) : (
                <div className={styles.issueList}>
                  {byIssue.slice(0, 10).map(cat => {
                    const max = Math.max(...byIssue.map(c => c.total), 1);
                    const isOpen = expanded === cat.issue;
                    return (
                      <div key={cat.issue}>
                        <button className={styles.issueRow}
                          onClick={() => setExpanded(isOpen ? null : cat.issue)}
                          aria-expanded={isOpen}
                        >
                          <span className={styles.issueChevron} data-open={isOpen}>▸</span>
                          <span className={styles.issueName} title={cat.issue}>{cat.issue}</span>
                          <span className={styles.issueTrack}>
                            <span className={styles.issueFill} style={{ width: `${(cat.total / max) * 100}%` }} />
                            <span className={styles.issueFillResolved} style={{ width: `${(cat.resolved / max) * 100}%` }} />
                          </span>
                          <span className={styles.issueVal}>{cat.total}</span>
                        </button>
                        {isOpen && (
                          <div className={styles.subIssueList}>
                            {cat.sub_issues.map(si => (
                              <div key={si.sub_issue} className={styles.subIssueRow}>
                                <span className={styles.subIssueName} title={si.sub_issue}>{si.sub_issue}</span>
                                <span className={styles.subIssueVal}>{si.total}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className={styles.hBarLegend}>
                    <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.barTotal}`} />Total</span>
                    <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.barResolved}`} />Resolved</span>
                  </div>
                </div>
              )}
            </Panel>
          </div>

          <div className={styles.twoCol}>
            {/* Agent performance — admins compare everyone, agents see themselves */}
            <Panel
              title={isAdmin ? 'Agent performance' : 'Your numbers'}
              sub={periodLabel}
              note="Reply, note and action figures only cover activity recorded since agent tracking was enabled."
            >
              {agents.length === 0 ? <Empty text="No agent activity in this period" /> : (
                <table className={styles.table}>
                  <thead><tr>
                    <th>Agent</th><th>Resolved</th><th>Replies</th><th>Notes</th><th>Actions</th><th>Avg response</th>
                  </tr></thead>
                  <tbody>
                    {agents.map(a => (
                      <tr key={a.user_id} className={a.user_id === user?.id ? styles.rowSelf : ''}>
                        <td>
                          <div className={styles.agentCell}>
                            <div className={styles.agentAvatar}>{a.name?.[0]?.toUpperCase() || '?'}</div>
                            <span>{a.name}</span>
                            {a.user_id === user?.id && <span className={styles.youTag}>you</span>}
                          </div>
                        </td>
                        <td><strong>{a.resolved}</strong></td>
                        <td>{a.replies}</td>
                        <td className={styles.muted}>{a.notes}</td>
                        <td>{a.actions_closed}</td>
                        <td className={styles.muted}>{formatMins(a.avg_response_mins)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel title="SLA breached tickets" sub="business hours: Mon–Sat 10AM–8PM IST">
              {!sla?.breaching_threads?.length ? (
                <Empty text="✓ All open tickets are within SLA" isGood />
              ) : (
                <div className={styles.slaList}>
                  {sla.breaching_threads.map(t => (
                    <div key={t.id} className={styles.slaRow}>
                      <div className={styles.slaRowLeft}>
                        <span className={styles.slaTicketId}>{t.ticket_id || `#${t.id}`}</span>
                        <span className={styles.slaCustomer}>{t.customer_name || t.customer_email}</span>
                        <span className={styles.slaBrand}>{t.brand}</span>
                      </div>
                      <div className={styles.slaRowRight}>
                        <span className={`${styles.slaTime} ${t.pct >= 150 ? styles.slaTimeCritical : styles.slaTimeWarning}`}>
                          {t.sla_label || `${formatMins(t.elapsed_mins)} overdue`}
                        </span>
                        {t.priority === 'urgent' && <span className={styles.urgentTag}>Urgent</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          {templates.length > 0 && (
            <Panel title="Most used templates" sub="all time">
              <HBarChart data={templates} labelKey="title" valueKey="usage_count" />
            </Panel>
          )}

        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function Panel({ title, sub, note, children }) {
  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <span className={styles.chartTitle}>{title}</span>
        {sub && <span className={styles.chartSub}>{sub}</span>}
      </div>
      {children}
      {note && <p className={styles.chartNote}>{note}</p>}
    </div>
  );
}

function Empty({ text, isGood }) {
  return <div className={`${styles.emptyChart} ${isGood ? styles.emptyGood : ''}`}>{text}</div>;
}

function StatCard({ label, value, color, isText, delta: d, sub, lowerIsBetter }) {
  // For durations a drop is an improvement, so the arrow direction and the
  // good/bad colour have to be decided separately.
  const good = d && d.dir !== 'flat' && (lowerIsBetter ? d.dir === 'down' : d.dir === 'up');

  return (
    <div className={`${styles.statCard} ${styles[`stat_${color}`] || ''}`}>
      <div className={styles.statLabel}>{label}</div>
      <div className={`${styles.statValue} ${isText ? styles.statValueText : ''}`}>
        {value ?? '—'}
      </div>
      <div className={styles.statFoot}>
        {d ? (
          d.dir === 'flat'
            ? <span className={styles.deltaFlat}>no change</span>
            : <span className={`${styles.delta} ${good ? styles.deltaGood : styles.deltaBad}`}>
                {d.dir === 'up' ? '▲' : '▼'} {d.pct}%
              </span>
        ) : <span className={styles.deltaFlat}>{sub || 'vs prev —'}</span>}
        {d && sub && <span className={styles.statSub}>{sub}</span>}
      </div>
    </div>
  );
}

function BarChart({ data, bars }) {
  const maxVal = Math.max(...data.map(d => Math.max(...bars.map(b => Number(d[b.key]) || 0))), 1);
  // Cap the bar count so a 90-day range stays legible
  const display = data.length > 60 ? data.slice(-60) : data;

  return (
    <div className={styles.barChart}>
      <div className={styles.barChartBars}>
        {display.map((d, i) => (
          <div key={i} className={styles.barGroup}
            title={`${d.label || d.date}: ${bars.map(b => `${b.label} ${d[b.key] || 0}`).join(', ')}`}>
            {bars.map(b => (
              <div key={b.key} className={`${styles.barItem} ${b.cls}`}
                style={{ height: `${Math.max(2, ((Number(d[b.key]) || 0) / maxVal) * 100)}%` }} />
            ))}
          </div>
        ))}
      </div>
      <div className={styles.barLegend}>
        {bars.map(b => (
          <span key={b.key} className={styles.legendItem}>
            <span className={`${styles.legendDot} ${b.cls}`} />{b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LineChart({ data, yKey, formatY }) {
  if (!data.length) return null;
  const vals = data.map(d => Number(d[yKey]) || 0);
  const maxVal = Math.max(...vals, 1);
  const w = 100 / Math.max(data.length - 1, 1);
  const y = (v) => 100 - ((Number(v) || 0) / maxVal) * 85;
  const points = data.map((d, i) => `${i * w},${y(d[yKey])}`).join(' ');

  return (
    <div className={styles.lineChart}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.lineSvg}>
        <polyline points={points} fill="none" className={styles.lineStroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => (
          <circle key={i} cx={i * w} cy={y(d[yKey])} r="1.5" className={styles.lineDot} vectorEffect="non-scaling-stroke">
            <title>{d.label || d.date}: {formatY ? formatY(d[yKey]) : d[yKey]}</title>
          </circle>
        ))}
      </svg>
      <div className={styles.lineRange}>
        <span>{formatY ? formatY(maxVal) : maxVal}</span>
        <span>{formatY ? formatY(Math.round(maxVal / 2)) : Math.round(maxVal / 2)}</span>
        <span>0</span>
      </div>
    </div>
  );
}

function HBarChart({ data, labelKey, valueKey, resolvedKey }) {
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
  return (
    <div className={styles.hBarChart}>
      {data.map((d, i) => (
        <div key={i} className={styles.hBarRow}>
          <div className={styles.hBarLabel} title={d[labelKey]}>{d[labelKey]}</div>
          <div className={styles.hBarTrack}>
            <div className={styles.hBarFill} style={{ width: `${((Number(d[valueKey]) || 0) / max) * 100}%` }} />
            {resolvedKey && (
              <div className={styles.hBarResolved} style={{ width: `${((Number(d[resolvedKey]) || 0) / max) * 100}%` }} />
            )}
          </div>
          <div className={styles.hBarVal}>{d[valueKey]}</div>
        </div>
      ))}
    </div>
  );
}
