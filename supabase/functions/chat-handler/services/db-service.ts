/**
 * Service to handle database operations, decoupling persistence from orchestrator
 */ export class DbService {
  supabase: any;
  constructor(supabase: any) {
    this.supabase = supabase;
  }
  /**
   * Logs food items to the database
   */ async logFoodItems(userId: string, items: any[]) {
    const { error } = await this.supabase.from('food_log').insert(items.map((item: any) => ({
      ...item,
      user_id: userId,
      confidence: item.confidence,
      confidence_details: item.confidence_details,
      error_sources: item.error_sources
    })));
    if (error) {
      console.error('[DbService] Error logging food items:', error);
      throw error;
    }
  }
  /**
   * Fetches food logs for a user within a time range
   */ async getFoodLogs(userId: string, start: string, end: string) {
    const { data, error } = await this.supabase.from('food_log').select('*').eq('user_id', userId).gte('log_time', start).lte('log_time', end);
    if (error) {
      console.error('[DbService] Error fetching food logs:', error);
      throw error;
    }
    return data;
  }
  /**
   * Fetches user goals
   */ async getUserGoals(userId: string) {
    const { data, error } = await this.supabase.from('user_goals').select('nutrient, target_value, unit, goal_type, yellow_min, green_min, red_min').eq('user_id', userId);
    if (error) {
      console.error('[DbService] Error fetching user goals:', error);
      throw error;
    }
    return data;
  }
  /**
   * Updates a recipe's nutrition data
   */ async updateRecipeNutrition(recipeId: string, nutritionData: any) {
    const { error } = await this.supabase.from('user_recipes').update({
      nutrition_data: nutritionData
    }).eq('id', recipeId);
    if (error) {
      console.error('[DbService] Error updating recipe nutrition:', error);
      throw error;
    }
  }
  /**
   * Fetches ingredients for a recipe
   */ async getRecipeIngredients(recipeId: string) {
    const { data, error } = await this.supabase.from('recipe_ingredients').select('*').eq('recipe_id', recipeId);
    if (error) {
      console.error('[DbService] Error fetching recipe ingredients:', error);
      throw error;
    }
    return data;
  }
  /**
   * Updates a user's nutritional goal
   */ async updateUserGoal(userId: string, nutrient: string, value: number, unit: string, thresholds: any = {}) {
    const { error } = await this.supabase.from('user_goals').upsert({
      user_id: userId,
      nutrient: nutrient,
      target_value: value,
      unit: unit,
      goal_type: 'goal',
      ...thresholds
    }, {
      onConflict: 'user_id, nutrient'
    });
    if (error) {
      console.error('[DbService] Error updating user goal:', error);
      throw error;
    }
  }
  /**
   * Fetches recent messages for context
   */ async getRecentMessages(userId: string, sessionId: string, limit: number = 10) {
    const { data, error } = await this.supabase.from('chat_messages').select('*').eq('user_id', userId).eq('session_id', sessionId).order('created_at', {
      ascending: false
    }).limit(limit);
    if (error) {
      console.error('[DbService] Error fetching recent messages:', error);
      throw error;
    }
    return data;
  }
  /**
   * Updates multiple user nutritional goals in a single transaction-like call
   */ async updateUserGoals(userId: string, goals: any[]) {
    const { error } = await this.supabase.from('user_goals').upsert(goals.map((g: any) => ({
      user_id: userId,
      nutrient: g.nutrient,
      target_value: g.value,
      unit: g.unit,
      goal_type: 'goal',
      yellow_min: g.yellow_min,
      green_min: g.green_min,
      red_min: g.red_min
    })), {
      onConflict: 'user_id, nutrient'
    });
    if (error) {
      console.error('[DbService] Error updating user goals:', error);
      throw error;
    }
  }
  /**
   * Updates a user's profile information
   */ async updateUserProfile(userId, data) {
    const { error } = await this.supabase.from('user_profiles').update(data).eq('id', userId);
    if (error) {
      console.error('[DbService] Error updating user profile:', error);
      throw error;
    }
  }
  /**
   * Fetches user profile with safe handling for missing rows
   */ async getUserProfile(userId) {
    const { data, error } = await this.supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle();
    if (error) {
      console.error('[DbService] Error fetching user profile:', error);
      throw error;
    }
    return {
      data
    };
  }
  /**
   * Adds a daily adjustment (e.g., workout)
   */ async addDailyAdjustment(userId, adjustment) {
    const { error } = await this.supabase.from('daily_adjustments').upsert({
      user_id: userId,
      nutrient: adjustment.nutrient,
      adjustment_value: adjustment.adjustment_value,
      adjustment_type: adjustment.adjustment_type || 'workout',
      notes: adjustment.notes,
      adjustment_date: adjustment.date || new Date().toISOString().split('T')[0]
    }, {
      onConflict: 'user_id, adjustment_date, nutrient, adjustment_type'
    });
    if (error) {
      console.error('[DbService] Error adding daily adjustment:', error);
      throw error;
    }
  }
  /**
   * Fetches daily adjustments for a date range
   */ async getDailyAdjustments(userId, start, end) {
    const { data, error } = await this.supabase.from('daily_adjustments').select('*').eq('user_id', userId).gte('adjustment_date', start).lte('adjustment_date', end);
    if (error) {
      console.error('[DbService] Error fetching daily adjustments:', error);
      throw error;
    }
    return data;
  }
  /**
   * Fetches the day classification for a user on a specific date
   */ async getDayClassification(userId: string, date: string) {
    const { data, error } = await this.supabase.from('daily_classification').select('*').eq('user_id', userId).eq('date', date).maybeSingle();
    if (error) {
      console.error('[DbService] Error fetching day classification:', error);
      throw error;
    }
    return data;
  }
  /**
   * Sets or updates the day classification for a user
   */ async setDayClassification(userId, date, type, notes = null) {
    const { error } = await this.supabase.from('daily_classification').upsert({
      user_id: userId,
      date: date,
      day_type: type,
      notes: notes
    }, {
      onConflict: 'user_id, date'
    });
    if (error) {
      console.error('[DbService] Error setting day classification:', error);
      throw error;
    }
  }
  /**
   * Fetches historical logs and metadata for analysis
   */ async getHistoricalData(userId: string, filters: { days?: number, range?: { start: string, end: string }, type?: string }) {
    let query = this.supabase.from('food_log').select('*').eq('user_id', userId);
    if (filters.days) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - filters.days);
      const startStr = startDate.toISOString().split('T')[0];
      query = query.gte('log_time', startStr);
    } else if (filters.range) {
      query = query.gte('log_time', filters.range.start).lte('log_time', filters.range.end);
    }
    const { data: logs, error: logsError } = await query.order('log_time', {
      ascending: true
    });
    if (logsError) throw logsError;

    // Fetch classifications
    let classQuery = this.supabase.from('daily_classification').select('*').eq('user_id', userId);
    if (filters.type) {
      classQuery = classQuery.eq('day_type', filters.type);
    }
    const { data: classifications, error: classError } = await classQuery;
    if (classError) throw classError;

    // If type filter is provided, filter logs to only include those from matching days
    let filteredLogs = logs;
    if (filters.type && classifications.length > 0) {
      const validDates = new Set(classifications.map((c: any) => c.date));
      filteredLogs = logs.filter((l: any) => validDates.has(new Date(l.log_time).toISOString().split('T')[0]));
    }

    return {
      logs: filteredLogs,
      classifications
    };
  }

  /**
   * Fetches summarized daily totals for analysis
   */
  async getAnalyticalData(userId: string, days: number = 7) {
    const { logs, classifications } = await this.getHistoricalData(userId, { days });

    // Group logs by date and calculate totals
    const dailyTotals: Record<string, any> = {};

    logs.forEach((log: any) => {
      const date = new Date(log.log_time).toISOString().split('T')[0];
      if (!dailyTotals[date]) {
        dailyTotals[date] = {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          fiber: 0,
          sugar: 0,
          sodium: 0,
          water: 0,
          items: []
        };
      }

      dailyTotals[date].calories += Number(log.calories) || 0;
      dailyTotals[date].protein += Number(log.protein) || 0;
      dailyTotals[date].carbs += Number(log.carbs) || 0;
      dailyTotals[date].fat += Number(log.fat) || 0;
      dailyTotals[date].fiber += Number(log.fiber) || 0;
      dailyTotals[date].sugar += Number(log.sugar) || 0;
      dailyTotals[date].sodium += Number(log.sodium) || 0;
      dailyTotals[date].water += Number(log.water_ml) || 0;
      dailyTotals[date].items.push(log.food_name);
    });

    // Map classifications for easy access
    const classMap: Record<string, any> = {};
    classifications.forEach((c: any) => {
      classMap[c.date] = { type: c.day_type, notes: c.notes };
    });

    return {
      dailyTotals,
      classifications: classMap,
      daysAnalysed: days
    };
  }
}
