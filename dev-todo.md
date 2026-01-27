# NutriPal Development TODO

## Overview
Multi-agent nutrition tracking system using Supabase Edge Functions with OpenAI GPT-4.

---

## Phase 1: Infrastructure Setup

### 1. Environment Setup
- [x] **1.1** Create `packages/web/.env.local` with Supabase credentials
- [x] **1.2** Create `packages/mobile/.env` with Supabase credentials  
- [x] **1.3** Create `packages/supabase/functions/.env` with Supabase + OpenAI credentials
- [x] **1.4** Update `packages/supabase/.temp/project-ref` with new project ID
- [ ] **1.5** Verify web app connects to new Supabase project
- [ ] **1.6** Verify mobile app connects to new Supabase project

### 2. Database Migrations
- [x] **2.1** Create `set_timestamp()` trigger function for updated_at columns
- [x] **2.2** Create `user_profiles` table (user demographics, preferences)
- [x] **2.3** Create `user_goals` table (nutrition targets per nutrient)
- [x] **2.4** Create `food_log` table (daily food entries with all nutrient columns)
- [x] **2.5** Create `chat_sessions` table (conversation sessions)
- [x] **2.6** Create `chat_messages` table (message history with sender type, flagged)
- [x] **2.7** Create `user_recipes` table (saved recipes with ingredients, portions, nutrition)
- [x] **2.8** Create `food_products` table (cached nutrition data from external APIs)
- [x] **2.9** Create `recipe_ingredients` table (normalized parsed ingredients)
- [x] **2.10** Create `agent_execution_logs` table (debugging/auditing agent runs)
- [x] **2.11** Create RLS policies for all user-scoped tables
- [x] **2.12** Create RLS policies for shared tables (food_products)
- [x] **2.13** Create indexes for performance (search, timestamps, foreign keys)
- [x] **2.14** Apply all migrations to Supabase project
- [x] **2.15** Verify tables created correctly in Supabase dashboard

### 3. Shared Edge Function Utilities
- [x] **3.1** Create `packages/supabase/functions/_shared/` directory structure
- [x] **3.2** Create `cors.ts` with CORS headers for web/mobile
- [x] **3.3** Create `types.ts` with shared TypeScript types for agents
- [x] **3.4** Create `supabase-client.ts` with authenticated client helper
- [x] **3.5** Create `openai-client.ts` with OpenAI SDK setup
- [x] **3.6** Create `error-handler.ts` with standardized error responses

---

## Phase 2: Agent System Implementation

### 4. Intent Agent
- [x] **4.1** Create `packages/supabase/functions/chat-handler/agents/` directory
- [x] **4.2** Define intent types enum (log_food, log_recipe, save_recipe, query_nutrition, update_goals, clarify, off_topic)
- [x] **4.3** Create Intent Agent interface and types
- [x] **4.4** Implement OpenAI prompt for intent classification
- [x] **4.5** Implement food/portion extraction from user message
- [x] **4.6** Implement recipe detection logic
- [x] **4.7** Implement clarification request detection
- [ ] **4.8** Add unit tests for intent classification
- [ ] **4.9** Test with sample user messages

### 5. Nutrition Agent
- [x] **5.1** Create Nutrition Agent interface and types
- [x] **5.2** Integrate existing `nutrition-lookup` module
- [x] **5.3** Implement portion size parsing and normalization
- [x] **5.4** Implement portion scaling (e.g., "2 cups" → multiply nutrition)
- [x] **5.5** Implement food_products cache lookup (check before API call)
- [x] **5.6** Implement food_products cache write (save API results)
- [ ] **5.7** Handle ambiguous food matches (return options to user)
- [ ] **5.8** Handle not found foods gracefully
- [ ] **5.9** Test with various food queries

### 6. Validator Agent
- [x] **6.1** Create Validator Agent interface and types
- [x] **6.2** Implement calorie/macro consistency check (calories ≈ protein*4 + carbs*4 + fat*9)
- [x] **6.3** Implement portion reasonableness check (flag unusually large/small)
- [ ] **6.4** Implement cross-source validation (compare FDC vs OFF when available)
- [x] **6.5** Implement nutrient range validation (flag negative or impossibly high values)
- [x] **6.6** Create validation result structure (passed, warnings, errors)
- [x] **6.7** Test with valid and invalid nutrition data

