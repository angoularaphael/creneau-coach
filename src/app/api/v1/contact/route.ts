import { NextRequest } from 'next/server';
import { jsonError } from '@/lib/api/http';

export const dynamic = 'force-dynamic';

const hits = new Map<string, { n: number; reset: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const row = hits.get(ip);
  if (!row || now > row.reset) {
    hits.set(ip, { n: 1, reset: now + 60 * 60 * 1000 });
    return true;
  }
  if (row.n >= 5) return false;
  row.n += 1;
  return true;
}

/** POST /api/v1/contact */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'local';

  if (!rateLimit(ip)) {
    return jsonError(429, 'RATE_LIMITED', 'Trop de messages. Réessayez plus tard.');
  }

  let body: { name?: string; email?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'VALIDATION_ERROR', 'JSON invalide.');
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const message = String(body.message || '').trim();

  if (!name || name.length > 120) {
    return jsonError(400, 'VALIDATION_ERROR', 'Nom invalide.');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError(400, 'VALIDATION_ERROR', 'E-mail invalide.');
  }
  if (!message || message.length > 4000) {
    return jsonError(400, 'VALIDATION_ERROR', 'Message invalide.');
  }

  // Raphael brancher Resend ; ici ACK sans logger le message en clair en prod
  console.info('[contact]', { name, email, len: message.length });
  return new Response(null, { status: 204 });
}
