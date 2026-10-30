const mongoose = require('mongoose');
const { getDefaultTenant } = require('../../utils/tenant');

// Adds the organization (and, for per-gym data, the gym) that owns each document.
// Documents created without them get the default tenant until requests carry their own (etapa 2).
function tenantPlugin(schema, { gym = false } = {}) {
  schema.add({ organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true } });
  if (gym && !schema.path('gymId')) {
    schema.add({ gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true, index: true } });
  }

  schema.pre('validate', function fillDefaultTenant() {
    const tenant = getDefaultTenant();
    if (!tenant) return;
    if (!this.organizationId) this.organizationId = tenant.organizationId;
    if (gym && !this.gymId) this.gymId = tenant.gymId;
  });
}

module.exports = tenantPlugin;
