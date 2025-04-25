// Pending action helpers for AI handler
// Export setPendingAction, getPendingAction, clearPendingAction

export async function setPendingAction(userId: string, action: any, supabaseClient: any) {
  try {
    await supabaseClient.from('pending_actions').upsert({ user_id: userId, action: JSON.stringify(action), updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  } catch (err) {
    console.error('Error storing pending action:', err);
  }
}

export async function getPendingAction(userId: string, supabaseClient: any): Promise<any | null> {
  try {
    const { data, error } = await supabaseClient.from('pending_actions').select('action').eq('user_id', userId).single();
    if (error || !data) return null;
    return JSON.parse(data.action);
  } catch (err) {
    console.error('Error retrieving pending action:', err);
    return null;
  }
}

export async function clearPendingAction(userId: string, supabaseClient: any) {
  try {
    await supabaseClient.from('pending_actions').delete().eq('user_id', userId);
  } catch (err) {
    console.error('Error clearing pending action:', err);
  }
} 