'use client';

import { BuildingsPanel } from './buildings-panel';
import { ImportPanel } from './import-panel';
import { ConfigPanel } from './config-panel';
import { AuditPanel } from './audit-panel';

export function AdminShell({ section }: { section: 'buildings' | 'import' | 'config' | 'audit' }) {
  if (section === 'buildings') return <BuildingsPanel />;
  if (section === 'import') return <ImportPanel />;
  if (section === 'config') return <ConfigPanel />;
  if (section === 'audit') return <AuditPanel />;
  return null;
}
