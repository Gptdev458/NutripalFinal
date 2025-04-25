# Supabase Table Schema Reference

This document describes the structure of all Supabase tables used in the NutriPal project.

---

## Table: `chat_messages`
- `id` (bigserial, PK): Unique message ID
- `chat_id` (uuid, FK): References `chat_sessions(chat_id)` (CASCADE on delete)
- `sender` (text): Must be one of ['user', 'bot', 'error']
- `message` (text): Message content
- `created_at` (timestamp with time zone, default now())
- **Indexes:** `idx_chat_messages_chat_id`

## Table: `chat_sessions`
- `chat_id` (uuid, PK, default gen_random_uuid()): Unique chat session ID
- `user_id` (uuid, FK): References `auth.users(id)` (CASCADE on delete)
- `title` (text): Chat title
- `created_at` (timestamp with time zone, default now())
- `updated_at` (timestamp with time zone, default now())
- **Indexes:** `idx_chat_sessions_user_id`

## Table: `conversations`
- `id` (bigint, PK, identity): Unique conversation ID
- `user_id` (uuid, FK): References `auth.users(id)`
- `message` (text): User message
- `response` (text, nullable): AI response
- `timestamp` (timestamp with time zone, default now())
- `created_at` (timestamp with time zone, default now())
- `response_type` (text, nullable)
- `response_metadata` (jsonb, nullable)
- `sender` (text, nullable)
- **Indexes:** `idx_conversations_user_id`

## Table: `food_log`
- `id` (bigint, PK, identity): Unique food log ID
- `user_id` (uuid, FK): References `auth.users(id)`
- `food_name` (text): Name of the food
- `timestamp` (timestamp with time zone, default now())
- `source` (text): Source of the log
- `recipe_id` (bigint, FK, nullable): References `user_recipes(id)` (SET NULL on delete)
- Nutrient columns: `calories`, `water_g`, `protein_g`, `fat_total_g`, `carbs_g`, `fat_saturated_g`, `fat_polyunsaturated_g`, `fat_monounsaturated_g`, `fat_trans_g`, `fiber_g`, `sugar_g`, `sugar_added_g`, `cholesterol_mg`, `sodium_mg`, `potassium_mg`, `calcium_mg`, `iron_mg`, `magnesium_mg`, `phosphorus_mg`, `zinc_mg`, `copper_mg`, `manganese_mg`, `selenium_mcg`, `vitamin_a_mcg_rae`, `vitamin_d_mcg`, `vitamin_e_mg`, `vitamin_k_mcg`, `vitamin_c_mg`, `thiamin_mg`, `riboflavin_mg`, `niacin_mg`, `pantothenic_acid_mg`, `vitamin_b6_mg`, `biotin_mcg`, `folate_mcg_dfe`, `vitamin_b12_mcg`, `omega_3_g`, `omega_6_g`, `fiber_soluble_g` (all numeric, nullable)
- `created_at` (timestamp with time zone, default now())
- **Indexes:** `idx_food_log_user_id`, `idx_food_log_timestamp`, `idx_food_log_recipe_id`, `idx_food_log_source`

## Table: `user_goals`
- `id` (bigint, PK, identity): Unique goal ID
- `user_id` (uuid, FK): References `auth.users(id)`
- `nutrient` (text): Nutrient name
- `target_value` (numeric, nullable): Target value
- `unit` (text): Unit of measurement
- `created_at` (timestamp with time zone, default now())
- `goal_type` (text, default 'goal'): Must be 'goal' or 'limit'
- **Unique:** (`user_id`, `nutrient`)
- **Indexes:** `idx_user_goals_user_id`, `idx_user_goals_nutrient`

## Table: `user_profiles`
- `id` (uuid, PK, default gen_random_uuid()): Unique profile ID
- `user_id` (uuid, FK, unique): References `auth.users(id)` (CASCADE on delete)
- `age` (integer, nullable, must be > 0)
- `weight_kg` (numeric, nullable, must be > 0)
- `height_cm` (numeric, nullable, must be > 0)
- `sex` (user_sex, nullable)
- `created_at` (timestamp with time zone, default now())
- `updated_at` (timestamp with time zone, default now())
- `activity_level` (text, nullable)
- `health_goal` (text, nullable)
- **Trigger:** `set_timestamp` on update

## Table: `user_recipes`
- `id` (bigint, PK, identity): Unique recipe ID
- `user_id` (uuid, FK): References `auth.users(id)`
- `recipe_name` (text): Name of the recipe
- `description` (text, nullable)
- Nutrient columns: (same as `food_log`)
- `created_at` (timestamp with time zone, default now())
- **Indexes:** `idx_user_recipes_user_id`, `idx_user_recipes_recipe_name`, `idx_user_recipes_recipe_name_gin`

---

# Relationships
- `chat_messages.chat_id` → `chat_sessions.chat_id`
- `chat_sessions.user_id` → `auth.users.id`
- `conversations.user_id` → `auth.users.id`
- `food_log.user_id` → `auth.users.id`
- `food_log.recipe_id` → `user_recipes.id`
- `user_goals.user_id` → `auth.users.id`
- `user_profiles.user_id` → `auth.users.id`
- `user_recipes.user_id` → `auth.users.id`

---

# Indexes
- All major foreign keys and frequently queried columns are indexed as shown above. 