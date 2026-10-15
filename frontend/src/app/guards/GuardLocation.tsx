'use client';

import { useEffect, useState } from 'react';
import { dashboardRequest } from '../../lib/dashboard-client';

type Position = {
  latitude: number;
  longitude: number;
  accuracy_metres: number;
  captured_at: string;
  age_seconds: number;
};

type Row = {
  guard: { id: number };
  site: { name: string };
  location_status: string;
  last_position: Position | null;
};

type Feed = {
  results: Row[];
  next: string | null;
};

export default function GuardLocation({ guardId }: { guardId: number }) {
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    setRow(null);
    setError('');

    async function load() {
      try {
        let page = 1;
        let found: Row | null = null;

        while (Boolean(active)) {
          const feed = await dashboardRequest<Feed>(
            '/api/control-room/locations?page=' + page
          );
          if (active === false) return;
          found = feed.results.find(item => item.guard.id === guardId) ?? null;
          if (found || feed.next === null) break;
          page += 1;
        }

        if (active) {
          setRow(found);
          setError('');
        }
      } catch (cause) {
        if (active) {
          setRow(null);
          setError(cause instanceof Error ? cause.message : 'Location request failed.');
        }
      } finally {
        if (active) {
          setLoading(false);
          timer = setTimeout(() => void load(), 15000);
        }
      }
    }

    void load();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [guardId]);

  const position = row?.last_position;
  const latitude = Number(position?.latitude);
  const longitude = Number(position?.longitude);
  const valid = position &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;

  return (
    <section className="guard-location-panel" aria-label="GPS location">
      <h3>GPS location</h3>
      {loading ? <p role="status">Checking location…</p> :
        error ? <p role="alert">{error}</p> :
        row === null ? (
          <p>No active check-in found. Assign this guard a shift, then have them
            sign into the phone app and clock in with location enabled.</p>
        ) : (
          <>
            <p>Assigned site: {row.site.name}</p>
            <p>Status: {row.location_status.replaceAll('_', ' ')}</p>
            {valid ? (
              <>
                <p>Last received position: {latitude}, {longitude}</p>
                <p>Captured: {new Date(position.captured_at).toLocaleString()}</p>
                <p>Reported accuracy: {position.accuracy_metres} metres</p>
                <a
                  href={'https://www.google.com/maps/search/?api=1&query=' +
                    encodeURIComponent(latitude + ',' + longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                >Open last position on map ↗</a>
                <p className="location-help">
                  This is the last reported position. Stale readings do not
                  confirm the guard’s current location.
                </p>
              </>
            ) : <p>The phone has not sent a usable GPS reading yet.</p>}
          </>
        )}
    </section>
  );
}
