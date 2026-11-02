const DEFAULT_TZ_OFFSET_MINUTES = -360;
const DAY_MS = 24 * 60 * 60 * 1000;
// How many calendar weeks back the streak is followed.
const MAX_WEEKS = 53;

function localDate(value, tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES) {
  const date = new Date(value);
  return new Date(date.getTime() + tzOffsetMinutes * 60 * 1000);
}

function localDayKey(value, tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES) {
  return localDate(value, tzOffsetMinutes).toISOString().slice(0, 10);
}

function startOfLocalDay(value, tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES) {
  const date = localDate(value, tzOffsetMinutes);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// Local Monday of the week, as a UTC-midnight date (not a real instant).
function startOfLocalWeek(value, tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES) {
  const date = startOfLocalDay(value, tzOffsetMinutes);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date;
}

// The real instant the local week (Monday 00:00) began.
function localWeekStartInstant(value, tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES) {
  return new Date(startOfLocalWeek(value, tzOffsetMinutes).getTime() - tzOffsetMinutes * 60 * 1000);
}

// Scheduled days attended through the gym's QR access, walking back week by week (Monday to Sunday).
// A missed scheduled day is forgiven by attending a free day of the same week (no extra point);
// a week that closes on Sunday with misses left unrecovered ends the streak.
// The current week is still open, so its misses don't break it yet.
// Scheduled days before the first known check-in don't count as misses.
function calculateCurrentTrainingStreak(checkIns, scheduledDays, today = new Date(), tzOffsetMinutes = DEFAULT_TZ_OFFSET_MINUTES) {
  const trainingDays = new Set(scheduledDays);
  if (!trainingDays.size || !checkIns.length) return 0;

  const attended = new Set(checkIns.map((value) => localDayKey(value, tzOffsetMinutes)));
  const firstDayKey = [...attended].sort()[0];
  const todayKey = startOfLocalDay(today, tzOffsetMinutes).toISOString().slice(0, 10);
  const currentWeek = startOfLocalWeek(today, tzOffsetMinutes);

  let streak = 0;
  for (let weekIndex = 0; weekIndex < MAX_WEEKS; weekIndex += 1) {
    const monday = new Date(currentWeek.getTime() - weekIndex * 7 * DAY_MS);
    let points = 0;
    let missed = 0;
    let freeDays = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(monday.getTime() + offset * DAY_MS);
      const key = date.toISOString().slice(0, 10);
      if (key > todayKey || key < firstDayKey) continue;
      const wasThere = attended.has(key);
      if (trainingDays.has(date.getUTCDay())) {
        if (wasThere) points += 1;
        else if (key !== todayKey) missed += 1;
      } else if (wasThere) {
        freeDays += 1;
      }
    }
    if (weekIndex > 0 && missed > freeDays) break;
    streak += points;
    if (monday.toISOString().slice(0, 10) <= firstDayKey) break;
  }

  return streak;
}

module.exports = {
  calculateCurrentTrainingStreak,
  localDayKey,
  localWeekStartInstant,
};
