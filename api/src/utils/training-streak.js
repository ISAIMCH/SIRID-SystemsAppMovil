function startOfUtcDay(value) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function utcDayKey(value) {
  return startOfUtcDay(value).toISOString().slice(0, 10);
}

function calculateCurrentTrainingStreak(sessionDates, scheduledDays, today = new Date()) {
  const trainingDays = new Set(scheduledDays);
  if (!trainingDays.size) return 0;

  const completedDays = new Set(sessionDates.map(utcDayKey));
  let cursor = startOfUtcDay(today);
  const todayKey = utcDayKey(cursor);
  if (trainingDays.has(cursor.getUTCDay()) && !completedDays.has(todayKey)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let streak = 0;
  for (let checkedDays = 0; checkedDays < 366; checkedDays += 1) {
    if (trainingDays.has(cursor.getUTCDay())) {
      if (!completedDays.has(utcDayKey(cursor))) break;
      streak += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}

module.exports = { calculateCurrentTrainingStreak, utcDayKey };