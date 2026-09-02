import { z } from 'zod';

// All CONTRACTS §3 vars with their zero-config defaults.
// NEXT_PUBLIC_* are read via explicit process.env.X access so Next can inline
// them into the client bundle at build time.
const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .default('postgres://postgres:postgres@localhost:5433/growthcrew'),
  REDIS_URL: z.string().default('redis://localhost:6380'),
  AUTH_SECRET: z.string().default('dev-secret-change-me-32-bytes-minimum!!'),
  AUTH_URL: z.string().default('http://localhost:3000'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  ENCRYPTION_KEY: z
    .string()
    .length(64)
    .default('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'),
  LLM_PROVIDER: z.string().default('mock'),
  OPENAI_API_KEY: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  DEEPSEEK_API_KEY: z.string().default(''),
  GEMINI_API_KEY: z.string().default(''),
  // GEO / AI Visibility module (OpenRouter hosts Perplexity Sonar).
  OPENROUTER_API_KEY: z.string().default(''),
  GEO_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  GROQ_API_KEY: z.string().default(''),
  MISTRAL_API_KEY: z.string().default(''),
  QWEN_API_KEY: z.string().default(''),
  OLLAMA_BASE_URL: z.string().default(''),
  LLM_MODEL: z.string().default(''),
  STT_PROVIDER: z.enum(['mock', 'browser', 'whisper', 'deepgram']).default('mock'),
  DEEPGRAM_API_KEY: z.string().default(''),
  TTS_PROVIDER: z.enum(['mock', 'browser', 'openai', 'elevenlabs']).default('mock'),
  ELEVENLABS_API_KEY: z.string().default(''),
  ELEVENLABS_VOICE_ID: z.string().default('21m00Tcm4TlvDq8ikWAM'),
  SEO_AUDIT_MODE: z.enum(['live', 'mock']).default('live'),
  PAGESPEED_API_KEY: z.string().default(''),
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('Perfexa <reports@growthcrew.dev>'),
  DEMO_SEED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  NEXT_PUBLIC_APP_URL: z.string().default('http://localhost:3000'),
  NEXT_PUBLIC_STT_PROVIDER: z
    .enum(['mock', 'browser', 'whisper', 'deepgram'])
    .default('mock'),
  NEXT_PUBLIC_TTS_PROVIDER: z
    .enum(['mock', 'browser', 'openai', 'elevenlabs'])
    .default('mock'),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_URL: process.env.AUTH_URL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  GEO_ENABLED: process.env.GEO_ENABLED,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
  QWEN_API_KEY: process.env.QWEN_API_KEY,
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
  LLM_MODEL: process.env.LLM_MODEL,
  STT_PROVIDER: process.env.STT_PROVIDER,
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
  TTS_PROVIDER: process.env.TTS_PROVIDER,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
  SEO_AUDIT_MODE: process.env.SEO_AUDIT_MODE,
  PAGESPEED_API_KEY: process.env.PAGESPEED_API_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  DEMO_SEED: process.env.DEMO_SEED,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_STT_PROVIDER: process.env.NEXT_PUBLIC_STT_PROVIDER,
  NEXT_PUBLIC_TTS_PROVIDER: process.env.NEXT_PUBLIC_TTS_PROVIDER,
});

export type Env = z.infer<typeof envSchema>;
