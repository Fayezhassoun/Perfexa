// Text-to-speech (CONTRACTS §6): POST {text} → audio stream, or a 200 hint
// payload when unconfigured (client uses speechSynthesis instead).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { env } from '@/lib/env';
import { rateLimit } from '@/lib/rate-limit';

const bodySchema = z.object({ text: z.string().min(1).max(2000) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!rateLimit(`tts:${session.user.id}`, 60, 60_000).ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const { text } = parsed.data;
  const provider = env.TTS_PROVIDER;

  try {
    if (provider === 'openai' && env.OPENAI_API_KEY) {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'tts-1', voice: 'alloy', input: text, response_format: 'mp3' }),
      });
      if (!res.ok || !res.body) throw new Error(`openai tts ${res.status}`);
      return new Response(res.body, { headers: { 'Content-Type': 'audio/mpeg' } });
    }

    if (provider === 'elevenlabs' && env.ELEVENLABS_API_KEY) {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}/stream`,
        {
          method: 'POST',
          headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, model_id: 'eleven_turbo_v2' }),
        },
      );
      if (!res.ok || !res.body) throw new Error(`elevenlabs ${res.status}`);
      return new Response(res.body, { headers: { 'Content-Type': 'audio/mpeg' } });
    }

    return NextResponse.json({ error: 'tts_not_configured', provider });
  } catch (err) {
    return NextResponse.json({
      error: 'tts_failed',
      provider,
      detail: err instanceof Error ? err.message : 'unknown',
    });
  }
}
