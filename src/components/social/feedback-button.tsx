/**
 * FeedbackButton — always visible on the Profile tab.
 * Opens a modal with 5 category chips + optional 140-char text field.
 * Rate-limited to 1 per 24h.
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { MessageSquare, X, Send } from 'lucide-react';

const CATEGORIES = ['bug', 'feature_request', 'suggestion', 'complaint', 'praise'] as const;

export function FeedbackButton() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!category) {
      toast({ title: 'Pick a category first', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ category, body }),
      });
      const d = await res.json();
      if (!d.ok) {
        toast({ title: 'Could not send', description: d.message, variant: 'destructive' });
        return;
      }
      toast({ title: '✓ Feedback sent', description: 'Thank you — a moderator will read it.' });
      setOpen(false);
      setCategory(null);
      setBody('');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
        <MessageSquare className="h-4 w-4 mr-1.5" /> Send feedback
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Send feedback</CardTitle>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <CardDescription className="text-xs">
          The only place free text is allowed. Max 140 chars. One per 24h.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1 rounded-full text-[11px] font-medium border transition ${
                category === cat
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border hover:border-primary/40'
              }`}
            >
              {cat.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 140))}
          placeholder="Optional: tell us more (max 140 chars)…"
          rows={3}
          className="text-xs resize-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{body.length}/140</span>
          <Button size="sm" disabled={busy || !category} onClick={submit}>
            <Send className="h-3 w-3 mr-1" /> Send
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
