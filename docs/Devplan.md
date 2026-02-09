# NutriPal Development Plan

This document outlines the complete feature roadmap following the initial demo. Each feature is a detailed ticket with description, requirements, and implementation steps. Features are prioritized based on the architecture upgrade strategy.

---

## Feature 1: Dashboard UI Upgrade ✅ *COMPLETED*

**Description**: Enhanced the dashboard table to provide intuitive, color-coded feedback on nutritional progress and support dynamic adjustments.

### Requirements (Completed):
- **Color Coding**:
    - **Dynamic Thresholds**: Each nutrient goal stores specific thresholds: `yellow_min`, `green_min` (for goals), and `red_min` (for limits).
    - **Logic for Goals**:
        - Green: Progress ≥ `green_min` (Default: 0.75)
        - Yellow: Progress ≥ `yellow_min` (Default: 0.50)
        - Red: Progress < `yellow_min`
    - **Logic for Limits**:
        - Green: Progress < `green_min` (Default: 0.75)
        - Yellow: Progress between `green_min` and `red_min` (Default: 0.90)
        - Red: Progress ≥ `red_min`
    - **Interaction**: Users can ask AI (e.g., "Make my fiber green at 90%"). ReasoningAgent will update these values.
- **Table Columns**: Nutrient name (Goal/Limit), Target, Consumed, Progress %, Remaining (Delta).
- **Negative Numbers**: Over-target items show negative remaining values (e.g., `-12.5g`).
- **Workout Adjustments**: 
    - **User Action**: Inform AI "I did a workout".
    - **Logic**: AI triggers a `apply_daily_workout_offset` call, adding a fixed "bonus" to day's targets (configurable per user/nutrient).
    - **UI**: Target shows as `Base + Adjustment [Workout] = Final`.

### Implementation Status: ✅ Complete

---

## Feature 2: Agent Restructuring & Direct Routing ✅ *COMPLETED*

**Description**: Restructure the agent architecture to ensure proper delegation and utilization of specialist agents. Currently, the Reasoning Agent bypasses specialist agents by calling granular tools directly. This feature implements direct routing from the orchestrator to specialist agents.

> [!IMPORTANT]
> This is the foundational change that enables all other architecture upgrades. Must be completed first.

### Requirements (Completed):

- **Direct Routing in Orchestrator**:
    - `log_food` → NutritionAgent.estimate() (not ToolExecutor.lookup_nutrition)
    - `query_nutrition` → NutritionAgent.query()
    - `audit` / `patterns` / `summary` → InsightAgent.*()
    - `save_recipe` / `log_recipe` → RecipeAgent (already correct)
    - `complex_query` / `planning` → ReasoningAgent (fallback only)

- **Tool Categorization for ReasoningAgent**:
    - 🔴 **Remove** (duplicate agent work): `lookup_nutrition`, `estimate_nutrition`, `search_saved_recipes`, `get_recipe_details`, `analyze_eating_patterns`, `get_progress_report`
    - 🟢 **Keep** (context & data access): `get_user_goals`, `get_food_log_history`, `get_daily_totals`, `get_user_profile`, `search_memory` (future)
    - 🟡 **Add** (delegation tools): `ask_nutrition_agent`, `ask_recipe_agent`, `ask_insight_agent`
    - 🔵 **Keep** (actions): `log_food_entry`, `propose_action`, `set_goal`, `create_adjustment`

- **Agent Communication Protocol**:
    - When ReasoningAgent needs nutrition data, it calls `ask_nutrition_agent` which invokes NutritionAgent
    - Preserves agent intelligence (confidence, health flags) instead of raw data

### Schema Changes:
- None required

### Files Affected:
| File | Change |
|------|--------|
| `orchestrator_v3.ts` | Add direct routing logic after IntentAgent classification |
| `tools.ts` | Remove duplicate tools, add delegation tools |
| `tool-executor.ts` | Implement delegation tool handlers |
| `reasoning-agent.ts` | Update system prompt to use delegation tools |
| `intent-agent.ts` | Add new intents: `audit`, `patterns`, `summary` |

### Implementation Plan:

1. **Update IntentAgent** to detect new intents (`audit`, `patterns`, `summary`) and add routing metadata
2. **Modify orchestrator_v3.ts**:
   - After Step 2 (IntentAgent classification), add direct routing switch
   - Route `log_food` to NutritionAgent.estimate()
   - Route `query_nutrition` to NutritionAgent.query()
   - Route `audit`/`patterns`/`summary` to InsightAgent
   - Keep ReasoningAgent as fallback for complex/multi-step tasks
