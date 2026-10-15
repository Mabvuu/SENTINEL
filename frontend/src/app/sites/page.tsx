'use client';
import SiteAddressPicker from '@/components/SiteAddressPicker';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { dashboardRequest } from '../../lib/dashboard-client';
import '../clients/clients.css';
import './sites.css';

type Client = {
  id: number;
  name: string;
  is_active: boolean;
};

type Site = {
  id: number;
  client: number;
  client_name: string;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  radius_metres: number;
  max_accuracy_metres: number;
  required_guards: number;
  is_active: boolean;
};

type Page<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

type Draft = {
  client: string;
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  radius_metres: string;
  max_accuracy_metres: string;
  required_guards: string;
};

const blank: Draft = {
  client: '',
  name: '',
  address: '',
  latitude: '',
  longitude: '',
  radius_metres: '100',
  max_accuracy_metres: '50',
  required_guards: '1',
};

const numericFields = [
  ['latitude', 'Latitude', -90, 90, '0.000001'],
  ['longitude', 'Longitude', -180, 180, '0.000001'],
  ['radius_metres', 'Allowed radius (metres)', 20, 5000, '1'],
  ['max_accuracy_metres', 'Maximum GPS uncertainty (metres)', 5, 200, '1'],
  ['required_guards', 'Guards required', 1, 32767, '1'],
] as const;

function errorMessage(error: unknown) {
  if (
    typeof error === 'object' &&
    error === null === false &&
    error &&
    'status' in error
  ) {
    if (error.status === 401) return 'Return to the dashboard and sign in.';
    if (error.status === 403) return 'Only administrators can manage sites.';
  }
  return error instanceof Error ? error.message : 'Request failed.';
}

