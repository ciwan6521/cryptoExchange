import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/wallet',
  '/settings',
  '/ledger',
  '/rewards',
  '/kyc',
  '/convert',
  '/p2p',
  '/earn',
  '/futures',
  '/notifications',
  '/trade/',
];

const AUTH_PAGES = ['/auth/login', '/auth/register'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true' && !pathname.startsWith('/admin') && pathname !== '/status') {
    if (!pathname.startsWith('/_next') && pathname !== '/favicon.ico') {
      const url = request.nextUrl.clone();
      url.pathname = '/status';
      url.searchParams.set('maintenance', '1');
      return NextResponse.redirect(url);
    }
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p),
  );
  const hasToken = Boolean(request.cookies.get('access_token')?.value);

  if (isProtected && !hasToken) {
    const login = request.nextUrl.clone();
    login.pathname = '/auth/login';
    login.searchParams.set('redirect', pathname);
    return NextResponse.redirect(login);
  }

  if (hasToken && AUTH_PAGES.some((p) => pathname.startsWith(p))) {
    const dest = request.nextUrl.clone();
    dest.pathname = request.nextUrl.searchParams.get('redirect') || '/dashboard';
    dest.search = '';
    return NextResponse.redirect(dest);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
