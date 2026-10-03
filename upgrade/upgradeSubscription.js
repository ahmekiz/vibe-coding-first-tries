const {
  SubscriptionNotFoundError,
  SamePlanRejectedError,
  DuplicateRequestError,
  PaymentFailedError,
  CreditValidationError,
} = require("./errors");
const { validateCredit } = require("./validateCredit");
const { calculatePrice } = require("./calculatePrice");
const { toUpgradeResponseDto } = require("./toUpgradeResponseDto");
const { requireIdempotencyKey } = require("./requireIdempotencyKey");

/**
 * Atomic subscription upgrade.
 *
 * Credit is validated before price calculation.
 * Upgrade + invoice are committed in a single DB transaction.
 * External payment failure rolls the transaction back.
 * Response DTO never includes internal payment metadata.
 */
async function upgradeSubscription(deps, input) {
  const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
  const claimed = await deps.idempotencyStore.claim(idempotencyKey);

  if (!claimed) {
    throw new DuplicateRequestError();
  }

  try {
    const credit = validateCredit(input.credit);
    const subscription = await deps.subscriptions.findById(input.subscriptionId);

    if (!subscription) {
      throw new SubscriptionNotFoundError();
    }

    if (subscription.planId === input.targetPlanId) {
      throw new SamePlanRejectedError();
    }

    const currentPlan = await deps.plans.findById(subscription.planId);
    const targetPlan = await deps.plans.findById(input.targetPlanId);

    assertSameCurrency(credit.currency, currentPlan.currency, targetPlan.currency);

    const pricing = calculatePrice({
      currentPlanPrice: currentPlan.price,
      targetPlanPrice: targetPlan.price,
      remainingCycleRatio: input.remainingCycleRatio,
      creditAmount: credit.amount,
    });

    const result = await deps.db.transaction(async (tx) => {
      const upgraded = await tx.upgradeSubscription({
        subscriptionId: subscription.id,
        fromPlanId: subscription.planId,
        toPlanId: targetPlan.id,
      });

      const invoice = await tx.createInvoice({
        subscriptionId: subscription.id,
        amountDue: pricing.amountDue,
        currency: targetPlan.currency,
        status: pricing.amountDue === 0 ? "paid" : "open",
      });

      let paymentReceipt = { status: "skipped" };

      if (pricing.amountDue > 0) {
        try {
          paymentReceipt = await deps.payments.charge({
            amount: pricing.amountDue,
            currency: targetPlan.currency,
            subscriptionId: subscription.id,
            invoiceId: invoice.id,
          });
        } catch (error) {
          throw new PaymentFailedError(error.message);
        }
      }

      // Internal metadata stays on the transaction side only.
      void paymentReceipt;

      return toUpgradeResponseDto({
        subscription: upgraded,
        invoice,
        pricing,
      });
    });

    await deps.idempotencyStore.complete(idempotencyKey, result);
    return result;
  } catch (error) {
    await deps.idempotencyStore.release(idempotencyKey);
    throw error;
  }
}

function assertSameCurrency(creditCurrency, currentPlanCurrency, targetPlanCurrency) {
  if (creditCurrency !== currentPlanCurrency || creditCurrency !== targetPlanCurrency) {
    throw new CreditValidationError("Credit currency must match plan currency");
  }
}

module.exports = { upgradeSubscription };
