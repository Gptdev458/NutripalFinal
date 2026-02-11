


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."get_daily_nutrient_totals"("p_user_id" "uuid", "p_nutrient_key" "text", "p_start_date" "text", "p_end_date" "text") RETURNS TABLE("day" "date", "total" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Basic validation of nutrient key to prevent SQL injection
    -- (Though using it in the sum() below is generally safe if we trust the input)
    IF p_nutrient_key NOT IN (
        'calories', 'protein_g', 'fat_total_g', 'carbs_g', 'fiber_g', 
        'sugar_g', 'sodium_mg', 'fat_saturated_g', 'cholesterol_mg', 
        'potassium_mg', 'fat_trans_g', 'calcium_mg', 'iron_mg', 'sugar_added_g'
    ) THEN
        RAISE EXCEPTION 'Invalid nutrient key: %', p_nutrient_key;
    END IF;

    RETURN QUERY
    SELECT 
        (log_time AT TIME ZONE 'UTC')::DATE as day,
        COALESCE(SUM((CASE 
            WHEN p_nutrient_key = 'calories' THEN calories
            WHEN p_nutrient_key = 'protein_g' THEN protein_g
            WHEN p_nutrient_key = 'fat_total_g' THEN fat_total_g
            WHEN p_nutrient_key = 'carbs_g' THEN carbs_g
            WHEN p_nutrient_key = 'fiber_g' THEN fiber_g
            WHEN p_nutrient_key = 'sugar_g' THEN sugar_g
            WHEN p_nutrient_key = 'sodium_mg' THEN sodium_mg
            WHEN p_nutrient_key = 'fat_saturated_g' THEN fat_saturated_g
            WHEN p_nutrient_key = 'cholesterol_mg' THEN cholesterol_mg
            WHEN p_nutrient_key = 'potassium_mg' THEN potassium_mg
            WHEN p_nutrient_key = 'fat_trans_g' THEN fat_trans_g
            WHEN p_nutrient_key = 'calcium_mg' THEN calcium_mg
            WHEN p_nutrient_key = 'iron_mg' THEN iron_mg
            WHEN p_nutrient_key = 'sugar_added_g' THEN sugar_added_g
            ELSE 0
        END))::FLOAT, 0) as total
    FROM food_log
    WHERE user_id = p_user_id
      AND log_time >= p_start_date::TIMESTAMP WITH TIME ZONE
      AND log_time <= p_end_date::TIMESTAMP WITH TIME ZONE
    GROUP BY day
    ORDER BY day ASC;
END;
$$;


ALTER FUNCTION "public"."get_daily_nutrient_totals"("p_user_id" "uuid", "p_nutrient_key" "text", "p_start_date" "text", "p_end_date" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    new.updated_at = now();
    return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agent_execution_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "session_id" "uuid",
    "intent" "text",
    "agents_involved" "text"[],
    "execution_time_ms" integer,
    "status" "text",
    "logs" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "parent_id" "uuid"
);


ALTER TABLE "public"."agent_execution_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_failed_lookups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "query" "text" NOT NULL,
    "portion" "text",
    "failure_type" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."analytics_failed_lookups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "message_type" "text" DEFAULT 'standard'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "flagged" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chat_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "pending_action" "jsonb",
    "last_intent" "text",
    "last_response_type" "text",
    "buffer" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."chat_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "adjustment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "nutrient" "text" NOT NULL,
    "adjustment_value" double precision NOT NULL,
    "adjustment_type" "text" DEFAULT 'workout'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."daily_adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_classification" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "day_type" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "daily_classification_day_type_check" CHECK (("day_type" = ANY (ARRAY['travel'::"text", 'sick'::"text", 'social'::"text", 'workout'::"text", 'normal'::"text"])))
);


