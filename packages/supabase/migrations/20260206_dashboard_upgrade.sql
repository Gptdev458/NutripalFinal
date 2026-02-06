-- Dashboard Upgrade Migration
-- Adds dynamic thresholds to user_goals and support for daily workout adjustments

-- 1. Update user_goals table
ALTER TABLE user_goals 
ADD COLUMN IF NOT EXISTS yellow_min FLOAT DEFAULT 0.50,
ADD COLUMN IF NOT EXISTS green_min FLOAT DEFAULT 0.75,
ADD COLUMN IF NOT EXISTS red_min FLOAT DEFAULT 0.90;

-- 2. Create daily_adjustments table
CREATE TABLE IF NOT EXISTS daily_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    nutrient TEXT NOT NULL,
    adjustment_value FLOAT NOT NULL,
    adjustment_type TEXT DEFAULT 'workout',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, adjustment_date, nutrient, adjustment_type)
);

-- 3. Enable RLS
ALTER TABLE daily_adjustments ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Users can view own adjustments" ON daily_adjustments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own adjustments" ON daily_adjustments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own adjustments" ON daily_adjustments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own adjustments" ON daily_adjustments FOR DELETE USING (auth.uid() = user_id);

-- 5. Index for performance
CREATE INDEX IF NOT EXISTS idx_daily_adjustments_user_date ON daily_adjustments (user_id, adjustment_date);
