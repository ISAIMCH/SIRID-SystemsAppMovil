const { z } = require('zod');
const AccessIoT = require('../models/access-iot.model');
const Equipment = require('../models/equipment.model');
const User = require('../models/user.model');
const WorkoutSession = require('../models/workout-session.model');
const mongoose = require('mongoose');

async function getOperationsDashboard(req, res) {
  const { period } = z.object({ period: z.enum(['day', 'week']).default('day') }).parse(req.query);
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const periodStart = new Date(todayStart);
  if (period === 'week') periodStart.setUTCDate(periodStart.getUTCDate() - 6);

  const [eventsByDay, hourlyEvents, todaysCounts, currentOccupancy, equipmentByZone] = await Promise.all([
    AccessIoT.aggregate([
      { $match: { occurredAt: { $gte: periodStart } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt', timezone: 'UTC' } },
        checkIns: { $sum: { $cond: [{ $eq: ['$event', 'check-in'] }, 1, 0] } },
        checkOuts: { $sum: { $cond: [{ $eq: ['$event', 'check-out'] }, 1, 0] } },
      } },
      { $sort: { _id: 1 } },
    ]),
    AccessIoT.aggregate([
      { $match: { occurredAt: { $gte: periodStart }, event: 'check-in' } },
      { $group: { _id: { $hour: '$occurredAt' }, checkIns: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    AccessIoT.aggregate([
      { $match: { occurredAt: { $gte: todayStart } } },
      { $group: {
        _id: '$event',
        count: { $sum: 1 },
      } },
    ]),
    User.countDocuments({ role: 'Cliente', isActive: true, currentlyInside: true }),
    Equipment.aggregate([
      { $group: {
        _id: '$zone',
        total: { $sum: { $ifNull: ['$totalQuantity', 1] } },
        outOfService: { $sum: { $ifNull: ['$maintenanceQuantity', { $cond: [{ $eq: ['$status', 'out_of_service'] }, 1, 0] }] } },
      } },
      { $addFields: { available: { $subtract: ['$total', '$outOfService'] }, busy: 0 } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const hourlyDemand = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    checkIns: hourlyEvents.find((item) => item._id === hour)?.checkIns ?? 0,
  }));
  const today = todaysCounts.reduce((result, event) => {
    result[event._id === 'check-in' ? 'checkIns' : 'checkOuts'] = event.count;
    return result;
  }, { checkIns: 0, checkOuts: 0 });
  const peakHour = hourlyDemand.reduce((peak, item) => item.checkIns > peak.checkIns ? item : peak, { hour: 0, checkIns: 0 });

  res.json({
    period,
    periodStart,
    generatedAt: now,
    today,
    currentOccupancy,
    dailyAttendance: eventsByDay.map((item) => ({ date: item._id, checkIns: item.checkIns, checkOuts: item.checkOuts })),
    hourlyDemand,
    peakHour: peakHour.checkIns ? peakHour : null,
    equipmentByZone: equipmentByZone.map((item) => ({
      zone: item._id,
      total: item.total,
      available: item.available,
      busy: item.busy,
      outOfService: item.outOfService,
    })),
  });
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

function calculatePeriodRange(period, requestedDate, timezone = 'UTC', now = new Date()) {
  new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  let dateString = requestedDate ?? getDateInTimezone(now, timezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)
    || new Date(`${dateString}T00:00:00.000Z`).toISOString().slice(0, 10) !== dateString) {
    throw new Error('La fecha debe tener formato YYYY-MM-DD y ser válida.');
  }

  let startDate;
  let endDateExclusive;
  if (period === 'day') {
    startDate = dateString;
    endDateExclusive = addCalendarDays(startDate, 1);
  } else if (period === 'week') {
    const weekday = new Date(`${dateString}T00:00:00.000Z`).getUTCDay();
    startDate = addCalendarDays(dateString, -((weekday + 6) % 7));
    endDateExclusive = addCalendarDays(startDate, 7);
  } else {
    const [year, month] = dateString.split('-').map(Number);
    startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    endDateExclusive = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  }

  return {
    startDate,
    endDateExclusive,
    start: localMidnightToUtc(startDate, timezone),
    end: localMidnightToUtc(endDateExclusive, timezone),
  };
}

function buildClientChart(period, rows, startDate, endDateExclusive) {
  const byLabel = new Map(rows.map((row) => [row._id, row]));
  const labels = period === 'day'
    ? Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
    : (() => {
        const days = [];
        for (let date = startDate; date < endDateExclusive; date = addCalendarDays(date, 1)) days.push(date);
        return days;
      })();

  return labels.map((label) => {
    const row = byLabel.get(label);
    return {
      label: period === 'day' ? `${label}:00` : label,
      durationMinutes: row?.durationMinutes ?? 0,
      totalVolumeKg: row?.totalVolumeKg ?? 0,
      caloriesBurned: row?.caloriesBurned ?? 0,
    };
  });
}

function buildTimeGroupExpression(period, timezone) {
  return period === 'day'
    ? { $dateToString: { format: '%H', date: '$completedAt', timezone } }
    : { $dateToString: { format: '%Y-%m-%d', date: '$completedAt', timezone } };
}

async function getClientFitnessAnalytics(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.clientId)) throw new HttpError(400, 'ID de cliente inválido.');
  const input = z.object({
    period: z.enum(['day', 'week', 'month']).default('day'),
    date: z.string().optional(),
    timezone: z.string().trim().min(1).max(100).default('UTC'),
  }).parse(req.query);

  const clientId = req.params.clientId;
  if (req.user.role === 'Cliente' && String(req.user.id) !== clientId) {
    throw new HttpError(403, 'Solo puedes consultar tus propias estadísticas.');
  }
  if (req.user.role === 'Coach') {
    const assignedClient = await User.exists({ _id: clientId, role: 'Cliente', assignedCoach: req.user.id });
    if (!assignedClient) throw new HttpError(404, 'Cliente no encontrado.');
  } else if (!['Admin', 'Cliente'].includes(req.user.role)) {
    throw new HttpError(403, 'No tienes permiso para consultar estas estadísticas.');
  }

  let range;
  try {
    range = calculatePeriodRange(input.period, input.date, input.timezone);
  } catch (error) {
    throw new HttpError(400, error.message);
  }

  const match = {
    user: new mongoose.Types.ObjectId(clientId),
    completedAt: { $gte: range.start, $lt: range.end },
  };
  const chartGroup = buildTimeGroupExpression(input.period, input.timezone);

  const [totalsRows, chartRows, bestLiftRows] = await Promise.all([
    WorkoutSession.aggregate([
      { $match: match },
      { $group: {
        _id: null,
        sessionCount: { $sum: 1 },
        durationMinutes: { $sum: '$durationMinutes' },
        totalVolumeKg: { $sum: '$totalVolumeKg' },
        caloriesBurned: { $sum: { $ifNull: ['$caloriesBurned', 0] } },
      } },
    ]),
    WorkoutSession.aggregate([
      { $match: match },
      { $group: {
        _id: chartGroup,
        durationMinutes: { $sum: '$durationMinutes' },
        totalVolumeKg: { $sum: '$totalVolumeKg' },
        caloriesBurned: { $sum: { $ifNull: ['$caloriesBurned', 0] } },
      } },
      { $sort: { _id: 1 } },
    ]),
    WorkoutSession.aggregate([
      { $match: match },
      { $facet: {
        blockLifts: [
          { $unwind: '$blocks' },
          { $unwind: '$blocks.sets' },
          { $unwind: '$blocks.sets.exercises' },
          { $match: { 'blocks.sets.exercises.weightKg': { $type: 'number' } } },
          { $project: {
            weightKg: '$blocks.sets.exercises.weightKg',
            exerciseName: '$blocks.sets.exercises.exerciseName',
            completedAt: '$completedAt',
          } },
        ],
        legacyLifts: [
          { $unwind: '$exercises' },
          { $unwind: '$exercises.sets' },
          { $match: { 'exercises.sets.weightKg': { $type: 'number' } } },
          { $project: {
            weightKg: '$exercises.sets.weightKg',
            exerciseName: '$exercises.exerciseName',
            completedAt: '$completedAt',
          } },
        ],
      } },
      { $project: { lifts: { $concatArrays: ['$blockLifts', '$legacyLifts'] } } },
      { $unwind: '$lifts' },
      { $sort: { 'lifts.weightKg': -1, 'lifts.completedAt': -1 } },
      { $limit: 1 },
      { $replaceRoot: { newRoot: '$lifts' } },
    ]),
  ]);

  res.json({
    clientId,
    period: input.period,
    date: input.date ?? getDateInTimezone(new Date(), input.timezone),
    timezone: input.timezone,
    range: { start: range.start, end: range.end },
    totals: totalsRows[0] ?? { sessionCount: 0, durationMinutes: 0, totalVolumeKg: 0, caloriesBurned: 0 },
    bestLift: bestLiftRows[0] ?? null,
    chartData: buildClientChart(input.period, chartRows, range.startDate, range.endDateExclusive),
  });
}

module.exports = {
  getOperationsDashboard,
  getClientFitnessAnalytics,
  calculatePeriodRange,
  buildClientChart,
  buildTimeGroupExpression,
};