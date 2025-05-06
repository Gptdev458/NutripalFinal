import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Function to patch cookies for base64-encoded values (reused from chat route)
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
                            console.log(`[api/flag-message] Decoded base64- cookie for ${name}`);
                        } catch (e) {
                            console.error(`[api/flag-message] Failed to decode base64- cookie for ${name}:`, e);
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
    // Create a Supabase client for this route handler
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    // Check authentication
    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError || !authData.session) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    let requestBody;
    try {
        requestBody = await request.json();
    } catch (error) {
        console.error('Error parsing request body:', error);
        return NextResponse.json({ message: 'Invalid request body' }, { status: 400 });
    }

    const { messageId, flagged = true } = requestBody;

    if (!messageId) {
        return NextResponse.json({ message: 'Missing required field: messageId' }, { status: 400 });
    }

    try {
        // Update the message flagged status
        const { error } = await supabase
            .from('chat_messages')
            .update({ flagged })
            .eq('id', messageId);

        if (error) {
            throw error;
        }

        return NextResponse.json({ 
            message: `Message ${flagged ? 'flagged' : 'unflagged'} successfully`,
            messageId,
            flagged
        }, { status: 200 });
    } catch (error: any) {
        console.error('Error updating message flag status:', error);
        return NextResponse.json({ 
            message: 'Failed to update message flag status',
            error: error.message 
        }, { status: 500 });
    }
} 