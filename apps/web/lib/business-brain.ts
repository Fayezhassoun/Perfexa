export const BUSINESS_BRAIN_CHANNELS = [
  { key: 'seo', label: 'SEO' },
  { key: 'google_ads', label: 'Google Ads' },
  { key: 'meta', label: 'Meta' },
  { key: 'email', label: 'Email' },
  { key: 'social', label: 'Social' },
  { key: 'reviews', label: 'Reviews' },
] as const;

export type BusinessBrainChannel = (typeof BUSINESS_BRAIN_CHANNELS)[number]['key'];
export type BusinessBrainTone = 'friendly' | 'expert' | 'premium' | 'direct';

export type BusinessBrain = {
  offer?: string;
  idealCustomer?: string;
  location?: string;
  tone?: BusinessBrainTone;
  channels?: BusinessBrainChannel[];
  constraints?: string;
  proofPoints?: string;
};

const CHANNEL_KEYS = BUSINESS_BRAIN_CHANNELS.map(({ key }) => key) as BusinessBrainChannel[];
const TONES: BusinessBrainTone[] = ['friendly', 'expert', 'premium', 'direct'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function readBusinessBrain(settings: unknown): BusinessBrain {
  if (!isRecord(settings) || !isRecord(settings.businessBrain)) return {};

  const brain = settings.businessBrain;
  const channels = Array.isArray(brain.channels)
    ? brain.channels.filter((channel): channel is BusinessBrainChannel =>
        typeof channel === 'string' && CHANNEL_KEYS.includes(channel as BusinessBrainChannel),
      )
    : undefined;

  return {
    offer: typeof brain.offer === 'string' ? brain.offer : undefined,
    idealCustomer: typeof brain.idealCustomer === 'string' ? brain.idealCustomer : undefined,
    location: typeof brain.location === 'string' ? brain.location : undefined,
    tone: typeof brain.tone === 'string' && TONES.includes(brain.tone as BusinessBrainTone)
      ? (brain.tone as BusinessBrainTone)
      : undefined,
    channels,
    constraints: typeof brain.constraints === 'string' ? brain.constraints : undefined,
    proofPoints: typeof brain.proofPoints === 'string' ? brain.proofPoints : undefined,
  };
}