ALTER TABLE "public"."daily_classification" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."food_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "food_name" "text" NOT NULL,
    "calories" double precision,
    "protein_g" double precision,
    "carbs_g" double precision,
    "fat_total_g" double precision,
    "fiber_g" double precision,
    "sugar_g" double precision,
    "sodium_mg" double precision,
    "fat_saturated_g" double precision,
    "cholesterol_mg" double precision,
    "potassium_mg" double precision,
    "fat_trans_g" double precision,
    "calcium_mg" double precision,
    "iron_mg" double precision,
    "sugar_added_g" double precision,
    "serving_size" "text",
    "meal_type" "text",
    "log_time" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "portion" "text",
    "recipe_id" "uuid",
    "hydration_ml" double precision,
    "fat_poly_g" double precision,
    "fat_mono_g" double precision,
    "omega_3_g" double precision,
    "omega_6_g" double precision,
    "fiber_soluble_g" double precision,
    "magnesium_mg" double precision,
    "phosphorus_mg" double precision,
    "zinc_mg" double precision,
    "copper_mg" double precision,
    "manganese_mg" double precision,
    "selenium_mcg" double precision,
    "vitamin_a_mcg" double precision,
    "vitamin_c_mg" double precision,
    "vitamin_d_mcg" double precision,
    "vitamin_e_mg" double precision,
    "vitamin_k_mcg" double precision,
    "thiamin_mg" double precision,
    "riboflavin_mg" double precision,
    "niacin_mg" double precision,
    "pantothenic_acid_mg" double precision,
    "vitamin_b6_mg" double precision,
    "biotin_mcg" double precision,
    "folate_mcg" double precision,
    "vitamin_b12_mcg" double precision,
    "omega_ratio" double precision,
    "extras" "jsonb" DEFAULT '{}'::"jsonb",
    "confidence" character varying(20),
    "confidence_details" "jsonb",
    "error_sources" "text"[],
    CONSTRAINT "food_log_confidence_check" CHECK ((("confidence")::"text" = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying])::"text"[])))
);


ALTER TABLE "public"."food_log" OWNER TO "postgres";


COMMENT ON COLUMN "public"."food_log"."serving_size" IS 'Legacy/Standard serving size data (e.g., "100g")';



COMMENT ON COLUMN "public"."food_log"."portion" IS 'User-specified or AI-estimated portion description (e.g., "1 medium apple")';



COMMENT ON COLUMN "public"."food_log"."recipe_id" IS 'ID of the recipe this log entry belongs to, if applicable.';



CREATE TABLE IF NOT EXISTS "public"."food_products" (
    "id" bigint NOT NULL,
    "product_name" "text" NOT NULL,
    "brand" "text",
    "search_term" "text" NOT NULL,
    "nutrition_data" "jsonb" NOT NULL,
    "barcode" "text",
    "source" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "calories" double precision,
    "protein_g" double precision,
    "carbs_g" double precision,
    "fat_total_g" double precision
);


ALTER TABLE "public"."food_products" OWNER TO "postgres";


ALTER TABLE "public"."food_products" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."food_products_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."recipe_ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "ingredient_name" "text" NOT NULL,
    "quantity" double precision,
    "unit" "text",
    "nutrition_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."recipe_ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."unit_conversions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "food_name" "text" NOT NULL,
    "from_unit" "text" NOT NULL,
    "to_unit" "text" NOT NULL,
    "multiplier" double precision NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."unit_conversions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "nutrient" "text" NOT NULL,
    "target_value" double precision NOT NULL,
    "unit" "text" NOT NULL,
    "goal_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "yellow_min" double precision DEFAULT 0.50,
    "green_min" double precision DEFAULT 0.75,
    "red_min" double precision DEFAULT 0.90,
    CONSTRAINT "user_goals_goal_type_check" CHECK (("goal_type" = ANY (ARRAY['goal'::"text", 'limit'::"text"])))
);


