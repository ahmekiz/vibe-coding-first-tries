const { CreditValidationError } = require("./errors");

function validateCredit(credit) {
  if (credit === null || typeof credit !== "object" || Array.isArray(credit)) {
    throw new CreditValidationError("Credit must be an object");
  }

  if (typeof credit.amount !== "number" || !Number.isFinite(credit.amount) || credit.amount < 0) {
    throw new CreditValidationError("Credit amount must be a non-negative finite number");
  }

  if (typeof credit.currency !== "string" || credit.currency.trim() === "") {
    throw new CreditValidationError("Credit currency must be a non-empty string");
  }

  return {
    amount: credit.amount,
    currency: credit.currency,
  };
}

module.exports = { validateCredit };
