-- Ensure schema for learned context and health constraints
-- Created: 2026-02-11

-- 1. User Learned Context Table
CREATE TABLE IF NOT EXISTS user_learned_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('food', 'health', 'habits', 'preferences', 'priorities')),
    fact TEXT NOT NULL,
    source_message TEXT,
    confidence FLOAT DEFAULT 1.0,
    active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. User Health Constraints Table
CREATE TABLE IF NOT EXISTS user_health_constraints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category TEXT NOT NULL, -- e.g., 'allergy', 'condition'
    constraint TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, category, constraint)
);

-- 3. Daily Classification Table
CREATE TABLE IF NOT EXISTS daily_classification (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    day_type TEXT NOT NULL, -- e.g., 'normal', 'travel', 'sick', 'social', 'workout'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- 4. Enable RLS
ALTER TABLE user_learned_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_health_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_classification ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- user_learned_context
CREATE POLICY "Users can view own learned context" ON user_learned_context FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own learned context" ON user_learned_context FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own learned context" ON user_learned_context FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own learned context" ON user_learned_context FOR DELETE USING (auth.uid() = user_id);

-- user_health_constraints
CREATE POLICY "Users can view own health constraints" ON user_health_constraints FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own health constraints" ON user_health_constraints FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own health constraints" ON user_health_constraints FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own health constraints" ON user_health_constraints FOR DELETE USING (auth.uid() = user_id);

-- daily_classification
CREATE POLICY "Users can view own daily classification" ON daily_classification FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own daily classification" ON daily_classification FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own daily classification" ON daily_classification FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own daily classification" ON daily_classification FOR DELETE USING (auth.uid() = user_id);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_user_learned_context_user_category ON user_learned_context (user_id, category);
CREATE INDEX IF NOT EXISTS idx_user_health_constraints_user ON user_health_constraints (user_id);
CREATE INDEX IF NOT EXISTS idx_daily_classification_user_date ON daily_classification (user_id, date);

-- 7. Triggers for updated_at
CREATE TRIGGER set_timestamp_user_learned_context BEFORE UPDATE ON user_learned_context FOR EACH ROW EXECUTE FUNCTION set_timestamp();
CREATE TRIGGER set_timestamp_user_health_constraints BEFORE UPDATE ON user_health_constraints FOR EACH ROW EXECUTE FUNCTION set_timestamp();
CREATE TRIGGER set_timestamp_daily_classification BEFORE UPDATE ON daily_classification FOR EACH ROW EXECUTE FUNCTION set_timestamp();
