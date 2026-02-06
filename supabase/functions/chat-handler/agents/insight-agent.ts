import { createAdminClient } from '../../_shared/supabase-client.ts';
import { createOpenAIClient } from '../../_shared/openai-client.ts';
import { getStartAndEndOfDay, getDateRange } from '../../_shared/utils.ts';
export class InsightAgent {
  name = 'insight';
  async execute(_input, context) {
    const { userId, supabase: contextSupabase, timezone = 'UTC' } = context;
    const supabase = contextSupabase || createAdminClient();
    const now = new Date();
    const todayRange = getStartAndEndOfDay(now, timezone);
    const weekRange = getDateRange(now, 7, timezone);
    // 1. Fetch Today's Logs, Last 7 Days Logs, and Goals
    const [{ data: todayLogs }, { data: weekLogs }, { data: goals }] = await Promise.all([
      supabase.from('food_log').select('*').eq('user_id', userId).gte('log_time', todayRange.start).lte('log_time', todayRange.end),
      supabase.from('food_log').select('*').eq('user_id', userId).gte('log_time', weekRange.start).lte('log_time', weekRange.end),
      supabase.from('user_goals').select('nutrient, target_value, goal_type').eq('user_id', userId)
    ]);
    const totals = {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_total_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      sodium_mg: 0
    };
    if (todayLogs) {
      todayLogs.forEach((log)=>{
        Object.keys(totals).forEach((key)=>{
          if (typeof log[key] === 'number') {
            totals[key] += log[key] || 0;
          }
        });
      });
    }
    // 2. Calculate Weekly Averages
    const weekTotals = {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_total_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      sodium_mg: 0
    };
    if (weekLogs) {
      weekLogs.forEach((log)=>{
        Object.keys(weekTotals).forEach((key)=>{
          if (typeof log[key] === 'number') {
            weekTotals[key] += log[key] || 0;
          }
        });
      });
    }
    const weeklyAverages = {};
    Object.keys(weekTotals).forEach((key)=>{
      weeklyAverages[key] = Math.round(weekTotals[key] / 7);
    });
    // 3. Calculate Progress for Today
    const progress = {};
    if (goals) {
      goals.forEach((goal)=>{
        const nutrient = goal.nutrient;
        const target = goal.target_value;
        if (totals[nutrient] !== undefined && target > 0) {
          progress[nutrient] = Math.round(totals[nutrient] / target * 100);
        }
      });
    }
    // 4. Generate Insights with OpenAI
    const openai = createOpenAIClient();
    const prompt = `
User's Today's Totals: ${JSON.stringify(totals)}
User's Last 7 Days Averages: ${JSON.stringify(weeklyAverages)}
User's Goals: ${JSON.stringify(goals)}
Today's Progress (%): ${JSON.stringify(progress)}
User Timezone: ${timezone}

Based on the above, provide 2 very short, actionable nutrition suggestions. 
One should focus on today, and one should mention a trend from the last 7 days if relevant.
Example: "You're low on protein today. Try a greek yogurt for your next snack. Your weekly average for fiber is also a bit low."
Keep it under 40 words total.
`;
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 150
    });
    const suggestions = response.choices[0].message.content?.split('\n').filter((s)=>s.trim()) || [];
    return {
      daily_totals: totals,
      goal_progress: progress,
      suggestions,
      patterns: [
        `Weekly avg calories: ${weeklyAverages.calories}kcal`
      ]
    };
  }
}
// Keep legacy export for now
export async function generateInsights(userId) {
  const agent = new InsightAgent();
  return agent.execute(undefined, {
    userId,
    supabase: createAdminClient()
  });
}