3. **Refactor tools.ts**:
   - Remove duplicate tools from ReasoningAgent tool list
   - Create new delegation tools: `ask_nutrition_agent`, `ask_recipe_agent`, `ask_insight_agent`
   - Define tool schemas for delegation (include context passing parameters)
4. **Update tool-executor.ts**:
   - Implement handlers for delegation tools that invoke specialist agents
   - Pass context and return enriched responses (with confidence, flags)
5. **Update reasoning-agent.ts**:
   - Modify system prompt to use delegation tools instead of granular tools
   - Add guidance for when to delegate vs. handle directly

### Dependencies:
- None (this is the foundation)

---

## Feature 3: Confidence & Uncertainty System

**Description**: Every nutrition estimate must include confidence levels and likely error sources. This enables the UI to show uncertainty markers and allows the system to ask clarifying questions when confidence is low.

> [!NOTE]
> Principle: "Directional estimates are allowed. False precision is not."

### Requirements:

- **NutritionAgent Response Enrichment**:
    - Return `confidence` field: `low` | `medium` | `high`
    - Return `error_sources` array: e.g., `["portion_vague", "dressing_unknown", "cooking_method_unclear"]`
    - Return `health_flags` array: e.g., `["contains_dairy", "high_sodium"]` (for health considerations)

- **Confidence Calculation Logic**:
    - **High**: Exact match from database, user-provided weight, known brand
    - **Medium**: Generic food match, standard portion, common preparation
    - **Low**: Ambiguous portion, unknown cooking method, restaurant meal, user description vague

- **Error Source Categories**:
    - `portion_vague` - Unclear serving size
    - `cooking_method_unclear` - Oil, butter, sauce unknown
    - `restaurant_meal` - Hidden calories likely
    - `dressing_unknown` - Salad dressings, sauces
    - `ingredient_substitution` - User may use different ingredients
    - `brand_variation` - Nutritional content varies by brand

- **UI Indicators**:
    - Show confidence badge/icon on estimates
    - Tooltip with error sources
    - Visual distinction for low-confidence items

- **Passive Notification Pattern**:
    - Show estimate with low confidence markers
    - Don't block user from proceeding
    - Offer optional clarification: "My confidence is low because [X]. Want to clarify?"

### Schema Changes:
```sql
-- Add columns to food_log for confidence tracking
ALTER TABLE food_log ADD COLUMN confidence VARCHAR(10) DEFAULT 'medium';
ALTER TABLE food_log ADD COLUMN error_sources TEXT[]; -- Array of error source codes
```

### Files Affected:
| File | Change |
|------|--------|
| `nutrition-agent.ts` | Add confidence calculation, return enriched response |
| `tool-executor.ts` | Pass confidence data through to proposals |
| `orchestrator_v3.ts` | Include confidence in PCC proposals |
| `chat-agent.ts` | Format responses mentioning confidence when low |
| `db-service.ts` | Store confidence with food logs |
| `packages/web/...` | UI components for confidence display |

### Implementation Plan:

1. **Define TypeScript types** for enriched nutrition response:
   ```typescript
   interface EnrichedNutritionResult {
     // existing nutrition fields...
     confidence: 'low' | 'medium' | 'high';
     error_sources: string[];
     health_flags: string[];
   }
   ```

2. **Update nutrition-agent.ts**:
   - Add confidence calculation function based on input analysis
   - Analyze: source of data (DB match vs LLM estimate), portion specificity, cooking method known
   - Return enriched response from all estimation methods

3. **Update proposal flow**:
   - `propose_food_log` includes confidence data
   - Session pending action stores confidence
   - Confirmation UI receives confidence data

4. **Update ChatAgent prompts**:
   - When confidence is low, include brief explanation
   - Format: "Here's what I think (confidence: low) — [estimate]. [Error source explanation]"

5. **Frontend changes**:
   - Add confidence indicator to `FoodLogConfirmation` component
   - Add tooltip showing error sources
   - Style low-confidence items distinctively

6. **Database migration**:
   - Add confidence columns to food_log table
   - Store confidence metadata for historical analysis

