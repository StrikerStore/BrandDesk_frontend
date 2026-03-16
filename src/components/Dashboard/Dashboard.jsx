import { useState, useEffect, useCallback } from 'react';
import {
  fetchAnalyticsOverview, fetchAnalyticsVolume, fetchAnalyticsByBrand,
  fetchAnalyticsByIssue, fetchAnalyticsResponse, fetchAnalyticsResolvedBy,
  fetchAnalyticsSla, fetchAnalyticsTemplates,
} from '../../utils/api.js';
import styles from './Dashboard.module.css';

const RANGE_OPTIONS = [
  { label: 'Today', value: 1  },
  { label: '7 days',  value: 7  },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

function formatMins(mins) {
  if (!mins && mins !== 0) return '—';
  mins = Number(mins);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function Dashboard({ onClose, sidebarWidth }) {
  const [range, setRange]           = useState(30);
  const [overview, setOverview]     = useState(null);
  const [volume, setVolume]         = useState([]);
  const [byBrand, setByBrand]       = useState([]);
  const [byIssue, setByIssue]       = useState([]);
  const [responseTime, setResponse] = useState([]);
  const [resolvedBy, setResolvedBy] = useState([]);
  const [sla, setSla]               = useState(null);
  const [templates, setTemplates]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, vol, brand, issue, resp, resBy, slaData, tplData] = await Promise.all([
        fetchAnalyticsOverview(),
        fetchAnalyticsVolume(range),
        fetchAnalyticsByBrand(),
        fetchAnalyticsByIssue(),
        fetchAnalyticsResponse(range),
        fetchAnalyticsResolvedBy(),
        fetchAnalyticsSla(),
        fetchAnalyticsTemplates(),
      ]);
      setOverview(ov.data);
      setVolume(vol.data || []);
      setByBrand(brand.data || []);
      setByIssue(issue.data || []);
      setResponse(resp.data || []);
      setResolvedBy(resBy.data || []);
      setSla(slaData.data);
      setTemplates(tplData.data || []);
    } catch (err) {
      console.error('Analytics load error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className={styles.root} style={{ left: sidebarWidth || 0 }}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>Analytics</h1>
          <div className={styles.rangeToggle}>
            {RANGE_OPTIONS.map(o => (
              <button key={o.value}
                className={`${styles.rangeBtn} ${range === o.value ? styles.rangeBtnActive : ''}`}
                onClick={() => setRange(o.value)}
              >{o.label}</button>
            ))}
          </div>
        </div>
        <button className={styles.closeBtn} onClick={onClose} title="Back to inbox (Esc)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
          Close
        </button>
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

          {/* Overview cards */}
          <div className={styles.cardGrid}>
            <StatCard label="Open"             value={overview?.open}             color="amber"  />
            <StatCard label="In progress"      value={overview?.in_progress}      color="blue"   />
            <StatCard label="Resolved today"   value={overview?.today_resolved}   color="green"  />
            <StatCard label="New today"        value={overview?.today_new}        color="purple" />
            <StatCard label="Urgent open"      value={overview?.urgent}           color="red"    />
            <StatCard label="Avg first response" value={formatMins(overview?.avg_response_mins)} color="gray" isText />
          </div>

          {/* SLA Banner */}
          {sla && (
            <div className={`${styles.slaBanner} ${sla.breach > 0 ? styles.slaBannerAlert : ''}`}>
              <div className={styles.slaLeft}>
                <span className={styles.slaBannerTitle}>SLA Status</span>
                <span className={styles.slaSub}>
                  {sla.sla_description || 'Business hours: Mon–Sat 10 AM–8 PM IST · 4h during hours · Next day 12 PM outside'}
                </span>
              </div>
              <div className={styles.slaStats}>
                <div className={styles.slaStat}>
                  <span className={styles.slaNum} style={{ color: '#16a34a' }}>{sla.on_track}</span>
                  <span className={styles.slaLabel}>On track</span>
                </div>
                <div className={styles.slaDivider} />
                <div className={styles.slaStat}>
                  <span className={styles.slaNum} style={{ color: '#d97706' }}>{sla.at_risk}</span>
                  <span className={styles.slaLabel}>At risk</span>
                </div>
                <div className={styles.slaDivider} />
                <div className={styles.slaStat}>
                  <span className={styles.slaNum} style={{ color: '#dc2626' }}>{sla.breach}</span>
                  <span className={styles.slaLabel}>Breached</span>
                </div>
              </div>
            </div>
          )}

          <div className={styles.twoCol}>
            {/* Volume chart */}
            <div className={styles.chartCard}>
              <div className={styles.chartHeader}>
                <span className={styles.chartTitle}>Ticket volume</span>
                <span className={styles.chartSub}>Last {range === 1 ? 'today' : `${range} days`}</span>
              </div>
              {volume.filter(d => d.total > 0).length === 0 ? (
                <Empty text="No ticket data for this period" />
              ) : (
                <BarChart data={volume} bars={[
                  { key: 'total',    label: 'Total',    color: '#93c5fd' },
                  { key: 'resolved', label: 'Resolved', color: '#6ee7b7' },
                ]} />
              )}
            </div>

            {/* Response time chart */}
            <div className={styles.chartCard}>
              <div className={styles.chartHeader}>
                <span className={styles.chartTitle}>Avg first response time</span>
                <span className={styles.chartSub}>Minutes to first reply</span>
              </div>
              {responseTime.length === 0 ? (
                <Empty text="No response time data yet — send some replies first" />
              ) : (
                <LineChart data={responseTime} yKey="avg_mins" color="#a78bfa" formatY={formatMins} />
              )}
            </div>
          </div>

          <div className={styles.twoCol}>
            {/* By brand */}
            <div className={styles.chartCard}>
              <div className={styles.chartHeader}>
                <span className={styles.chartTitle}>By brand</span>
              </div>
              {byBrand.length === 0 ? <Empty text="No brand data" /> : (
                <table className={styles.table}>
                  <thead><tr>
                    <th>Brand</th><th>Total</th><th>Open</th>
                    <th>Resolved</th><th>Urgent</th><th>Avg response</th>
                  </tr></thead>
                  <tbody>
                    {byBrand.map(b => (
                      <tr key={b.brand}>
                        <td className={styles.brandCell}>{b.brand}</td>
                        <td><strong>{b.total}</strong></td>
                        <td><span className={styles.badge} style={{ background:'#fffbeb', color:'#92400e' }}>{b.open}</span></td>
                        <td><span className={styles.badge} style={{ background:'#f0fdf4', color:'#14532d' }}>{b.resolved}</span></td>
                        <td>{b.urgent > 0 ? <span className={styles.badge} style={{ background:'#fef2f2', color:'#7f1d1d' }}>{b.urgent}</span> : '—'}</td>
                        <td className={styles.muted}>{formatMins(b.avg_response_mins)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* By issue */}
            <div className={styles.chartCard}>
              <div className={styles.chartHeader}>
                <span className={styles.chartTitle}>Top issue categories</span>
              </div>
              {byIssue.length === 0 ? (
                <Empty text="No issue data yet — issue categories come from parsed Shopify tickets" />
              ) : (
                <HBarChart data={byIssue} labelKey="issue" valueKey="total" resolvedKey="resolved" />
              )}
            </div>
          </div>

          <div className={styles.twoCol}>
            {/* Resolved by leaderboard */}
            <div className={styles.chartCard}>
              <div className={styles.chartHeader}>
                <span className={styles.chartTitle}>Resolved by</span>
                <span className={styles.chartSub}>All time</span>
              </div>
              {resolvedBy.length === 0 ? (
                <Empty text="No resolved tickets yet — resolve some tickets to see the leaderboard" />
              ) : (
                <table className={styles.table}>
                  <thead><tr><th>Agent</th><th>Resolved</th><th>Avg response</th></tr></thead>
                  <tbody>
                    {resolvedBy.map(r => (
                      <tr key={r.resolved_by}>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div className={styles.agentAvatar}>{r.resolved_by[0]?.toUpperCase()}</div>
                            {r.resolved_by}
                          </div>
                        </td>
                        <td><strong>{r.total}</strong></td>
                        <td className={styles.muted}>{formatMins(r.avg_response_mins)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* SLA breaching tickets */}
            <div className={styles.chartCard}>
              <div className={styles.chartHeader}>
                <span className={styles.chartTitle}>SLA breached tickets</span>
                <span className={styles.chartSub}>Business hours: Mon–Sat 10AM–8PM IST</span>
              </div>
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
            </div>
          </div>

          {/* Template usage */}
          <div className={styles.twoCol}>
            <div className={styles.chartCard}>
              <div className={styles.chartHeader}>
                <span className={styles.chartTitle}>Most used templates</span>
                <span className={styles.chartSub}>All time</span>
              </div>
              {templates.length === 0 ? (
                <Empty text="No template usage yet — use templates when replying to tickets" />
              ) : (
                <table className={styles.table}>
                  <thead><tr><th>Template</th><th>Category</th><th>Used</th></tr></thead>
                  <tbody>
                    {templates.map(t => (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 500 }}>{t.title}</td>
                        <td className={styles.muted}>{t.category}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              height: 6, borderRadius: 99,
                              background: '#93c5fd',
                              width: `${Math.max(12, (t.usage_count / templates[0].usage_count) * 80)}px`
                            }} />
                            <strong>{t.usage_count}</strong>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Placeholder for future chart */}
            <div className={styles.chartCard}>
              <div className={styles.chartHeader}>
                <span className={styles.chartTitle}>Quick stats</span>
              </div>
              <div className={styles.quickStats}>
                <div className={styles.quickStat}>
                  <span className={styles.quickStatVal}>{overview?.total || 0}</span>
                  <span className={styles.quickStatLabel}>Total tickets all time</span>
                </div>
                <div className={styles.quickStatDivider} />
                <div className={styles.quickStat}>
                  <span className={styles.quickStatVal}>
                    {overview?.total > 0 ? Math.round((overview.resolved / overview.total) * 100) : 0}%
                  </span>
                  <span className={styles.quickStatLabel}>Resolution rate</span>
                </div>
                <div className={styles.quickStatDivider} />
                <div className={styles.quickStat}>
                  <span className={styles.quickStatVal}>{templates.reduce((a, t) => a + t.usage_count, 0)}</span>
                  <span className={styles.quickStatLabel}>Total template uses</span>
                </div>
                <div className={styles.quickStatDivider} />
                <div className={styles.quickStat}>
                  <span className={styles.quickStatVal}>{resolvedBy.length}</span>
                  <span className={styles.quickStatLabel}>Active agents</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function Empty({ text, isGood }) {
  return (
    <div className={styles.emptyChart} style={{ color: isGood ? '#16a34a' : undefined }}>
      {text}
    </div>
  );
}

function StatCard({ label, value, color, isText }) {
  const colors = {
    amber:  { bg: '#fffbeb', text: '#92400e', border: '#fcd34d' },
    blue:   { bg: '#eff6ff', text: '#1e3a8a', border: '#93c5fd' },
    green:  { bg: '#f0fdf4', text: '#14532d', border: '#86efac' },
    red:    { bg: '#fef2f2', text: '#7f1d1d', border: '#fca5a5' },
    purple: { bg: '#f5f3ff', text: '#3b0764', border: '#c4b5fd' },
    gray:   { bg: '#f9fafb', text: '#374151', border: '#e5e7eb' },
  };
  const c = colors[color] || colors.gray;
  return (
    <div className={styles.statCard} style={{ background: c.bg, borderColor: c.border }}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue} style={{ color: c.text, fontSize: isText ? 20 : 28 }}>
        {value ?? '—'}
      </div>
    </div>
  );
}

function BarChart({ data, bars }) {
  const maxVal = Math.max(...data.map(d => Math.max(...bars.map(b => Number(d[b.key]) || 0))), 1);
  // Show max 60 bars to avoid clutter
  const display = data.length > 60 ? data.slice(-60) : data;

  return (
    <div className={styles.barChart}>
      <div className={styles.barChartBars}>
        {display.map((d, i) => (
          <div key={i} className={styles.barGroup}
            title={`${d.label || d.date}: ${bars.map(b => `${b.label} ${d[b.key]||0}`).join(', ')}`}>
            {bars.map(b => (
              <div key={b.key} className={styles.barItem}
                style={{ height: `${Math.max(2, ((Number(d[b.key])||0) / maxVal) * 100)}%`, background: b.color }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className={styles.barLegend}>
        {bars.map(b => (
          <span key={b.key} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: b.color }} />{b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LineChart({ data, yKey, color, formatY }) {
  if (!data.length) return null;
  const vals  = data.map(d => Number(d[yKey]) || 0);
  const maxVal = Math.max(...vals, 1);
  const w = 100 / Math.max(data.length - 1, 1);

  const points = data.map((d, i) => `${i * w},${100 - ((Number(d[yKey])||0) / maxVal) * 85}`).join(' ');

  return (
    <div className={styles.lineChart}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.lineSvg}>
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => (
          <circle key={i} cx={i * w} cy={100 - ((Number(d[yKey])||0) / maxVal) * 85}
            r="1.5" fill={color} vectorEffect="non-scaling-stroke">
            <title>{d.date}: {formatY ? formatY(d[yKey]) : d[yKey]}</title>
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
            <div className={styles.hBarFill} style={{ width: `${((Number(d[valueKey])||0) / max) * 100}%` }} />
            <div className={styles.hBarResolved} style={{ width: `${((Number(d[resolvedKey])||0) / max) * 100}%` }} />
          </div>
          <div className={styles.hBarVal}>{d[valueKey]}</div>
        </div>
      ))}
      <div className={styles.hBarLegend}>
        <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#93c5fd' }} />Total</span>
        <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: '#6ee7b7' }} />Resolved</span>
      </div>
    </div>
  );
}