ALTER TABLE "public"."user_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_health_constraints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "constraint_type" character varying(50) NOT NULL,
    "category" character varying(100) NOT NULL,
    "severity" character varying(20) DEFAULT 'warning'::character varying,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_health_constraints" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_learned_context" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category" character varying(20) NOT NULL,
    "fact" "text" NOT NULL,
    "source_message" "text",
    "confidence" double precision DEFAULT 1.0,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_used_at" timestamp with time zone,
    "use_count" integer DEFAULT 0,
    CONSTRAINT "user_learned_context_category_check" CHECK ((("category")::"text" = ANY ((ARRAY['food'::character varying, 'priorities'::character varying, 'health'::character varying, 'habits'::character varying, 'preferences'::character varying])::"text"[])))
);


ALTER TABLE "public"."user_learned_context" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "age" integer,
    "gender" "text",
    "height_cm" double precision,
    "weight_kg" double precision,
    "activity_level" "text",
    "dietary_preferences" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "health_goal" "text"
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "recipe_name" "text" NOT NULL,
    "instructions" "text",
    "servings" double precision DEFAULT 1,
    "nutrition_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "total_batch_size" "text",
    "serving_size" "text",
    "total_batch_grams" double precision,
    "per_serving_nutrition" "jsonb" DEFAULT '{}'::"jsonb",
    "last_logged_at" timestamp with time zone,
    "ingredient_fingerprint" "text"
);


ALTER TABLE "public"."user_recipes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_recipes"."total_batch_grams" IS 'Total batch size in grams for portion calculations';



COMMENT ON COLUMN "public"."user_recipes"."per_serving_nutrition" IS 'Pre-calculated nutrition per single serving (nutrition_data / servings)';



COMMENT ON COLUMN "public"."user_recipes"."last_logged_at" IS 'Timestamp when recipe was last logged to food_log';



COMMENT ON COLUMN "public"."user_recipes"."ingredient_fingerprint" IS 'A normalized, alphabetic list of ingredient names used for fast duplicate detection (e.g., "basil,onion,tomato").';



ALTER TABLE ONLY "public"."agent_execution_logs"
    ADD CONSTRAINT "agent_execution_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analytics_failed_lookups"
    ADD CONSTRAINT "analytics_failed_lookups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_adjustments"
    ADD CONSTRAINT "daily_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_adjustments"
    ADD CONSTRAINT "daily_adjustments_user_id_adjustment_date_nutrient_adjustme_key" UNIQUE ("user_id", "adjustment_date", "nutrient", "adjustment_type");



ALTER TABLE ONLY "public"."daily_classification"
    ADD CONSTRAINT "daily_classification_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_classification"
    ADD CONSTRAINT "daily_classification_user_id_date_key" UNIQUE ("user_id", "date");



ALTER TABLE ONLY "public"."food_log"
    ADD CONSTRAINT "food_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_products"
    ADD CONSTRAINT "food_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unit_conversions"
    ADD CONSTRAINT "unit_conversions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_goals"
    ADD CONSTRAINT "user_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_goals"
    ADD CONSTRAINT "user_goals_user_id_nutrient_key" UNIQUE ("user_id", "nutrient");



ALTER TABLE ONLY "public"."user_health_constraints"
    ADD CONSTRAINT "user_health_constraints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_health_constraints"
    ADD CONSTRAINT "user_health_constraints_user_id_category_key" UNIQUE ("user_id", "category");



ALTER TABLE ONLY "public"."user_learned_context"
    ADD CONSTRAINT "user_learned_context_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_recipes"
    ADD CONSTRAINT "user_recipes_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_agent_logs_parent" ON "public"."agent_execution_logs" USING "btree" ("parent_id");



CREATE INDEX "idx_chat_messages_session" ON "public"."chat_messages" USING "btree" ("session_id");



CREATE INDEX "idx_daily_adjustments_user_date" ON "public"."daily_adjustments" USING "btree" ("user_id", "adjustment_date");



CREATE INDEX "idx_daily_classification_user_date" ON "public"."daily_classification" USING "btree" ("user_id", "date");