### Dependencies:
- Feature 2 (Agent Restructuring) - NutritionAgent must be primary handler

---

## Feature 4: Ambiguity Detection & Clarification

**Description**: When ambiguity materially affects the answer, pause and ask 1-2 clarifying questions instead of guessing silently. This prevents the "0 calorie apple" type issues.

> [!CAUTION]
> Hard rules: No silent defaults. No "probably you meant...". Ambiguity beats speed.

### Requirements:

- **IntentAgent Ambiguity Detection**:
    - Return `ambiguity_level`: `none` | `low` | `medium` | `high`
    - Return `ambiguity_reasons`: array of specific issues
    - High ambiguity triggers clarification flow

- **Ambiguity Categories**:
    - `portion_unclear` - "a bowl of pasta" (how big?)
    - `preparation_unknown` - "chicken" (grilled? fried? breaded?)
    - `restaurant_vs_homemade` - Context unclear
    - `multiple_interpretations` - "salad" could be many things
    - `missing_quantity` - "some nuts" (how many?)
    - `cooking_method_unknown` - "eggs" (scrambled? fried? boiled?)

- **Clarification Flow**:
    - When `ambiguity_level` is `high`, orchestrator routes to clarification
    - Generate 1-2 targeted questions
    - Explain why the clarification matters
    - Store partial context in session
    - On user response, continue with full context

- **Graceful Degradation**:
    - If `ambiguity_level` is `medium`, proceed with explicit assumptions + low confidence
    - Never completely block the user

### Schema Changes:
- Session storage for clarification context (already exists in `chat_sessions.context`)

### Files Affected:
| File | Change |
|------|--------|
| `intent-agent.ts` | Add ambiguity detection logic and return fields |
| `orchestrator_v3.ts` | Add clarification flow branch |
| `session-service.ts` | Store/retrieve clarification context |
| `chat-agent.ts` | Format clarification questions |

### Implementation Plan:

1. **Enhance IntentAgent**:
   - Add ambiguity analysis to system prompt
   - Return structured analysis: `{ ambiguity_level, ambiguity_reasons, clarification_questions }`
   - Detection rules for each ambiguity category

2. **Add clarification flow to orchestrator**:
   - After Step 2, check `ambiguity_level`
   - If `high`: save partial context, return clarification response with `response_type: 'clarification'`
   - On next message: check if previous was clarification, merge contexts

3. **Session context management**:
   - Store original message + extracted entities in session
   - Store pending clarification ID
   - On clarification response: retrieve, merge, and process

4. **ChatAgent formatting**:
   - Generate natural clarification questions
   - Explain impact: "This matters because the calorie difference could be 2x"
   - Limit to 1-2 questions per turn

5. **Frontend handling**:
   - Recognize `response_type: 'clarification'`
   - Display questions distinctively
   - User response flows through normal chat

### Dependencies:
- Feature 2 (Agent Restructuring) - IntentAgent enhancements

---

## Feature 5: Insight Agent Upgrade

**Description**: Transform the Insight Agent from a simple summary generator into a full analyst with audit mode, pattern recognition, day classification, and proactive reflection capabilities.

> [!NOTE]
> Currently most underutilized agent. Has the data, lacks the prompts.

### Requirements:

- **Audit Mode** (`action: 'audit'`):
    - When user says "this seems off" or "check my numbers"
    - List likely undercount sources
    - Show itemized breakdown
    - Ask minimal clarifying questions
    - Debugging stance, not correcting user

- **Pattern Recognition** (`action: 'patterns'`):
    - Detect: "this keeps happening", "new pattern", "only under condition X"
    - Pattern vs noise judgment
    - One structural fix suggestion
    - Keep it compressed (3-5 bullets max)

- **Day Classification** (`action: 'classify_day'`):
    - Mark days as: `normal` | `travel` | `sick` | `heavy_workout` | `social` | `depleted`
    - User trigger: "Travel day" or automatic detection
    - Adjust expectations for classified days
    - Exclude from normal pattern analysis

- **Proactive Reflection** (`action: 'reflect'`):
    - Top contributors today
    - What changed vs yesterday
    - Single biggest improvement lever
    - Brief, no essays

- **Summary Mode** (`action: 'summary'`):
    - Day/week view
    - Hard format: bullets only, 3-5 max, one idea per bullet
    - Answer: what mattered, what didn't, one takeaway, one adjustment

