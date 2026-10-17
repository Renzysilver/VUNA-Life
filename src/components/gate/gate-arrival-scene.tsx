/**
 * GateArrivalScene — full-screen overlay shown on first login of the day.
 *
 * The outcome is computed SERVER-SIDE before this scene renders — the
 * client cannot skip consequences. The scene is skippable after 3 seconds
 * (config: gate_skip_delay_seconds) but the discipline entries are
 * already applied.
 *
 * All officer dialogue lines are AI-labelled (HARD RULE).
 */

'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ShieldCheck, AlertTriangle, Scissors, X, SkipForward } from 'lucide-react';

type DialogueLine = { text: string; isAI: boolean };

type GateData = {
  arrivalId: string;
  officerPersonality: string;
  searchOutcome: string;
  dressCodeResult: string;
  disciplineApplied: string | null;
  dialogueLines: DialogueLine[];
  alreadyArrived: boolean;
};

const PERSONALITY_LABELS: Record<string, string> = {
  strict: 'Strict Officer',
  relaxed: 'Relaxed Officer',
  suspicious: 'Suspicious Officer',
  friendly: 'Friendly Officer',
};

const PERSONALITY_EMOJI: Record<string, string> = {
  strict: '😤',
  relaxed: '😌',
  suspicious: '🤨',
  friendly: '😊',
};

export function GateArrivalScene({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<GateData | null>(null);
  const [canSkip, setCanSkip] = useState(false);

  useEffect(() => {
    // Compute the gate outcome (server-side, deterministic).
    fetch('/api/gate/arrive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'compute' }) })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setData(d);
      })
      .catch(() => {});
    // Enable the skip button after 3 seconds (config).
    const t = setTimeout(() => setCanSkip(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const handleSkip = async () => {
    if (!data) return;
    await fetch('/api/gate/arrive', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'skip', arrivalId: data.arrivalId }),
    });
    onDone();
  };

  if (!data) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-background">
        <div className="animate-pulse text-muted-foreground">Arriving at the gate…</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      {/* ── Gate scene header ──────────────────────────── */}
      <div className="bg-primary px-6 pt-12 pb-8">
        <div className="text-white/60 text-[11px] uppercase tracking-widest mb-1">VUNA Life</div>
        <h1
          className="text-2xl font-bold text-white"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Main Gate
        </h1>
        <p className="text-white/50 text-xs mt-1">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* ── Officer ──────────────────────────────────── */}
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border">
          <div className="h-12 w-12 rounded-full bg-primary/15 grid place-items-center text-2xl">
            {PERSONALITY_EMOJI[data.officerPersonality] ?? '👮'}
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">{PERSONALITY_LABELS[data.officerPersonality] ?? 'Security Officer'}</div>
            <div className="text-[11px] text-muted-foreground">On duty today</div>
          </div>
          {/* AI LABEL — HARD RULE */}
          <Badge variant="outline" className="text-[9px] border-amber-400/40 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20">
            AI NPC
          </Badge>
        </div>

        {/* ── Dialogue lines (AI-labelled) ──────────────── */}
        <div className="space-y-2">
          {data.dialogueLines.map((line, i) => (
            <div
              key={i}
              className={cn(
                'p-3 rounded-2xl border text-sm',
                line.isAI
                  ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/40 dark:border-amber-900'
                  : 'bg-card border-border',
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                {line.isAI && (
                  <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                    AI
                  </span>
                )}
              </div>
              <div className="leading-relaxed">{line.text}</div>
            </div>
          ))}
        </div>

        {/* ── Search outcome ─────────────────────────── */}
        <div className={cn(
          'p-3 rounded-2xl border flex items-center gap-2 text-sm',
          data.searchOutcome === 'cleared'
            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/40 text-emerald-700 dark:text-emerald-300'
            : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/40 text-amber-700 dark:text-amber-300',
        )}>
          {data.searchOutcome === 'cleared' ? (
            <ShieldCheck className="h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          <span>
            {data.searchOutcome === 'cleared' ? 'Bag search: cleared.' : 'Bag search: items checked.'}
          </span>
        </div>

        {/* ── Dress code ─────────────────────────────── */}
        {data.dressCodeResult === 'violation' && (
          <div className="p-3 rounded-2xl border border-destructive/30 bg-destructive/5 flex items-center gap-2 text-sm text-destructive">
            <Scissors className="h-4 w-4 shrink-0" />
            <span>Hair past the allowed level — <strong>Form</strong> entry recorded. Get a haircut before you come back.</span>
          </div>
        )}

        {/* ── Discipline summary ─────────────────────── */}
        {data.disciplineApplied && (
          <div className="text-xs text-muted-foreground text-center">
            Discipline: <span className="font-semibold">{data.disciplineApplied}</span> tier applied. This is private to you — not shown to other students.
          </div>
        )}

        {/* ── Skip / Continue ─────────────────────────── */}
        <div className="pt-2">
          {canSkip ? (
            <Button className="w-full" onClick={handleSkip}>
              Enter campus →
            </Button>
          ) : (
            <div className="text-center text-xs text-muted-foreground">
              <SkipForward className="inline h-3 w-3 mr-1" />
              Outcome already computed. You can enter in {Math.ceil((3000 - (Date.now() % 3000)) / 1000)}s.
            </div>
          )}
        </div>

        {data.alreadyArrived && (
          <div className="text-[10px] text-muted-foreground text-center italic">
            You already arrived today — this is a replay of the scene.
          </div>
        )}
      </div>
    </div>
  );
}
