// Speech-to-text (CONTRACTS §6): POST multipart audio → {transcript}.
// mock/unset returns a 200 hint payload so the client falls back to browser
// STT or the text box.

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { env } from '@/lib/env';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!rateLimit(`stt:${session.user.id}`, 30, 60_000).ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const provider = env.STT_PROVIDER;
  if (provider === 'mock' || provider === 'browser') {
    return NextResponse.json({ transcript: '', error: 'stt_not_configured', provider });
  }

  const form = await req.formData().catch(() => null);
  const audio = form?.get('audio');
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: 'missing_audio' }, { status: 400 });
  }
  if (audio.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'audio_too_large' }, { status: 413 });
  }

  try {
    if (provider === 'whisper') {
      if (!env.OPENAI_API_KEY) {
        return NextResponse.json({ transcript: '', error: 'stt_not_configured', provider });
      }
      const upstream = new FormData();
      upstream.append('file', audio, 'audio.webm');
      upstream.append('model', 'whisper-1');
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: upstream,
      });
      if (!res.ok) throw new Error(`whisper ${res.status}`);
      const data = (await res.json()) as { text?: string };
      return NextResponse.json({ transcript: data.text ?? '' });
    }

    // deepgram
    if (!env.DEEPGRAM_API_KEY) {
      return NextResponse.json({ transcript: '', error: 'stt_not_configured', provider });
    }
    const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
      method: 'POST',
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        'Content-Type': audio.type || 'audio/webm',
      },
      body: Buffer.from(await audio.arrayBuffer()),
    });
    if (!res.ok) throw new Error(`deepgram ${res.status}`);
    const data = (await res.json()) as {
      results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
    };
    const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
    return NextResponse.json({ transcript });
  } catch (err) {
    // Degrade gracefully (CONTRACTS §3): surface a hint, client falls back.
    return NextResponse.json({
      transcript: '',
      error: 'stt_failed',
      provider,
      detail: err instanceof Error ? err.message : 'unknown',
    });
  }
}

export function GET(req: Request) {
  void clientIp(req.headers);
  return NextResponse.json({ provider: env.STT_PROVIDER });
}
