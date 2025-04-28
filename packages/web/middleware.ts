import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Helper function to create a Supabase client for middleware/server components
const createSupabaseMiddlewareClient = (request: NextRequest, response: NextResponse) => {
    // Ensure environment variables are available
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    console.log(`[createSupabaseMiddlewareClient] Env Check: URL Loaded: ${!!supabaseUrl}, Key Loaded: ${!!supabaseAnonKey}`);

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('Middleware Error: Missing Supabase URL or Anon Key in environment variables.');
        // Handle appropriately, maybe throw or return a response indicating server error
        // For simplicity here, we might let it proceed and fail later, but logging is crucial.
        // Or throw new Error('Missing Supabase credentials for middleware');
    }

    return createServerClient(
        supabaseUrl || '', 
        supabaseAnonKey || '',
        {
            cookies: {
                get(name: string) {
                    let value = request.cookies.get(name)?.value;
                    // Patch: If the value starts with 'base64-', decode it
                    if (value && value.startsWith('base64-')) {
                        try {
                            const b64 = value.slice(7); // Remove 'base64-'
                            // atob is not available in Node.js, use Buffer
                            value = Buffer.from(b64, 'base64').toString('utf-8');
                            console.log(`[middleware.cookies.get] Decoded base64- cookie for ${name}`);
                        } catch (e) {
                            console.error(`[middleware.cookies.get] Failed to decode base64- cookie for ${name}:`, e);
                        }
                    }
                    return value;
                },
                set(name: string, value: string, options: any) {
                    // --- ADD LOGGING --- 
                    console.log(`[middleware.setCookie] Attempting to set cookie: Name=${name}`);
                    // Log only a snippet of the value to avoid flooding logs with huge tokens
                    const valueSnippet = value.substring(0, 50) + (value.length > 50 ? '...' : '');
                    console.log(`[middleware.setCookie] Value Snippet: ${valueSnippet}`); 
                    console.log(`[middleware.setCookie] Options:`, options);
                    // Check for the specific auth token cookie name
                    if (name.includes('-auth-token')) {
                        // Is the value being provided already corrupted?
                        if (value.startsWith('base64-')) {
                            console.error(`[middleware.setCookie] CRITICAL: Value for ${name} provided by Supabase helper ALREADY starts with 'base64-'!`);
                        }
                        try {
                           // Try parsing the value Supabase helper provides
                           JSON.parse(value);
                           console.log(`[middleware.setCookie] Value for ${name} IS valid JSON.`);
                        } catch (e) {
                           console.error(`[middleware.setCookie] CRITICAL: Value for ${name} provided by Supabase helper IS NOT valid JSON! Error: ${e instanceof Error ? e.message : String(e)}`);
                        }
                    }
                    // --- END LOGGING ---
                    request.cookies.set({ name, value, ...options }); 
                    response.cookies.set({ name, value, ...options }); 
                },
                remove(name: string, options: any) {
                    // Optional: Add logging here too if needed
                    console.log(`[middleware.removeCookie] Removing cookie: ${name}`);
                    request.cookies.set({ name, value: '', ...options });
                    response.cookies.set({ name, value: '', ...options });
                },
            },
        }
    );
};

export async function middleware(request: NextRequest) {
    // Create a response object to potentially modify cookies
    const response = NextResponse.next();
    const supabase = createSupabaseMiddlewareClient(request, response);

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

    // If no redirect needed, continue to the requested page, returning the potentially modified response (with refreshed cookies)
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