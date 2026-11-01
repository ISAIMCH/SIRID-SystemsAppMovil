const { z } = require('zod');
const User = require('../models/user.model');
const HttpError = require('../utils/http-error');
const { resolveTenant } = require('../utils/tenant');
const { findClientMember, isAssignedCoach } = require('../utils/members');

const observationsSchema = z.object({
  observations: z.string().trim().max(4000),
});

function serializeClient(user, member) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    address: user.address,
    role: user.role,
    isActive: user.isActive,
    goal: user.goal,
    experienceLevel: user.experienceLevel,
    availableTrainingDays: user.availableTrainingDays,
    observations: member.observations,
    membership: user.membership,
    assignedCoach: member.assignedCoach ? {
      id: String(member.assignedCoach._id),
      name: member.assignedCoach.name,
      email: member.assignedCoach.email,
    } : null,
  };
}

// The notes belong to the request's organization; other organizations keep their own.
async function updateClientObservations(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new HttpError(400, 'ID de usuario inválido.');

  const member = await findClientMember(req, req.params.id);
  if (resolveTenant(req).role === 'Coach' && !isAssignedCoach(member, req.user.id)) throw new HttpError(404, 'Cliente no encontrado.');
  const input = observationsSchema.parse(req.body);
  const client = await User.findById(req.params.id)
    .select('name email phone address role isActive goal experienceLevel availableTrainingDays membership')
    .lean();
  if (!client) throw new HttpError(404, 'Cliente no encontrado.');

  member.observations = input.observations;
  await member.save();
  await member.populate('assignedCoach', 'name email');
  res.json({ user: serializeClient(client, member) });
}

module.exports = { updateClientObservations };
