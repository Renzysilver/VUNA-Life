'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

type AuditRow = {
  id: number;
  actorId: string | null;
  action: string;
  tableName: string;
  rowId: string | null;
  before: any;
  after: any;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

export function AuditPanel() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);

  const reload = useCallback(() => {
    let cancelled = false;
    fetch('/api/admin/audit-log?limit=100', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setRows(d.ok ? d.rows : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = reload();
    return cleanup;
  }, [reload]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Audit log</CardTitle>
            <CardDescription>
              Most recent 100 entries. Every admin mutation lands here with actor
              id, before/after, IP and user-agent.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={reload}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!rows ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No audit entries yet. Make a building edit or run a CSV import to see one.
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh] rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="w-[60px]">#</TableHead>
                  <TableHead className="w-[100px]">When</TableHead>
                  <TableHead className="w-[100px]">Action</TableHead>
                  <TableHead className="w-[100px]">Table</TableHead>
                  <TableHead className="w-[80px]">Row</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead className="w-[120px]">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.id}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {new Date(r.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={actionVariant(r.action)} className="text-[10px]">
                        {r.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.tableName}</TableCell>
                    <TableCell className="font-mono text-xs">{r.rowId}</TableCell>
                    <TableCell>
                      <pre className="text-[10px] font-mono whitespace-pre-wrap max-w-[480px]">
                        {formatChange(r.before, r.after)}
                      </pre>
                    </TableCell>
                    <TableCell className="font-mono text-[10px]">{r.ip ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function actionVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (action === 'delete') return 'destructive';
  if (action === 'insert') return 'default';
  if (action === 'update') return 'secondary';
  return 'outline';
}

function formatChange(before: any, after: any): string {
  if (!before && after) {
    return `+ ${JSON.stringify(after).slice(0, 240)}`;
  }
  if (before && !after) {
    return `- ${JSON.stringify(before).slice(0, 240)}`;
  }
  if (before && after) {
    return `- ${JSON.stringify(before).slice(0, 120)}\n+ ${JSON.stringify(after).slice(0, 240)}`;
  }
  return '';
}
