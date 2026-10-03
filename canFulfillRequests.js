function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isValidCustomer(customer) {
  if (customer === null || typeof customer !== "object" || Array.isArray(customer)) {
    return false;
  }

  return (
    isPositiveNumber(customer.id) &&
    typeof customer.name === "string" &&
    isNonNegativeNumber(customer.currentHours) &&
    isNonNegativeNumber(customer.maxHours)
  );
}

function isValidRequest(request) {
  if (request === null || typeof request !== "object" || Array.isArray(request)) {
    return false;
  }

  return (
    isPositiveNumber(request.assignmentId) &&
    isPositiveNumber(request.developerId) &&
    isNonNegativeNumber(request.hours)
  );
}

/**
 * Checks whether incoming customer data can fulfill the given requests.
 * Does not mutate the original arrays or their objects.
 *
 * @param {Array} customers
 * @param {Array} requests
 * @returns {boolean}
 */
function canFulfillRequests(customers, requests) {
  if (!Array.isArray(customers) || !Array.isArray(requests)) {
    return false;
  }

  const customerCopies = customers.map((customer) => ({ ...customer }));
  const requestCopies = requests.map((request) => ({ ...request }));
  const hoursByCustomerId = new Map();

  for (const customer of customerCopies) {
    if (!isValidCustomer(customer)) {
      return false;
    }

    if (customer.currentHours > customer.maxHours) {
      return false;
    }

    if (hoursByCustomerId.has(customer.id)) {
      return false;
    }

    hoursByCustomerId.set(customer.id, customer.currentHours);
  }

  for (const request of requestCopies) {
    if (!isValidRequest(request)) {
      return false;
    }

    if (!hoursByCustomerId.has(request.developerId)) {
      return false;
    }

    const customer = customerCopies.find((item) => item.id === request.developerId);
    const projectedHours = hoursByCustomerId.get(request.developerId) + request.hours;

    if (projectedHours > customer.maxHours) {
      return false;
    }

    hoursByCustomerId.set(request.developerId, projectedHours);
  }

  return true;
}

module.exports = {
  canFulfillRequests,
  isValidCustomer,
  isValidRequest,
};
