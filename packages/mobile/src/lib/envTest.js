import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';

console.log('EnvTest - SUPABASE_URL:', SUPABASE_URL);
console.log('EnvTest - SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? 'Key exists' : 'Key is undefined');

export const testEnvVars = () => {
  return {
    url: SUPABASE_URL,
    keyExists: Boolean(SUPABASE_ANON_KEY)
  };
}; 