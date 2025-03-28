# NutriPal MVP - Project Reference

## 1. Project Overview

**Product Name:** NutriPal (placeholder)
**Description:** An AI-powered health and nutrition assistant focused on conversational food logging and customizable nutrient tracking. Users interact via chat to log meals (items or recipes), set nutritional goals, and get basic insights. The primary interaction for logging is via AI, with OpenAI used for nutrition estimation.
**Target Platforms:** iOS & Android (via Expo Go), Web (static deployment).
**Target Users:** Small group (3-4 users) for initial use/feedback.

## 2. Core Objectives (MVP)

*   Allow users to select which nutrients (from a predefined list) they want to track.
*   Enable users to set specific daily targets for their selected nutrients.
*   Provide an AI chat interface for logging food items and recipes using natural language.
*   Use the OpenAI API exclusively to estimate nutritional values for logged items/recipes based on user descriptions or provided ingredients.
*   Save user-defined recipes (ingredients provided via chat) for quick re-logging later.
*   Offer a "Quick Add" feature to log previously saved recipes easily.
*   Display a daily dashboard showing progress towards user-defined nutrient goals.
*   Answer basic user questions about their daily intake vs. goals via the AI chat.
*   Ensure data synchronization between the mobile (Expo Go) and web versions for a logged-in user.
*   Utilize a simple deployment strategy suitable for a small user group (Expo Go, static web host).

## 3. Key MVP Features

*   **Authentication:**
    *   Email/Password Sign Up & Login using Supabase Auth.
    *   Session management across platforms.
*   **Goal Setting:**
    *   User selects nutrients to track from a `MASTER_NUTRIENT_LIST`.
    *   User inputs daily target values for selected nutrients.
    *   Goals are saved in the `user_goals` database table.
*   **AI Chat Interface:**
    *   User inputs messages (food descriptions, recipe names, questions).
    *   **Logging Food Items:** AI identifies intent, asks OpenAI for nutritional estimates (for *all* master nutrients), saves to `food_log`.
    *   **Logging Recipes (New):** AI identifies intent (recipe name). If recipe not found in `user_recipes`, AI asks for ingredients. User provides ingredients. AI asks OpenAI to estimate *total recipe nutrition* based on ingredients. AI saves the recipe details (name, description, nutrition) to `user_recipes` and logs the meal to `food_log`.
    *   **Logging Recipes (Existing):** AI identifies intent (recipe name). Finds recipe in `user_recipes`. Logs the meal to `food_log` using stored nutrient totals.
    *   **Answering Questions:** AI identifies intent. Fetches user's tracked goals and current daily totals. Prompts OpenAI with context to provide relevant answers/insights (e.g., "How much protein left?", "Am I over my sugar goal?").
*   **Recipe Quick Add:**
    *   A screen lists recipes saved in `user_recipes`.
    *   User can tap a recipe to instantly log it to `food_log` using the stored nutritional values.
*   **Dashboard:**
    *   Displays progress for the current day.
    *   Shows only the nutrients the user has actively chosen to track (via `user_goals`).
    *   Calculates current intake by summing `food_log` entries for the day.
    *   Compares current intake vs. target goal for each tracked nutrient.
*   **Settings:**
    *   Navigate to Goal Setting screen.
    *   Sign Out functionality.

## 4. Technology Stack

*   **Frontend:** React Native + Expo (JavaScript/TypeScript)
*   **Backend:** Supabase
    *   Authentication
    *   PostgreSQL Database
    *   Edge Functions (Deno/TypeScript) for backend logic
*   **AI:** OpenAI API (GPT-3.5-Turbo recommended for cost/speed, or GPT-4) - accessed via Edge Function.
*   **Nutrition Estimation:** **Exclusively** via OpenAI API based on user text/ingredients. No other external food database API needed for direct lookup in MVP.

## 5. Database Schema (Supabase PostgreSQL)

*   **`user_goals`**: Stores user-selected nutrient targets.
    *   `id`, `user_id` (FK to `auth.users`), `nutrient` (text key, e.g., 'protein_g'), `target_value` (numeric), `unit` (text), `created_at`.
    *   RLS Enabled (User owns their data).
*   **`user_recipes`**: Stores user-defined recipes created via chat.
    *   `id`, `user_id` (FK), `recipe_name` (text), `description` (text, user's ingredient input), *[nullable numeric columns for ALL nutrients in `MASTER_NUTRIENT_LIST`]* (e.g., `calories`, `protein_g`, ...), `created_at`.
    *   RLS Enabled.
*   **`food_log`**: Stores individual food/meal log entries.
    *   `id`, `user_id` (FK), `food_name` (text), `timestamp` (timestamptz), `source` (text: 'ai_chat_item', 'ai_chat_recipe_new', 'ai_chat_recipe_saved', 'quick_recipe'), `recipe_id` (nullable FK to `user_recipes`), *[nullable numeric columns for ALL nutrients in `MASTER_NUTRIENT_LIST`]* (e.g., `calories`, `protein_g`, ...), `created_at`.
    *   RLS Enabled.
*   **`MASTER_NUTRIENT_LIST`**: A constant defined in frontend code (`src/constants/nutrients.js`) listing all potentially trackable nutrients (`key`, `name`, `unit`). Used for Goal Setting UI and defining DB columns.

## 6. Backend Logic (Supabase Edge Function: `ai-handler`)

*   Receives POST requests from the app containing `{ message: string, context?: { type: 'ingredients', recipeName: string } }`.
*   Authenticates user via JWT passed in Authorization header (using request-scoped Supabase client).
*   Uses OpenAI API (key from secrets) for:
    1.  **Intent/Entity Recognition:** Classify user message (log item, log recipe, question). Extract recipe name if applicable.
    2.  **Nutrition Estimation (Items):** Estimate nutrients for described food items.
    3.  **Nutrition Estimation (Recipes):** Estimate total nutrients for a recipe based on provided ingredients.
    4.  **Answering Questions:** Generate responses based on user goals, current intake, and question.
*   Interacts with Supabase DB (using request-scoped client) to:
    *   Check for existing recipes (`user_recipes`).
    *   Save new recipes (`user_recipes`).
    *   Save log entries (`food_log`).
    *   Fetch goals/logs for context when answering questions.
*   Returns JSON response indicating success, failure, or need for more info (e.g., ingredients).

## 7. Deployment Strategy

*   **Mobile:**
    *   Users install the **Expo Go** app from App Store / Google Play Store.
    *   Developer publishes app updates using Expo services (e.g., `eas update` or potentially `expo publish`).
    *   Developer shares the project URL (e.g., `exp.host/@username/project-slug`) with users.
    *   Users open this URL within Expo Go to run the app.
*   **Web:**
    *   Build static web assets using `npx expo export --platform web`.
    *   Deploy the contents of the `web-build` directory to a free static hosting provider (e.g., Netlify, Vercel).
*   **Backend:**
    *   Supabase handles database hosting and Edge Function execution. Deployed via `supabase functions deploy`.

## 8. Key Exclusions (MVP)

*   No image/OCR nutritional label scanning.
*   No direct Apple Health / Google Fit integration.
*   No separate screen for manually entering single food items with their nutrient values.
*   No advanced analytics, trends, or weekly/monthly views.
*   No submission to public App Store / Google Play Store.
*   No offline functionality.
*   UI/UX limited to core functionality.