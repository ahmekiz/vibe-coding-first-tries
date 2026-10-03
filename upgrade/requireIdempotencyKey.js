const { HttpError } = require("./errors");

function requireIdempotencyKey(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, "Idempotency key is required", "MISSING_IDEMPOTENCY_KEY");
  }

  return value.trim();
}

module.exports = { requireIdempotencyKey };