CREATE INDEX "idx_food_log_user_time" ON "public"."food_log" USING "btree" ("user_id", "log_time");



CREATE INDEX "idx_food_products_calories" ON "public"."food_products" USING "btree" ("calories");



CREATE INDEX "idx_food_products_macros" ON "public"."food_products" USING "btree" ("protein_g", "carbs_g", "fat_total_g");



CREATE INDEX "idx_food_products_search" ON "public"."food_products" USING "gin" ("to_tsvector"('"english"'::"regconfig", "search_term"));



CREATE INDEX "idx_unit_conversions_lookup" ON "public"."unit_conversions" USING "btree" ("food_name", "from_unit", "to_unit");



CREATE INDEX "idx_user_context_category" ON "public"."user_learned_context" USING "btree" ("user_id", "category", "active");



CREATE INDEX "idx_user_recipes_fingerprint" ON "public"."user_recipes" USING "btree" ("user_id", "ingredient_fingerprint");



CREATE INDEX "idx_user_recipes_last_logged" ON "public"."user_recipes" USING "btree" ("user_id", "last_logged_at" DESC NULLS LAST);



CREATE INDEX "idx_user_recipes_user" ON "public"."user_recipes" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "set_timestamp_chat_sessions" BEFORE UPDATE ON "public"."chat_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_timestamp"();



CREATE OR REPLACE TRIGGER "set_timestamp_food_log" BEFORE UPDATE ON "public"."food_log" FOR EACH ROW EXECUTE FUNCTION "public"."set_timestamp"();



CREATE OR REPLACE TRIGGER "set_timestamp_food_products" BEFORE UPDATE ON "public"."food_products" FOR EACH ROW EXECUTE FUNCTION "public"."set_timestamp"();



CREATE OR REPLACE TRIGGER "set_timestamp_user_goals" BEFORE UPDATE ON "public"."user_goals" FOR EACH ROW EXECUTE FUNCTION "public"."set_timestamp"();



CREATE OR REPLACE TRIGGER "set_timestamp_user_profiles" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_timestamp"();



CREATE OR REPLACE TRIGGER "set_timestamp_user_recipes" BEFORE UPDATE ON "public"."user_recipes" FOR EACH ROW EXECUTE FUNCTION "public"."set_timestamp"();



CREATE OR REPLACE TRIGGER "update_chat_sessions_updated_at" BEFORE UPDATE ON "public"."chat_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."agent_execution_logs"
    ADD CONSTRAINT "agent_execution_logs_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."agent_execution_logs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_execution_logs"
    ADD CONSTRAINT "agent_execution_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_execution_logs"
    ADD CONSTRAINT "agent_execution_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."analytics_failed_lookups"
    ADD CONSTRAINT "analytics_failed_lookups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_adjustments"
    ADD CONSTRAINT "daily_adjustments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_classification"
    ADD CONSTRAINT "daily_classification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_log"
    ADD CONSTRAINT "food_log_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."user_recipes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."food_log"
    ADD CONSTRAINT "food_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."user_recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_goals"
    ADD CONSTRAINT "user_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_health_constraints"
    ADD CONSTRAINT "user_health_constraints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_learned_context"
    ADD CONSTRAINT "user_learned_context_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_recipes"
    ADD CONSTRAINT "user_recipes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can view food products" ON "public"."food_products" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can insert food products" ON "public"."food_products" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable read access for all users" ON "public"."unit_conversions" FOR SELECT USING (true);



