'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, Copy } from 'lucide-react';

export type VerifiedUser = {
  id: string;
  email: string;
  emailDomain: string;
  role: string;
  username: string | null;
  displayName: string | null;
  departmentId: string | null;
  level: number | null;
  isVerifiedStudent: boolean;
};

export type VerifyResponse = {
  user: VerifiedUser;
  department: { code: string; name: string; faculty: string | null } | null;
  mondayTimetable: Array<{
    id: string;
    courseCode: string;
    courseTitle: string;
    weekday: number;
    startTime: string;
    endTime: string;
    venue: { pin: string; name: string | null; status: string } | null;
    lecturer: { username: string } | null;
  }>;
};

export function OtpConfirmForm({
  email,
  demoOtp,
  expiresInSec,
  onVerified,
  onBack,
}: {
  email: string;
  demoOtp?: string;
  expiresInSec: number;
  // onVerified receives the full verify-otp response (user + department +
  // Monday timetable) so the parent can render the dashboard immediately
  // without a second fetch that races against the cookie being committed
  // to the browser jar (a real problem through the preview gateway).
  onVerified: (response: VerifyResponse) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(expiresInSec);

  useEffect(() => {
    const t = setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!data.ok || !data.user) {
        setError(data.message ?? 'Verification failed.');
        return;
      }
      onVerified({
        user: data.user,
        department: data.department ?? null,
        mondayTimetable: data.mondayTimetable ?? [],
      });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="code">One-time code</Label>
        <InputOTP
          id="code"
          maxLength={6}
          value={code}
          onChange={(v: string) => setCode(v)}
          autoFocus
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>

      {demoOtp && (
        <div className="text-xs bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-md p-3 flex items-center justify-between">
          <span>
            <strong>DEMO OTP:</strong>{' '}
            <code className="font-mono text-sm">{demoOtp}</code>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => {
              navigator.clipboard?.writeText(demoOtp);
              setCode(demoOtp);
            }}
          >
            <Copy className="h-3 w-3 mr-1" /> Use it
          </Button>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        Code expires in{' '}
        <span className="font-mono tabular-nums">
          {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
        </span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button type="submit" className="flex-1" disabled={busy || code.length !== 6}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Verify
        </Button>
      </div>
    </form>
  );
}
