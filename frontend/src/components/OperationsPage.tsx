'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import './operations-modules.css';
import { dashboardRequest } from '@/lib/modules-client';

type Row = Record<string, string | number | boolean | null> & { id: number };
type Page = { count: number; results: Row[]; next: string | null };
type Choice = { id: number; name?: string; reference?: string };
type Choices = { sites: Choice[]; clients: Choice[]; contracts: Choice[] };
type Kind = 'incident' | 'handover' | 'inspection' | 'attendance' | 'reports' | 'contracts' | 'invoices';
const config: Record<Kind, { title: string; resource: string; add?: string }> = {
  incident: { title: 'Incident register', resource: 'entries', add: 'Report incident' },
  handover: { title: 'Shift handovers', resource: 'entries', add: 'Record handover' },
  inspection: { title: 'Supervisor checks', resource: 'entries', add: 'Record check' },
  attendance: { title: 'Attendance', resource: 'attendance' },
  reports: { title: 'Client reports', resource: 'reports' },
  contracts: { title: 'Contracts', resource: 'contracts', add: 'Add contract' },
  invoices: { title: 'Invoices', resource: 'invoices', add: 'Create invoice' },
};
const labels: Record<string, string> = { site_name: 'Site', client_name: 'Client', guard_name: 'Guard', created_by_name: 'Recorded by', clock_out_gps_verified: 'Clock-out GPS verified', late_minutes: 'Late by (minutes)' };
function label(key: string) { return labels[key] || key.replaceAll('_', ' '); }
function format(key: string, value: Row[string]) {
  if (value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (key.endsWith('_at')) return new Date(String(value)).toLocaleString('en-GB', { timeZone: 'Africa/Harare' }) + ' CAT';
  return key === 'status' ? String(value).replaceAll('_', ' ') : String(value);
}
function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export default function OperationsPage({ kind }: { kind: Kind }) {
  const cfg = config[kind];
  const isEntry = cfg.resource === 'entries';
  const readOnly = kind === 'attendance' || kind === 'reports';
  const [data, setData] = useState<Page | null>(null);
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const details = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const query = new URLSearchParams({ search, ...(isEntry ? { kind } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  const endpoint = `/api/console/${cfg.resource}`;

  useEffect(() => {
    let alive = true;
    // This effect synchronizes visible request state with a new query.
    setLoading(true);
    setError('');
    dashboardRequest<Page>(`${endpoint}?${query}&page=${page}`).then(result => {
      if (alive) setData(result);
    }).catch(err => { if (alive) { setData(null); setError(err.message); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [endpoint, query, page, revision]);

  async function openForm() {
    setFormError(''); setChoices(null); dialog.current?.showModal();
    try { setChoices(await dashboardRequest<Choices>('/api/console/choices')); }
    catch (err) { setFormError(err instanceof Error ? err.message : 'Could not load choices.'); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); setFormError('');
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    if (isEntry) body.kind = kind;
    try {
      await dashboardRequest(endpoint, 'POST', body);
      dialog.current?.close(); form.reset(); setPage(1); setRevision(x => x + 1);
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Save failed.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function transition() {
    if (!selected || lock.current) return;
    lock.current = true; setBusy(true); setFormError('');
    try {
      await dashboardRequest(`${endpoint}?id=${selected.id}`, 'PATCH', { status: isEntry ? 'resolved' : 'paid' });
      details.current?.close(); setSelected(null); setRevision(x => x + 1);
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Update failed.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function exportCSV() {
    setBusy(true); setError('');
    try {
      const rows: Row[] = [];
      let number = 1;
      while (true) {
        const result = await dashboardRequest<Page>(`${endpoint}?${query}&page=${number}`);
        rows.push(...result.results);
        if (!result.next) break;
        number += 1;
      }
      if (!rows.length) throw new Error('No records to export for these filters.');
      const keys = Object.keys(rows[0]);
      const csv = [keys.map(csvCell).join(','), ...rows.map(row => keys.map(key => csvCell(row[key])).join(','))].join('\r\n');
      const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = `sentinel-${kind}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err instanceof Error ? err.message : 'Export failed.'); }
    finally { setBusy(false); }
  }
  function select(name: keyof Choices, field: string, title: string) {
    return <label>{title}<select name={field} required defaultValue=""><option value="" disabled>Select {title.toLowerCase()}</option>
      {(choices?.[name] || []).map(item => <option key={item.id} value={item.id}>{item.name || item.reference}</option>)}
    </select>{choices && choices[name].length === 0 && <small>No records available. Add the {title.toLowerCase()} first.</small>}</label>;
  }
  return <main className="ops-page">
    <header className="ops-heading"><div><p className="ops-eyebrow">OPERATIONS</p><h1>{cfg.title}</h1><p>Saved records · Times shown in CAT</p></div>
      {cfg.add && <button onClick={() => void openForm()}>{cfg.add}</button>}
    </header>
    {(kind === 'contracts' || kind === 'invoices') && <div className="ops-tabs"><Link href="/contracts">Contracts</Link><Link href="/billing">Invoices</Link><span>USD · manual payment records</span></div>}
    {error && <p role="alert" className="ops-error">{error} <Link href="/">Sign in</Link></p>}
    <section className="ops-panel">
      <form className="ops-toolbar" onSubmit={e => { e.preventDefault(); setSearch(term); setPage(1); setRevision(x => x + 1); }}>
        <input aria-label="Search records" placeholder="Search records" value={term} onChange={e => setTerm(e.target.value)} />
        {readOnly && <><label>From<input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} /></label><label>To<input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} /></label></>}
        <button>Search</button><button type="button" className="secondary" onClick={() => setRevision(x => x + 1)}>Refresh</button>
        {readOnly && <button type="button" className="secondary" disabled={busy} onClick={() => void exportCSV()}>{busy ? 'Exporting…' : 'Export CSV'}</button>}
      </form>
      {loading ? <p className="ops-empty">Loading records…</p> : data?.results.length === 0 ? <p className="ops-empty">No records match these filters.</p> : data?.results.map(row => <button className="ops-row" key={row.id} onClick={() => { setSelected(row); setFormError(''); details.current?.showModal(); }}>
        <span><strong>{row.title || row.reference || row.guard_name}</strong><small>{row.site_name || row.client_name}</small></span>
        <span><small>{row.status ? format('status', row.status) : format('starts_on', row.starts_on)}</small><span aria-hidden="true"> ›</span></span>
      </button>)}
      <footer className="ops-pagination"><button className="secondary" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page} · {data?.count ?? 0} records</span><button className="secondary" disabled={!data?.next || loading} onClick={() => setPage(p => p + 1)}>Next</button></footer>
    </section>
    <dialog ref={dialog} className="ops-dialog" aria-label={cfg.title} onCancel={e => { if (busy) e.preventDefault(); }}>
      <button type="button" className="ops-close secondary" disabled={busy} onClick={() => dialog.current?.close()}>Close</button><h2>{cfg.add}</h2>
      {formError && <p role="alert" className="ops-error">{formError}</p>}
      {!choices ? <p>{formError ? 'Close and retry to reload choices.' : 'Loading choices…'}</p> : <form onSubmit={save} className="ops-form">
        {isEntry ? <>{select('sites', 'site', 'Site')}<label>Title<input name="title" required maxLength={200} /></label><label>Priority<select name="severity"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></> : <>
          {kind === 'contracts' ? select('clients', 'client', 'Client') : select('contracts', 'contract', 'Contract')}
          <label>Reference<input name="reference" required maxLength={80} /></label>
          {kind === 'contracts' ? <><label>Starts on<input type="date" name="starts_on" required /></label><label>Ends on<input type="date" name="ends_on" required /></label><label>Monthly fee (USD)<input type="number" name="monthly_fee" min="0" step="0.01" required /></label></> : <><label>Amount (USD)<input type="number" name="amount" min="0.01" step="0.01" required /></label><label>Due on<input type="date" name="due_on" required /></label></>}
        </>}
        <label>Notes<textarea name="notes" required={isEntry} maxLength={8000} rows={5} /></label>
        <button disabled={busy}>{busy ? 'Saving…' : 'Save record'}</button>
      </form>}
    </dialog>
    <dialog ref={details} className="ops-dialog" aria-label={cfg.title} onCancel={e => { if (busy) e.preventDefault(); }}>
      <button className="ops-close secondary" disabled={busy} onClick={() => details.current?.close()}>Close</button>
      <h2>{selected?.title || selected?.reference || selected?.guard_name}</h2>
      {formError && <p role="alert" className="ops-error">{formError}</p>}
      {selected && <dl className="ops-details">{Object.entries(selected).filter(([key]) => !['id','site','client','contract','kind'].includes(key)).map(([key,value]) => <div key={key}><dt>{label(key)}</dt><dd>{format(key,value)}</dd></div>)}</dl>}
      {selected && (isEntry ? selected.status === 'open' : kind === 'invoices' && selected.paid_at === null) && <button disabled={busy} onClick={() => { if (window.confirm(isEntry ? 'Mark this record resolved?' : 'Confirm that full payment was received?')) void transition(); }}>{busy ? 'Saving…' : isEntry ? 'Mark resolved' : 'Record full payment received'}</button>}
    </dialog>
  </main>;
}