### 7. Recipe Agent
- [x] **7.1** Create Recipe Agent interface and types
- [x] **7.2** Implement saved recipe name matching (fuzzy search user_recipes)
- [x] **7.3** Implement recipe text parsing with OpenAI (extract ingredients list)
- [x] **7.4** Implement ingredient quantity extraction (amount, unit, food item)
- [x] **7.5** Implement yield/servings detection from recipe text
- [ ] **7.6** Implement portion calculation (total batch → user's portion)
- [ ] **7.7** Handle recipe clarification requests (missing yield, vague quantities)
- [x] **7.8** Implement recipe save flow (store to user_recipes)
- [ ] **7.9** Test with sample recipe texts

### 8. Orchestrator
- [x] **8.1** Create `packages/supabase/functions/chat-handler/index.ts` entry point
- [x] **8.2** Create `orchestrator.ts` main coordination logic
- [x] **8.3** Implement request validation and auth check
- [x] **8.4** Implement agent execution pipeline (Intent → Recipe/Nutrition → Validator)
- [x] **8.5** Implement state management between agent calls
- [x] **8.6** Implement food_log write on successful validation
- [x] **8.7** Implement chat_messages write (user message + bot response)
- [x] **8.8** Implement error handling and recovery
- [x] **8.9** Implement agent_execution_logs for debugging
- [x] **8.10** Test full pipeline end-to-end (Code ready for testing)

### 9. Chat Agent
- [x] **9.1** Create Chat Agent interface and types
- [x] **9.2** Define system prompt for nutrition assistant persona
- [x] **9.3** Implement conversation context management (recent messages)
- [x] **9.4** Implement topic guardrails (redirect off-topic to nutrition)
- [x] **9.5** Implement natural language response generation
- [ ] **9.6** Implement clarification question formatting
- [ ] **9.7** Implement confirmation message formatting (food logged successfully)
- [ ] **9.8** Implement suggestion/tip generation based on goals
- [ ] **9.9** Test conversational flow

---

## Phase 3: Frontend Integration

### 10. Connect Web Chat UI
- [x] **10.1** Update `packages/web/app/chat/page.tsx` to call Edge Function
- [x] **10.2** Implement Edge Function invocation with auth token
- [ ] **10.3** Handle streaming responses (if implemented)
- [x] **10.4** Handle structured responses (clarifications, confirmations)
- [x] **10.5** Update chat history display with new message format
- [x] **10.6** Implement error handling and retry logic
- [x] **10.7** Refresh dashboard after food log
- [x] **10.8** Test full user flow (login → chat → log food → see dashboard update)

### 11. Connect Recipe UI
- [x] **11.1** Update `packages/web/app/recipes/page.tsx` to use new backend
- [x] **11.2** Implement recipe logging via chat-handler
- [ ] **11.3** Implement recipe creation/save flow
- [ ] **11.4** Test recipe management flow

---

## Phase 4: Analytics & Polish

### 12. Insight Agent (Async)
- [ ] **12.1** Create Insight Agent interface and types
- [ ] **12.2** Implement daily totals calculation
- [ ] **12.3** Implement goal progress tracking
- [ ] **12.4** Implement pattern detection (meal timing, nutrient trends)
- [ ] **12.5** Implement suggestion generation based on remaining goals
- [ ] **12.6** Set up async execution (non-blocking)
- [ ] **12.7** Test analytics generation

### 13. Testing & Deployment
- [x] **13.1** Create test user account
- [x] **13.2** Seed sample data (goals, recipes)
- [x] **13.3** End-to-end testing of all flows
- [x] **13.4** Deploy Edge Functions to production
- [x] **13.5** Set production secrets (OPENAI_API_KEY)
- [ ] **13.6** Test production deployment
- [ ] **13.7** Monitor logs for errors

---

## Credentials Reference

**Supabase Project:** `xujphusgufnlatokdsqy`
- URL: `https://xujphusgufnlatokdsqy.supabase.co`
- Anon Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1anBodXNndWZubGF0b2tkc3F5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MTQ0MzIsImV4cCI6MjA4NTA5MDQzMn0.wbkhTi8WjARqsnE-B7XGME3PstGfNvi9mvYMmUgRmV4`

**OpenAI:** Key stored in `packages/supabase/functions/.env`

---

## Current Progress

**Status:** Phase 3 - Frontend Integration in progress

**Next Step:** 10.1 - Verify production deployment and test chat flow in Web UI
