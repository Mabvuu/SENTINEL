'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { dashboardRequest, RequestError } from '@/lib/dashboard-client';
import './sentinel.css';
import DashboardSummary from '@/components/DashboardSummary';

type User = {
  id: number;
  username: string;
  first_name: string;
  role: string;
};

type LocationStatus = 'inside' | 'outside' | 'uncertain' | 'stale' | 'unavailable';

type GuardRow = {
  attendance_id: number;
  guard: { id: number; name: string };
  site: { id: number; name: string; client: string };
  clocked_in_at: string;
  shift_ends_at: string;
  location_status: LocationStatus;
  last_position: null | {
    latitude: number;
    longitude: number;
    accuracy_metres: number;
    captured_at: string;
    received_at: string;
    age_seconds: number;
  };
};

type Feed = {
  count: number;
  next: string | null;
  previous: string | null;
  server_time: string;
  stale_after_seconds: number;
  results: GuardRow[];
};

const labels: Record<LocationStatus, string> = {
  inside: 'Inside site',
  outside: 'Outside site',
  uncertain: 'Uncertain',
  stale: 'Stale location',
  unavailable: 'No location',
};

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [feed, setFeed] = useState<Feed | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [clock, setClock] = useState(0);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;

    dashboardRequest<{ user: User }>('/api/auth/me')
      .then((result) => {
        if (alive) setUser(result.user);
      })
      .catch((err) => {
        if (alive && !(err instanceof RequestError && err.status === 401)) {
          setError(err instanceof Error ? err.message : 'Connection failed.');
        }
      })
      .finally(() => {
        if (alive) setChecking(false);
      });

    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setClock(performance.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      try {
        const result = await dashboardRequest<Feed>(
          `/api/control-room/locations?page=${page}`
        );

        if (!alive) return;
        setFeed(result);
        setReceivedAt(performance.now());
        setClock(performance.now());
        setError('');
      } catch (err) {
        if (!alive) return;
        setFeed(null);
        setError(err instanceof Error ? err.message : 'Location feed unavailable.');

        if (
          err instanceof RequestError &&
          [401, 403].includes(err.status)
        ) {
          setUser(null);
          return;
        }
      } finally {
        if (alive) timer = setTimeout(() => void load(), 15000);
      }
    }

    void load();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [user, page, reload]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      const result = await dashboardRequest<{ user: User }>(
        '/api/auth/login',
        'POST',
        { username, password },
        false
      );
      setPassword('');
      setPage(1);
      setFeed(null);
      setUser(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await dashboardRequest('/api/auth/logout', 'POST', undefined, false);
      setUser(null);
      setFeed(null);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-out failed.');
    } finally {
      setBusy(false);
    }
  }

  const elapsed = Math.max(0, (clock - receivedAt) / 1000);
  const serverNow = feed ? Date.parse(feed.server_time) + elapsed * 1000 : 0;

  function statusFor(row: GuardRow): LocationStatus {
    if (
      row.last_position &&
      row.last_position.age_seconds + elapsed > (feed?.stale_after_seconds ?? 90)
    ) {
      return 'stale';
    }
    return row.location_status;
  }

  const rows = (feed?.results ?? []).filter(
    (row) => Date.parse(row.shift_ends_at) > serverNow
  );

  const visible = rows.filter((row) =>
    `${row.guard.name} ${row.site.name} ${row.site.client}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <main className="sentinel">
      <header className="topbar">
        <div className="brand"><span className="shield">S</span>SENTINEL</div>
        <span className="muted">Security operations</span>
        {user && (
          <button className="secondary" disabled={busy} onClick={() => void signOut()}>
            Sign out
          </button>
        )}
      </header>

      {checking ? (
        <section className="login-card">Checking your session…</section>
      ) : !user ? (
        <section className="login-card">
          <span className="eyebrow">CONTROL ROOM</span>
          <h1>Welcome back.</h1>
          <p className="muted">Sign in with your administrator or supervisor account.</p>
          {error && <p className="error" role="alert">{error}</p>}
          <form onSubmit={(event) => void signIn(event)}>
            <label htmlFor="username">Username</label>
            <input id="username" autoComplete="username" required
              value={username} onChange={(event) => setUsername(event.target.value)} />
            <label htmlFor="password">Password</label>
            <input id="password" type="password" autoComplete="current-password" required
              value={password} onChange={(event) => setPassword(event.target.value)} />
            <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
        </section>
      ) : (
        <div className="control-shell">
          <div className="dashboard">
          <section className="heading">
            <div>
              <span className="eyebrow">OPERATIONS / OVERVIEW</span>
              <h1>Control Room</h1>
              <p className="muted">
                Welcome, {user.first_name || user.username}. Updates refresh every 15 seconds.
              </p>
            </div>
            <button className="secondary" onClick={() => {
              setFeed(null);
              setReload((value) => value + 1);
            }}>Refresh now</button>
          </section>

          {error && <p className="error" role="alert">{error}</p>}

          <DashboardSummary key={reload} />
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Active attendance</h2>
                <p className="muted">Locations older than 90 seconds are marked stale.</p>
              </div>
              <input aria-label="Search this page" placeholder="Search guards or sites"
                value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>

            {!feed ? <p className="empty">{error ? 'Location feed unavailable.' : 'Loading locations…'}</p> : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead><tr>
                      <th>Guard</th><th>Assigned site</th><th>Location status</th>
                      <th>Last reading</th><th>Coordinates</th>
                    </tr></thead>
                    <tbody>
                      {visible.map((row) => {
                        const status = statusFor(row);
                        const position = row.last_position;
                        return (
                          <tr key={row.attendance_id}>
                            <td><strong>{row.guard.name}</strong><small>Clocked in {new Date(row.clocked_in_at).toLocaleTimeString()}</small></td>
                            <td>{row.site.name}<small>{row.site.client}</small></td>
                            <td><span className={`badge ${status}`}>{labels[status]}</span></td>
                            <td>{position ? `${Math.floor(position.age_seconds + elapsed)}s ago` : 'Not received'}
                              {position && <small>Accuracy ±{Math.round(position.accuracy_metres)} m</small>}
                            </td>
                            <td>{position
                              ? <><span>{position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}</span><small><a href={`https://www.google.com/maps/search/?api=1&query=${position.latitude},${position.longitude}`} target="_blank" rel="noopener noreferrer">Open last position on map ↗</a></small></>
                              : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {visible.length === 0 && <p className="empty">No matching active attendance on this page.</p>}
                <footer className="pagination">
                  <button className="secondary" disabled={page <= 1} onClick={() => {
                    setFeed(null); setPage(value => value - 1);
                  }}>Previous</button>
                  <span>Page {page}</span>
                  <button className="secondary" disabled={!feed.next} onClick={() => {
                    setFeed(null); setPage(value => value + 1);
                  }}>Next</button>
                </footer>
              </>
            )}
          </section>
          </div>
        </div>
      )}
    </main>
  );
}