### Schema Changes:
```sql
-- Add day classification to daily_progress or new table
ALTER TABLE daily_adjustments ADD COLUMN day_type VARCHAR(20) DEFAULT 'normal';
-- OR create new table:
CREATE TABLE daily_classification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  date DATE NOT NULL,
  day_type VARCHAR(20) NOT NULL DEFAULT 'normal',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, date)
);
```

### Files Affected:
| File | Change |
|------|--------|
| `insight-agent.ts` | Add audit, patterns, classify_day, reflect, summary actions |
| `orchestrator_v3.ts` | Direct routing for insight intents |
| `db-service.ts` | Add day classification read/write |
| `intent-agent.ts` | Detect insight-related intents |

### Implementation Plan:

1. **Expand InsightAgent action types**:
   - Add `action` parameter: `audit` | `patterns` | `summary` | `classify_day` | `reflect`
   - Create specialized prompts for each action type

2. **Implement Audit Mode**:
   - Analyze today's log entries
   - Identify likely undercount sources (restaurants, snacks, drinks, oils)
   - Generate itemized breakdown with categories
   - Return structured audit report

3. **Implement Pattern Recognition**:
   - Query historical data (7-day, 30-day)
   - Identify recurring patterns (time of day, day of week, specific foods)
   - Distinguish pattern from noise using frequency/consistency
   - Generate brief pattern report

4. **Implement Day Classification**:
   - Add classification persistence in DB
   - Create detection heuristics (high sodium + irregular times = travel?)
   - User override always wins
   - Propagate classification to insights

5. **Implement Summary Generation**:
   - Enforce hard format rules in prompt
   - Calculate key metrics
   - Generate compressed insights

6. **Update Orchestrator routing**:
   - Route `audit`, `patterns`, `summary` intents directly to InsightAgent
   - Skip ReasoningAgent for pure insight queries

### Dependencies:
- Feature 2 (Agent Restructuring) - Direct routing to InsightAgent

---

## Feature 6: Learned Context Memory

**Description**: Implement a classified memory system where user corrections, preferences, and behaviors persist and are automatically applied to future interactions.

> [!IMPORTANT]
> Anti-pattern: Repeating the same mistake after correction.

### Requirements:

- **Memory Categories**:
    | Category | Examples | Used By |
    |----------|----------|---------|
    | `food` | "User's chicken is higher in sodium" | NutritionAgent |
    | `priorities` | "User prioritizes protein over calories" | ReasoningAgent, InsightAgent |
    | `health` | "User is lactose intolerant" | NutritionAgent, ChatAgent |
    | `habits` | "User always adds olive oil when cooking" | NutritionAgent |
    | `preferences` | "User prefers metric units" | ChatAgent |

- **Memory Operations**:
    - Create: Extract learnable fact from user statement/correction
    - Search: Query memories by category relevant to current agent/task
    - Apply: Automatically incorporate into estimates and responses

- **Learning Triggers**:
    - User provides correction: "Actually, this is 2 cups not 1"
    - User states preference: "I always add butter to my eggs"
    - User provides context: "My chicken breasts are usually 8oz"

- **Confirmation Pattern**:
    - When learning new fact: "Got it. I'll remember that going forward."
    - When applying learned fact: Use silently, only mention if relevant

### Schema Changes:
```sql
CREATE TABLE user_learned_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  category VARCHAR(20) NOT NULL CHECK (category IN ('food', 'priorities', 'health', 'habits', 'preferences')),
  fact TEXT NOT NULL,
  source_message TEXT, -- Original user message that taught this
  confidence FLOAT DEFAULT 1.0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  use_count INTEGER DEFAULT 0
);

CREATE INDEX idx_user_context_category ON user_learned_context(user_id, category, active);
```

### Files Affected:
| File | Change |
|------|--------|
| `db-service.ts` | Add memory CRUD operations |
| `session-service.ts` | Track corrections in session for extraction |
| `nutrition-agent.ts` | Query `food`, `habits`, `health` memories |
| `reasoning-agent.ts` | Query `priorities` memories |
| `chat-agent.ts` | Query `health`, `preferences` memories |
| `tools.ts` | Add `search_memory`, `save_memory` tools |
| `tool-executor.ts` | Implement memory tool handlers |

### Implementation Plan:

1. **Create database migration**:
   - Create `user_learned_context` table
   - Add indexes for efficient querying
   - Create DB service methods

