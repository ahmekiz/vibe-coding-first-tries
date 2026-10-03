/**
 * Pure price helper. No I/O, no Date.now, no mutation of inputs.
 */
function calculatePrice({ currentPlanPrice, targetPlanPrice, remainingCycleRatio, creditAmount }) {
  if (![currentPlanPrice, targetPlanPrice, remainingCycleRatio, creditAmount].every(
    (value) => typeof value === "number" && Number.isFinite(value)
  )) {
    throw new TypeError("Price inputs must be finite numbers");
  }

  if (currentPlanPrice < 0 || targetPlanPrice < 0 || creditAmount < 0) {
    throw new TypeError("Prices and credit must be non-negative");
  }

  if (remainingCycleRatio < 0 || remainingCycleRatio > 1) {
    throw new TypeError("remainingCycleRatio must be between 0 and 1");
  }

  const unusedCurrentValue = roundMoney(currentPlanPrice * remainingCycleRatio);
  const targetProrated = roundMoney(targetPlanPrice * remainingCycleRatio);
  const subtotal = roundMoney(Math.max(0, targetProrated - unusedCurrentValue));
  const creditApplied = roundMoney(Math.min(creditAmount, subtotal));
  const amountDue = roundMoney(subtotal - creditApplied);

  return Object.freeze({
    unusedCurrentValue,
    targetProrated,
    subtotal,
    creditApplied,
    amountDue,
  });
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

module.exports = { calculatePrice };
