// Automated API tests for ai-handler-v2
// Usage: node ai-handler-api.test.js
// Requires: node-fetch (npm install node-fetch@2)

const fetch = require('node-fetch');

const API_URL = 'https://jkmpmjumhbqjnjarekgo.supabase.co/functions/v1/ai-handler-v2';
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsImtpZCI6Iml1cGdWZWdFRWplUlBxNi8iLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2prbXBtanVtaGJxam5qYXJla2dvLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI2NGJiNGU1Zi03YmZkLTQ2NjYtYTMzOS0wZmI3YjFkYjNhNjQiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzQ1NTEzMjczLCJpYXQiOjE3NDU1MDk2NzMsImVtYWlsIjoiaWFuLmt1a3Nvdi5zdHVkZW50QGdtYWlsLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWwiOiJpYW4ua3Vrc292LnN0dWRlbnRAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBob25lX3ZlcmlmaWVkIjpmYWxzZSwic3ViIjoiNjRiYjRlNWYtN2JmZC00NjY2LWEzMzktMGZiN2IxZGIzYTY0In0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3NDU1MDk2NzN9XSwic2Vzc2lvbl9pZCI6ImJkYTY3MjMyLTU1YWItNDFlYi1iMWE3LWFiODQ1ZjhjOGQ2MSIsImlzX2Fub255bW91cyI6ZmFsc2V9.P-isO_pLlGp3nfBWa-iGIR8-hZO8Qeyuggzy5DJfarU';

async function sendMessage(message, context = undefined, conversation_history = undefined) {
  const body = {
    message,
    ...(context ? { context } : {}),
    ...(conversation_history ? { conversation_history } : {}),
  };
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function runTests() {
  console.log('--- AI Handler Automated API Tests ---');

  // 1. Log a simple food
  let response = await sendMessage('Log a banana');
  console.log('Test 1 - Log a banana:', response);

  // 2. Log an ambiguous food (should trigger clarifyDishType)
  response = await sendMessage('Log a sandwich');
  console.log('Test 2 - Log a sandwich (should clarify):', response);

  // 3. Analyze a custom recipe
  response = await sendMessage('Analyze this: 1L broth, 2 carrots, 1 potato');
  console.log('Test 3 - Analyze recipe:', response);

  // 4. Ask a general nutrition question
  response = await sendMessage('How much protein should I eat?');
  console.log('Test 4 - General question:', response);

  // 5. Try to log a saved recipe by name
  response = await sendMessage('Log my chili recipe');
  console.log('Test 5 - Log saved recipe:', response);

  // 6. List logged foods
  response = await sendMessage('What did I eat today?');
  console.log('Test 6 - List logged foods:', response);

  // 7. Undo last action
  response = await sendMessage('Undo my last log');
  console.log('Test 7 - Undo last action:', response);

  // 8. Error handling (empty message)
  response = await sendMessage('');
  console.log('Test 8 - Empty message (should error):', response);
}

runTests().catch(console.error); 