2. **Implement memory service**:
   - `getMemories(userId, categories)`: Retrieve relevant memories
   - `saveMemory(userId, category, fact, source)`: Store new learning
   - `markUsed(memoryId)`: Track usage for relevance

3. **Add learning detection**:
   - In orchestrator, detect correction patterns
   - Extract learnable facts using LLM
   - Categorize and store

4. **Integrate with agents**:
   - Each agent queries its relevant memory categories on invocation
   - Memories added to agent context
   - Agents apply memories to responses

5. **Add memory tools for ReasoningAgent**:
   - `search_memory`: Query by category
   - `save_memory`: Explicitly store a learned fact

6. **Confirmation flow**:
   - When saving memory, ChatAgent acknowledges
   - When applying, silently use (unless explanation helps)

### Dependencies:
- Feature 2 (Agent Restructuring) - Agents need to be primary handlers to use memories

---

## Feature 7: Health Considerations (Safety System)

**Description**: Personalized AI advice and safety warnings based on user's medical or dietary constraints. Implements a parallel Safety Agent pattern for constraint checking.

> [!WARNING]
> This is SAFETY-CRITICAL. Incorrect handling could harm users with allergies or conditions.

### Requirements:

- **Constraint Storage**:
    - `user_profiles.health_considerations` (TEXT) - Free-form health constraints
    - Examples: "lactose intolerant", "avoid high sodium - blood pressure", "vegetarian", "nut allergy"

- **Constraint Parsing**:
    - Extract prohibited items from unstructured health text
    - Map to ingredient categories (dairy, nuts, gluten, high-sodium foods, etc.)
    - Update as user provides new information

- **Parallel Safety Check**:
    - Run safety check in parallel during `orchestrateV3` for all food logging paths
    - Safety check result (Safety Report) informs ChatAgent's narrative
    - Does NOT block logging, but issues clear warnings

- **Health Flags in Responses**:
    - NutritionAgent returns `health_flags: ["contains_dairy", "high_sodium"]`
    - ChatAgent explains flags naturally: "I should mention this contains dairy..."
    - UI shows health warnings distinctively

- **App-Wide Awareness**:
    - Health constraints part of standard `Context` object for all agents
    - Reasoning considers constraints in tradeoff thinking
    - Insights account for constraints when analyzing patterns

### Schema Changes:
```sql
-- Already exists per original plan:
-- user_profiles.health_considerations TEXT

-- Add structured constraints (optional enhancement):
CREATE TABLE user_health_constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  constraint_type VARCHAR(50) NOT NULL, -- 'allergy', 'intolerance', 'condition', 'preference'
  category VARCHAR(100) NOT NULL, -- 'dairy', 'gluten', 'nuts', 'sodium', etc.
  severity VARCHAR(20) DEFAULT 'warning', -- 'warning', 'critical', 'fatal'
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, category)
);
```

### Files Affected:
| File | Change |
|------|--------|
| `db-service.ts` | Get/set health constraints |
| `nutrition-agent.ts` | Check food against constraints, return health_flags |
| `orchestrator_v3.ts` | Parallel safety check, inject report into context |
| `chat-agent.ts` | Explain health warnings naturally |
| `reasoning-agent.ts` | Consider constraints in tradeoff reasoning |
| Frontend | Health constraint input, warning display |

### Implementation Plan:

1. **Constraint parsing utility**:
   - Create `parseHealthConstraints(text)` function
   - Extract categories: dairy, gluten, nuts, soy, eggs, fish, shellfish, high-sodium, etc.
   - Map to ingredient keywords for matching

2. **Extend user profile**:
   - Add health_considerations field (if not exists)
   - Create structured constraints table (optional)
   - Frontend for managing constraints

3. **Parallel safety check in orchestrator**:
   - For log_food paths, run safety check in parallel with estimation
   - Check proposed food against user constraints
   - Generate Safety Report: `{ safe: boolean, flags: [], explanation: string }`

4. **Integrate with NutritionAgent**:
   - Query user health constraints when estimating
   - Analyze food components against constraint categories
   - Include health_flags in response

5. **ChatAgent warning integration**:
   - Receive Safety Report in context
   - Natural explanation: "I should let you know this contains [X], which you've noted..."
   - Tone: informative, not preachy

