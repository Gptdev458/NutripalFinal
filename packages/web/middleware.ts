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
        supabaseUrl || '', // Provide fallback or handle error if missing
        supabaseAnonKey || '', // Provide fallback or handle error if missing
        {
            cookies: {
                get(name: string) {
                    return request.cookies.get(name)?.value;
                },
                set(name: string, value: string, options: any) {
                    request.cookies.set({ name, value, ...options }); // Apply cookie to the request for server components
                    response.cookies.set({ name, value, ...options }); // Apply cookie to the response to send back to browser
                },
                remove(name: string, options: any) {
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
        // Allow request to proceed but log the error, maybe auth check will fail later
        return response;
    }

    const isLoggedIn = !!session;
    const pathname = request.nextUrl.pathname;

    // Define protected and public-only routes
    const protectedRoutes = ['/', '/dashboard', '/profile', '/chat'];
    const publicOnlyRoutes = ['/login', '/signup']; // Routes accessible only when logged out

    // Check if the current path is protected
    const isProtectedRoute = protectedRoutes.some(route => pathname === route || (route !== '/' && pathname.startsWith(route + '/')));

    // Check if the current path is public-only
    const isPublicOnlyRoute = publicOnlyRoutes.includes(pathname);

    console.log(`Middleware Check: Path=${pathname}, IsLoggedIn=${isLoggedIn}, IsProtected=${isProtectedRoute}, IsPublicOnly=${isPublicOnlyRoute}`);

    // Redirect logic
    if (!isLoggedIn && isProtectedRoute) {
        // Not logged in, trying to access protected route -> redirect to login
        console.log('Middleware: Not logged in, redirecting to /login');
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
    }

    if (isLoggedIn && isPublicOnlyRoute) {
        // Logged in, trying to access login/signup -> redirect to dashboard (or home)
        console.log('Middleware: Logged in, redirecting to /');
        const url = request.nextUrl.clone();
        url.pathname = '/'; // Redirect to home/dashboard
        return NextResponse.redirect(url);
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