export default function SitesPage() {
  const [data, setData] = useState<Page<Site> | null>(null);
  const [draft, setDraft] = useState<Draft>({ ...blank });
  const [editing, setEditing] = useState<Site | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientPage, setClientPage] = useState(1);
  const [clientNext, setClientNext] = useState(false);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientRevision, setClientRevision] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clientError, setClientError] = useState('');
  const [success, setSuccess] = useState('');
  const saving = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const siteProfile = useRef<HTMLDialogElement>(null);
  const [viewedSite, setViewedSite] = useState<Site | null>(null);

  useEffect(() => {
    if (viewedSite) siteProfile.current?.showModal();
  }, [viewedSite]);

  const dialog = useRef<HTMLDialogElement>(null);
  const [requestedClient, setRequestedClient] = useState<number | null>(null);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('client');
    const id = Number(value);
    if (value && Number.isSafeInteger(id) && id > 0) {
      setRequestedClient(id);
    }
  }, []);

  useEffect(() => {
    if (requestedClient === null || clientsLoading || clientError) return;

    const selected = clients.find(client => client.id === requestedClient);
    if (selected) {
      if (selected.is_active) {
        setEditing(null);
        setDraft({ ...blank, client: String(selected.id) });
        setError('');
        setSuccess('');
        dialog.current?.showModal();
      } else {
        setError('This client is archived. Restore it before adding a site.');
      }
      setRequestedClient(null);
      return;
    }

    if (clientNext) {
      setClientsLoading(true);
      setClientPage(value => value + 1);
    } else {
      setError('The selected client could not be found in this account.');
      setRequestedClient(null);
    }
  }, [requestedClient, clients, clientsLoading, clientError, clientNext]);

  useEffect(() => {
    let active = true;
    setClientsLoading(true);
    setClientError('');

    dashboardRequest<Page<Client>>(
      `/api/management/clients?page=${clientPage}`, 'GET'
    )
      .then((result) => {
        if (active === false) return;
        setClients((previous) => {
          const combined = clientPage === 1
            ? result.results
            : [...previous, ...result.results];
          return Array.from(
            new Map(combined.map((client) => [client.id, client])).values()
          );
        });
        setClientNext(Boolean(result.next));
      })
      .catch((cause: unknown) => {
        if (active) setClientError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setClientsLoading(false);
      });

    return () => { active = false; };
  }, [clientPage, clientRevision]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(null);
    setError('');

    const params = new URLSearchParams({
      page: String(page),
      search,
    });

    dashboardRequest<Page<Site>>(
      `/api/management/sites?${params.toString()}`, 'GET'
    )
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [page, search, revision]);

  function reset() {
    dialog.current?.close();
    setEditing(null);
    setDraft({ ...blank });
  }

  function edit(site: Site) {
    dialog.current?.showModal();
    setEditing(site);
    setDraft({
      client: String(site.client),
      name: site.name,
      address: site.address,
      latitude: String(site.latitude),
      longitude: String(site.longitude),
      radius_metres: String(site.radius_metres),
      max_accuracy_metres: String(site.max_accuracy_metres),
      required_guards: String(site.required_guards),
    });
    setError('');
    setSuccess('');
    form.current?.scrollIntoView({ behavior: 'smooth' });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        client: Number(draft.client),
        name: draft.name.trim(),
        address: draft.address.trim(),
        latitude: draft.latitude,
        longitude: draft.longitude,
        radius_metres: Number(draft.radius_metres),
        max_accuracy_metres: Number(draft.max_accuracy_metres),
        required_guards: Number(draft.required_guards),
      };

      await dashboardRequest<Site>(
        editing === null
          ? '/api/management/sites'
          : `/api/management/sites?id=${editing.id}`,
        editing === null ? 'POST' : 'PATCH',
        payload
      );

      setSuccess(editing === null ? 'Site added.' : 'Site updated.');
      reset();
      setPage(1);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function toggle(site: Site) {
    if (saving.current) return;
    const action = site.is_active ? 'Archive' : 'Restore';
    const warning = site.is_active
      ? ' New clock-ins and location updates at this site will be blocked.'
      : '';

    if (window.confirm(`${action} ${site.name}?${warning}`) === false) return;

    saving.current = true;
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await dashboardRequest<Site>(
        `/api/management/sites?id=${site.id}`,
        'PATCH',
        { is_active: site.is_active === false }
      );
      if (editing?.id === site.id) reset();
      setSuccess(`${site.name} ${site.is_active ? 'archived' : 'restored'}.`);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  function find(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(query.trim());
    setRevision((value) => value + 1);
  }

  return (
    <main className="clients-page sites-page">
      <header className="clients-header">
        <div>
          <p className="clients-brand">SENTINEL</p>
          <h1>Client sites</h1>
          <p>Locations, GPS boundaries and staffing requirements.</p>
        </div>
        <nav className="clients-actions" aria-label="Management">
          <Link href="/">Dashboard</Link>
          <Link href="/clients">Clients</Link>
          <button type="button" onClick={() => {
            reset();
            setError('');
            setSuccess('');
            setClientPage(1);
            setClientRevision(value => value + 1);
            dialog.current?.showModal();
          }}>Add site</button>
        </nav>
      </header>

      {error && <div role="alert" className="clients-error">{error}</div>}
      {success && <div role="status" className="clients-success">{success}</div>}

      <div className="clients-grid">
        <dialog
          ref={dialog}
          className="sentinel-site-dialog"
          aria-label="Add or edit site"
          onCancel={event => {
            if (busy) event.preventDefault();
            else reset();
          }}
        >
        <section className="clients-panel">
          <button
            type="button"
            className="site-dialog-close secondary"
            disabled={busy}
            onClick={reset}
          >Close</button>
          {error && <p role="alert" className="clients-error">{error}</p>}
          <h2>{editing === null ? 'Add site' : 'Edit site'}</h2>
          {clientError && (
            <div role="alert" className="clients-error">
              {clientError}
              <button
                type="button"
                disabled={clientsLoading}
                onClick={() => setClientRevision((value) => value + 1)}
              >
                Retry clients
              </button>
            </div>
          )}

          <form ref={form} onSubmit={save}>
            <fieldset disabled={busy}>
              <label>
                Client
                {editing ? (
                  <input readOnly value={editing.client_name} />
                ) : (
                  <select
                    required
                    value={draft.client}
                    onChange={(event) => setDraft({
                      ...draft, client: event.target.value,
                    })}
                  >
                    <option value="">Select an active client</option>
                    {clients.filter((client) => client.is_active).map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                )}
              </label>

              {editing === null && (
                <div className="site-client-controls">
                  {clientsLoading && <p role="status">Loading clients…</p>}
                  {clientsLoading === false && clientError === '' && (
                    <p role="status">
                      {clients.filter(client => client.is_active).length} active clients loaded.
                      {clients.some(client => client.is_active) === false
                        ? ' Add or activate a client first, or load more clients below.'
                        : ''}
                    </p>
                  )}
                  <button
                    type="button"
                    className="secondary"
                    disabled={clientsLoading}
                    onClick={() => {
                      setClientPage(1);
                      setClientRevision(value => value + 1);
                    }}
                  >Refresh clients</button>
                  {clientNext && clientError.length === 0 && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={clientsLoading}
                      onClick={() => setClientPage((value) => value + 1)}
                    >
                      Load more clients
                    </button>
                  )}
                  <Link href="/clients">Add a client</Link>
                </div>
              )}

              <label>
                Site name
                <input
                  required
                  maxLength={200}
                  value={draft.name}
                  onChange={(event) => setDraft({
                    ...draft, name: event.target.value,
                  })}
                />
              </label>

              <SiteAddressPicker draft={draft} onChange={patch=>setDraft(previous=>({...previous,...patch}))} />

              {numericFields.map(([key, label, min, max, step]) => (
                <label key={key}>
                  {label}
                  <input
                    required
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={draft[key]}
                    onChange={(event) => setDraft({
                      ...draft, [key]: event.target.value,
                    })}
                  />
                </label>
              ))}

              <p className="site-help">
                Enter the coordinates of the actual work site.
                The radius defines how far guards may be from its centre.
                Existing clock-ins keep their original GPS boundary.
              </p>

              <div className="clients-actions">
                <button type="submit">
                  {busy ? 'Saving…' : editing === null ? 'Add site' : 'Save changes'}
                </button>
                {editing && (
                  <button type="button" className="secondary" onClick={reset}>
                    Cancel
                  </button>
                )}
              </div>
            </fieldset>
          </form>
        </section>
        </dialog>

        <section className="clients-panel">
          <h2>Site directory</h2>
          <form onSubmit={find} className="clients-search">
            <input
              aria-label="Search sites"
              placeholder="Site, address or client"
              maxLength={200}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button disabled={busy || loading}>Search</button>
          </form>

          <button
            type="button"
            className="secondary"
            disabled={busy || loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            Refresh list
          </button>

          {loading && <p role="status">Loading sites…</p>}

          {data && (
            <>
              <p>{data.count} site{data.count === 1 ? '' : 's'}</p>
              {data.results.length === 0 && <p>No matching sites.</p>}

              {data.results.map((site) => (
                
<button
  key={site.id}
  type="button"
  className="site-directory-row"
  onClick={() => setViewedSite(site)}
>
  <span>{site.name}</span>
  <small>{site.is_active ? 'Active' : 'Archived'}</small>
  <span aria-hidden="true">›</span>
</button>

              ))}

              <div className="clients-actions">
                <button
                  disabled={busy || loading || data.previous === null}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Previous
                </button>
                <span>Page {page}</span>
                <button
                  disabled={busy || loading || data.next === null}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    
<dialog
  ref={siteProfile}
  className="site-profile-dialog"
  aria-label="Site details"
  onClose={() => setViewedSite(null)}
>
  <button type="button" className="secondary site-profile-close"
    onClick={() => siteProfile.current?.close()}>Close</button>
  {viewedSite && (() => {
    const site = viewedSite;
    return (<article className="site-profile-content">
                  <div className="client-card-heading">
                    <h3>{site.name}</h3>
                    <span>{site.is_active ? 'Active' : 'Archived'}</span>
                  </div>
                  <p>{site.client_name}</p>
                  <p className="client-address">{site.address}</p>
                  <div className="site-details">
                    <span>GPS: {site.latitude}, {site.longitude}</span>
                    <span>Radius: {site.radius_metres} m</span>
                    <span>Maximum uncertainty: {site.max_accuracy_metres} m</span>
                    <span>Guards required: {site.required_guards}</span>
                  </div>
                  <div className="clients-actions">
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => { siteProfile.current?.close(); edit(site); }}
                    >
                      Edit
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => { siteProfile.current?.close(); void toggle(site); }}
                    >
                      {site.is_active ? 'Archive' : 'Restore'}
                    </button>
                  </div>
                </article>);
  })()}
</dialog>
</main>
  );
}
