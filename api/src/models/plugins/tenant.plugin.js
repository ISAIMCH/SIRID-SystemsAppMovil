const mongoose = require('mongoose');

// Adds the organization (and, for per-gym data, the gym) that owns each document.
// Callers always set them from the request (utils/tenant.js); a document without them fails validation.
function tenantPlugin(schema, { gym = false } = {}) {
  schema.add({ organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true } });
  if (gym && !schema.path('gymId')) {
    schema.add({ gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true, index: true } });
  }
}

module.exports = tenantPlugin;