6. **Reasoning integration**:
   - Health constraints inform tradeoff decisions
   - "Given your blood pressure concerns, lower sodium option is better"

### Dependencies:
- Feature 3 (Confidence) - Health flags are part of enriched response
- Feature 6 (Memory) - Health constraints stored as learned context too

---

## Feature 8: What-If Planning & Scenarios

**Description**: Support planning mode with branching scenarios, counterfactuals, and "what if I eat this" queries. This is a what-if engine, not just a diary.

### Requirements:

- **Planning Mode**:
    - "If I eat this, where does that put me?"
    - Show projected totals without logging
    - Compare scenarios side-by-side

- **Counterfactual Queries**:
    - "If I hadn't eaten that snack, would today be better?"
    - "If I skip dinner, what happens?"
    - Calculate hypothetical totals

- **Scenario Comparison**:
    - "Should I have pizza or salad?"
    - Show both options with projections
    - Include confidence and tradeoffs

- **What-If Tool**:
    - `calculate_scenario(foods: Food[], context: 'add' | 'remove' | 'replace')`
    - Returns projected totals, deltas, and impact narrative

### Schema Changes:
- None required (all calculations are ephemeral)

### Files Affected:
| File | Change |
|------|--------|
| `tools.ts` | Add `calculate_scenario` tool |
| `tool-executor.ts` | Implement scenario calculations |
| `reasoning-agent.ts` | Enhanced prompting for planning queries |
| `chat-agent.ts` | Format scenario comparisons |

### Implementation Plan:

1. **Add scenario calculation tool**:
   - Parameters: foods to add/remove/replace, current progress
   - Calculate projected totals
   - Return structured comparison

2. **Enhance ReasoningAgent for planning**:
   - Detect planning intent: "if I...", "what if...", "should I..."
   - Use scenario tool to calculate options
   - Reason across tradeoffs

3. **Comparison formatting**:
   - Side-by-side option display
   - Delta highlighting
   - Recommendation with rationale

4. **Second-order effects** (stretch):
   - "Skip dinner" → mention hunger rebound, sleep impacts
   - Health-informed suggestions

### Dependencies:
- Feature 2 (Agent Restructuring) - ReasoningAgent handles planning queries

---

## Feature 9: Day Classification & Exception Handling

**Description**: Detect and reclassify exception days (travel, sick, workout, social, depleted). Exceptions are categories, not failures. Adjust expectations and protect momentum.

### Requirements:

- **Day Types**:
    - `normal` - Regular day, standard expectations
    - `travel` - Less control over meals, expect higher sodium/calories
    - `sick` - Different eating patterns, lower activity
    - `heavy_workout` - Higher calorie/protein needs
    - `social` - Restaurant meals, social eating
    - `depleted` - Low energy, comfort eating acceptable

- **Detection Methods**:
    - User explicit: "Travel day today"
    - Heuristic: High sodium + irregular meal times = travel?
    - Context: User mentions "at a restaurant", "stuck in airport"

- **Expectation Adjustment**:
    - Classified days have adjusted goal thresholds
    - e.g., Travel day: sodium limit relaxed, calorie focus less strict
    - Insights acknowledge classification

- **Longitudinal Handling**:
    - Exception days can be excluded from trend analysis
    - Or analyzed separately: "On travel days, you average X"

### Schema Changes:
```sql
-- See Feature 5 schema (daily_classification table)
```

### Files Affected:
| File | Change |
|------|--------|
| `db-service.ts` | Day classification CRUD |
| `intent-agent.ts` | Detect day classification statements |
| `insight-agent.ts` | Use classification in analysis |
| `reasoning-agent.ts` | Adjust expectations based on day type |
| `chat-agent.ts` | Acknowledge classification appropriately |

### Implementation Plan:

1. **Day classification persistence**:
   - Create classification table (or column)
   - API to get/set day type

2. **IntentAgent detection**:
   - Detect day type declarations: "I'm traveling", "sick day"
   - Add to extraction: `day_context`

3. **Automatic classification** (stretch):
   - Heuristic rules based on food patterns
   - Suggest to user: "Looks like a travel day?"

4. **InsightAgent integration**:
   - Filter exception days from trend analysis
   - Provide exception-day specific insights
   - Compare: "Normal days vs travel days"

5. **Expectation relaxation**:
   - Day type maps to threshold adjustments
   - ReasoningAgent uses adjusted targets

