const HttpError = require('../utils/http-error');
const asyncHandler = require('../utils/async-handler');
const { FEATURE_LABELS, organizationHasFeature } = require('../utils/saas-plans');

// Paying for GymGo is the owner's: managers (also 'Admin' for routes) don't see or change the plan.
function requireOwner(req, res, next) {
  if (req.user?.isPlatformAdmin || req.tenantContext?.member.roles.includes('Propietario')) return next();
  return next(new HttpError(403, 'Solo el propietario administra el plan de GymGo.'));
}

// Hard limit by plan: the API refuses what the organization's plan doesn't include, whatever the client shows.
function requireFeature(feature) {
  return asyncHandler(async (req, res, next) => {
    if (req.user?.isPlatformAdmin) return next();
    const organization = req.tenantContext?.organization;
    if (!await organizationHasFeature(organization, feature)) {
      throw new HttpError(403, `Tu plan no incluye ${FEATURE_LABELS[feature]}. Cámbiate a Pro para usarlo.`, {
        code: 'feature_not_in_plan',
        feature,
        planCode: organization?.subscription?.planCode ?? null,
      });
    }
    return next();
  });
}

module.exports = { requireOwner, requireFeature };
