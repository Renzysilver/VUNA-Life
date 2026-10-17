'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Download, Upload, FileText } from 'lucide-react';

type ImportKind = 'departments' | 'courses' | 'timetable';

const SAMPLE_CSV: Record<ImportKind, string> = {
  departments: `code,name,faculty
CSC,Computer Science,Natural and Applied Sciences
LAW,Law,Law
MED,Medicine and Surgery,Medicine`,
  courses: `code,title,department,level,credits
CSC201,Data Structures,CSC,200,3
CSC301,Algorithms,CSC,300,3
LAW101,Introduction to Law,LAW,100,2`,
  timetable: `course,department,level,day,start,end,venue
CSC201,CSC,200,Monday,08:00,10:00,2
CSC201,CSC,200,Monday,14:00,16:00,2
LAW101,LAW,100,Monday,10:00,12:00,1`,
};

const HEADERS: Record<ImportKind, string> = {
  departments: 'code, name, faculty',
  courses: 'code, title, department, level (100–800), credits',
  timetable: 'course, department, level, day, start, end, venue (pin)',
};

export function ImportPanel() {
  const { toast } = useToast();
  const [busy, setBusy] = useState<ImportKind | null>(null);
  const [csvText, setCsvText] = useState<Record<ImportKind, string>>({
    departments: '',
    courses: '',
    timetable: '',
  });

  const runImport = async (kind: ImportKind) => {
    const csv = csvText[kind].trim();
    if (!csv) {
      toast({ title: 'Empty', description: 'Paste a CSV body first.', variant: 'destructive' });
      return;
    }
    setBusy(kind);
    try {
      const res = await fetch(`/api/admin/import/${kind}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const d = await res.json();
      if (!d.ok) {
        toast({
          title: `${kind} import failed`,
          description: d.message,
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: `${kind} imported`,
        description: `Inserted ${d.inserted ?? 0}, updated ${d.updated ?? 0}. ${
          d.ignored?.length ? `${d.ignored.length} row(s) ignored.` : ''
        } ${
          d.orphanedDepartments?.length || d.orphanedCourse?.length || d.orphanedVenue?.length
            ? 'Some rows referenced missing parent records — see response.'
            : ''
        }`,
      });
      console.log(`${kind} import response:`, d);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {(['departments', 'courses', 'timetable'] as ImportKind[]).map((kind) => (
        <Card key={kind} className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base capitalize">
              <FileText className="h-4 w-4" /> {kind}
            </CardTitle>
            <CardDescription>
              Headers: <code className="text-[11px]">{HEADERS[kind]}</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-3">
            <div className="space-y-1.5 flex-1 flex flex-col">
              <Label htmlFor={`${kind}-csv`} className="text-xs">
                CSV body
              </Label>
              <Textarea
                id={`${kind}-csv`}
                value={csvText[kind]}
                onChange={(e) => setCsvText((s) => ({ ...s, [kind]: e.target.value }))}
                rows={8}
                placeholder={SAMPLE_CSV[kind]}
                className="font-mono text-xs flex-1"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => runImport(kind)}
                disabled={busy === kind}
              >
                <Upload className="h-3.5 w-3.5 mr-1" /> Import
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setCsvText((s) => ({ ...s, [kind]: SAMPLE_CSV[kind] }))
                }
              >
                <Download className="h-3.5 w-3.5 mr-1" /> Sample
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
