'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { dashboardRequest } from '@/lib/dashboard-client';
import './clients.css';

type Client = {
  id: number;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  is_active: boolean;
};

type ClientPage = {
  count: number;
  next: string | null;
  previous: string | null;
  results: Client[];
};

type Draft = Omit<Client, 'id'>;

const emptyDraft: Draft = {
  name: '',
  contact_name: '',
  email: '',
  phone: '',
  address: '',
  is_active: true,
};

const fields = [
  ['name', 'Client name', 200],
  ['contact_name', 'Contact person', 150],
  ['email', 'Email', 254],
  ['phone', 'Phone', 30],
] as const;

function message(error: unknown) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error
  ) {
    if (error.status === 401) {
      return 'Your session expired. Return to the dashboard to sign in.';
    }
    if (error.status === 403) {
      return 'Only administrators can manage clients.';
    }
  }
  return error instanceof Error ? error.message : 'Request failed.';
}

export default function ClientsPage() {
  const [data, setData] = useState<ClientPage | null>(null);
  const [draft, setDraft] = useState<Draft>({ ...emptyDraft });
  const [editing, setEditing] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const saving = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const profileRef = useRef<HTMLDialogElement>(null);
  const [viewedClient, setViewedClient] = useState<Client | null>(null);

  useEffect(() => {
    if (viewedClient) profileRef.current?.showModal();
  }, [viewedClient]);

  const clientDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(null);
    setError('');

    const query = new URLSearchParams({
      page: String(page),
      search,
    });

    dashboardRequest<ClientPage>(
      `/api/management/clients?${query.toString()}`,
      'GET'
    )
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (active) setError(message(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [page, search, revision]);

  function resetForm() {
    clientDialog.current?.close();
    setEditing(null);
    setDraft({ ...emptyDraft });
  }

  function edit(client: Client) {
    clientDialog.current?.showModal();
    setEditing(client.id);
    setDraft({
      name: client.name,
      contact_name: client.contact_name,
      email: client.email,
      phone: client.phone,
      address: client.address,
      is_active: client.is_active,
    });
    setError('');
    setSuccess('');
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const path = editing === null
        ? '/api/management/clients'
        : `/api/management/clients?id=${editing}`;

      await dashboardRequest<Client>(
        path,
        editing === null ? 'POST' : 'PATCH',
        { ...draft, name: draft.name.trim() }
      );

      setSuccess(editing === null ? 'Client added.' : 'Client updated.');
      resetForm();
      setPage(1);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(message(cause));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function toggle(client: Client) {
    if (saving.current) return;

    const action = client.is_active ? 'Archive' : 'Restore';
    const explanation = client.is_active
      ? ' This also makes its sites unavailable for new clock-ins and location updates.'
      : '';

    if (
      window.confirm(`${action} ${client.name}?${explanation}`) === false
    ) return;

    saving.current = true;
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await dashboardRequest<Client>(
        `/api/management/clients?id=${client.id}`,
        'PATCH',
        { is_active: client.is_active === false }
      );
      if (editing === client.id) resetForm();
      setSuccess(`${client.name} ${client.is_active ? 'archived' : 'restored'}.`);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(message(cause));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  function find(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
    setRevision((value) => value + 1);
  }

  return (
    <main className="clients-page client-directory-page">
      <header className="clients-header">
        <div>
          <p className="clients-brand">SENTINEL</p>
          <h1>Clients</h1>
          <p>Manage companies and their contact details.</p>
        </div>
        <div className="clients-actions">
    <Link href="/sites">Sites</Link>
    <button type="button" onClick={() => {
      resetForm();
      setError('');
      setSuccess('');
      clientDialog.current?.showModal();
    }}>Add client</button>
  </div>
      </header>

      {error && <div role="alert" className="clients-error">{error}</div>}
      {success && (
        <div role="status" className="clients-success">{success}</div>
      )}

      <div className="clients-grid">
        <dialog
          ref={clientDialog}
          className="sentinel-client-dialog"
          aria-label="Add or edit client"
          onCancel={event => {
            if (busy) event.preventDefault();
            else resetForm();
          }}
        >
        <section className="clients-panel">
          <button
            type="button"
            className="client-dialog-close secondary"
            disabled={busy}
            onClick={resetForm}
          >Close</button>
          {error && <p role="alert" className="clients-error">{error}</p>}
          <h2>{editing === null ? 'Add client' : 'Edit client'}</h2>

          <form onSubmit={save} ref={formRef}>
            <fieldset disabled={busy}>
              {fields.map(([key, label, limit]) => (
                <label key={key}>
                  {label}
                  <input
                    value={draft[key]}
                    type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
                    required={key === 'name'}
                    maxLength={limit}
                    onChange={(event) => setDraft({
                      ...draft,
                      [key]: event.target.value,
                    })}
                  />
                </label>
              ))}

              <label>
                Address
                <textarea
                  value={draft.address}
                  maxLength={4000}
                  rows={3}
                  onChange={(event) => setDraft({
                    ...draft,
                    address: event.target.value,
                  })}
                />
              </label>

              <div className="clients-actions">
                <button type="submit">
                  {busy ? 'Saving…' : editing === null ? 'Add client' : 'Save changes'}
                </button>
                {editing !== null && (
                  <button type="button" className="secondary" onClick={resetForm}>
                    Cancel
                  </button>
                )}
              </div>
            </fieldset>
          </form>
        </section>
        </dialog>

        <section className="clients-panel">
          <h2>Client directory</h2>

          <form className="clients-search" onSubmit={find}>
            <input
              aria-label="Search clients"
              placeholder="Name, contact, email or phone"
              value={searchInput}
              maxLength={200}
              onChange={(event) => setSearchInput(event.target.value)}
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

          {loading && <p role="status">Loading clients…</p>}

          {data && (
            <>
              <p>{data.count} client{data.count === 1 ? '' : 's'}</p>
              {data.results.length === 0 && <p>No matching clients.</p>}

              {data.results.map((client) => (
                
<button
  key={client.id}
  type="button"
  className="client-directory-row"
  onClick={() => setViewedClient(client)}
>
  <span>{client.name}</span>
  <small>{client.is_active ? 'Active' : 'Archived'}</small>
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
    ref={profileRef}
    className="client-profile-dialog"
    aria-label="Client details"
    onClose={() => setViewedClient(null)}
  >
    <button
      type="button"
      className="secondary client-profile-close"
      onClick={() => profileRef.current?.close()}
    >Close</button>
    {viewedClient && (() => {
      const client = viewedClient;
      return (<section className="client-profile-content">
                  <div className="client-profile-heading">
                    <span>{client.name}</span>
                    <small>{client.is_active ? 'Active' : 'Archived'}</small>
                  </div>
                  <div className="client-expanded-content">
                  {client.is_active && (
                    <Link
                      className="client-site-link"
                      href={'/sites?client=' + client.id}
                    >Add site for this client →</Link>
                  )}
                  <p>{client.contact_name || 'No contact person'}</p>
                  <p>{client.email || 'No email'} · {client.phone || 'No phone'}</p>
                  {client.address && <p className="client-address">{client.address}</p>}

                  <div className="clients-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => { profileRef.current?.close(); edit(client); }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => { profileRef.current?.close(); void toggle(client); }}
                    >
                      {client.is_active ? 'Archive' : 'Restore'}
                    </button>
                  </div>
                </div>
                </section>);
    })()}
  </dialog>
</main>
  );
}
