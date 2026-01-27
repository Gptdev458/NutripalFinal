NutriPal: Agentic Architecture
Executive Summary
NutriPal is a nutrition tracking app that uses a multi-agent system to interpret user input, pull nutrition data from multiple verified sources and validate that data.
Agents are used to reduce errors at each step. Multiple data sources are used to avoid gaps and inconsistencies. The objective is simple: users can log food quickly and trust the results without second-guessing the data.
User input is handled by specialized agents that interpret intent, resolve foods and recipes, retrieve nutrition data and validate it. Each agent owns a single step, which reduces errors
Objectives
NutriPal exists to make nutrition tracking reliable and low-friction.
Core objectives:
Track nutrients with  a minimum error rate
Correctly interpret user intent 
Eliminate hallucinated nutrition data by use of agents
Make food logging easy via text, photos, and saved recipes
Sync with Apple Health to add activity and health context
System risks points
Recipe ambiguity
Vague quantities (“a bunch”, “to taste”), missing yields or servings.
Raw vs cooked, drained vs undrained, bone-in vs boneless.
Portion ambiguity
Weight vs volume confusion.
Portion taken before vs after cooking.
Ingredient mismatch
Wrong variant selected (cut, fat %, salted vs unsalted).
Data source limitations
Gaps or inconsistencies in USDA and Open Food Facts.
Missing micronutrient data.



Unit conversion errors
Volume-to-weight conversions and scaling mistakes.
Double counting
Overlapping ingredients or repeated items in pasted recipes.
Validation edge cases
Legitimate meals flagged as implausible.
Incorrect matches that still appear reasonable.
User trust risks
Excessive clarifications or silent assumptions.
Performance tradeoffs
Multi-agent flow adding latency or cost for simple logs.

Example Use Case A: Logging NEW Homemade Soup recipe 
User input:
 “I just had 5 oz of this soup: Lemon-Dill Mediterranean Chicken Soup…”
 (User pastes the full recipe text.)
System behavior
Chat Agent (User Interface Agent)
Natural language chat interface for all user interaction.
Enforces nutrition-only scope and keeps conversations on-topic.
Converts free-form messages into structured intents and parameters for the Intent agent.
Manages clarifications and presents results, assumptions, and edit options.
Orchestrator Agent
Coordinates agent execution order and passes structured outputs between agents.
Intent Agent
Determines the user’s intent is to log food
Detects this is a homemade recipe, not a branded food.
Extracts the portion (5 oz).
Determines whether clarification is needed.


Recipe Agent
Checks whether this recipe already exists in the user’s saved recipes.
If a match is found:
Prompts the user to confirm logging the saved recipe (and confirms portion size if missing).
If no match is found:
Parses the recipe into structured data: ingredients, quantities, units, and preparation context (raw vs cooked when relevant).
Outputs a structured payload for the Nutrition Agent (no nutrition is calculated here).
Orchestrator Agent
Determines the correct execution path based on context (saved recipe vs new recipe).


Nutrition Agent
Uses the structured data from the Recipe Agent to query external nutrition databases (e.g. USDA FoodData Central).
Resolves nutrition values for each ingredient and normalizes units.
Calculates nutrition for the full batch as the canonical record.
Derives nutrition for the logged portion (5 oz) from batch totals.
Stores batch-level nutrition so future logs of the same saved recipe can reuse it and apply different portion sizes.


Validator Agent
Cross-checks nutrition values across available data sources to ensure differences are within acceptable limits.
Performs logical sanity checks on the data:
Calories, macros, and portions make sense for the food type.
Ingredient amounts are within reasonable ranges.
Flags inconsistencies such as out-of-norm portions, disproportionate ingredients, or large cross-source discrepancies.


Insight Agent (non-blocking)
Records metadata (date, time, macro composition, meal type).
Updates daily goal progress using the validated log.
Uses validated logs later to generate correlations with Apple Health data.
Generates a short next-step suggestion based on remaining goals and context.
Runs asynchronously and does not affect logging completion.



Orchestrator Agent
Commits the log entry
Example Use Case B: Logging saved Homemade Soup recipe 

Orchestrator Agent
Coordinates agent execution order and passes structured outputs between agents.
Intent Agent
Determines the user’s intent is to log food
Detects this is a homemade recipe, not a branded food.
Extracts the portion (5 oz).
Determines whether clarification is needed.


Recipe Agent
Detect: likely saved recipe (name match)
Finds saved recipe candidate(s)
Prompts: “Log your saved Lemon-Dill Mediterranean Chicken Soup for 5 oz?” (shows last-used portion and recipe recap)
Orchestrator Agent
Determines the correct execution path based on context (saved recipe vs new recipe).
Nutrition Agent
No ingredient lookup needed
Pulls stored batch nutrition record
Scales to 5 oz
Validator Agent
Performs logical sanity checks on the data:
Calories, macros, and portions make sense for the food type.
Ingredient amounts are within reasonable ranges.
Flags inconsistencies such as out-of-norm portions, disproportionate ingredients, or large cross-source discrepancies.


Optional checks: “recipe changed since last time?” or “portion unusually large?”
Orchestrator
Writes log entry
Updates “last used”, optional meal tagging

Data Sources
USDA FoodData Central is used for raw ingredients and generic foods. It is authoritative but limited for restaurants and branded products.
Open Food Facts covers packaged foods worldwide. It offers broad coverage but variable data quality, which is why validation is required.
User-created recipes form a personal data source for repeated meals..
Using multiple sources allows cross-verification and avoids reliance on any single, incomplete dataset.
