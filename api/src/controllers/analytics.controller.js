const { z } = require('zod');
const AccessIoT = require('../models/access-iot.model');
const Equipment = require('../models/equipment.model');
const Gym = require('../models/gym.model');
const WorkoutSession = require('../models/workout-session.model');
const mongoose = require('mongoose');
const HttpError = require('../utils/http-error');
const { resolveTenant, gymFilter } = require('../utils/tenant');
const { findClientMember, isAssignedCoach } = require('../utils/members');
const { addCalendarDays, getDateInTimezone, localMidnightToUtc, gymTimezoneExpression } = require('../utils/timezone');
const { findClientsInside } = require('../utils/occupancy');

// Where each gym's "today" and the period start, in its own time zone; `days` counts today.
function gymPeriodStarts(gyms, days, now = new Date()) {
  return gyms.map((gym) => {
    const today = getDateInTimezone(now, gym.timezone);
    return {
      gymId: gym._id,
      timezone: gym.timezone,
      todayStart: localMidnightToUtc(today, gym.timezone),
      periodStart: localMidnightToUtc(addCalendarDays(today, -(days - 1)), gym.timezone),
    };
  });
}

// Entries and exits since each gym's own start time.
function sinceGymStart(organizationId, starts, field) {
  return {
    organizationId,
    event: { $in: AccessIoT.PASSAGE_EVENTS },
    $or: starts.map((start) => ({ gymId: start.gymId, occurredAt: { $gte: start[field] } })),
  };
}

// Days and hours are counted in each gym's time zone (Gym.timezone), not the server's.
async function getOperationsDashboard(req, res) {
  const { period } = z.object({ period: z.enum(['day', 'week']).default('day') }).parse(req.query);
  const { organizationId, gymIds } = resolveTenant(req);
  const now = new Date();
  const gyms = await Gym.find({ _id: { $in: gymIds } }).select('timezone').lean();
  const starts = gymPeriodStarts(gyms, period === 'week' ? 7 : 1, now);
  const timezones = [...new Set(gyms.map((gym) => gym.timezone))];
  const localTimezone = gymTimezoneExpression(gyms);
  const noGyms = starts.length === 0;

  const [eventsByDay, hourlyEvents, todaysCounts, inside, equipmentByZone] = await Promise.all([
    noGyms ? [] : AccessIoT.aggregate([
      { $match: sinceGymStart(organizationId, starts, 'periodStart') },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$occurredAt', timezone: localTimezone } },
        checkIns: { $sum: { $cond: [{ $eq: ['$event', 'check-in'] }, 1, 0] } },
        checkOuts: { $sum: { $cond: [{ $eq: ['$event', 'check-out'] }, 1, 0] } },
      } },
      { $sort: { _id: 1 } },
    ]),
    noGyms ? [] : AccessIoT.aggregate([
      { $match: { ...sinceGymStart(organizationId, starts, 'periodStart'), event: 'check-in' } },
      { $group: { _id: { $hour: { date: '$occurredAt', timezone: localTimezone } }, checkIns: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    noGyms ? [] : AccessIoT.aggregate([
      { $match: sinceGymStart(organizationId, starts, 'todayStart') },
      { $group: {
        _id: '$event',
        count: { $sum: 1 },
      } },
    ]),
    findClientsInside(organizationId, gymIds),
    Equipment.aggregate([
      { $match: { ...gymFilter(req), isDeleted: { $ne: true } } },
      { $group: {
        _id: '$zone',
        total: { $sum: { $ifNull: ['$totalQuantity', 1] } },
        outOfService: { $sum: { $ifNull: ['$maintenanceQuantity', { $cond: [{ $eq: ['$status', 'out_of_service'] }, 1, 0] }] } },
      } },
      { $addFields: { available: { $subtract: ['$total', '$outOfService'] }, busy: 0 } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  const currentOccupancy = inside.length;

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
    // The earliest gym start; each gym counts from its own local midnight.
    periodStart: noGyms ? null : new Date(Math.min(...starts.map((start) => start.periodStart.getTime()))),
    // Dates and hours are local to these zones; a single one when every visible gym shares it.
    timezones,
    timezone: timezones.length === 1 ? timezones[0] : null,
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
  const { role } = resolveTenant(req);
  if (role === 'Cliente' && String(req.user.id) !== clientId) {
    throw new HttpError(403, 'Solo puedes consultar tus propias estadísticas.');
  }
  if (role === 'Coach') {
    const member = await findClientMember(req, clientId);
    if (!isAssignedCoach(member, req.user.id)) throw new HttpError(404, 'Cliente no encontrado.');
  } else if (role === 'Admin') {
    await findClientMember(req, clientId);
  } else if (role !== 'Cliente') {
    throw new HttpError(403, 'No tienes permiso para consultar estas estadísticas.');
  }

  let range;
  try {
    range = calculatePeriodRange(input.period, input.date, input.timezone);
  } catch (error) {
    throw new HttpError(400, error.message);
  }

  // Staff only count what the client trained with their organization; the client sees everything.
  const match = {
    user: new mongoose.Types.ObjectId(clientId),
    ...(role === 'Cliente' ? {} : { organizationId: new mongoose.Types.ObjectId(String(resolveTenant(req).organizationId)) }),
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
  gymPeriodStarts,
  getClientFitnessAnalytics,
  calculatePeriodRange,
  buildClientChart,
  buildTimeGroupExpression,
};