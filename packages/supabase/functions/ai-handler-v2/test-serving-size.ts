// Test script for serving size functionality in AI handler
// Run with: deno run -A test-serving-size.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Configure these variables
const SUPABASE_URL = 'https://jkmpmjumhbqjnjarekgo.supabase.co';
const SUPABASE_ANON_KEY = ''; // Insert your anon key here
const TEST_USER_ID = ''; // Insert a test user ID here
const AI_HANDLER_URL = `${SUPABASE_URL}/functions/v1/ai-handler-v2`;

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Mock a request to the AI handler
async function sendAIHandlerRequest(message: string, userId: string) {
  try {
    console.log(`\n🚀 SENDING REQUEST: "${message}"`);
    
    const response = await fetch(AI_HANDLER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        message,
        user_id: userId
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`📥 RESPONSE: "${data.message}"`);
    return data;
  } catch (error) {
    console.error('Error sending request:', error);
    throw error;
  }
}

// Function to clear pending actions before testing
async function clearPendingActions(userId: string) {
  try {
    console.log(`\n🧹 Clearing pending actions for user ${userId}`);
    const { error } = await supabase
      .from('pending_actions')
      .delete()
      .eq('user_id', userId);
      
    if (error) {
      console.error('Error clearing pending actions:', error);
      throw error;
    }
    console.log('✅ Successfully cleared pending actions');
  } catch (error) {
    console.error('Failed to clear pending actions:', error);
    throw error;
  }
}

// Function to run a series of tests
async function runServingSizeTests() {
  // Make sure we start fresh
  await clearPendingActions(TEST_USER_ID);
  
  try {
    console.log('\n==== SERVING SIZE TEST SEQUENCE ====');
    
    // Test 1: Initial query with serving size
    console.log('\n🧪 TEST 1: Initial query with "Log 2 servings of breakfast smoothie"');
    const initialResponse = await sendAIHandlerRequest('Log 2 servings of breakfast smoothie', TEST_USER_ID);
    
    console.log('📊 DETAILS:');
    console.log('Response type:', initialResponse.response_type);
    
    if (initialResponse.pending_action) {
      console.log('Pending action type:', initialResponse.pending_action.type);
      console.log('Requested servings:', initialResponse.pending_action.requested_servings);
    }
    
    // Verify that the initial response mentions the correct serving size
    if (!initialResponse.message.includes('2 serving')) {
      console.error('❌ TEST 1 FAILED: Response message does not include "2 serving"');
    } else {
      console.log('✅ TEST 1 PASSED: Response includes correct serving size');
    }
    
    // Test 2: Confirm with "yes"
    console.log('\n🧪 TEST 2: Confirm with "yes"');
    const confirmResponse = await sendAIHandlerRequest('yes', TEST_USER_ID);
    
    console.log('📊 DETAILS:');
    console.log('Response type:', confirmResponse.response_type);
    
    // Verify that the confirmation response mentions logging 2 servings
    if (!confirmResponse.message.includes('2 serving')) {
      console.error('❌ TEST 2 FAILED: Confirmation response does not mention "2 serving"');
    } else {
      console.log('✅ TEST 2 PASSED: Confirmation response includes correct serving size');
    }
    
    // Clean up
    await clearPendingActions(TEST_USER_ID);
    
    // Test 3: Try with a different serving size
    console.log('\n🧪 TEST 3: Try with "Log 3.5 servings of breakfast smoothie"');
    const testThreeResponse = await sendAIHandlerRequest('Log 3.5 servings of breakfast smoothie', TEST_USER_ID);
    
    console.log('📊 DETAILS:');
    console.log('Response type:', testThreeResponse.response_type);
    
    if (testThreeResponse.pending_action) {
      console.log('Pending action type:', testThreeResponse.pending_action.type);
      console.log('Requested servings:', testThreeResponse.pending_action.requested_servings);
    }
    
    // Verify that the response mentions the correct serving size
    if (!testThreeResponse.message.includes('3.5 serving')) {
      console.error('❌ TEST 3 FAILED: Response message does not include "3.5 serving"');
    } else {
      console.log('✅ TEST 3 PASSED: Response includes correct serving size');
    }
    
    // Test 4: Confirm with a different confirmation message
    console.log('\n🧪 TEST 4: Confirm with just "log it"');
    const logItResponse = await sendAIHandlerRequest('log it', TEST_USER_ID);
    
    console.log('📊 DETAILS:');
    console.log('Response type:', logItResponse.response_type);
    
    // Verify that the confirmation response mentions logging 3.5 servings
    if (!logItResponse.message.includes('3.5 serving')) {
      console.error('❌ TEST 4 FAILED: Confirmation response does not mention "3.5 serving"');
    } else {
      console.log('✅ TEST 4 PASSED: Confirmation response includes correct serving size');
    }
    
    console.log('\n==== TESTS COMPLETED ====');
  } catch (error) {
    console.error('Testing error:', error);
  } finally {
    // Clean up
    await clearPendingActions(TEST_USER_ID);
    console.log('\n🧹 Final cleanup completed');
  }
}

// Run the tests
console.log('Starting serving size tests...');
runServingSizeTests(); 