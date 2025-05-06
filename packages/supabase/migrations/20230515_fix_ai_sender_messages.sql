-- Update all existing messages with sender='ai' to sender='bot' to match schema constraint
UPDATE chat_messages 
SET sender = 'bot' 
WHERE sender = 'ai';

-- Add comment to document the change
COMMENT ON TABLE chat_messages IS 'Contains all chat messages with standardized sender types (user, bot, error)'; 