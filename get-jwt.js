const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jkmpmjumhbqjnjarekgo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprbXBtanVtaGJxam5qYXJla2dvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMxNzE3ODQsImV4cCI6MjA1ODc0Nzc4NH0.hJ3Dt5BtNmrQab2Ik8C67qeV4XEusRxKUFZ-F-fuiVw';

const email = 'ian.kuksov.student@gmail.com';
const password = 'Samurai13';

async function getJwt() {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('Login error:', error);
    return;
  }
  if (!data.session) {
    console.error('No session returned.');
    return;
  }
  console.log('User JWT:', data.session.access_token);
}

getJwt(); 