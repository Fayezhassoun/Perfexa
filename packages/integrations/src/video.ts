// Video generation adapters (CONTRACTS / Wave 2A).
// Mock-first offline, live fal.ai adapter behind API key.

import { hashHex } from './util/hash.js';

export interface GenerateVideoInput {
  prompt: string;
  style?: string; // ugc|product_demo|cinematic|slideshow
  aspectRatio?: string; // 9:16|1:1|16:9
  durationSec?: number;
}

export interface VideoJobResult {
  jobId: string;
  status: 'completed' | 'failed' | 'processing' | 'queued' | 'needs_approval';
  resultUrl?: string;
  thumbnailUrl?: string;
  costCents: number;
  provider: 'mock' | 'fal' | 'replicate';
  error?: string;
}

export interface VideoAdapter {
  provider: 'mock' | 'fal' | 'replicate';
  generate(input: GenerateVideoInput): Promise<VideoJobResult>;
}

export function createMockVideoAdapter(): VideoAdapter {
  return {
    provider: 'mock',
    async generate(input: GenerateVideoInput): Promise<VideoJobResult> {
      const hash = hashHex(input.prompt);
      const jobId = `mock_${hash.slice(0, 12)}`;
      const resultUrl = `https://cdn.growthcrew.dev/mock/${hash}.mp4`;
      const thumbnailUrl = `https://cdn.growthcrew.dev/mock/${hash}_thumb.jpg`;
      const costCents = 15;

      return {
        jobId,
        status: 'completed',
        resultUrl,
        thumbnailUrl,
        costCents,
        provider: 'mock',
      };
    },
  };
}

export function createFalVideoAdapter(options?: { apiKey?: string; fetch?: typeof fetch }): VideoAdapter {
  const apiKey = options?.apiKey ?? process.env.FAL_KEY ?? process.env.FAL_API_KEY;
  const customFetch = options?.fetch ?? globalThis.fetch;

  return {
    provider: 'fal',
    async generate(input: GenerateVideoInput): Promise<VideoJobResult> {
      const endpoint = 'https://fal.run/fal-ai/hunyuan-video';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Key ${apiKey}`;
      }

      const res = await customFetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: input.prompt,
          aspect_ratio: input.aspectRatio ?? '9:16',
          duration: input.durationSec ?? 15,
          style: input.style ?? 'ugc',
        }),
      });

      const hash = hashHex(input.prompt);
      const fallbackJobId = `fal_${hash.slice(0, 12)}`;

      if (!res.ok) {
        let errorMsg = `fal.ai error: ${res.status} ${res.statusText}`;
        try {
          const errData = (await res.json()) as { error?: string; detail?: string };
          errorMsg = errData.error ?? errData.detail ?? errorMsg;
        } catch {
          // keep fallback
        }
        return {
          jobId: fallbackJobId,
          status: 'failed',
          costCents: 0,
          provider: 'fal',
          error: errorMsg,
        };
      }

      const data = (await res.json()) as {
        request_id?: string;
        id?: string;
        video?: { url?: string };
        video_url?: string;
        url?: string;
        thumbnail?: { url?: string };
        thumbnail_url?: string;
        cost_cents?: number;
      };

      const resultUrl = data.video?.url ?? data.video_url ?? data.url;
      const thumbnailUrl = data.thumbnail?.url ?? data.thumbnail_url;
      const jobId = data.request_id ?? data.id ?? fallbackJobId;
      const costCents = data.cost_cents ?? 50;

      return {
        jobId,
        status: 'completed',
        resultUrl,
        thumbnailUrl,
        costCents,
        provider: 'fal',
      };
    },
  };
}

export function getVideoAdapter(options?: { provider?: string; apiKey?: string; fetch?: typeof fetch }): VideoAdapter {
  const provider = options?.provider ?? process.env.VIDEO_PROVIDER ?? 'mock';
  if (provider === 'fal') {
    return createFalVideoAdapter(options);
  }
  return createMockVideoAdapter();
}
