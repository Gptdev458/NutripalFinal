import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

// Helper function to create a Supabase client for middleware/server components
const createSupabaseMiddlewareClient = (request: NextRequest, response: NextResponse) => {
    // Ensure environment variables are available
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    console.log(`[createSupabaseMiddlewareClient] Env Check: URL Loaded: ${!!supabaseUrl}, Key Loaded: ${!!supabaseAnonKey}`);

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('Middleware Error: Missing Supabase URL or Anon Key in environment variables.');
        // Return null or throw to indicate failure upstream
        return null; 
    }

    return createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                // A simple implementation using the NextRequest and NextResponse cookies
                get(name: string) {
                    return request.cookies.get(name)?.value;
                },
                set(name: string, value: string, options: CookieOptions) {
                    // Use the response's cookie setting method
                    response.cookies.set({ name, value, ...options });
                },
                remove(name: string, options: CookieOptions) {
                    // Use the response's cookie setting method to delete the cookie
                    response.cookies.set({ name, value: '', ...options });
                },
            },
        }
    );
};

export async function middleware(request: NextRequest) {
    // Create a response object to potentially modify cookies
    let response = NextResponse.next({
      request: {
        headers: new Headers(request.headers), // Ensure headers are passed along
      },
    });
    
    // Create the Supabase client using the simplified helper
    const supabase = createSupabaseMiddlewareClient(request, response);

    // If client creation failed (e.g., missing env vars), return an error response
    if (!supabase) {
        console.error("[middleware] Failed to create Supabase client. Check environment variables.");
        // Optionally return a server error response
        return new Response("Internal Server Error: Auth configuration issue", { status: 500 }); 
    }

    console.log(`Middleware running for path: ${request.nextUrl.pathname}`);

    // *** ADDED LOGGING FOR COOKIES ***
    console.log('Middleware received cookies:', request.cookies.getAll());

    // Refresh session if expired - important to keep user logged in
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    console.log('[middleware] getSession result:', { sessionIsNotNull: !!session, sessionError }); // Log getSession result

    if (sessionError) {
        console.error('Middleware Error fetching session:', sessionError);
        // REMOVED EARLY RETURN: Allow logic to continue to determine redirect based on lack of session.
        // return response;
    }

    // Determine logged-in status *after* attempting to get session
    const isLoggedIn = !!session;
    const pathname = request.nextUrl.pathname;

    // Define protected and public-only routes
    // REMOVED '/' from protectedRoutes as it no longer has a page
    const protectedRoutes = ['/dashboard', '/profile', '/chat', '/analytics', '/recipes', '/settings', '/history']; 
    const publicOnlyRoutes = ['/login', '/signup']; // Routes accessible only when logged out

    // Handle root path explicitly
    if (pathname === '/') {
        if (isLoggedIn) {
            console.log('Middleware: Logged in at root, redirecting to /dashboard');
            return NextResponse.redirect(new URL('/dashboard', request.url));
        } else {
            console.log('Middleware: Not logged in at root, redirecting to /login');
            return NextResponse.redirect(new URL('/login', request.url));
        }
    }

    // Check if the current path is protected
    // Adjusted check: Use startsWith for all protected routes
    const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));

    // Check if the current path is public-only
    const isPublicOnlyRoute = publicOnlyRoutes.includes(pathname);

    console.log(`Middleware Check: Path=${pathname}, IsLoggedIn=${isLoggedIn}, IsProtected=${isProtectedRoute}, IsPublicOnly=${isPublicOnlyRoute}`);

    // Redirect logic
    if (!isLoggedIn && isProtectedRoute) {
        // Not logged in, trying to access protected route -> redirect to login
        console.log('Middleware: Not logged in, redirecting to /login');
        return NextResponse.redirect(new URL('/login', request.url));
    }

    if (isLoggedIn && isPublicOnlyRoute) {
        // Logged in, trying to access login/signup -> redirect to dashboard
        console.log('Middleware: Logged in, redirecting to /dashboard');
        return NextResponse.redirect(new URL('/dashboard', request.url)); // Redirect to /dashboard
    }

    // If no redirect needed, continue to the requested page, returning the response potentially modified with new cookies
    return response;
}

// Configure the middleware to run on specific paths
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
}; 