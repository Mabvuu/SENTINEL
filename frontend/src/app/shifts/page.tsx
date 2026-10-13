'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { dashboardRequest } from '../../lib/dashboard-client';
import '../clients/clients.css';
import './shifts.css';

type Page<T> = { results: T[]; next: string | null; previous: string | null; count: number };
type Guard = {
  id: number; username: string; first_name: string; last_name: string;
  is_active: boolean;
};
type Site = { id: number; name: string; client_name: string; is_active: boolean };
type Shift = {
  id: number; guard_name: string; site_name: string; client_name: string;
  starts_at: string; ends_at: string; status: string; notes: string;
};

const blank = { guard: '', site: '', starts_at: '', ends_at: '', notes: '' };

function describe(error: unknown) {
  return error instanceof Error ? error.message : 'Request failed.';
}

async function all<T>(endpoint: string): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;
  while (true) {
    const result = await dashboardRequest<Page<T>>(endpoint + '?page=' + page);
    rows.push(...result.results);
    if (result.next === null) return rows;
    page += 1;
  }
}

function when(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    timeZone: 'Africa/Harare',
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  }) + ' CAT';
}

export default function ShiftsPage() {
  const [data, setData] = useState<Page<Shift> | null>(null);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [draft, setDraft] = useState(blank);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [choicesLoading, setChoicesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [selected, setSelected] = useState<Shift | null>(null);
  const editor = useRef<HTMLDialogElement>(null);
  const detail = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), search });
    dashboardRequest<Page<Shift>>('/api/management/assignments?' + params)
      .then(result => { if (active) setData(result); })
      .catch(cause => { if (active) { setData(null); setError(describe(cause)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, search, revision]);

  useEffect(() => {
    if (selected) detail.current?.showModal();
  }, [selected]);

  async function loadChoices() {
    setChoicesLoading(true);
    setFormError('');
    try {
      const [people, places] = await Promise.all([
        all<Guard>('/api/management/guards'),
        all<Site>('/api/management/sites'),
      ]);
      setGuards(people.filter(item => item.is_active));
      setSites(places.filter(item => item.is_active));
    } catch (cause) {
      setFormError(describe(cause));
    } finally {
      setChoicesLoading(false);
    }
  }

  function open() {
    setDraft({ ...blank });
    setSuccess('');
    editor.current?.showModal();
    void loadChoices();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    setFormError('');

    // Form times are explicitly Harare / CAT (UTC+02:00).
    const start = new Date(draft.starts_at + ':00+02:00');
    const end = new Date(draft.ends_at + ':00+02:00');
    if (
      Number.isFinite(start.getTime()) === false ||
      Number.isFinite(end.getTime()) === false ||
      end <= start
    ) {
      setFormError('Enter valid times. End must be after start.');
      return;
    }

    saving.current = true;
    setBusy(true);
    try {
      await dashboardRequest<Shift>('/api/management/assignments', 'POST', {
        guard: Number(draft.guard),
        site: Number(draft.site),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        notes: draft.notes.trim(),
      });
      editor.current?.close();
      setSuccess('Guard assigned. This shift is now available to their phone account.');
      setPage(1);
      setRevision(value => value + 1);
    } catch (cause) {
      setFormError(describe(cause));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="clients-page roster-page">
      <header className="clients-header">
        <div>
          <p className="clients-brand">SENTINEL</p>
          <h1>Shift roster</h1>
          <p>Assign guards to sites and working hours.</p>
        </div>
        <button type="button" onClick={open}>Assign guard</button>
      </header>

      {error && <p className="clients-error" role="alert">{error}</p>}
      {success && <p className="clients-success" role="status">{success}</p>}

      <section className="clients-panel">
        <form className="clients-search" onSubmit={event => {
          event.preventDefault(); setPage(1); setSearch(query.trim());
        }}>
          <input aria-label="Search shifts" placeholder="Guard, site or client"
            value={query} onChange={event => setQuery(event.target.value)} />
          <button>Search</button>
          <button type="button" className="secondary"
            onClick={() => setRevision(value => value + 1)}>Refresh</button>
        </form>

        {loading ? <p role="status">Loading shifts…</p> : (
          <div className="roster-list">
            {data?.results.length === 0 && <p>No assignments yet. Select Assign guard.</p>}
            {data?.results.map(shift => (
              <button className="roster-row" type="button" key={shift.id}
                onClick={() => setSelected(shift)}>
                <span>{shift.guard_name}<small>{shift.site_name}</small></span>
                <span>{when(shift.starts_at)}<small>{shift.status}</small></span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        )}

        <div className="clients-actions roster-pagination">
          <button disabled={loading || Boolean(data?.previous) === false}
            onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button>
          <span>Page {page}</span>
          <button disabled={loading || Boolean(data?.next) === false}
            onClick={() => setPage(value => value + 1)}>Next</button>
        </div>
      </section>

      <dialog ref={editor} className="roster-dialog" aria-label="Assign guard"
        onCancel={event => { if (busy) event.preventDefault(); }}>
        <button type="button" className="secondary roster-close"
          disabled={busy} onClick={() => editor.current?.close()}>Close</button>
        <h2>Assign guard</h2>
        <p>All shift times use Harare time (CAT).</p>
        {formError && <p className="clients-error" role="alert">{formError}</p>}
        {choicesLoading && <p role="status">Loading guards and sites…</p>}
        <button type="button" className="secondary"
          disabled={choicesLoading || busy} onClick={() => void loadChoices()}>
          Refresh choices
        </button>
        <form onSubmit={save}>
          <fieldset disabled={busy || choicesLoading}>
            <label>Guard
              <select required value={draft.guard}
                onChange={event => setDraft({ ...draft, guard: event.target.value })}>
                <option value="">Select guard</option>
                {guards.map(guard => (
                  <option key={guard.id} value={guard.id}>
                    {[guard.first_name, guard.last_name].filter(Boolean).join(' ') || guard.username}
                  </option>
                ))}
              </select>
            </label>
            <label>Site
              <select required value={draft.site}
                onChange={event => setDraft({ ...draft, site: event.target.value })}>
                <option value="">Select site</option>
                {sites.map(site => (
                  <option key={site.id} value={site.id}>
                    {site.name} — {site.client_name}
                  </option>
                ))}
              </select>
            </label>
            <label>Shift starts (CAT)
              <input required type="datetime-local" value={draft.starts_at}
                onChange={event => setDraft({ ...draft, starts_at: event.target.value })} />
            </label>
            <label>Shift ends (CAT)
              <input required type="datetime-local" value={draft.ends_at}
                onChange={event => setDraft({ ...draft, ends_at: event.target.value })} />
            </label>
            <label className="roster-wide">Instructions
              <textarea rows={3} maxLength={4000} value={draft.notes}
                onChange={event => setDraft({ ...draft, notes: event.target.value })} />
            </label>
            <div className="clients-actions">
              <button disabled={guards.length === 0 || sites.length === 0}>
                {busy ? 'Saving…' : 'Save assignment'}
              </button>
            </div>
          </fieldset>
        </form>
      </dialog>

      <dialog ref={detail} className="roster-dialog" aria-label="Shift details"
        onClose={() => setSelected(null)}>
        <button type="button" className="secondary roster-close"
          onClick={() => detail.current?.close()}>Close</button>
        {selected && <>
          <h2>{selected.guard_name}</h2>
          <p>Site: {selected.site_name}</p>
          <p>Client: {selected.client_name}</p>
          <p>Starts: {when(selected.starts_at)}</p>
          <p>Ends: {when(selected.ends_at)}</p>
          <p>Status: {selected.status}</p>
          <p>{selected.notes || 'No additional instructions.'}</p>
          <p>Scheduled assignment. Actual attendance is confirmed when the guard clocks in.</p>
        </>}
      </dialog>
    </main>
  );
}
