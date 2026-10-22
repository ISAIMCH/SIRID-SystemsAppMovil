const DEFAULT_TZ_OFFSET_MINUTES = -360;

function localDate(value, tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES) {
  const date = new Date(value);
  return new Date(date.getTime() + tzOffsetMinutes * 60 * 1000);
}

function localDayKey(value, tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES) {
  return localDate(value, tzOffsetMinutes).toISOString().slice(0, 10);
}

function localDayNumber(value, tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES) {
  return localDate(value, tzOffsetMinutes).getUTCDay();
}

function startOfLocalDay(value, tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES) {
  const date = localDate(value, tzOffsetMinutes);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function weekKey(value, tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES) {
  const date = startOfLocalDay(value, tzOffsetMinutes);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function normalizeSession(value) {
  if (value && typeof value === 'object') {
    return { completedAt: value.completedAt, trainingDay: value.trainingDay };
  }
  return { completedAt: value, trainingDay: undefined };
}

function calculateCurrentTrainingStreak(sessionDates, scheduledDays, today = new Date(), tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES) {
  const trainingDays = new Set(scheduledDays);
  if (!trainingDays.size) return 0;

  const sessions = sessionDates.map(normalizeSession);
  const completedDates = new Set(
    sessions.filter((session) => session.trainingDay === undefined).map((session) => localDayKey(session.completedAt, tzOffsetMinutes)),
  );
  const completedScheduledDates = new Set(
    sessions
      .filter((session) => session.trainingDay !== undefined)
      .map((session) => `${localDayKey(session.completedAt, tzOffsetMinutes)}:${session.trainingDay}`),
  );
  const trainingDaysByWeek = new Set(
    sessions
      .filter((session) => session.trainingDay !== undefined)
      .map((session) => `${weekKey(session.completedAt, tzOffsetMinutes)}:${session.trainingDay}`),
  );

  let cursor = startOfLocalDay(today, tzOffsetMinutes);
  const todayKey = cursor.toISOString().slice(0, 10);
  const todayDay = cursor.getUTCDay();
  const isFulfilled = (date) => {
    const dateKey = date.toISOString().slice(0, 10);
    const day = date.getUTCDay();
    return completedDates.has(dateKey)
      || completedScheduledDates.has(`${dateKey}:${day}`)
      || trainingDaysByWeek.has(`${weekKey(date, 0)}:${day}`);
  };

  if (trainingDays.has(todayDay) && !isFulfilled(cursor)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let streak = 0;
  for (let checkedDays = 0; checkedDays < 366; checkedDays += 1) {
    if (trainingDays.has(cursor.getUTCDay())) {
      if (!isFulfilled(cursor)) break;
      streak += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}

module.exports = {
  calculateCurrentTrainingStreak,
  localDayKey,
};
