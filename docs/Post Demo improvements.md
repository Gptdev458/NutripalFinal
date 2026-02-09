# Post Demo Improvements

This document outlines the planned feature upgrades following the initial demo. It describes the requirements, technical approach, and implementation steps for each feature.

## Feature 1: Dashboard UI Upgrade

**Description**: Enhance the dashboard table to provide intuitive, color-coded feedback on nutritional progress and support dynamic adjustments.

### Requirements:
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

### Implementation Plan:
1.  **Schema**: `user_goals` gets `yellow_min`, `green_min`, `red_min`. 
2.  **Workout Table**: `daily_adjustments` stores date-specific modifiers.

---

## Feature 2: Nutrient Selection & Management

### Requirements:
### Nutrient Data Integrity (Logic Check)

**Description**: Ensure that nutrient roll-ups (sub-nutrients) are handled correctly across the entire system.

### Key Logic:
- **Parent-Child Mapping**:
    - `sugar_g` ⊂ `carbs_g`
    - `fat_saturated_g` ⊂ `fat_total_g`
    - `fiber_soluble_g` ⊂ `fiber_g`
- **Behavior**: When a food is logged, its child nutrient values are automatically added to the parent's total. For example, logging a food with 10g Sugar and 20g "Other Carbs" will result in +30g Carbs and +10g Sugar.
- **We need to check other trackable nutrients for this type of logic**

### Implementation Plan:
1.  **Integrity Service**: Centralize the roll-up logic in the backend persistence layer (`DbService`).
2.  **AI Estimates**: Ensure the `NutritionAgent` and `ReasoningAgent` provide breakdown-aware estimates.

---

## Feature 3: Health Considerations

**Description**: Personalized AI advice and safety warnings based on the user's medical or dietary constraints.

### Requirements:
- **Constraint Storage**: `user_profiles.health_considerations` (TEXT).
- **App-Wide awareness**: 
    - **Context Injection**: Health constraints are part of the standard `Context` object provided to *all* agents (Reasoning, Chat, Nutrition, etc.).
    - **Safety-Driven Reasoning**: `ReasoningAgent` is aware of the constraints and consider them in its thinking and reasoning.
    - **Knowledgeable Chat**: `ChatAgent` knows *why* a food is flagged and can explain it naturally (e.g., "I should warn you that this contains dairy, which you've noted you need to avoid due to your health constraints").

### Implementation Plan:
1.  **Constraint Parser**: A utility to extract prohibited items from the unstructured health text.
2.  **Safety Hook**: Run the constraint check in parallel during `orchestrateV3`. The results (Safety Report) inform the ChatAgent's narrative.

### Implementation Plan:
1.  **Safety Service**: Create a backend service that cross-references food components with health strings/keywords.
2.  **Orchestrator Hook**: Inject the safety check into `orchestrator_v3.ts` for all logging paths.

---