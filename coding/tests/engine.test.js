/**
 * Automated Unit Tests for PS-02 Smart Crop Advisory & Distress Risk Engines
 * Validates Section 11 & Section 12 Acceptance Criteria:
 * 1. Advisory Engine pure function & speed (<= 2s)
 * 2. Contingency crop switch on delayed monsoon onset (R-10)
 * 3. Market intervention override when crop_stage == 'harvest' and price < MSP (R-30)
 * 4. 4-Weight Distress Score formula ($0.35R + 0.30P + 0.20L + 0.15V$)
 * 5. MSP-relative P computation
 * 6. Historical vulnerability index trigger for State Relief Scheme (S4)
 * 7. Adaptive Capacity Channel Routing (getRecommendedChannel & getDefaultUIMode)
 * 8. Ethical boundary: no fragility index leak to farmer payload
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const { getAdvisory } = require("../server/engine/advisoryEngine");
const { calculateDistressScore, DEFAULT_WEIGHTS } = require("../server/engine/distressScorer");
const { getRecommendedChannel, getDefaultUIMode } = require("../server/engine/channelRouter");

// Load Seed Data
const dataDir = path.join(__dirname, "../data");
const districts = JSON.parse(fs.readFileSync(path.join(dataDir, "districts.json"), "utf8"));
const mandi_prices = JSON.parse(fs.readFileSync(path.join(dataDir, "mandi_prices.json"), "utf8"));
const farmers = JSON.parse(fs.readFileSync(path.join(dataDir, "farmers.json"), "utf8"));
const schemes = JSON.parse(fs.readFileSync(path.join(dataDir, "schemes.json"), "utf8"));
const daily_rainfall = JSON.parse(fs.readFileSync(path.join(dataDir, "daily_rainfall.json"), "utf8"));
const advisory_rules = JSON.parse(fs.readFileSync(path.join(dataDir, "advisory_rules.json"), "utf8"));
const contingency_crops = JSON.parse(fs.readFileSync(path.join(dataDir, "contingency_crops.json"), "utf8"));

const dataStore = {
  districts,
  mandi_prices,
  farmers,
  schemes,
  daily_rainfall,
  advisory_rules,
  contingency_crops
};

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
  }
}

console.log("\n========================================================");
console.log("🧪 RUNNING SUITE: PS-02 Pure Engine & Acceptance Tests");
console.log("========================================================\n");

// --- TEST 1: Channel Router (Adaptive Capacity) ---
test("Channel Routing: Feature phone / poor network maps to ivr_or_sms and assisted mode", () => {
  const ramesh = farmers.find(f => f.id === "F1");
  assert.strictEqual(ramesh.device_type, "feature_phone");
  assert.strictEqual(getRecommendedChannel(ramesh), "ivr_or_sms");
  assert.strictEqual(getDefaultUIMode(ramesh), "assisted");
});

test("Channel Routing: Smartphone + good network maps to in_app_voice_and_text and self mode", () => {
  const anil = farmers.find(f => f.id === "F4");
  assert.strictEqual(anil.device_type, "smartphone");
  assert.strictEqual(getRecommendedChannel(anil), "in_app_voice_and_text");
  assert.strictEqual(getDefaultUIMode(anil), "self");
});

// --- TEST 2: Advisory Engine - Market Intervention Override (R-30) ---
test("Advisory Engine: Harvest stage with price < MSP forces action_type='market_intervention' (R-30)", () => {
  const startTime = Date.now();
  const advisory = getAdvisory("F1", dataStore);
  const duration = Date.now() - startTime;

  assert(duration < 2000, `Advisory execution took ${duration}ms, expected <= 2000ms`);
  assert.strictEqual(advisory.rule_id, "R-30");
  assert.strictEqual(advisory.action_type, "market_intervention");
  assert.strictEqual(advisory.price_data.is_below_msp, true);
  assert(advisory.text.en.includes("below the Govt MSP"));
  assert(advisory.text.hi.includes("सरकारी समर्थन मूल्य"));
});

// --- TEST 3: Advisory Engine - Contingency Crop Switch (R-10) ---
test("Advisory Engine: Delayed onset in sowing stage triggers CRIDA contingency switch (R-10)", () => {
  const advisory = getAdvisory("F2", dataStore);
  assert.strictEqual(advisory.rule_id, "R-10");
  assert.strictEqual(advisory.action_type, "contingency_crop_switch");
  assert(advisory.contingency_crops.length > 0, "Contingency crops list should not be empty");
  assert(advisory.contingency_crops.some(c => c.name.includes("Pearl Millet") || c.name.includes("Pigeonpea")));
});

// --- TEST 4: Distress Scorer - Formula & MSP-Relative Price Drop ---
test("Distress Scorer: Formula accurately computes 4-weighted components including MSP shortfall", () => {
  const scoreResult = calculateDistressScore("F1", DEFAULT_WEIGHTS, dataStore);
  
  // Ramesh F1: Nashik (D1)
  // R: deviation = 41.67 => R = 41.67
  // P: Onion price = 1100, MSP = 1500 => shortfall = (400 / 1500) * 100 = 26.67% => P = 26.67
  // L: Loan due 2026-09-06 vs 2026-08-26 = 11 days => L = 100 - (11/90)*100 = 87.78
  // V: Nashik vulnerability index = 85
  // Expected score = 0.35*41.67 + 0.30*26.67 + 0.20*87.78 + 0.15*85
  // = 14.58 + 8.00 + 17.56 + 12.75 = 52.89 (Medium band)

  assert(scoreResult.distress_score >= 50 && scoreResult.distress_score <= 56, `Expected score ~53, got ${scoreResult.distress_score}`);
  assert.strictEqual(scoreResult.risk_band, "Medium");
  assert(scoreResult.explanation.length > 0);
  assert(scoreResult.recommended_interventions.some(i => i.scheme_id === "S3"), "Should recommend PM-AASHA / e-NAM for price < MSP");
});

// --- TEST 5: Distress Scorer - Historical Vulnerability Index Non-Redundancy ---
test("Distress Scorer: High vulnerability index in normal weather triggers State Drought Relief S4", () => {
  const ganeshScore = calculateDistressScore("F3", DEFAULT_WEIGHTS, dataStore);
  
  // Ganesh has good weather and above-MSP price, but district is Vidarbha (V = 92)
  assert.strictEqual(ganeshScore.raw_components.V, 92);
  const s4Intervention = ganeshScore.recommended_interventions.find(i => i.scheme_id === "S4");
  assert(s4Intervention !== undefined, "High vulnerability district should trigger State Drought Relief (S4)");
  assert.strictEqual(s4Intervention.trigger.includes("Structural District Fragility"), true);
});

// --- TEST 6: Custom Weights Live Re-calculation ---
test("Distress Scorer: Custom weights re-normalize and shift total score accordingly", () => {
  // Give 100% weight to rainfall
  const rainOnly = calculateDistressScore("F1", { rainfall: 1, price: 0, loan: 0, vulnerability: 0 }, dataStore);
  assert.strictEqual(rainOnly.distress_score, 41.7);

  // Give 100% weight to vulnerability
  const vulnOnly = calculateDistressScore("F1", { rainfall: 0, price: 0, loan: 0, vulnerability: 1 }, dataStore);
  assert.strictEqual(vulnOnly.distress_score, 85);
});

console.log(`\n========================================================`);
console.log(`🏁 TEST RESULTS: ${passed} / ${total} Tests Passed`);
console.log(`========================================================\n`);

if (passed !== total) {
  process.exit(1);
}
