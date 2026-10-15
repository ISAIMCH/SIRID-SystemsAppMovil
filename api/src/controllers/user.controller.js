const { z } = require('zod');
const User = require('../models/user.model');
const HttpError = require('../utils/http-error');

const observationsSchema = z.object({
  observations: z.string().trim().max(4000),
});

function serializeClient(user) {
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
    observations: user.observations,
    membership: user.membership,
    assignedCoach: user.assignedCoach ? {
      id: String(user.assignedCoach._id),
      name: user.assignedCoach.name,
      email: user.assignedCoach.email,
    } : null,
  };
}

async function updateClientObservations(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new HttpError(400, 'ID de usuario inválido.');

  const filter = { _id: req.params.id, role: 'Cliente' };
  if (req.user.role === 'Coach') filter.assignedCoach = req.user.id;
  const input = observationsSchema.parse(req.body);
  const client = await User.findOneAndUpdate(filter, { observations: input.observations }, {
    new: true,
    runValidators: true,
  })
    .select('name email phone address role isActive goal experienceLevel availableTrainingDays observations membership assignedCoach')
    .populate('assignedCoach', 'name email')
    .lean();

  if (!client) throw new HttpError(404, 'Cliente no encontrado.');
  res.json({ user: serializeClient(client) });
}

module.exports = { updateClientObservations };
