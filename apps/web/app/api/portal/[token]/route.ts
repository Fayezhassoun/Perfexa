import { NextResponse } from 'next/server';
import { resolvePortal } from '@growthcrew/agents';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const summary = await resolvePortal(token);
  if (!summary) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });

  return NextResponse.json(summary);
}
