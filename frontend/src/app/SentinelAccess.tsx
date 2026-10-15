'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { dashboardRequest, RequestError } from '@/lib/dashboard-client';

type Phase = 'checking' | 'login' | 'unlocking' | 'ready';
export default function SentinelAccess({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const generation = useRef(0);
  const sending = useRef(false);
  const phaseRef = useRef<Phase>('checking');
  function transition(next: Phase) { phaseRef.current = next; setPhase(next); }

  useEffect(() => {
    let alive = true;
    async function verify() {
      if (sending.current || phaseRef.current === 'unlocking') return;
      const ticket = ++generation.current;
      try {
        await dashboardRequest('/api/auth/me');
        if (alive && ticket === generation.current) { transition('ready'); setError(''); }
      } catch (err) {
        if (alive && ticket === generation.current) {
          transition('login');
          setError(err instanceof RequestError && err.status === 401 ? '' : 'We could not reach your workspace. Check the backend, then try signing in.');
        }
      }
    }
    function signedOut() {
      ++generation.current;
      transition('login'); setError('');
    }
    function focus() { if (phaseRef.current === 'ready') void verify(); }
    window.addEventListener('sentinel:signed-out', signedOut);
    window.addEventListener('focus', focus);
    void verify();
    return () => {
      alive = false; ++generation.current;
      window.removeEventListener('sentinel:signed-out', signedOut);
      window.removeEventListener('focus', focus);
    };
  }, [pathname]);

  useEffect(() => {
    if (phase !== 'unlocking') return;
    const timer = setTimeout(() => transition('ready'), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 1100);
    return () => clearTimeout(timer);
  }, [phase]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    sending.current = true; ++generation.current; setBusy(true); setError('');
    try {
      await dashboardRequest('/api/auth/login', 'POST', {
        username: String(fields.get('username') || '').trim(),
        password: String(fields.get('password') || ''),
      }, false);
      form.reset(); transition('unlocking');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally { sending.current = false; setBusy(false); }
  }

  if (phase === 'ready') return <>{children}</>;

  return <div className="sa-access" data-phase={phase}>
    <header className="sa-brand"><span className="sa-mark">S</span><span>SENTINEL<small>SECURITY OPERATIONS</small></span></header>
    <div className="sa-grid">
      <section className="sa-story" aria-label="Sentinel workspace">
        <span className="sa-kicker">YOUR PEOPLE. YOUR SITES. ONE VIEW.</span>
        <h1>Stay close.<br />Even from <em>here.</em></h1>
        <p>A clearer view of your security operation.<br />From the first check-in to the final patrol.</p>
        <div className="sa-orbit" aria-hidden="true">
          <div className="sa-ring sa-ring-one" /><div className="sa-ring sa-ring-two" />
          <svg viewBox="0 0 360 180"><path d="M55 130L120 60 208 105 305 43" fill="none" stroke="#df8a39" strokeWidth="2" strokeDasharray="5 7" />
          <circle cx="55" cy="130" r="6" fill="#264f77"/><circle cx="120" cy="60" r="6" fill="#df8a39"/><circle cx="208" cy="105" r="6" fill="#264f77"/><circle cx="305" cy="43" r="6" fill="#df8a39"/></svg>
          <span className="sa-orbit-label">CONNECTED OPERATIONS</span>
        </div>
        <div className="sa-features"><span>01 <b>Personnel</b></span><span>02 <b>Attendance</b></span><span>03 <b>Patrols</b></span></div>
      </section>
      <section className="sa-card" aria-labelledby="sa-title" aria-busy={busy || phase === 'checking'}>
        <div className="sa-lock" aria-hidden="true"><div className="sa-shackle"/><div className="sa-lock-body"><span/></div></div>
        {phase === 'checking' ? <div className="sa-message" role="status"><h2 id="sa-title">Opening your workspace</h2><p>Checking your session…</p><span className="sa-loader" /></div>
        : phase === 'unlocking' ? <div className="sa-message" role="status" aria-live="polite"><span className="sa-kicker">ACCESS GRANTED</span><h2 id="sa-title">You’re in.</h2><p>Welcome back to Sentinel.</p></div>
        : <>
          <span className="sa-kicker">WORKSPACE ACCESS</span><h2 id="sa-title">Welcome back.</h2>
          <p className="sa-subtitle">Sign in to your command centre.</p>
          <form onSubmit={signIn}>
            <label htmlFor="sa-username">Username</label><input id="sa-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={150} placeholder="Enter your username" disabled={busy}/>
            <label htmlFor="sa-password">Password</label><div className="sa-password"><input id="sa-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" required maxLength={1024} placeholder="Enter your password" disabled={busy}/><button type="button" className="sa-reveal" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}>{visible ? 'Hide' : 'Show'}</button></div>
            {error ? <p className="sa-error" role="alert">{error}</p> : null}
            <button className="sa-submit" disabled={busy} type="submit"><span>{busy ? 'Signing in…' : 'Enter workspace'}</span><span aria-hidden="true">{busy ? '◌' : '→'}</span></button>
          </form>
          <p className="sa-help">Administrator & supervisor access.<br />Guards sign in through the Sentinel mobile app.</p>
        </>}
      </section>
    </div>
    <footer className="sa-footer"><span>SENTINEL / SECURITY OPERATIONS</span><span>Clarity. Accountability. Control.</span></footer>
  </div>;
}
