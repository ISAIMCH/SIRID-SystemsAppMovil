const { z } = require('zod');
const AccessIoT = require('../models/access-iot.model');
const Equipment = require('../models/equipment.model');
const User = require('../models/user.model');

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
        total: { $sum: 1 },
        available: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } },
        busy: { $sum: { $cond: [{ $eq: ['$status', 'busy'] }, 1, 0] } },
        outOfService: { $sum: { $cond: [{ $eq: ['$status', 'out_of_service'] }, 1, 0] } },
      } },
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

module.exports = { getOperationsDashboard };