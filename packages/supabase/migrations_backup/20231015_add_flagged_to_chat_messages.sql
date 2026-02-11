-- Add 'flagged' boolean field to chat_messages table
ALTER TABLE chat_messages 
ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT FALSE;

-- Add index for more efficient querying of flagged messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_flagged ON chat_messages(flagged);

-- Add comment to the table to document the change
COMMENT ON COLUMN chat_messages.flagged IS 'Indicates if this message has been flagged for review'; 