CREATE POLICY "Users can delete own adjustments" ON "public"."daily_adjustments" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own chat sessions" ON "public"."chat_sessions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own food log" ON "public"."food_log" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own goals" ON "public"."user_goals" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own recipes" ON "public"."user_recipes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own adjustments" ON "public"."daily_adjustments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own agent logs" ON "public"."agent_execution_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own chat messages" ON "public"."chat_messages" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own chat sessions" ON "public"."chat_sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own food log" ON "public"."food_log" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own goals" ON "public"."user_goals" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."user_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own recipe ingredients" ON "public"."recipe_ingredients" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_recipes"
  WHERE (("user_recipes"."id" = "recipe_ingredients"."recipe_id") AND ("user_recipes"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert own recipes" ON "public"."user_recipes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own classifications" ON "public"."daily_classification" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own failed lookups" ON "public"."analytics_failed_lookups" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own session" ON "public"."chat_sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own adjustments" ON "public"."daily_adjustments" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own chat sessions" ON "public"."chat_sessions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own food log" ON "public"."food_log" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own goals" ON "public"."user_goals" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."user_profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own recipes" ON "public"."user_recipes" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own classifications" ON "public"."daily_classification" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own session" ON "public"."chat_sessions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own adjustments" ON "public"."daily_adjustments" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own agent logs" ON "public"."agent_execution_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own chat messages" ON "public"."chat_messages" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own chat sessions" ON "public"."chat_sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own food log" ON "public"."food_log" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own goals" ON "public"."user_goals" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."user_profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own recipe ingredients" ON "public"."recipe_ingredients" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_recipes"
  WHERE (("user_recipes"."id" = "recipe_ingredients"."recipe_id") AND ("user_recipes"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own recipes" ON "public"."user_recipes" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own classifications" ON "public"."daily_classification" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own failed lookups" ON "public"."analytics_failed_lookups" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own session" ON "public"."chat_sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."agent_execution_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics_failed_lookups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_adjustments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_classification" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipe_ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."unit_conversions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_recipes" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."get_daily_nutrient_totals"("p_user_id" "uuid", "p_nutrient_key" "text", "p_start_date" "text", "p_end_date" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_daily_nutrient_totals"("p_user_id" "uuid", "p_nutrient_key" "text", "p_start_date" "text", "p_end_date" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_nutrient_totals"("p_user_id" "uuid", "p_nutrient_key" "text", "p_start_date" "text", "p_end_date" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."agent_execution_logs" TO "anon";
GRANT ALL ON TABLE "public"."agent_execution_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_execution_logs" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_failed_lookups" TO "anon";
GRANT ALL ON TABLE "public"."analytics_failed_lookups" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_failed_lookups" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_sessions" TO "anon";
GRANT ALL ON TABLE "public"."chat_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."daily_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."daily_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."daily_classification" TO "anon";
GRANT ALL ON TABLE "public"."daily_classification" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_classification" TO "service_role";



GRANT ALL ON TABLE "public"."food_log" TO "anon";
GRANT ALL ON TABLE "public"."food_log" TO "authenticated";
GRANT ALL ON TABLE "public"."food_log" TO "service_role";



GRANT ALL ON TABLE "public"."food_products" TO "anon";
GRANT ALL ON TABLE "public"."food_products" TO "authenticated";
GRANT ALL ON TABLE "public"."food_products" TO "service_role";



GRANT ALL ON SEQUENCE "public"."food_products_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."food_products_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."food_products_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."recipe_ingredients" TO "anon";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."unit_conversions" TO "anon";
GRANT ALL ON TABLE "public"."unit_conversions" TO "authenticated";
GRANT ALL ON TABLE "public"."unit_conversions" TO "service_role";



GRANT ALL ON TABLE "public"."user_goals" TO "anon";
GRANT ALL ON TABLE "public"."user_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."user_goals" TO "service_role";



GRANT ALL ON TABLE "public"."user_health_constraints" TO "anon";
GRANT ALL ON TABLE "public"."user_health_constraints" TO "authenticated";
GRANT ALL ON TABLE "public"."user_health_constraints" TO "service_role";



GRANT ALL ON TABLE "public"."user_learned_context" TO "anon";
GRANT ALL ON TABLE "public"."user_learned_context" TO "authenticated";
GRANT ALL ON TABLE "public"."user_learned_context" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_recipes" TO "anon";
GRANT ALL ON TABLE "public"."user_recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."user_recipes" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































