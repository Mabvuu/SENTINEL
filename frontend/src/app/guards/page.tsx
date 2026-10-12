'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { dashboardRequest } from '../../lib/dashboard-client';
import '../clients/clients.css';
import './guards.css';

type Guard = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  employee_number: string;
  national_id: string;
  training_status: string;
  vetting_status: string;
  employment_status: string;
  training_notes: string;
  vetting_notes: string;
  is_active: boolean;
};

type GuardPage = {
  count: number;
  next: string | null;
  previous: string | null;
  results: Guard[];
};

type Draft = {
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  employee_number: string;
  national_id: string;
  training_status: string;
  vetting_status: string;
  employment_status: string;
  training_notes: string;
  vetting_notes: string;
  password: string;
};

const blank: Draft = {
  username: '',
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  employee_number: '',
  national_id: '',
  training_status: 'not_started',
  vetting_status: 'pending',
  employment_status: 'active',
  training_notes: '',
  vetting_notes: '',
  password: '',
};

function getError(error: unknown): string {
  if (error && typeof error === 'object') {
    if ('status' in error) {
      if (error.status === 401) return 'Please sign in again.';
      if (error.status === 403) return 'Administrator access required.';
    }
  }
  return error instanceof Error ? error.message : 'Request failed.';
}

export default function GuardsPage() {
  const [data, setData] = useState<GuardPage | null>(null);
  const [draft, setDraft] = useState<Draft>({ ...blank });
  const [editing, setEditing] = useState<number | null>(null);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const saving = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError('');

    const params = new URLSearchParams({
      page: String(page),
      search,
    });

    dashboardRequest<GuardPage>(
      `/api/management/guards?${params.toString()}`,
      'GET'
    )
      .then(result => {
        if (active) setData(result);
      })
      .catch(err => {
        if (active) {
          setData(null);
          setError(getError(err));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, search, revision]);

  function reset() {
    setEditing(null);
    setDraft({ ...blank });
  }

  function edit(guard: Guard) {
    setEditing(guard.id);

    setDraft({
      username: guard.username,
      first_name: guard.first_name,
      last_name: guard.last_name,
      email: guard.email,
      phone: guard.phone,
      employee_number: guard.employee_number,
      national_id: guard.national_id,
      training_status: guard.training_status,
      vetting_status: guard.vetting_status,
      employment_status: guard.employment_status,
      training_notes: guard.training_notes,
      vetting_notes: guard.vetting_notes,
      password: '',
    });

    setError('');
    setSuccess('');

    formRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving.current) return;

    saving.current = true;
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const payload: Record<string, string> = {
        username: draft.username.trim(),
        first_name: draft.first_name.trim(),
        last_name: draft.last_name.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        employee_number: draft.employee_number.trim(),
        national_id: draft.national_id.trim(),
        training_status: draft.training_status.trim(),
        vetting_status: draft.vetting_status.trim(),
        employment_status: draft.employment_status.trim(),
        training_notes: draft.training_notes.trim(),
        vetting_notes: draft.vetting_notes.trim(),
      };

      if (draft.password) {
        payload.password = draft.password;
      }

      await dashboardRequest<Guard>(
        editing === null
          ? '/api/management/guards'
          : `/api/management/guards?id=${editing}`,
        editing === null ? 'POST' : 'PATCH',
        payload
      );

      setSuccess(
        editing === null
          ? 'Guard registered successfully.'
          : 'Guard updated successfully.'
      );

      reset();
      setPage(1);
      setRevision(value => value + 1);
    } catch (err) {
      setError(getError(err));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function toggle(guard: Guard) {
    if (saving.current) return;

    const action = guard.is_active ? 'Deactivate' : 'Activate';

    if (!window.confirm(`${action} ${guard.username}?`)) return;

    saving.current = true;
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await dashboardRequest<Guard>(
        `/api/management/guards?id=${guard.id}`,
        'PATCH',
        { is_active: !guard.is_active }
      );

      if (editing === guard.id) reset();

      setSuccess(`Guard ${action.toLowerCase()}d successfully.`);
      setRevision(value => value + 1);
    } catch (err) {
      setError(getError(err));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  function find(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchText.trim());
    setRevision(value => value + 1);
  }

  return (
    <main className="clients-page guards-page">
      <header className="clients-header">
        <div>
          <p className="clients-brand">SENTINEL</p>
          <h1>Guard Management</h1>
          <p>Register, manage and monitor security personnel.</p>
        </div>

        <Link href="/">Back to Dashboard</Link>
      </header>

      {error && (
        <div className="clients-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="clients-success" role="status">
          {success}
        </div>
      )}

      <section className="guards-stats">
        <article>
          <span>Total registered guards</span>
          <strong>{data?.count ?? '—'}</strong>
        </article>

        <article>
          <span>Active guards on this page</span>
          <strong>
            {data
              ? data.results.filter(g => g.is_active).length
              : '—'}
          </strong>
        </article>

        <article>
          <span>Inactive guards on this page</span>
          <strong>
            {data
              ? data.results.filter(g => !g.is_active).length
              : '—'}
          </strong>
        </article>
      </section>

      <div className="clients-grid">
        <section className="clients-panel">
          <h2>
            {editing === null ? 'Register Guard' : 'Edit Guard'}
          </h2>

          <form ref={formRef} onSubmit={save}>
            <fieldset disabled={busy}>
              <label>
                Username
                <input
                  required
                  maxLength={150}
                  autoComplete="username"
                  value={draft.username}
                  onChange={e => setDraft({
                    ...draft,
                    username: e.target.value,
                  })}
                />
              </label>

              <label>
                First name
                <input
                  required
                  maxLength={150}
                  value={draft.first_name}
                  onChange={e => setDraft({
                    ...draft,
                    first_name: e.target.value,
                  })}
                />
              </label>

              <label>
                Last name
                <input
                  required
                  maxLength={150}
                  value={draft.last_name}
                  onChange={e => setDraft({
                    ...draft,
                    last_name: e.target.value,
                  })}
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  maxLength={254}
                  value={draft.email}
                  onChange={e => setDraft({
                    ...draft,
                    email: e.target.value,
                  })}
                />
              </label>

              <label>
                Phone number
                <input
                  type="tel"
                  maxLength={30}
                  value={draft.phone}
                  onChange={e => setDraft({
                    ...draft,
                    phone: e.target.value,
                  })}
                />
              </label>


              {([
                ['employee_number', 'Employee number'],
                ['national_id', 'National ID'],
              ] as const).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    value={draft[key]}
                    maxLength={key === 'employee_number' ? 50 : 100}
                    onChange={e => setDraft({
                      ...draft,
                      [key]: e.target.value,
                    })}
                  />
                </label>
              ))}

              {([
                ['training_status', 'Training status', [
                  ['not_started', 'Not started'],
                  ['in_progress', 'In progress'],
                  ['completed', 'Completed'],
                  ['expired', 'Expired'],
                ]],
                ['vetting_status', 'Vetting status', [
                  ['pending', 'Pending'],
                  ['in_progress', 'In progress'],
                  ['cleared', 'Cleared'],
                  ['rejected', 'Rejected'],
                ]],
                ['employment_status', 'Employment status', [
                  ['active', 'Active'],
                  ['suspended', 'Suspended'],
                  ['on_leave', 'On leave'],
                  ['terminated', 'Terminated'],
                ]],
              ] as const).map(([key, label, options]) => (
                <label key={key}>
                  {label}
                  <select
                    value={draft[key]}
                    onChange={e => setDraft({
                      ...draft,
                      [key]: e.target.value,
                    })}
                  >
                    {options.map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                  </select>
                </label>
              ))}

              {([
                ['training_notes', 'Training notes'],
                ['vetting_notes', 'Vetting notes'],
              ] as const).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <textarea
                    rows={3}
                    value={draft[key]}
                    onChange={e => setDraft({
                      ...draft,
                      [key]: e.target.value,
                    })}
                  />
                </label>
              ))}

              <label>
                {editing === null ? 'Password' : 'New password (optional)'}
                <input
                  type="password"
                  minLength={8}
                  maxLength={128}
                  required={editing === null}
                  autoComplete="new-password"
                  value={draft.password}
                  onChange={e => setDraft({
                    ...draft,
                    password: e.target.value,
                  })}
                />
              </label>

              <div className="clients-actions">
                <button type="submit">
                  {busy
                    ? 'Saving...'
                    : editing === null
                      ? 'Register Guard'
                      : 'Save Changes'}
                </button>

                {editing !== null && (
                  <button
                    className="secondary"
                    type="button"
                    onClick={reset}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </fieldset>
          </form>
        </section>

        <section className="clients-panel">
          <div className="guards-list-header">
            <div>
              <h2>Registered Guards</h2>
              <p>Manage guard accounts and access.</p>
            </div>

            <form onSubmit={find} className="guards-search">
              <input
                placeholder="Search guards..."
                aria-label="Search guards"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
              />
              <button type="submit">Search</button>
            </form>
          </div>

          {loading && <p>Loading guards...</p>}

          {!loading && data?.results.length === 0 && (
            <p>No guards found.</p>
          )}

          <div className="guards-list">
            {!loading && data?.results.map(guard => (
              <article className="guard-card" key={guard.id}>
                <div className="guard-card-top">
                  <div>
                    <h3>
                      {`${guard.first_name} ${guard.last_name}`.trim()
                        || guard.username}
                    </h3>
                    <p>@{guard.username}</p>
                  </div>

                  <span className={
                    guard.is_active
                      ? 'guard-status active'
                      : 'guard-status inactive'
                  }>
                    {guard.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="guard-details">
                  <p><strong>Email:</strong> {guard.email || '—'}</p>
                  <p><strong>Phone:</strong> {guard.phone || '—'}</p>
                  <p><strong>Account ID:</strong> {guard.id}</p>

                  <p><strong>Employee number:</strong> {guard.employee_number || '—'}</p>
                  <p><strong>National ID:</strong> {guard.national_id || '—'}</p>
                  <p><strong>Training:</strong> {guard.training_status.replaceAll('_', ' ')}</p>
                  <p><strong>Vetting:</strong> {guard.vetting_status.replaceAll('_', ' ')}</p>
                  <p><strong>Employment:</strong> {guard.employment_status.replaceAll('_', ' ')}</p>
                  <p><strong>Training notes:</strong> {guard.training_notes || '—'}</p>
                  <p><strong>Vetting notes:</strong> {guard.vetting_notes || '—'}</p>

                </div>

                <div className="guard-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => edit(guard)}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => void toggle(guard)}
                  >
                    {guard.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="guards-pagination">
            <button
              type="button"
              disabled={loading || busy || !data?.previous}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              Previous
            </button>

            <span>Page {page}</span>

            <button
              type="button"
              disabled={loading || busy || !data?.next}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
