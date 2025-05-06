-- Additional fix for any remaining messages with sender='ai'
UPDATE chat_messages 
SET sender = 'bot' 
WHERE sender = 'ai';

-- Add index for faster querying by sender type
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender);

-- Add comment to document the purpose of this migration
COMMENT ON TABLE chat_messages IS 'Contains all chat messages with standardized sender types (user, bot, error). AI messages are stored as sender=bot.'; 