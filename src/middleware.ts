import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { isAuthMockEnabled, isSupabaseConfigured } from '@/lib/auth/config';

const MOCK_COOKIE = 'coach_mock_session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isCoachArea =
    pathname.startsWith('/espace-coach') &&
    pathname !== '/espace-coach/suspendu';

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  if (isSupabaseConfigured()) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            request.cookies.set({ name, value, ...options });
            response = NextResponse.next({
              request: { headers: request.headers },
            });
            response.cookies.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            request.cookies.set({ name, value: '', ...options });
            response = NextResponse.next({
              request: { headers: request.headers },
            });
            response.cookies.set({ name, value: '', ...options });
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (isCoachArea && !user) {
      const url = request.nextUrl.clone();
      url.pathname = '/auth/connexion';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }

    return response;
  }

  if (isCoachArea) {
    if (isAuthMockEnabled()) {
      if (!request.cookies.get(MOCK_COOKIE)?.value) {
        const url = request.nextUrl.clone();
        url.pathname = '/auth/connexion';
        url.searchParams.set('next', pathname);
        return NextResponse.redirect(url);
      }
      return response;
    }

    const url = request.nextUrl.clone();
    url.pathname = '/auth/connexion';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/espace-coach/:path*', '/auth/callback'],
};
