'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Building2, Pencil, Plus, RefreshCw, Search } from 'lucide-react';

type Building = {
  id: string;
  pin: string;
  name: string | null;
  category: string;
  genderAttr: string | null;
  status: string;
  positionStatus: string;
  facing: string | null;
  footprints: any[];
  courtyardPx: any[] | null;
  sourceNote: string | null;
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  USER_CONFIRMED: 'default',
  SECONDARY_SOURCE: 'secondary',
  UNNAMED: 'secondary',
  NAME_PENDING: 'outline',
  PROPOSED: 'outline',
  MISSING_FROM_OLD_IMAGE: 'destructive',
  TO_VERIFY: 'destructive',
};

const STATUSES = [
  'USER_CONFIRMED',
  'SECONDARY_SOURCE',
  'UNNAMED',
  'NAME_PENDING',
  'PROPOSED',
  'MISSING_FROM_OLD_IMAGE',
  'TO_VERIFY',
];

const CATEGORIES = ['academic', 'hostel', 'shop', 'service', 'sports', 'other'];
const GENDERS = ['', 'boys', 'girls', 'mixed', 'staff'];

export function BuildingsPanel() {
  const { toast } = useToast();
  const [buildings, setBuildings] = useState<Building[] | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editing, setEditing] = useState<Building | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(() => {
    let cancelled = false;
    fetch('/api/admin/buildings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setBuildings(d.ok ? d.buildings : []);
      })
      .catch(() => {
        if (!cancelled) setBuildings([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = reload();
    return cleanup;
  }, [reload]);

  const filtered = useMemo(() => {
    if (!buildings) return [];
    const q = search.trim().toLowerCase();
    return buildings.filter((b) => {
      if (categoryFilter !== 'all' && b.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (q) {
        const hay = `${b.pin} ${b.name ?? ''} ${b.category} ${b.genderAttr ?? ''} ${b.status}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [buildings, search, categoryFilter, statusFilter]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Building2 className="h-5 w-5" /> Buildings
                {buildings && (
                  <Badge variant="secondary" className="ml-1">
                    {filtered.length}/{buildings.length}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                43 records seeded from <code>veritas_campus_map.json</code>.
                Some buildings have multiple footprints. Status badges follow the
                design doc's status taxonomy; everything unknown starts as
                TO_VERIFY and is never silently guessed.
              </CardDescription>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={reload}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Dialog open={creating} onOpenChange={setCreating}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </DialogTrigger>
                <BuildingEditDialog
                  mode="create"
                  onClose={() => setCreating(false)}
                  onSaved={() => {
                    setCreating(false);
                    reload();
                  }}
                />
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 mb-4">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search pin, name, status…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!buildings ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ScrollArea className="max-h-[60vh] rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="w-[80px]">Pin</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-[100px]">Category</TableHead>
                    <TableHead className="w-[100px]">Gender</TableHead>
                    <TableHead className="w-[160px]">Status</TableHead>
                    <TableHead className="w-[80px] text-right">FPs</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs">{b.pin}</TableCell>
                      <TableCell className="font-medium text-sm">
                        {b.name ?? (
                          <span className="text-muted-foreground italic">Unnamed building</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{b.category}</Badge>
                      </TableCell>
                      <TableCell>
                        {b.genderAttr ? (
                          <Badge variant="secondary" className="text-[10px]">{b.genderAttr}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[b.status] ?? 'secondary'} className="text-[10px]">
                          {b.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        {b.footprints.length}
                      </TableCell>
                      <TableCell>
                        <Dialog
                          open={editing?.id === b.id}
                          onOpenChange={(open) => setEditing(open ? b : null)}
                        >
                          <DialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </DialogTrigger>
                          <BuildingEditDialog
                            mode="edit"
                            building={b}
                            onClose={() => setEditing(null)}
                            onSaved={() => {
                              setEditing(null);
                              reload();
                              toast({ title: 'Saved', description: `Building ${b.pin} updated. Audit log written.` });
                            }}
                          />
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-6">
                        No buildings match this filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BuildingEditDialog({
  mode,
  building,
  onClose,
  onSaved,
}: {
  mode: 'create' | 'edit';
  building?: Building;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(building?.name ?? '');
  const [category, setCategory] = useState(building?.category ?? 'other');
  const [genderAttr, setGenderAttr] = useState(building?.genderAttr ?? '');
  const [status, setStatus] = useState(building?.status ?? 'TO_VERIFY');
  const [positionStatus, setPositionStatus] = useState(building?.positionStatus ?? 'TO_VERIFY');
  const [pin, setPin] = useState(building?.pin ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      if (mode === 'create') {
        if (!pin.trim()) {
          toast({ title: 'Pin required', variant: 'destructive' });
          setBusy(false);
          return;
        }
        const res = await fetch('/api/admin/buildings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            pin: pin.trim(),
            name: name.trim() || null,
            category,
            genderAttr: genderAttr || null,
            status,
            positionStatus,
          }),
        });
        const d = await res.json();
        if (!d.ok) {
          toast({ title: 'Failed', description: d.message, variant: 'destructive' });
          return;
        }
        onSaved();
      } else if (building) {
        const res = await fetch('/api/admin/buildings', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            pin: building.pin,
            name: name.trim() || null,
            category,
            genderAttr: genderAttr || null,
            status,
            positionStatus,
          }),
        });
        const d = await res.json();
        if (!d.ok) {
          toast({ title: 'Failed', description: d.message, variant: 'destructive' });
          return;
        }
        onSaved();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>
          {mode === 'create' ? 'Add a building' : `Edit building ${building?.pin}`}
        </DialogTitle>
        <DialogDescription>
          {mode === 'create'
            ? 'New buildings default to TO_VERIFY. The owner must confirm before they go live.'
            : 'Every change is written to audit_log with your actor id.'}
        </DialogDescription>
      </DialogHeader>

      {mode === 'create' && (
        <div className="space-y-1.5">
          <Label htmlFor="pin">Pin (stable id)</Label>
          <Input id="pin" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="e.g. 39" />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Leave blank for unnamed"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Gender attr</Label>
          <Select value={genderAttr} onValueChange={setGenderAttr}>
            <SelectTrigger><SelectValue placeholder="none" /></SelectTrigger>
            <SelectContent>
              {GENDERS.map((g) => (
                <SelectItem key={g || 'none'} value={g || 'none'}>{g || 'none'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Position status</Label>
          <Input
            value={positionStatus}
            onChange={(e) => setPositionStatus(e.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
