// node --test tests/   — no dependencies, no database, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANS, decide, MAX_CLIP_SECONDS, planFor, periodKey } from "../api/_lib/quota-rules.js";
import { resolvePlan, parseOverrides, _clearCache } from "../api/_lib/entitlement.js";

const ok = (plan) => ({ ok: true, json: async () => ({ speak_plan: plan }) });

test("plan minutes match the published price list", () => {
  assert.equal(PLANS.free.seconds, 15 * 60);
  assert.equal(PLANS.free.window, "once");
  assert.equal(PLANS.speak.seconds, 90 * 60);
  assert.equal(PLANS.speak_plus.seconds, 180 * 60);
});

test("worst-case margin stays >= 45% at 660đ/min (Speak 129k, Speak+ 219k)", () => {
  const cost = (p) => (PLANS[p].seconds / 60) * 660;
  assert.ok(1 - cost("speak") / 129000 >= 0.45);
  assert.ok(1 - cost("speak_plus") / 219000 >= 0.45);
});

test("clip cap is Azure short-audio's 30 s", () => {
  assert.equal(MAX_CLIP_SECONDS, 30);
  assert.equal(decide({ scope: "account", plan: "speak", seconds: 31, used: 0 }).reason, "clip_too_long");
});

test("unknown plan is never unlimited", () => {
  assert.equal(planFor({ plan: "vip" }), "free");
  assert.equal(periodKey("once"), "trial");
});

test("speak quota blocks at 90 minutes", () => {
  assert.equal(decide({ scope: "account", plan: "speak", seconds: 20, used: 90 * 60 - 10 }).ok, false);
  assert.equal(decide({ scope: "account", plan: "speak", seconds: 20, used: 60 * 60 }).ok, true);
});

test("entitlement: not configured → free, no network", async () => {
  delete process.env.WRITERIGHT_URL; _clearCache();
  let called = false;
  const p = await resolvePlan({ email: "a@b.vn" }, { fetchImpl: async () => { called = true; return ok("speak"); } });
  assert.equal(p, "free"); assert.equal(called, false);
});

test("entitlement: reads WriteRight, sends the secret, caches for a minute", async () => {
  process.env.WRITERIGHT_URL = "https://wr.test/"; process.env.PRECISELY_ENTITLEMENT_SECRET = "s3"; _clearCache();
  let calls = 0, seen;
  const f = async (url, init) => { calls++; seen = { url, key: init.headers["x-unicoach-key"] }; return ok("speak_plus"); };
  assert.equal(await resolvePlan({ email: "A_B@x.vn" }, { fetchImpl: f, now: 1000 }), "speak_plus");
  assert.equal(seen.url, "https://wr.test/api/entitlement?email=a_b%40x.vn");
  assert.equal(seen.key, "s3");
  await resolvePlan({ email: "a_b@x.vn" }, { fetchImpl: f, now: 30000 });
  assert.equal(calls, 1);
});

test("entitlement: garbage plan from server → free", async () => {
  _clearCache();
  assert.equal(await resolvePlan({ email: "g@x.vn" }, { fetchImpl: async () => ok("unlimited") }), "free");
});

test("entitlement: outage → last known answer, else speak (paying learner not locked out)", async () => {
  _clearCache();
  await resolvePlan({ email: "c@x.vn" }, { fetchImpl: async () => ok("speak_plus"), now: 0 });
  const down = async () => { throw new Error("ECONNRESET"); };
  assert.equal(await resolvePlan({ email: "c@x.vn" }, { fetchImpl: down, now: 120000 }), "speak_plus");
  assert.equal(await resolvePlan({ email: "new@x.vn" }, { fetchImpl: down, now: 120000 }), "speak");
});

test("overrides win and ignore invalid plans", async () => {
  process.env.PRECISELY_PLAN_OVERRIDES = "beta@x.vn:speak_plus, bad@x.vn:unlimited";
  _clearCache();
  assert.equal(await resolvePlan({ email: "Beta@x.vn" }, { fetchImpl: async () => ok("free") }), "speak_plus");
  assert.equal(parseOverrides().has("bad@x.vn"), false);
  delete process.env.PRECISELY_PLAN_OVERRIDES;
});

test("no email → free", async () => {
  assert.equal(await resolvePlan({ sub: "x" }), "free");
});
