import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Ensure Supabase URL and ANON Key are available in the environment
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Define the expected request body structure (optional but good practice)
interface ChatRequestBody {
    message?: string;
    chat_id: string;
    context?: Record<string, unknown>;
    pending_action?: Record<string, unknown>;
    action?: string; // Include action if frontend might send it directly
}

// Patch: decode base64- cookie if present before using createRouteHandlerClient
function getPatchedCookies() {
    const cookieStore = cookies();
    return new Proxy(cookieStore, {
        get(target, prop, receiver) {
            if (prop === 'get') {
                return (name: string) => {
                    const cookie = target.get(name);
                    if (!cookie) return undefined;
                    let value = cookie.value;
                    if (value && value.startsWith('base64-')) {
                        try {
                            const b64 = value.slice(7);
                            value = Buffer.from(b64, 'base64').toString('utf-8');
                            console.log(`[api/chat] Decoded base64- cookie for ${name}`);
                        } catch (e) {
                            console.error(`[api/chat] Failed to decode base64- cookie for ${name}:`, e);
                        }
                    }
                    return { ...cookie, value };
                };
            }
            return Reflect.get(target, prop, receiver);
        },
    });
}

export async function POST(request: NextRequest) {
    const cookieStore = getPatchedCookies();
    // Create a Supabase client specific to this route handler
    // Note: Using createRouteHandlerClient is often for direct DB access within the route.
    // For invoking a function securely, we might just need the user's token.
    // Let's get the session first to extract the token.
    const supabaseAuth = createRouteHandlerClient({ cookies: () => cookieStore });

    let session;
    try {
        const { data, error } = await supabaseAuth.auth.getSession();
        if (error) {
            console.error('Auth Error getting session:', error.message);
            return NextResponse.json({ message: 'Authentication error retrieving session.', status: 'error', response_type: 'error_auth' }, { status: 401 });
        }
        if (!data.session) {
             return NextResponse.json({ message: 'User not authenticated.', status: 'error', response_type: 'error_auth' }, { status: 401 });
        }
        session = data.session;
    } catch (e: any) {
         console.error('Unexpected Auth Error:', e.message);
         return NextResponse.json({ message: 'Internal server error during authentication.', status: 'error', response_type: 'error_server' }, { status: 500 });
    }

    let requestBody: ChatRequestBody;
    try {
        requestBody = await request.json();
    } catch (error) {
        console.error('Error parsing request body:', error);
        return NextResponse.json({ message: 'Invalid request body.', status: 'error', response_type: 'error_request' }, { status: 400 });
    }

    // Validate required fields from frontend call
    if (!requestBody.chat_id) {
         return NextResponse.json({ message: 'Missing required field: chat_id.', status: 'error', response_type: 'error_request' }, { status: 400 });
    }
    // Ensure message or action is present as expected by the frontend call
    if (!requestBody.message && !requestBody.action) {
         console.log('Request body:', requestBody); // Log what was received
         return NextResponse.json({ message: 'Request must include a message or action.', status: 'error', response_type: 'error_request' }, { status: 400 });
    }

    if (!SUPABASE_URL) {
        console.error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
        return NextResponse.json({ message: 'Server configuration error (URL).', status: 'error', response_type: 'error_config' }, { status: 500 });
    }

    // Construct the URL to your Supabase Edge Function
    // Ensure this matches your actual function slug/name
    const functionUrl = `${SUPABASE_URL}/functions/v1/ai-handler-v2`;

    try {
        console.log(`Forwarding request to Supabase function: ${functionUrl}`);
        console.log('Request body being forwarded:', JSON.stringify(requestBody)); // Log the body
        console.log('Using Access Token:', session.access_token ? 'Present' : 'MISSING!'); // Check token presence

        const functionResponse = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // IMPORTANT: Forward the user's Authorization token
                'Authorization': `Bearer ${session.access_token}`,
                // Supabase functions might require the ANON key as apikey header
                // Check your function/Supabase project settings if this is needed
            },
            body: JSON.stringify(requestBody), // Forward the parsed body
        });

        console.log(`Supabase function response status: ${functionResponse.status}`);

        // Check if the function call itself failed (e.g., network error, 5xx from function)
        if (!functionResponse.ok) {
            const errorBody = await functionResponse.text();
            console.error(`Supabase function call failed (${functionResponse.status}):`, errorBody);
            // Try to parse Supabase error if JSON, otherwise return text
             let errorJson;
             try { errorJson = JSON.parse(errorBody); } catch { /* ignore */}
             const errorMessage = errorJson?.message || errorJson?.error_description || errorBody || 'Failed to invoke AI handler function.';
            return NextResponse.json({ message: errorMessage, status: 'error', response_type: 'error_invoke_handler' }, { status: functionResponse.status });
        }

        // Get the response body from the function
        const responseData = await functionResponse.json();

        console.log('Received response from Supabase function:', responseData);

        // Return the successful response from the function directly to the frontend
        return NextResponse.json(responseData, { status: 200 });

    } catch (error: any) {
        console.error('Error invoking Supabase function:', error);
        return NextResponse.json({ message: `Internal server error: ${error.message}`, status: 'error', response_type: 'error_server' }, { status: 500 });
    }
}

// Optional: Add handler for GET or other methods if needed
// export async function GET(request: NextRequest) { ... } 