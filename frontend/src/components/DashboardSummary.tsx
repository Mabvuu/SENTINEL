'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import './dashboard-summary.css';
import { dashboardRequest } from '@/lib/dashboard-client';

type Summary = { active_sites: number; clocked_in: number; empty_posts: number; open_incidents: number; overdue_usd: string | null; server_time: string; coverage: { id: number; name: string; required: number; clocked_in: number }[] };
export default function DashboardSummary() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const data = await dashboardRequest<Summary>('/api/console/summary');
        if (alive) { setSummary(data); setError(''); }
      } catch (err) { if (alive) { setError(err instanceof Error ? err.message : 'Summary unavailable.'); setSummary(null); } }
      finally { if (alive) timer = setTimeout(() => void load(), 15000); }
    }
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  return <>
    <div className="ops-overview-banner"><div><strong>Operations overview</strong><p>{summary ? `${summary.active_sites} active sites` : error ? 'Summary unavailable' : 'Loading operations'} · Harare, Zimbabwe</p></div><span>{summary ? new Date(summary.server_time).toLocaleTimeString('en-GB', { timeZone: 'Africa/Harare', hour: '2-digit', minute: '2-digit' }) + ' CAT' : '—'}</span></div>
    {error && <p className="ops-error" role="alert">{error}</p>}
    <div className="dashboard-quick-links"><Link href="/guards">Guards</Link><Link href="/clients">Clients</Link><Link href="/sites">Sites</Link><Link href="/shifts">Assign guard</Link><Link href="/patrols">Patrol map</Link><Link href="/incidents">Incidents</Link></div>
    <div className="ops-stat-grid">
      <Link href="/attendance"><span>Guards clocked in</span><strong>{summary?.clocked_in ?? '—'}</strong><small>Attendance, not continuous GPS proof</small></Link>
      <Link href="/shifts"><span>Empty posts</span><strong>{summary?.empty_posts ?? '—'}</strong><small>Required guards minus clocked in</small></Link>
      <Link href="/incidents"><span>Open incidents</span><strong>{summary?.open_incidents ?? '—'}</strong><small>Recorded events awaiting resolution</small></Link>
      {summary?.overdue_usd !== null && <Link href="/billing"><span>Overdue invoices · USD</span><strong>{summary?.overdue_usd !== null && summary?.overdue_usd !== undefined ? '$' + Number(summary.overdue_usd).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</strong><small>Unpaid invoices past due</small></Link>}
    </div>
    <section className="ops-panel"><div className="ops-heading"><div><h2>Site coverage</h2><p>Based on current clock-ins. Check the GPS feed below for location evidence.</p></div><Link href="/sites">All sites →</Link></div>
      <div className="ops-coverage">{summary?.coverage.map(site => <Link key={site.id} href="/shifts"><strong>{site.name}</strong><span>{site.clocked_in} / {site.required} clocked in</span><small>{site.clocked_in >= site.required ? 'Staffing covered' : 'Needs assignment or check-in'}</small><progress value={Math.min(site.clocked_in, site.required)} max={site.required} aria-label={`${site.name} staffing`} /></Link>)}</div>
      {summary?.coverage.length === 0 && <p>No active sites. <Link href="/sites">Add a site</Link> to start.</p>}
    </section>
  </>;
}
