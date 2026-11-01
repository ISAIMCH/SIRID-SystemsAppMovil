const Promotion = require('../models/promotion.model');
const HttpError = require('./http-error');
const { hasVerifiedDocument } = require('./documents');

const roundMoney = (value) => Math.round(value * 100) / 100;

function isPromotionCurrent(promotion, now = new Date()) {
  return promotion.isActive !== false && promotion.active !== false && (!promotion.validUntil || promotion.validUntil > now);
}

// A membership promotion without plans applies to every plan.
function promotionCoversPlan(promotion, planId) {
  if (promotion.appliesTo !== 'membership') return false;
  const plans = promotion.applicablePlans ?? [];
  return plans.length === 0 || plans.some((id) => String(id) === String(planId));
}

function discountedPrice(listPrice, discountPercentage) {
  const discountApplied = roundMoney(listPrice * (discountPercentage ?? 0) / 100);
  return { listPrice, discountApplied, amount: roundMoney(listPrice - discountApplied) };
}

// Every current promotion for the plan, with its price. `eligible` is false when the client lacks the document it
// asks for; without a client it is null (unknown). `best` is the eligible one with the lowest price.
async function quoteMembership({ plan, userId, organizationId, now = new Date() }) {
  const promotions = await Promotion.find({ organizationId, appliesTo: 'membership' }).lean();
  const options = [];
  for (const promotion of promotions) {
    if (!isPromotionCurrent(promotion, now) || !promotionCoversPlan(promotion, plan._id)) continue;
    const eligible = !promotion.requiredDocument
      || (userId ? await hasVerifiedDocument(userId, organizationId, promotion.requiredDocument) : null);
    options.push({
      promotionId: String(promotion._id),
      title: promotion.title,
      discountPercentage: promotion.discountPercentage,
      requiredDocument: promotion.requiredDocument ?? null,
      validUntil: promotion.validUntil ?? null,
      eligible,
      ...discountedPrice(plan.price, promotion.discountPercentage),
    });
  }
  options.sort((a, b) => a.amount - b.amount);
  return { listPrice: plan.price, promotions: options, best: options.find((option) => option.eligible === true) ?? null };
}

// The price the server charges for the plan with that promotion; a promotion that no longer applies is refused
// so reception never charges a discount the client is not entitled to.
async function priceMembership({ plan, promotionId, userId, organizationId, session, now = new Date() }) {
  if (!promotionId) return { promotionId: null, ...discountedPrice(plan.price, 0) };
  const promotion = await Promotion.findOne({ _id: promotionId, organizationId }).session(session ?? null).lean();
  if (!promotion || !isPromotionCurrent(promotion, now)) throw new HttpError(409, 'La promoción ya no está vigente.', { code: 'promotion_unavailable' });
  if (!promotionCoversPlan(promotion, plan._id)) throw new HttpError(409, 'La promoción no aplica a este plan.', { code: 'promotion_not_applicable' });
  if (promotion.requiredDocument && !(await hasVerifiedDocument(userId, organizationId, promotion.requiredDocument, { session }))) {
    throw new HttpError(409, 'La promoción requiere un documento verificado del cliente.', { code: 'promotion_document_required' });
  }
  return { promotionId: promotion._id, ...discountedPrice(plan.price, promotion.discountPercentage) };
}

module.exports = { isPromotionCurrent, promotionCoversPlan, discountedPrice, quoteMembership, priceMembership };
