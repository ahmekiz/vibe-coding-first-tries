const { upgradeSubscription, calculatePrice } = require("./index");
const {
  SubscriptionNotFoundError,
  SamePlanRejectedError,
  CreditValidationError,
  DuplicateRequestError,
  PaymentFailedError,
} = require("./errors");

function createIdempotencyStore() {
  const keys = new Map();

  return {
    async claim(key) {
      if (keys.has(key)) {
        return false;
      }
      keys.set(key, { status: "in_progress" });
      return true;
    },
    async complete(key, response) {
      keys.set(key, { status: "complete", response });
    },
    async release(key) {
      const entry = keys.get(key);
      if (entry && entry.status === "in_progress") {
        keys.delete(key);
      }
    },
  };
}

function createDb({ subscriptions }) {
  const state = {
    subscriptions: new Map(subscriptions.map((item) => [item.id, { ...item }])),
    invoices: [],
    committed: [],
    rolledBack: 0,
  };

  return {
    state,
    async transaction(work) {
      const snapshot = {
        subscriptions: new Map(
          [...state.subscriptions.entries()].map(([id, value]) => [id, { ...value }])
        ),
        invoices: [...state.invoices],
      };

      const tx = {
        async upgradeSubscription({ subscriptionId, fromPlanId, toPlanId }) {
          const current = state.subscriptions.get(subscriptionId);
          const upgraded = {
            ...current,
            previousPlanId: fromPlanId,
            planId: toPlanId,
            status: "active",
          };
          state.subscriptions.set(subscriptionId, upgraded);
          return { ...upgraded };
        },
        async createInvoice(invoice) {
          const created = { id: `inv_${state.invoices.length + 1}`, ...invoice };
          state.invoices.push(created);
          return { ...created };
        },
      };

      try {
        const result = await work(tx);
        state.committed.push({
          subscription: { ...state.subscriptions.get(work.subscriptionId) },
          invoices: [...state.invoices],
        });
        return result;
      } catch (error) {
        state.subscriptions = snapshot.subscriptions;
        state.invoices = snapshot.invoices;
        state.rolledBack += 1;
        throw error;
      }
    },
  };
}

function createDeps({ payment = async () => ({ paymentId: "pay_secret", processorChargeId: "ch_secret" }) } = {}) {
  const subscriptions = [
    { id: "sub_1", planId: "plan_basic", status: "active" },
  ];
  const db = createDb({ subscriptions });

  return {
    db,
    idempotencyStore: createIdempotencyStore(),
    subscriptions: {
      async findById(id) {
        return subscriptions.find((item) => item.id === id) || null;
      },
    },
    plans: {
      async findById(id) {
        const catalog = {
          plan_basic: { id: "plan_basic", price: 10, currency: "USD" },
          plan_pro: { id: "plan_pro", price: 30, currency: "USD" },
        };
        return catalog[id];
      },
    },
    payments: {
      charge: payment,
    },
  };
}

async function run() {
  const originalPriceInput = Object.freeze({
    currentPlanPrice: 10,
    targetPlanPrice: 30,
    remainingCycleRatio: 0.5,
    creditAmount: 2,
  });
  const pricing = calculatePrice(originalPriceInput);
  assert(pricing.amountDue === 8, "pure helper should apply unused value and credit");
  assert(originalPriceInput.creditAmount === 2, "calculatePrice must not mutate inputs");

  const happyDeps = createDeps();
  const response = await upgradeSubscription(happyDeps, {
    subscriptionId: "sub_1",
    targetPlanId: "plan_pro",
    remainingCycleRatio: 0.5,
    credit: { amount: 2, currency: "USD" },
    idempotencyKey: "key-1",
  });

  assert(response.planId === "plan_pro", "plan should upgrade");
  assert(response.invoice.id, "invoice should be created in the same commit");
  assert(!("paymentId" in response), "DTO must hide paymentId");
  assert(!JSON.stringify(response).includes("processorChargeId"), "DTO must hide processor metadata");
  assert(!JSON.stringify(response).includes("pay_secret"), "DTO must hide payment ids");
  assert(happyDeps.db.state.invoices.length === 1, "invoice should persist after commit");

  await assertThrows(
    () => upgradeSubscription(happyDeps, {
      subscriptionId: "sub_1",
      targetPlanId: "plan_pro",
      remainingCycleRatio: 0.5,
      credit: { amount: 2, currency: "USD" },
      idempotencyKey: "key-1",
    }),
    DuplicateRequestError
  );

  await assertThrows(
    () => upgradeSubscription(createDeps(), {
      subscriptionId: "missing",
      targetPlanId: "plan_pro",
      remainingCycleRatio: 1,
      credit: { amount: 0, currency: "USD" },
      idempotencyKey: "key-404",
    }),
    SubscriptionNotFoundError
  );

  await assertThrows(
    () => upgradeSubscription(createDeps(), {
      subscriptionId: "sub_1",
      targetPlanId: "plan_basic",
      remainingCycleRatio: 1,
      credit: { amount: 0, currency: "USD" },
      idempotencyKey: "key-same",
    }),
    SamePlanRejectedError
  );

  await assertThrows(
    () => upgradeSubscription(createDeps(), {
      subscriptionId: "sub_1",
      targetPlanId: "plan_pro",
      remainingCycleRatio: 1,
      credit: { amount: -1, currency: "USD" },
      idempotencyKey: "key-credit",
    }),
    CreditValidationError
  );

  const failingDeps = createDeps({
    payment: async () => {
      throw new Error("gateway timeout");
    },
  });

  await assertThrows(
    () => upgradeSubscription(failingDeps, {
      subscriptionId: "sub_1",
      targetPlanId: "plan_pro",
      remainingCycleRatio: 1,
      credit: { amount: 0, currency: "USD" },
      idempotencyKey: "key-pay",
    }),
    PaymentFailedError
  );

  assert(failingDeps.db.state.rolledBack === 1, "payment failure should rollback");
  assert(failingDeps.db.state.invoices.length === 0, "rolled back invoice must not persist");
  assert(
    failingDeps.db.state.subscriptions.get("sub_1").planId === "plan_basic",
    "rolled back subscription must keep current plan"
  );

  console.log("upgrade flow checks passed");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertThrows(fn, ErrorType) {
  try {
    await fn();
  } catch (error) {
    if (error instanceof ErrorType) {
      return;
    }
    throw new Error(`expected ${ErrorType.name}, got ${error.constructor.name}: ${error.message}`);
  }
  throw new Error(`expected ${ErrorType.name}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
