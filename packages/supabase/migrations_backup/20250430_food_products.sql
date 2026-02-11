-- Create food_products table for caching food lookup data
CREATE TABLE IF NOT EXISTS food_products (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_name TEXT NOT NULL,
    search_term TEXT NOT NULL,
    nutrition_data JSONB NOT NULL,
    barcode TEXT,
    source TEXT DEFAULT 'open_food_facts',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for efficient searching
CREATE INDEX IF NOT EXISTS idx_food_products_search_term ON food_products USING gin (to_tsvector('english', search_term));
CREATE INDEX IF NOT EXISTS idx_food_products_product_name ON food_products USING gin (to_tsvector('english', product_name));
CREATE INDEX IF NOT EXISTS idx_food_products_barcode ON food_products (barcode);

-- Update trigger for updated_at field
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_food_products') THEN
        CREATE TRIGGER set_timestamp_food_products
        BEFORE UPDATE ON food_products
        FOR EACH ROW
        EXECUTE FUNCTION set_timestamp();
    END IF;
END
$$; 