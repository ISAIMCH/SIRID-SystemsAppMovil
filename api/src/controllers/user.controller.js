const { z } = require('zod');
const User = require('../models/user.model');
const HttpError = require('../utils/http-error');
const { resolveTenant } = require('../utils/tenant');
const { findClientMember } = require('../utils/members');

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
    assignedCoach: user.assignedCoach ? {
      id: String(user.assignedCoach._id),
      name: user.assignedCoach.name,
      email: user.assignedCoach.email,
    } : null,
  };
}

// The notes belong to the request's organization; other organizations keep their own.
async function updateClientObservations(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new HttpError(400, 'ID de usuario inválido.');

  const member = await findClientMember(req, req.params.id);
  const filter = { _id: req.params.id };
  if (resolveTenant(req).role === 'Coach') filter.assignedCoach = req.user.id;
  const input = observationsSchema.parse(req.body);
  const client = await User.findOne(filter)
    .select('name email phone address role isActive goal experienceLevel availableTrainingDays membership assignedCoach')
    .populate('assignedCoach', 'name email')
    .lean();
  if (!client) throw new HttpError(404, 'Cliente no encontrado.');

  member.observations = input.observations;
  await member.save();
  res.json({ user: serializeClient(client, member) });
}

module.exports = { updateClientObservations };
