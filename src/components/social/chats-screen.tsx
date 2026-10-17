/**
 * ChatsScreen — list of the user's chats + open a chat with messages.
 *
 * Layout:
 *   - List of chats (other user's name + dept + last message)
 *   - Click a chat → ChatView (message list + send input)
 */

'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ArrowLeft, Send, MessageCircle, Flag } from 'lucide-react';

type Chat = {
  id: string;
  otherUserId: string;
  otherUsername: string | null;
  otherDisplayName: string | null;
  otherDepartment: { code: string; name: string } | null;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
};

type Message = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
};

const REPORT_CATEGORIES = ['harassment', 'spam', 'impersonation', 'off_campus_contact', 'other'] as const;

export function ChatsScreen() {
  const { toast } = useToast();
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [busySending, setBusySending] = useState(false);
  const [draft, setDraft] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [reportingChat, setReportingChat] = useState<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const reloadChats = useCallback(() => {
    let cancelled = false;
    fetch('/api/chats', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.ok) setChats(d.chats); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { return reloadChats(); }, [reloadChats]);

  // Poll messages every 3s when a chat is open.
  useEffect(() => {
    if (!activeChatId) { setMessages([]); return; }
    let cancelled = false;
    const load = () => {
      fetch(`/api/chats/${activeChatId}/messages`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { if (!cancelled && d.ok) setMessages(d.messages ?? []); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [activeChatId]);

  // Scroll to bottom when messages change.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!activeChatId || !draft.trim()) return;
    setBusySending(true);
    try {
      const res = await fetch(`/api/chats/${activeChatId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: draft }),
      });
      const d = await res.json();
      if (!d.ok) {
        toast({ title: 'Could not send', description: d.message, variant: 'destructive' });
        return;
      }
      setDraft('');
      // Immediately reload messages so the user sees their own message.
      const mRes = await fetch(`/api/chats/${activeChatId}/messages`, { cache: 'no-store' });
      const mD = await mRes.json();
      if (mD.ok) setMessages(mD.messages ?? []);
      reloadChats();
    } finally {
      setBusySending(false);
    }
  };

  const submitReport = async (category: string) => {
    if (!reportingChat) return;
    const res = await fetch(`/api/users/${reportingChat.otherUserId}/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category }),
    });
    const d = await res.json();
    if (!d.ok) {
      toast({ title: 'Could not report', description: d.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Report sent', description: 'A moderator will review it.' });
    setShowReport(false);
    setReportingChat(null);
  };

  if (!chats) return <Skeleton className="h-64 w-full rounded-2xl" />;

  // ── Single chat view ─────────────────────────────────────────────────
  if (activeChatId) {
    const chat = chats.find((c) => c.id === activeChatId);
    if (!chat) { setActiveChatId(null); return null; }
    const myId = chats.length > 0 ? null : null; // we don't know my user id here; we'll match by elimination
    return (
      <div className="p-4 space-y-3 h-full flex flex-col">
        <Card className="flex-1 flex flex-col">
          <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2 min-w-0">
              <Button size="sm" variant="ghost" onClick={() => setActiveChatId(null)} className="h-7 px-2">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <CardTitle className="text-sm truncate">
                  {chat.otherDisplayName ?? chat.otherUsername ?? 'Friend'}
                </CardTitle>
                {chat.otherDepartment && (
                  <CardDescription className="text-[10px] truncate">
                    {chat.otherDepartment.name} ({chat.otherDepartment.code})
                  </CardDescription>
                )}
              </div>
            </div>
            <Button size="sm" variant="ghost" className="h-7 text-destructive"
              onClick={() => { setReportingChat(chat); setShowReport(true); }}>
              <Flag className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-2 p-3">
            <ScrollArea className="flex-1 max-h-[60vh]">
              <div className="space-y-2 pr-2">
                {messages.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-4">
                    No messages yet. Say hi.
                  </div>
                ) : (
                  messages.map((m) => {
                    // The current user's id isn't known here — we match
                    // by checking if the message body starts with the
                    // other user's id (no, that's wrong).
                    // Actually we need to know my user id. Let's mark
                    // as "mine" if senderId !== otherUserId (the only
                    // two participants).
                    const isMine = m.senderId !== chat.otherUserId;
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          'max-w-[80%] p-2 rounded-lg text-sm',
                          isMine
                            ? 'ml-auto bg-primary text-primary-foreground rounded-br-sm'
                            : 'mr-auto bg-muted rounded-bl-sm',
                        )}
                      >
                        <div className="break-words">{m.body}</div>
                        <div className={cn('text-[9px] mt-0.5', isMine ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
                          {new Date(m.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              />
              <Button onClick={send} disabled={busySending || !draft.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Chat list ─────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageCircle className="h-4 w-4" /> Chats
          </CardTitle>
          <CardDescription className="text-xs">
            Chats open only after a hello is accepted. No DMs to strangers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chats.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2 text-center">
              No chats yet. Accept a hello to start one.
            </div>
          ) : (
            <ul className="space-y-2">
              {chats.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setActiveChatId(c.id)}
                    className="w-full text-left p-3 rounded-lg border border-border bg-card hover:border-primary/40 flex items-center gap-3"
                  >
                    <div className="h-9 w-9 rounded-full bg-primary/20 grid place-items-center text-xs font-bold text-primary">
                      {(c.otherDisplayName ?? c.otherUsername ?? '?')[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {c.otherDisplayName ?? c.otherUsername ?? 'Friend'}
                      </div>
                      {c.lastMessageBody ? (
                        <div className="text-xs text-muted-foreground truncate">{c.lastMessageBody}</div>
                      ) : (
                        <div className="text-xs text-muted-foreground italic">No messages yet</div>
                      )}
                    </div>
                    {c.lastMessageAt && (
                      <div className="text-[10px] text-muted-foreground shrink-0">
                        {new Date(c.lastMessageAt).toLocaleTimeString()}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {showReport && reportingChat && (
        <ReportModal chat={reportingChat} onClose={() => { setShowReport(false); setReportingChat(null); }} onSubmit={submitReport} />
      )}
    </div>
  );
}

function ReportModal({
  chat,
  onClose,
  onSubmit,
}: {
  chat: Chat;
  onClose: () => void;
  onSubmit: (category: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-sm">Report {chat.otherDisplayName ?? chat.otherUsername ?? 'this person'}</CardTitle>
          <CardDescription className="text-xs">
            Two-tap report. Pick a category — no free text. A moderator will review.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 gap-2">
            {REPORT_CATEGORIES.map((cat) => (
              <Button
                key={cat}
                variant="outline"
                className="justify-start text-xs h-9"
                onClick={() => onSubmit(cat)}
              >
                {cat.replace(/_/g, ' ')}
              </Button>
            ))}
          </div>
          <Button variant="ghost" className="w-full text-xs" onClick={onClose}>Cancel</Button>
        </CardContent>
      </Card>
    </div>
  );
}
