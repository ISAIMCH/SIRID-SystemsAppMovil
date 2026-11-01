const Gym = require('../models/gym.model');
const { hasActiveMembership, membershipCoversGym } = require('./membership');
const { hasVerifiedDocument } = require('./documents');

const DOCUMENT_LABELS = { student_id: 'la credencial de estudiante' };

function toMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Minutes since midnight at `date` in the gym's time zone.
function localMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const value = (type) => Number(parts.find((part) => part.type === type).value);
  return value('hour') * 60 + value('minute');
}

// The end time is exclusive; a schedule whose end is before its start crosses midnight (22:00-06:00).
function isWithinSchedule(schedule, date, timeZone) {
  if (!schedule?.startTime || !schedule?.endTime) return true;
  const now = localMinutes(date, timeZone);
  const start = toMinutes(schedule.startTime);
  const end = toMinutes(schedule.endTime);
  return start < end ? now >= start && now < end : now >= start || now < end;
}

function deny(code, message) {
  return { allowed: false, code, message };
}

// The single check behind every entry (turnstile and staff scanner), in this order: account, membership, gym,
// schedule, document. Only the rules copied to the membership at sale apply, never the plan's current ones.
async function evaluateAccess({ user, isMember, membership, gymId, now = new Date() }, { session } = {}) {
  if (!user?.isActive || !isMember) return deny('account_disabled', 'La cuenta no está habilitada para ingresar.');
  if (!hasActiveMembership(membership, now)) return deny('membership_inactive', 'La membresía no está vigente.');
  if (!membershipCoversGym(membership, gymId)) return deny('gym_not_included', 'El plan del cliente no incluye esta sucursal.');

  if (membership.schedule?.startTime) {
    const gym = await Gym.findById(gymId).select('timezone').session(session ?? null).lean();
    if (!isWithinSchedule(membership.schedule, now, gym?.timezone ?? 'America/Mexico_City')) {
      const { startTime, endTime } = membership.schedule;
      return deny('outside_schedule', `El plan permite entrar de ${startTime} a ${endTime}.`);
    }
  }

  const category = membership.requiredDocument;
  if (category && !(await hasVerifiedDocument(membership.userId, membership.organizationId, category, { session }))) {
    const label = DOCUMENT_LABELS[category] ?? 'el documento que pide el plan';
    return deny('document_required', `Falta verificar ${label} del cliente, o ya venció.`);
  }

  return { allowed: true };
}

module.exports = { isWithinSchedule, localMinutes, evaluateAccess };
