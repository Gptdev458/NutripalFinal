-- NutriPal Agentic Architecture Base Migration
-- Created: 2026-01-27

-- 1. Helper Functions
CREATE OR REPLACE FUNCTION set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. User Profiles Table
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    age INTEGER,
    gender TEXT,
    height_cm FLOAT,
    weight_kg FLOAT,
    activity_level TEXT,
    dietary_preferences TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. User Goals Table
CREATE TABLE IF NOT EXISTS user_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nutrient TEXT NOT NULL,
    target_value FLOAT NOT NULL,
    unit TEXT NOT NULL,
    goal_type TEXT DEFAULT 'goal' CHECK (goal_type IN ('goal', 'limit')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, nutrient)
);

-- 4. Food Log Table
CREATE TABLE IF NOT EXISTS food_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    food_name TEXT NOT NULL,
    calories FLOAT,
    protein_g FLOAT,
    carbs_g FLOAT,
    fat_total_g FLOAT,
    fiber_g FLOAT,
    sugar_g FLOAT,
    sodium_mg FLOAT,
    fat_saturated_g FLOAT,
    cholesterol_mg FLOAT,
    potassium_mg FLOAT,
    fat_trans_g FLOAT,
    calcium_mg FLOAT,
    iron_mg FLOAT,
    sugar_added_g FLOAT,
    serving_size TEXT,
    meal_type TEXT,
    log_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Chat Sessions Table
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Chat Messages Table
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'standard',
    metadata JSONB DEFAULT '{}'::jsonb,
    flagged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. User Recipes Table
CREATE TABLE IF NOT EXISTS user_recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recipe_name TEXT NOT NULL,
    instructions TEXT,
    servings FLOAT DEFAULT 1,
    nutrition_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Recipe Ingredients Table
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES user_recipes(id) ON DELETE CASCADE,
    ingredient_name TEXT NOT NULL,
    quantity FLOAT,
    unit TEXT,
    nutrition_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Food Products (Cache) Table
CREATE TABLE IF NOT EXISTS food_products (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_name TEXT NOT NULL,
    brand TEXT,
    search_term TEXT NOT NULL,
    nutrition_data JSONB NOT NULL,
    barcode TEXT,
    source TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Agent Execution Logs Table
CREATE TABLE IF NOT EXISTS agent_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
    intent TEXT,
    agents_involved TEXT[],
    execution_time_ms INTEGER,
    status TEXT,
    logs JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Triggers for updated_at
CREATE TRIGGER set_timestamp_user_profiles BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION set_timestamp();
CREATE TRIGGER set_timestamp_user_goals BEFORE UPDATE ON user_goals FOR EACH ROW EXECUTE FUNCTION set_timestamp();
CREATE TRIGGER set_timestamp_food_log BEFORE UPDATE ON food_log FOR EACH ROW EXECUTE FUNCTION set_timestamp();
CREATE TRIGGER set_timestamp_chat_sessions BEFORE UPDATE ON chat_sessions FOR EACH ROW EXECUTE FUNCTION set_timestamp();
CREATE TRIGGER set_timestamp_user_recipes BEFORE UPDATE ON user_recipes FOR EACH ROW EXECUTE FUNCTION set_timestamp();
CREATE TRIGGER set_timestamp_food_products BEFORE UPDATE ON food_products FOR EACH ROW EXECUTE FUNCTION set_timestamp();

-- 12. RLS Policies

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_execution_logs ENABLE ROW LEVEL SECURITY;

-- user_profiles: users can only see and edit their own profile
CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- user_goals: users can only see and edit their own goals
CREATE POLICY "Users can view own goals" ON user_goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own goals" ON user_goals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own goals" ON user_goals FOR INSERT WITH CHECK (auth.uid() = user_id);

-- food_log: users can only see and edit their own food logs
CREATE POLICY "Users can view own food log" ON food_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own food log" ON food_log FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own food log" ON food_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own food log" ON food_log FOR DELETE USING (auth.uid() = user_id);

-- chat_sessions: users can only see and edit their own sessions
CREATE POLICY "Users can view own chat sessions" ON chat_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own chat sessions" ON chat_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own chat sessions" ON chat_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own chat sessions" ON chat_sessions FOR DELETE USING (auth.uid() = user_id);

-- chat_messages: users can only see and edit their own messages
CREATE POLICY "Users can view own chat messages" ON chat_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own chat messages" ON chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- user_recipes: users can only see and edit their own recipes
CREATE POLICY "Users can view own recipes" ON user_recipes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own recipes" ON user_recipes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own recipes" ON user_recipes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own recipes" ON user_recipes FOR DELETE USING (auth.uid() = user_id);

-- recipe_ingredients: users can only see ingredients of their own recipes
CREATE POLICY "Users can view own recipe ingredients" ON recipe_ingredients FOR SELECT 
USING (EXISTS (SELECT 1 FROM user_recipes WHERE id = recipe_ingredients.recipe_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert own recipe ingredients" ON recipe_ingredients FOR INSERT 
WITH CHECK (EXISTS (SELECT 1 FROM user_recipes WHERE id = recipe_ingredients.recipe_id AND user_id = auth.uid()));

-- food_products: shared cache, anyone authenticated can read, system can insert
CREATE POLICY "Anyone can view food products" ON food_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert food products" ON food_products FOR INSERT TO authenticated WITH CHECK (true);

-- agent_execution_logs: users can view their own logs
CREATE POLICY "Users can view own agent logs" ON agent_execution_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own agent logs" ON agent_execution_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 13. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_food_log_user_time ON food_log (user_id, log_time);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id);
CREATE INDEX IF NOT EXISTS idx_food_products_search ON food_products USING gin (to_tsvector('english', search_term));
CREATE INDEX IF NOT EXISTS idx_user_recipes_user ON user_recipes (user_id);
