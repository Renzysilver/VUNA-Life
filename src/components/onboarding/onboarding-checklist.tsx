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

type Props = {
  username: string | null;
  isVerified: boolean;
  avatarPath: string | null;
};

const AVATAR_OPTIONS = [
  { code: 'scholar', label: 'Scholar', emoji: '📚' },
  { code: 'athlete', label: 'Athlete', emoji: '⚽' },
  { code: 'creative', label: 'Creative', emoji: '🎨' },
  { code: 'leader', label: 'Leader', emoji: '📋' },
];

export function OnboardingChecklist({ username, isVerified, avatarPath }: Props) {
  const { toast } = useToast();
  const [pickedAvatar, setPickedAvatar] = useState<string | null>(avatarPath);

  // If all steps are done, don't render the checklist.
  if (username && isVerified && avatarPath) return null;

  const steps = [
    { label: 'Set your username', done: !!username, icon: User },
    { label: 'Verify your student email', done: isVerified, icon: MailCheck },
    { label: 'Pick your avatar path', done: !!avatarPath, icon: Palette },
  ];

  const allDone = steps.every((s) => s.done);
  if (allDone) return null;

  const saveAvatar = async (code: string) => {
    setPickedAvatar(code);
    // Persist via /api/student/me PATCH (we'll add a simple update).
    // For now, use the existing config pattern.
    const res = await fetch('/api/student/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ avatarPath: code }),
    });
    if (res.ok) {
      toast({ title: 'Avatar path set!', description: AVATAR_OPTIONS.find(a => a.code === code)?.label });
    }
  };

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

        {/* Avatar picker */}
        {!avatarPath && (
          <div className="pt-2 space-y-2">
            <div className="text-[11px] text-muted-foreground">Pick your avatar:</div>
            <div className="grid grid-cols-4 gap-2">
              {AVATAR_OPTIONS.map((opt) => (
                <button
                  key={opt.code}
                  onClick={() => saveAvatar(opt.code)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-2 rounded-xl border transition',
                    pickedAvatar === opt.code
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/40',
                  )}
                >
                  <span className="text-2xl">{opt.emoji}</span>
                  <span className="text-[10px]">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
