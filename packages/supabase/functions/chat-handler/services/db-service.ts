import { FoodLogEntry, UserGoal } from '../../_shared/types.ts'

/**
 * Service to handle database operations, decoupling persistence from orchestrator
 */
export class DbService {
  constructor(public supabase: any) { }

  /**
   * Logs food items to the database
   */
  async logFoodItems(userId: string, items: Partial<FoodLogEntry>[]) {
    const { error } = await this.supabase.from('food_log').insert(
      items.map(item => ({
        ...item,
        user_id: userId
      }))
    )
    if (error) {
      console.error('[DbService] Error logging food items:', error)
      throw error
    }
  }

  /**
   * Fetches food logs for a user within a time range
   */
  async getFoodLogs(userId: string, start: string, end: string) {
    const { data, error } = await this.supabase
      .from('food_log')
      .select('*')
      .eq('user_id', userId)
      .gte('log_time', start)
      .lte('log_time', end)

    if (error) {
      console.error('[DbService] Error fetching food logs:', error)
      throw error
    }
    return data
  }

  /**
   * Fetches user goals
   */
  async getUserGoals(userId: string): Promise<UserGoal[]> {
    const { data, error } = await this.supabase
      .from('user_goals')
      .select('nutrient, target_value, unit, goal_type')
      .eq('user_id', userId)

    if (error) {
      console.error('[DbService] Error fetching user goals:', error)
      throw error
    }
    return data as UserGoal[]
  }

  /**
   * Updates a recipe's nutrition data
   */
  async updateRecipeNutrition(recipeId: string, nutritionData: any) {
    const { error } = await this.supabase
      .from('user_recipes')
      .update({ nutrition_data: nutritionData })
      .eq('id', recipeId)

    if (error) {
      console.error('[DbService] Error updating recipe nutrition:', error)
      throw error
    }
  }

  /**
   * Fetches ingredients for a recipe
   */
  async getRecipeIngredients(recipeId: string) {
    const { data, error } = await this.supabase
      .from('recipe_ingredients')
      .select('*')
      .eq('recipe_id', recipeId)

    if (error) {
      console.error('[DbService] Error fetching recipe ingredients:', error)
      throw error
    }
    return data
  }

  /**
   * Updates a user's nutritional goal
   */
  async updateUserGoal(userId: string, nutrient: string, value: number, unit: string) {
    const { error } = await this.supabase
      .from('user_goals')
      .upsert({
        user_id: userId,
        nutrient: nutrient,
        target_value: value,
        unit: unit,
        goal_type: 'goal'
      }, { onConflict: 'user_id, nutrient' })

    if (error) {
      console.error('[DbService] Error updating user goal:', error)
      throw error
    }
  }

  /**
   * Fetches recent messages for context
   */
  async getRecentMessages(userId: string, sessionId: string, limit = 10) {
    const { data, error } = await this.supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('[DbService] Error fetching recent messages:', error)
      throw error
    }
    return data
  }

  /**
   * Updates multiple user nutritional goals in a single transaction-like call
   */
  async updateUserGoals(userId: string, goals: { nutrient: string, value: number, unit: string }[]) {
    const { error } = await this.supabase
      .from('user_goals')
      .upsert(
        goals.map(g => ({
          user_id: userId,
          nutrient: g.nutrient,
          target_value: g.value,
          unit: g.unit,
          goal_type: 'goal'
        })),
        { onConflict: 'user_id, nutrient' }
      )

    if (error) {
      console.error('[DbService] Error updating user goals:', error)
      throw error
    }
  }

  /**
   * Updates a user's profile information
   */
  async updateUserProfile(userId: string, data: any) {
    const { error } = await this.supabase
      .from('user_profiles')
      .update(data)
      .eq('id', userId)

    if (error) {
      console.error('[DbService] Error updating user profile:', error)
      throw error
    }
  }

  /**
   * Fetches user profile with safe handling for missing rows
   */
  async getUserProfile(userId: string) {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('[DbService] Error fetching user profile:', error)
      throw error
    }
    return { data }
  }
}
