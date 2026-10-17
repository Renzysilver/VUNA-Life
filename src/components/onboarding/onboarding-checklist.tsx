/**
 * OnboardingChecklist — shown on the Home screen for new beta students
 * until they complete all 4 steps:
 *   1. Set a username (already done at signup, but can be changed)
 *   2. Verify student email (already done via OTP)
 *   3. Pick an avatar path (new — 4 simple options)
 *   4. Done!
 *
 * The checklist dismisses once all steps are complete.
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, User, MailCheck, Palette, Sparkles } from 'lucide-react';
import { BODY_TYPES, SKIN_TONES_LIST, AvatarRenderer, type AvatarConfig } from '@/components/avatar/avatar-renderer';

type Props = {
  username: string | null;
  isVerified: boolean;
  avatarPath: string | null;
};

export function OnboardingChecklist({ username, isVerified, avatarPath }: Props) {
  const { toast } = useToast();
  const [bodyType, setBodyType] = useState<string | null>(null);
  const [skinTone, setSkinTone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // avatarPath from Phase 6 doubles as "onboarding complete" flag.
  // If it's set, we treat onboarding as done.
  const lookPicked = !!(bodyType && skinTone);
  if (username && isVerified && avatarPath) return null;

  const steps = [
    { label: 'Set your username', done: !!username, icon: User },
    { label: 'Verify your student email', done: isVerified, icon: MailCheck },
    { label: 'Pick your look (body type + skin tone)', done: lookPicked, icon: Palette },
  ];

  const allDone = steps.every((s) => s.done);
  if (allDone) return null;

  const saveLook = async () => {
    if (!bodyType || !skinTone) return;
    setSaving(true);
    try {
      // Save avatar config (server-side only)
      const res = await fetch('/api/avatar/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bodyType, skinTone }),
      });
      const d = await res.json();
      if (!d.ok) {
        toast({ title: 'Could not save', description: d.message, variant: 'destructive' });
        return;
      }
      toast({ title: '✓ Look saved!', description: 'Your avatar is ready.' });
    } finally {
      setSaving(false);
    }
  };

  const config: AvatarConfig | null = bodyType && skinTone
    ? { bodyType: bodyType as any, skinTone: skinTone as any }
    : null;

  return (
    <Card className="border-accent/30 bg-accent/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent-foreground" />
          Welcome to VUNA Life
        </CardTitle>
        <CardDescription className="text-xs">
          Complete these steps to finish your onboarding.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            {step.done ? (
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span className={step.done ? 'text-muted-foreground line-through' : ''}>
              {step.label}
            </span>
          </div>
        ))}

        {/* Body type + skin tone picker (step 3) */}
        {!lookPicked && (
          <div className="pt-2 space-y-3">
            {/* Live preview */}
            <div className="flex justify-center">
              <div className="rounded-xl bg-card border border-border p-2">
                {config ? (
                  <AvatarRenderer config={config} equipped={null} hairStage="Fresh" size="small" />
                ) : (
                  <div className="w-20 h-32 rounded-xl bg-muted grid place-items-center text-[10px] text-muted-foreground">
                    Pick your look
                  </div>
                )}
              </div>
            </div>

            {/* Body type */}
            <div className="space-y-1.5">
              <div className="text-[11px] text-muted-foreground">Body type</div>
              <div className="grid grid-cols-3 gap-2">
                {BODY_TYPES.map((bt) => (
                  <button
                    key={bt.code}
                    onClick={() => setBodyType(bt.code)}
                    className={cn(
                      'flex flex-col items-center gap-0.5 p-2 rounded-xl border text-[10px] transition',
                      bodyType === bt.code
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/40',
                    )}
                  >
                    <span className="text-lg">{bt.emoji}</span>
                    <span>{bt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Skin tone */}
            <div className="space-y-1.5">
              <div className="text-[11px] text-muted-foreground">Skin tone</div>
              <div className="grid grid-cols-6 gap-2">
                {SKIN_TONES_LIST.map((st) => (
                  <button
                    key={st.code}
                    onClick={() => setSkinTone(st.code)}
                    className={cn(
                      'h-8 w-8 rounded-full border-2 transition',
                      skinTone === st.code
                        ? 'border-primary ring-2 ring-primary/30'
                        : 'border-border',
                    )}
                    style={{ backgroundColor: st.code }}
                    title={st.label}
                  />
                ))}
              </div>
            </div>

            {/* Save button */}
            {bodyType && skinTone && (
              <Button size="sm" className="w-full" disabled={saving} onClick={saveLook}>
                {saving ? 'Saving…' : 'Save my look'}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
