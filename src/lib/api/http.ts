import { NextResponse } from 'next/server';
import type { ErrorCode } from '@/lib/api/types';

export function jsonOk<T>(data: T, init?: { status?: number }) {
  return NextResponse.json(data, { status: init?.status ?? 200 });
}

export function jsonError(
  status: number,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
) {
  return NextResponse.json(
    { error: { code, message, details } },
    { status },
  );
}
