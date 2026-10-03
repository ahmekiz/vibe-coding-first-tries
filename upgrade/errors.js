class HttpError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

class SubscriptionNotFoundError extends HttpError {
  constructor() {
    super(404, "Subscription not found", "SUBSCRIPTION_NOT_FOUND");
  }
}

class SamePlanRejectedError extends HttpError {
  constructor() {
    super(409, "Current plan and target plan are the same", "SAME_PLAN");
  }
}

class CreditValidationError extends HttpError {
  constructor(message) {
    super(400, message, "INVALID_CREDIT");
  }
}

class DuplicateRequestError extends HttpError {
  constructor() {
    super(409, "Duplicate upgrade request", "DUPLICATE_IDEMPOTENCY_KEY");
  }
}

class PaymentFailedError extends HttpError {
  constructor(message = "External payment failed") {
    super(402, message, "PAYMENT_FAILED");
  }
}

module.exports = {
  HttpError,
  SubscriptionNotFoundError,
  SamePlanRejectedError,
  CreditValidationError,
  DuplicateRequestError,
  PaymentFailedError,
};
