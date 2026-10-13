'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';

const links = [
  { href: '/', label: 'Control room', icon: 'grid' },
  { href: '/guards', label: 'Guard personnel', icon: 'people' },
  { href: '/clients', label: 'Clients', icon: 'briefcase' },
  { href: '/sites', label: 'Client sites', icon: 'building' },
  { href: '/shifts', label: 'Shift roster', icon: 'calendar' },
];

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    briefcase: 'M3 7h18v14H3z M8 7V3h8v4 M3 12h18 M10 12v3h4v-3',
    building: 'M4 21V7l8-4 8 4v14 M2 21h20 M9 21v-5h6v5 M8 9h1 M15 9h1 M8 12h1 M15 12h1',
    calendar: 'M3 5h18v16H3z M16 3v4 M8 3v4 M3 11h18 M7 15h2 M15 15h2',
    menu: 'M4 6h16 M4 12h16 M4 18h16',
    close: 'M6 6l12 12 M18 6 6 18',
    shield: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z M8 12l3 3 5-6',
  };

  return (
    <svg width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.65"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] || paths.grid} />
    </svg>
  );
}

export default function SentinelNav() {
  const pathname = usePathname();
  const drawer = useRef<HTMLDialogElement>(null);

  const activeLink = links.find(item =>
    item.href === '/'
      ? pathname === '/'
      : pathname === item.href || pathname.startsWith(item.href + '/')
  );

  function navigation() {
    return (
      <>
        <Link href="/" className="sn-brand"
          onClick={() => drawer.current?.close()}>
          <span className="sn-logo">S</span>
          <span>
            <strong>SENTINEL</strong>
            <small>SECURITY OPERATIONS</small>
          </span>
        </Link>

        <div className="sn-workspace">
          <span className="sn-workspace-icon">SO</span>
          <div>
            <strong>Sentinel Operations</strong>
            <small>Harare · Zimbabwe</small>
          </div>
        </div>

        <p className="sn-caption">COMMAND CENTRE</p>

        <nav className="sn-links" aria-label="Main navigation">
          {links.map(item => (
            <Link key={item.href} href={item.href}
              aria-current={activeLink?.href === item.href ? 'page' : undefined}
              onClick={() => drawer.current?.close()}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sn-footer">
          <Icon name="shield" />
          <span>Security operations</span>
        </div>
      </>
    );
  }

  return (
    <>
      <aside className="sn-sidebar">{navigation()}</aside>

      <header className="sn-topbar">
        <button className="sn-menu-button" type="button"
          aria-label="Open navigation" aria-haspopup="dialog"
          onClick={() => drawer.current?.showModal()}>
          <Icon name="menu" />
        </button>

        <div className="sn-breadcrumb">
          <span>Workspace</span>
          <span aria-hidden="true">/</span>
          <strong>{activeLink?.label || 'Sentinel'}</strong>
        </div>

        <span className="sn-timezone">CAT · UTC+2</span>
      </header>

      <dialog ref={drawer} className="sn-drawer" aria-label="Navigation">
        <button className="sn-close" type="button"
          aria-label="Close navigation"
          onClick={() => drawer.current?.close()}>
          <Icon name="close" />
        </button>
        {navigation()}
      </dialog>
    </>
  );
}
