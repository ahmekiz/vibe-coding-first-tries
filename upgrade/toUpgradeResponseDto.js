function toUpgradeResponseDto({ subscription, invoice, pricing }) {
  return {
    subscriptionId: subscription.id,
    previousPlanId: subscription.previousPlanId,
    planId: subscription.planId,
    status: subscription.status,
    invoice: {
      id: invoice.id,
      amountDue: invoice.amountDue,
      currency: invoice.currency,
      status: invoice.status,
    },
    pricing: {
      subtotal: pricing.subtotal,
      creditApplied: pricing.creditApplied,
      amountDue: pricing.amountDue,
    },
  };
}

module.exports = { toUpgradeResponseDto };
