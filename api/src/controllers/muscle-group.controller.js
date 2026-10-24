const { MUSCLE_GROUPS } = require('../constants/muscle-groups');

async function listMuscleGroups(req, res) {
  const groups = MUSCLE_GROUPS.map((name) => ({ name, key: name.toLocaleLowerCase() }));
  res.json({ groups });
}

module.exports = { listMuscleGroups };
