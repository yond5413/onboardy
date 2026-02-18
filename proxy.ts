import { type NextRequest } from 'next/server';
import { updateSession } from '@/app/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  
  // Define public paths that don't require authentication
  const publicPaths = [
    '/about',
    '/login',
    '/signup',
    '/auth/callback',
    '/auth/confirm',
    '/forgot-password',
    '/auth/reset-password',
  ];
  
  const isPublicPath = publicPaths.some(path => 
    request.nextUrl.pathname === path || 
    request.nextUrl.pathname.startsWith('/auth/')
  );
  
  // API routes that don't require auth (for sharing)
  const isPublicApi = request.nextUrl.pathname.startsWith('/api/jobs/') && 
    request.nextUrl.pathname.endsWith('/route') &&
    request.method === 'GET';
  
  // Allow public access to public paths and shared jobs
  if (isPublicPath || isPublicApi) {
    return response;
  }
  
  // Redirect unauthenticated users to login
  if (!user) {
    // For API routes, return 401
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), 
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // For page routes, redirect to about page to show product first
    return Response.redirect(new URL('/about', request.url));
  }
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
