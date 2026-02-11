-- Add confidence metrics to food_log table
ALTER TABLE food_log 
ADD COLUMN IF NOT EXISTS confidence VARCHAR(20) CHECK (confidence IN ('low', 'medium', 'high')),
ADD COLUMN IF NOT EXISTS confidence_details JSONB,
ADD COLUMN IF NOT EXISTS error_sources TEXT[];

COMMENT ON COLUMN food_log.confidence IS 'Overall confidence level of the nutrition estimate: low, medium, or high';
COMMENT ON COLUMN food_log.confidence_details IS 'Detailed confidence scores per nutrient';
COMMENT ON COLUMN food_log.error_sources IS 'Array of reasons for low confidence or potential errors';
