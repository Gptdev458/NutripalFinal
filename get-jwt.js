const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://xujphusgufnlatokdsqy.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1anBodXNndWZubGF0b2tkc3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTQ0MzIsImV4cCI6MjA4NTA5MDQzMn0.wbkhTi8WjARqsnE-B7XGME3PstGfNvi9mvYMmUgRmV4';

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