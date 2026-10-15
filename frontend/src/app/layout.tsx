import SentinelAccess from './SentinelAccess';
import SentinelNav from './SentinelNav';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sentinel | Security Operations',
  description: 'Security operations and guard attendance.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="sentinel-app"><SentinelAccess><SentinelNav />{children}</SentinelAccess></body>
    </html>
  );
}

import './mobile-layout.css';

import "./sentinel-light.css";

import './sentinel-shell.css';

import "./sentinel-polish.css";

import './sentinel-access.css';

import './navigation-flow.css';
