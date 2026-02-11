-- Add batch size tracking to recipes
-- This allows proper portion scaling when logging recipes

ALTER TABLE user_recipes 
ADD COLUMN IF NOT EXISTS total_batch_size TEXT,
ADD COLUMN IF NOT EXISTS serving_size TEXT;

COMMENT ON COLUMN user_recipes.total_batch_size IS 'Total size of the recipe batch (e.g., "48 oz", "6 cups", "2 liters")';
COMMENT ON COLUMN user_recipes.serving_size IS 'Size of one serving (e.g., "8 oz", "1 cup", "250ml")';
