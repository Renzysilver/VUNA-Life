'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Save } from 'lucide-react';

type ConfigRow = {
  key: string;
  value: any;
  description: string | null;
};

export function ConfigPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ConfigRow[] | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});

  const reload = useCallback(() => {
    let cancelled = false;
    fetch('/api/admin/config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          if (d.ok) {
            setRows(d.rows);
            const map: Record<string, string> = {};
            for (const r of d.rows) {
              map[r.key] = typeof r.value === 'string' ? r.value : JSON.stringify(r.value);
            }
            setEdits(map);
          } else {
            setRows([]);
          }
        }
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

  const save = async (key: string) => {
    const raw = edits[key];
    let parsed: any = raw;
    // JSON-array-friendly: if it starts with [, try to parse
    if (raw.trim().startsWith('[') || raw.trim().startsWith('{')) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        toast({
          title: 'Invalid JSON',
          description: `${key} must be valid JSON if it starts with [ or {.`,
          variant: 'destructive',
        });
        return;
      }
    } else if (/^-?\d+$/.test(raw.trim())) {
      parsed = parseInt(raw, 10);
    }

    const res = await fetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, value: parsed }),
    });
    const d = await res.json();
    if (d.ok) {
      toast({ title: 'Saved', description: `${key} updated. Audit log written.` });
      reload();
    } else {
      toast({ title: 'Failed', description: d.message, variant: 'destructive' });
    }
  };

  const allowedEmailsRow = rows?.find((r) => r.key === 'allowed_email_domains');

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>allowed_email_domains controls sign-up</AlertTitle>
        <AlertDescription>
          The default is an empty list <code>[]</code>, which means sign-up is
          closed for everyone. Populate this with real school domains to open
          verification. In DEMO MODE the email check is bypassed so you can
          see the flow. Treat example domains as unverified guesses.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration</CardTitle>
          <CardDescription>
            Every change is audited. Prices, caps and fines live here, never in
            code (HARD RULE).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!rows ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="space-y-3">
              {rows.map((r) => (
                <div
                  key={r.key}
                  className="grid grid-cols-1 sm:grid-cols-[200px_1fr_auto] gap-2 sm:gap-3 items-start sm:items-center p-3 rounded-md border"
                >
                  <div className="space-y-0.5">
                    <div className="font-mono text-xs">{r.key}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.description}
                    </div>
                  </div>
                  <Input
                    value={edits[r.key] ?? ''}
                    onChange={(e) =>
                      setEdits((s) => ({ ...s, [r.key]: e.target.value }))
                    }
                    className="font-mono text-xs"
                    placeholder={
                      r.key === 'allowed_email_domains'
                        ? '["veritas.edu.ng"]'
                        : ''
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => save(r.key)}
                  >
                    <Save className="h-3.5 w-3.5 mr-1" /> Save
                  </Button>
                </div>
              ))}
            </div>
          )}
          {allowedEmailsRow && Array.isArray(allowedEmailsRow.value) && allowedEmailsRow.value.length === 0 && (
            <div className="mt-4 text-xs text-amber-700 dark:text-amber-300">
              <strong>Sign-up is currently CLOSED.</strong>{' '}
              No email domain is on the whitelist.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
