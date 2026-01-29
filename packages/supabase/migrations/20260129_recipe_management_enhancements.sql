-- Recipe Management Enhancements Migration
-- Adds missing columns per SPEC_RECIPE_MANAGEMENT.md

-- Add per-serving nutrition storage
ALTER TABLE user_recipes 
ADD COLUMN IF NOT EXISTS total_batch_grams NUMERIC,
ADD COLUMN IF NOT EXISTS per_serving_nutrition JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS last_logged_at TIMESTAMPTZ;

-- Comments for documentation
COMMENT ON COLUMN user_recipes.total_batch_grams IS 'Total batch size in grams for portion calculations';
COMMENT ON COLUMN user_recipes.per_serving_nutrition IS 'Pre-calculated nutrition per single serving (nutrition_data / servings)';
COMMENT ON COLUMN user_recipes.last_logged_at IS 'Timestamp when recipe was last logged to food_log';

-- Index for quick lookup of recently logged recipes
CREATE INDEX IF NOT EXISTS idx_user_recipes_last_logged ON user_recipes (user_id, last_logged_at DESC NULLS LAST);