### Dependencies:
- Feature 5 (Insight Agent) - Classification stored and used in insights

---

## Feature 10: Nutrient Data Integrity (Hierarchy Logic)

**Description**: Ensure nutrient roll-ups (sub-nutrients) are handled correctly across the system. Parent-child relationships must be preserved during logging.

### Requirements:

- **Parent-Child Mapping**:
    - `sugar_g` ⊂ `carbs_g`
    - `fat_saturated_g` ⊂ `fat_total_g`
    - `fat_poly_g` ⊂ `fat_total_g`
    - `fat_mono_g` ⊂ `fat_total_g`
    - `fat_trans_g` ⊂ `fat_total_g`
    - `fiber_soluble_g` ⊂ `fiber_g`
    - `sugar_added_g` ⊂ `sugar_g` ⊂ `carbs_g`
    - `omega_3_g` ⊂ `fat_total_g`
    - `omega_6_g` ⊂ `fat_total_g`

- **Logging Behavior**:
    - When logging, child values must not exceed parent values
    - If user specifies only child, system should not double-count
    - If user specifies parent and children separately, validate consistency

- **Display Behavior**:
    - Dashboard shows both parent and children
    - Children indented under parent
    - Totals calculated from parent, not sum of children

- **AI Estimation**:
    - NutritionAgent and ReasoningAgent must provide breakdown-aware estimates
    - When estimating sugar, also provide carbs context

### Schema Changes:
- None (logic change, not schema)

### Files Affected:
| File | Change |
|------|--------|
| `db-service.ts` | Validation on food log insert |
| `nutrition-agent.ts` | Breakdown-aware estimation prompts |
| `tool-executor.ts` | Validation before saving |
| `packages/shared/...` | Nutrient hierarchy constants |

### Implementation Plan:

1. **Define nutrient hierarchy constants**:
   - Create shared constant file with parent-child relationships
   - Include validation rules

2. **Implement integrity service**:
   - `validateNutrientHierarchy(nutrients)`: Check children ≤ parents
   - `normalizeNutrients(nutrients)`: Ensure consistency

3. **DbService validation**:
   - Before inserting food_log, run validation
   - Reject or auto-correct invalid entries

4. **AI estimation guidance**:
   - Update NutritionAgent prompt to always include parent when estimating child
   - Explicitly list hierarchy awareness

5. **Frontend display**:
   - Indentation for child nutrients
   - Parent totals calculated correctly

### Dependencies:
- None (can be done anytime)

---

## Implementation Priority Order

Based on architecture upgrade strategy and dependencies:

| Priority | Feature | Rationale |
|----------|---------|-----------|
| 🔴 1 | Feature 2: Agent Restructuring | Foundation for all other features |
| 🟠 2 | Feature 3: Confidence System | High visibility, enables clarification |
| 🟠 3 | Feature 4: Ambiguity Detection | Prevents silent guessing, core UX |
| 🟡 4 | Feature 5: Insight Agent Upgrade | Unlocks audit mode, patterns |
| 🟡 5 | Feature 6: Learned Context Memory | Corrections persist, reduces frustration |
| 🟡 6 | Feature 7: Health Considerations | Safety-critical, user trust |
| 🔵 7 | Feature 8: What-If Planning | Advanced reasoning feature |
| 🔵 8 | Feature 9: Day Classification | Better longitudinal analysis |
| ⚪ 9 | Feature 10: Nutrient Hierarchy | Data integrity, lower risk |

---

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| User corrections per session | High | Low (corrections persist) |
| Clarification questions asked | 0 | ~1 per ambiguous input |
| Confidence shown to user | Never | Always on estimates |
| Audit requests handled | 0 | 100% |
| Exception days classified | 0 | Auto-detected |
| Health warnings issued | 0 | When relevant |
| Silent assumption errors | Common | Rare |

---

## Glossary

- **PCC Pattern**: Propose-Confirm-Commit - Users verify actions before data is saved
- **Direct Routing**: Orchestrator routes to specialist agents, not through tools
- **Delegation Tools**: Tools that invoke other agents (e.g., `ask_nutrition_agent`)
- **Health Flags**: Warnings about food conflicting with user health constraints
- **Error Sources**: Reasons an estimate may be inaccurate (portion vague, etc.)
- **Day Type**: Classification of exceptional days (travel, sick, etc.)