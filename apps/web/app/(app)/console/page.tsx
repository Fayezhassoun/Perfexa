'use client';

// Voice Console (CONTRACTS §10): the home screen. Push-to-talk / hands-free
// mic, waveform, live partial transcript, full text parity, TTS with mute and
// barge-in, inline proposal cards with voice approval.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mic, MicOff, Plus, Send, Volume2, VolumeX } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useVoice } from '@/components/console/use-voice';
import { ProposalCard, type PlanShape } from '@/components/console/proposal-card';

export default function ConsolePage() {
  const utils = trpc.useUtils();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversationsQuery = trpc.conversations.list.useQuery();
  const conversationQuery = trpc.conversations.get.useQuery(
    { id: conversationId! },
    { enabled: !!conversationId },
  );
  const pendingProposals = trpc.proposals.list.useQuery({ status: 'pending' });

  const invalidateAfterAction = useCallback(async () => {
    await Promise.all([
      utils.conversations.invalidate(),
      utils.proposals.invalidate(),
      utils.dashboard.invalidate(),
      utils.agents.invalidate(),
      utils.campaigns.invalidate(),
    ]);
  }, [utils]);

  const sendMessage = trpc.conversations.sendMessage.useMutation({
    onSuccess: async (result) => {
      setConversationId(result.conversationId);
      await invalidateAfterAction();
      speak(result.reply);
    },
  });

  const voice = useVoice({
    onTranscript: (text) => submit(text, 'voice'),
  });
  const { speak } = voice;

  const approve = trpc.proposals.approve.useMutation({ onSuccess: invalidateAfterAction });
  const reject = trpc.proposals.reject.useMutation({ onSuccess: invalidateAfterAction });
  const requestChanges = trpc.proposals.requestChanges.useMutation({ onSuccess: invalidateAfterAction });

  const submit = useCallback(
    (text: string, modality: 'voice' | 'text') => {
      const content = text.trim();
      if (!content || sendMessage.isPending) return;
      voice.stopPlayback(); // barge-in
      sendMessage.mutate({ conversationId: conversationId ?? undefined, content, modality });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId, sendMessage.isPending],
  );

  const messages = conversationQuery.data?.messages ?? [];
  const conversationProposals = useMemo(
    () => (pendingProposals.data ?? []).filter((p) => !conversationId || p.conversationId === conversationId),
    [pendingProposals.data, conversationId],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, conversationProposals.length, sendMessage.isPending]);

  return (
    <div className="animate-page-in flex h-[calc(100dvh-3.5rem)] min-h-[560px] bg-transparent">
      {/* Conversation sidebar — floating glass panel */}
      <aside className="glass-elevated m-3 mr-0 hidden w-64 shrink-0 flex-col lg:flex">
        <div className="glass-divider-b flex items-center justify-between p-3">
          <div>
            <p className="text-sm font-medium">Conversations</p>
            <p className="mt-0.5 text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">Your workbench</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="New conversation"
            onClick={() => setConversationId(null)}
          >
            <Plus />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {(conversationsQuery.data ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => setConversationId(c.id)}
              className={cn(
                'mb-1 w-full rounded-xl border border-transparent px-3 py-2 text-left text-sm transition-all duration-300 hover:border-[color:var(--glass-border)] hover:bg-[color:var(--glass-bg-subtle)]',
                conversationId === c.id &&
                  'border-[color:var(--glass-border-strong)] bg-[color:var(--glass-bg-subtle)] shadow-sm',
              )}
            >
              <span className="block truncate font-medium">{c.title ?? 'Conversation'}</span>
              {c.lastMessage?.content && (
                <span className="block truncate text-xs text-muted-foreground">
                  {c.lastMessage.content}
                </span>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* Main console */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="liquid-topbar flex h-14 items-center justify-between px-4">
          <div>
            <h1 className="font-display font-semibold tracking-tight">Voice Console</h1>
            <p className="hidden text-[0.68rem] text-muted-foreground sm:block">Speak clearly. Approve deliberately.</p>
          </div>
          <div className="flex items-center gap-2">
            {conversationProposals.length > 0 && (
              <span className="glass-chip hidden rounded-full px-2.5 py-1 text-xs text-amber-600 dark:text-amber-400 sm:inline-flex">
                {conversationProposals.length} awaiting approval
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label={voice.muted ? 'Unmute replies' : 'Mute replies'}
              onClick={() => {
                if (!voice.muted) voice.stopPlayback();
                voice.setMuted(!voice.muted);
              }}
            >
              {voice.muted ? <VolumeX /> : <Volume2 />}
            </Button>
            <Button
              variant={voice.handsFree ? 'default' : 'outline'}
              size="sm"
              onClick={voice.toggleHandsFree}
            >
              {voice.handsFree ? 'Hands-free on' : 'Hands-free'}
            </Button>
          </div>
        </header>

        {voice.micDenied && (
          <div className="border-b bg-amber-500/10 px-4 py-2 text-sm text-amber-500" data-testid="mic-denied-hint">
            Microphone access was blocked — no problem, just type below. You can re-enable the mic
            in your browser&apos;s site settings.
          </div>
        )}

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4" data-testid="chat-panel">
          {messages.length === 0 && !sendMessage.isPending && (
            <div className="animate-fade-up flex h-full flex-col items-center justify-center text-center">
              <div className="voice-wave mb-6 flex items-end gap-1" aria-hidden>
                {[0.4, 0.75, 1, 0.6, 0.9, 0.5, 0.8].map((h, i) => (
                  <span
                    key={i}
                    className="animate-eq w-1 rounded-full bg-current"
                    style={{ height: `${h * 32}px`, animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </div>
              <div className="voice-orb mb-6 flex h-16 w-16 items-center justify-center rounded-2xl text-[color:hsl(var(--voice))]">
                <Mic className="h-7 w-7" />
              </div>
              <p className="font-display max-w-md text-2xl font-semibold tracking-tight">
                Tell me what you need — <span className="text-primary">like you would a colleague.</span>
              </p>
              <p className="mt-3 max-w-md text-sm text-muted-foreground">
                Try: “I need an SEO specialist. I need my website to be top visible. I need to get
                leads.”
              </p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'animate-fade-up max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'vox-gradient rounded-br-md text-white shadow-lg shadow-primary/20'
                    : 'glass rounded-bl-md',
                )}
                data-role={m.role}
              >
                {m.content}
                {m.inputModality === 'voice' && m.role === 'user' && (
                  <Mic className="ml-2 inline h-3 w-3 opacity-60" />
                )}
              </div>
            </div>
          ))}
          {sendMessage.isPending && (
            <div className="flex justify-start">
              <div className="glass flex items-center gap-2 rounded-2xl rounded-bl-md px-4 py-3">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
                <span className="sr-only">Thinking…</span>
              </div>
            </div>
          )}
          {conversationProposals.map((p) => (
            <ProposalCard
              key={p.id}
              plan={p.plan as unknown as PlanShape}
              status={p.status ?? 'pending'}
              busy={approve.isPending || reject.isPending || requestChanges.isPending}
              onApprove={() => approve.mutate({ id: p.id, via: 'click' })}
              onReject={() => reject.mutate({ id: p.id, via: 'click' })}
              onRequestChanges={(comment) => requestChanges.mutate({ id: p.id, comment, via: 'click' })}
            />
          ))}
        </div>

        {/* Input row */}
        <div className="glass-divider-t bg-[color:var(--glass-bg-subtle)] p-4 backdrop-blur-xl">
          {voice.partial && (
            <p className="mb-2 text-sm italic text-muted-foreground" data-testid="partial-transcript">
              {voice.partial}…
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={voice.recording ? 'Stop recording' : 'Hold to talk'}
              data-testid="mic-button"
              onMouseDown={() => !voice.handsFree && voice.startRecording()}
              onMouseUp={() => !voice.handsFree && voice.stopRecording()}
              onTouchStart={() => !voice.handsFree && voice.startRecording()}
              onTouchEnd={() => !voice.handsFree && voice.stopRecording()}
              onClick={() => voice.handsFree && (voice.recording ? voice.stopRecording() : voice.startRecording())}
              className={cn(
                'voice-orb relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-[color:hsl(var(--voice))] transition-all duration-200 active:scale-95',
                voice.recording ? 'border-destructive/60 bg-destructive/10 text-destructive' : 'animate-pulse-glow hover:scale-[1.02]',
              )}
              style={
                voice.recording
                  ? { boxShadow: `0 0 0 ${4 + voice.level * 20}px hsl(var(--destructive) / 0.22), 0 0 32px hsl(var(--destructive) / 0.5)` }
                  : undefined
              }
            >
              {voice.micDenied ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
            </button>
            <form
              className="flex flex-1 items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit(draft, 'text');
                setDraft('');
              }}
            >
              <Input
                placeholder="…or type instead"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                data-testid="text-input"
              />
              <Button type="submit" size="icon" aria-label="Send" disabled={sendMessage.isPending}>
                <Send />
              </Button>
            </form>
          </div>
          {sendMessage.isError && (
            <p className="mt-2 text-sm text-destructive">{sendMessage.error.message}</p>
          )}
        </div>
      </div>
    </div>
  );
}
