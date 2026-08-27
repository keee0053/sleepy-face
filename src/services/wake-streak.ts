import { supabase } from '@/lib/supabase';

const STREAK_LOOKBACK_ROWS = 60;

type WakeAttemptLogRow = {
  local_day: string;
  outcome: string;
};

function toUtcDayNumber(localDay: string): number {
  return Date.parse(`${localDay}T00:00:00.000Z`) / (24 * 60 * 60 * 1000);
}

// Counts consecutive days ending at the most recent logged day (see
// recordWakeAttemptOutcome in wake-status.ts) that were all 'success', for the current
// user's own history only. Reuses the existing wake_attempt_log table -- no new schema.
// A day with no row at all (the alarm never fired) breaks the streak the same as a
// 'failure' row would.
export async function getSuccessStreak(): Promise<number> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return 0;
  }

  const { data, error } = await supabase
    .from('wake_attempt_log')
    .select('local_day, outcome')
    .eq('profile_id', userData.user.id)
    .order('local_day', { ascending: false })
    .limit(STREAK_LOOKBACK_ROWS);

  if (error || !data || data.length === 0) {
    return 0;
  }

  const rows = data as WakeAttemptLogRow[];

  if (rows[0].outcome !== 'success') {
    return 0;
  }

  let streak = 1;
  let previousDayNumber = toUtcDayNumber(rows[0].local_day);

  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i].outcome !== 'success') {
      break;
    }

    const dayNumber = toUtcDayNumber(rows[i].local_day);

    if (previousDayNumber - dayNumber !== 1) {
      break;
    }

    streak += 1;
    previousDayNumber = dayNumber;
  }

  return streak;
}
