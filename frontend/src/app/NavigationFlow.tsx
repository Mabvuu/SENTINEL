"use client";
import Link from 'next/link';

type Item = { href: string; label: string; icon?: string };
const groups = [
  { title: 'Live operations', paths: ['/', '/duty-board', '/live-rounds', '/patrol'] },
  { title: 'Setup & scheduling', paths: ['/clients', '/sites', '/guards', '/routes-checkpoints', '/shifts'] },
  { title: 'Records & reports', paths: ['/attendance', '/incidents', '/handovers', '/inspections', '/reports'] },
  { title: 'Finance', paths: ['/contracts', '/billing'] },
];
const sequence = ['/clients', '/sites', '/guards', '/routes-checkpoints', '/shifts', '/duty-board', '/live-rounds'];
const names: Record<string, string> = {
 '/': 'Overview', '/duty-board': 'Duty & round scheduling', '/live-rounds': 'Live patrols',
 '/clients': 'Clients', '/sites': 'Sites', '/guards': 'Guards',
 '/routes-checkpoints': 'Routes & checkpoints', '/shifts': 'Assign shifts',
};
const matches = (path: string, href: string) => path === href || (href !== '/' && path.startsWith(href + '/'));
export function NavigationGroups({ links, pathname, onNavigate }: { links: Item[]; pathname: string; onNavigate: () => void }) {
 const known = new Set(groups.flatMap(g => g.paths));
 const sections = groups.map(g => ({ title: g.title, items: g.paths.flatMap(href => links.filter(l => l.href === href)) }));
 const extra = links.filter(l => !known.has(l.href));
 if (extra.length) sections.push({ title: 'More tools', items: extra });
 return <nav className="sn-links sf-groups" aria-label="Main navigation">
  {sections.filter(g => g.items.length).map(g => <details key={g.title + pathname} className="sf-group" open={g.title === 'Live operations' || g.items.some(l => matches(pathname, l.href))}>
    <summary>{g.title}<span aria-hidden="true">⌄</span></summary>
    <div>{g.items.map(item => <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={matches(pathname, item.href) ? 'page' : undefined}>
      <span className="sf-dot" aria-hidden="true" /><span>{names[item.href] || item.label}</span>
    </Link>)}</div>
  </details>)}
 </nav>;
}
export function NavigationSteps({ links, pathname }: { links: Item[]; pathname: string }) {
 const steps = sequence.flatMap(href => links.filter(l => l.href === href));
 const index = steps.findIndex(l => matches(pathname, l.href));
 if (index < 0) return null;
 const previous = steps[index - 1];
 const next = steps[index + 1];
 return <nav className="sf-step-links" aria-label="Setup and duty workflow">
   {previous && <Link href={previous.href} title={'Previous: ' + (names[previous.href] || previous.label)}>← <span>{names[previous.href] || previous.label}</span></Link>}
   {next && <Link className="sf-next" href={next.href}>Next: {names[next.href] || next.label} →</Link>}
 </nav>;
}
