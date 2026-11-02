// Calendar dates (YYYY-MM-DD) in an IANA time zone, so each gym counts its days in its own local time.

function isTimeZone(value) {
  try {
    new Intl.DateTimeFormat('es-MX', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function addCalendarDays(dateString, amount) {
  const value = new Date(`${dateString}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function getDateInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function localMidnightToUtc(dateString, timezone) {
  const [year, month, day] = dateString.split('-').map(Number);
  const desiredLocalAsUtc = Date.UTC(year, month - 1, day);
  let timestamp = desiredLocalAsUtc;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const parts = formatter.formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    const representedAsUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
    const adjustment = desiredLocalAsUtc - representedAsUtc;
    if (adjustment === 0) break;
    timestamp += adjustment;
  }
  return new Date(timestamp);
}

// An aggregation expression giving each document's gym time zone, for $dateToString and $hour.
function gymTimezoneExpression(gyms) {
  // $switch needs at least one branch.
  if (gyms.length === 0) return 'UTC';
  return {
    $switch: {
      branches: gyms.map((gym) => ({ case: { $eq: ['$gymId', gym._id] }, then: gym.timezone })),
      default: 'UTC',
    },
  };
}

module.exports = { isTimeZone, addCalendarDays, getDateInTimezone, localMidnightToUtc, gymTimezoneExpression };
