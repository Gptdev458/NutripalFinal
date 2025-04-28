'use client';

import React, { useState, useEffect } from 'react';
// Revert back to @supabase/auth-helpers-nextjs for testing
// import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'; 
import { createBrowserClient } from '@supabase/ssr';
// import { createBrowserClient } from '@supabase/ssr'; // Temporarily commented out
import type { SupabaseClient } from '@supabase/supabase-js';

export default function SupabaseTestPage() {
  const [testStatus, setTestStatus] = useState('Idle');
  const [testResult, setTestResult] = useState<any>(null);
  const [supabaseClient, setSupabaseClient] = useState<SupabaseClient | null>(null);

  // Effect to create client on mount
  useEffect(() => {
    console.log("[SupabaseTestPage] Creating client using @supabase/ssr (with unique storageKey)...");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[SupabaseTestPage] Missing ENV vars!");
      setTestStatus('Error: Missing ENV Vars');
      return;
    }

    try {
      // Use a unique storageKey to avoid conflicts
      const client = createBrowserClient(
        supabaseUrl,
        supabaseAnonKey,
        { auth: { storageKey: 'supabase-test-client' } }
      );
      setSupabaseClient(client);
      setTestStatus('Client Created (Using SSR, Unique Key). Ready to test.');
      console.log("[SupabaseTestPage] Client created successfully.");
    } catch (err: any) {
        console.error("[SupabaseTestPage] Error creating client:", err);
        setTestStatus(`Error creating client: ${err.message}`);
    }
  }, []);

  // Handler for the test button - Revert to testing getSession
  const handleRunTest = async () => {
    if (!supabaseClient) {
      setTestStatus('Error: Client not ready.');
      return;
    }

    setTestStatus('Running getSession test...');
    setTestResult(null);
    console.log("[SupabaseTestPage] handleRunTest: Calling getSession()...");

    try {
      console.log('[SupabaseTestPage] Before await supabaseClient.auth.getSession...');
      const { data, error } = await supabaseClient.auth.getSession();
      console.log('[SupabaseTestPage] After await supabaseClient.auth.getSession...');
      console.log("[SupabaseTestPage] handleRunTest: getSession() completed.", { data, error });

      if (error) {
        setTestStatus('Test Failed (getSession Error)');
        setTestResult({ error: error.message });
      } else if (data?.session) {
        setTestStatus('Test Success (Session Found)');
        setTestResult({ sessionUserId: data.session.user.id });
      } else {
        setTestStatus('Test Success (No Session)');
        setTestResult({ session: null });
      }
    } catch (err: any) {
      console.error("[SupabaseTestPage] handleRunTest: Exception during getSession:", err);
      setTestStatus('Test Exception');
      setTestResult({ exception: err.message });
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Supabase getSession Test Page</h1>
      <p>This page attempts to call `supabase.auth.getSession()` independently of the main application context.</p>
      
      <div style={{ marginTop: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px' }}>
        <p><strong>Status:</strong> <span style={{ fontWeight: 'bold' }}>{testStatus}</span></p>
        
        <button 
          onClick={handleRunTest}
          disabled={!supabaseClient || testStatus === 'Running getSession test...'}
          style={{ 
            padding: '10px 15px', 
            marginTop: '10px', 
            backgroundColor: (!supabaseClient || testStatus === 'Running getSession test...') ? '#ccc' : '#007bff', // Revert color 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: (!supabaseClient || testStatus === 'Running getSession test...') ? 'not-allowed' : 'pointer' 
          }}
        >
          Run getSession Test
        </button>

        {testResult && (
          <div style={{ marginTop: '15px', backgroundColor: '#f0f0f0', padding: '10px', borderRadius: '4px' }}>
            <strong>Result:</strong>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: '5px', fontSize: '12px' }}>
              {JSON.stringify(testResult, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
} 