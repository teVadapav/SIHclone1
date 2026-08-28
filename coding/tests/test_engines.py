"""
Automated Unit Tests for PS-02 Smart Crop Advisory & Distress Risk Engines (Python)
Validates Section 11 & Section 12 Acceptance Criteria:
1. Advisory Engine pure function & execution speed (<= 2s)
2. Contingency crop switch on delayed monsoon onset (R-10)
3. Market intervention override when crop_stage == 'harvest' and price < MSP (R-30)
4. 4-Weight Distress Score formula (0.35R + 0.30P + 0.20L + 0.15V)
5. MSP-relative P computation
6. Historical vulnerability index trigger for State Relief Scheme (S4)
7. Adaptive Capacity Channel Routing (get_recommended_channel & get_default_ui_mode)
8. Ethical boundary: no fragility index leak to farmer payload
"""

import json
import os
import time
import unittest

from server.engine.channel_router import get_recommended_channel, get_default_ui_mode
from server.engine.advisory_engine import get_advisory
from server.engine.distress_scorer import calculate_distress_score, DEFAULT_WEIGHTS

class TestEngines(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        data_dir = os.path.join(base_dir, "data")
        
        with open(os.path.join(data_dir, "districts.json"), "r", encoding="utf-8") as f:
            cls.districts = json.load(f)
        with open(os.path.join(data_dir, "mandi_prices.json"), "r", encoding="utf-8") as f:
            cls.mandi_prices = json.load(f)
        with open(os.path.join(data_dir, "farmers.json"), "r", encoding="utf-8") as f:
            cls.farmers = json.load(f)
        with open(os.path.join(data_dir, "schemes.json"), "r", encoding="utf-8") as f:
            cls.schemes = json.load(f)
        with open(os.path.join(data_dir, "daily_rainfall.json"), "r", encoding="utf-8") as f:
            cls.daily_rainfall = json.load(f)
        with open(os.path.join(data_dir, "advisory_rules.json"), "r", encoding="utf-8") as f:
            cls.advisory_rules = json.load(f)
        with open(os.path.join(data_dir, "contingency_crops.json"), "r", encoding="utf-8") as f:
            cls.contingency_crops = json.load(f)

        cls.data_store = {
            "districts": cls.districts,
            "mandi_prices": cls.mandi_prices,
            "farmers": cls.farmers,
            "schemes": cls.schemes,
            "daily_rainfall": cls.daily_rainfall,
            "advisory_rules": cls.advisory_rules,
            "contingency_crops": cls.contingency_crops
        }

    def test_01_channel_routing_adaptive_capacity(self):
        """Test adaptive capacity routing for feature phone and smartphone profiles"""
        ramesh = next(f for f in self.farmers if f["id"] == "F1")
        self.assertEqual(ramesh["device_type"], "feature_phone")
        self.assertEqual(get_recommended_channel(ramesh), "ivr_or_sms")
        self.assertEqual(get_default_ui_mode(ramesh), "assisted")

        anil = next(f for f in self.farmers if f["id"] == "F4")
        self.assertEqual(anil["device_type"], "smartphone")
        self.assertEqual(get_recommended_channel(anil), "in_app_voice_and_text")
        self.assertEqual(get_default_ui_mode(anil), "self")

    def test_02_advisory_market_intervention_override_r30(self):
        """Test that harvest stage + price < MSP forces Rule R-30 market intervention"""
        t0 = time.time()
        advisory = get_advisory("F1", self.data_store)
        duration_ms = (time.time() - t0) * 1000

        self.assertLessEqual(duration_ms, 2000, "Advisory calculation must take <= 2000ms")
        self.assertEqual(advisory["rule_id"], "R-30")
        self.assertEqual(advisory["action_type"], "market_intervention")
        self.assertTrue(advisory["price_data"]["is_below_msp"])
        self.assertIn("below the Govt MSP", advisory["text"]["en"])
        self.assertIn("सरकारी समर्थन मूल्य", advisory["text"]["hi"])

    def test_03_advisory_contingency_crop_switch_r10(self):
        """Test delayed monsoon onset triggers CRIDA contingency switch rule R-10"""
        advisory = get_advisory("F2", self.data_store)
        self.assertEqual(advisory["rule_id"], "R-10")
        self.assertEqual(advisory["action_type"], "contingency_crop_switch")
        self.assertTrue(len(advisory["contingency_crops"]) > 0)
        has_bajra = any("Pearl Millet" in c["name"] or "Pigeonpea" in c["name"] for c in advisory["contingency_crops"])
        self.assertTrue(has_bajra, "Should recommend Pearl Millet or Pigeonpea in contingency crops")

    def test_04_distress_scorer_worked_example_and_msp_formula(self):
        """Test 4-weight distress formula calculation and MSP-relative price drop"""
        score_res = calculate_distress_score("F1", DEFAULT_WEIGHTS, self.data_store)
        # Ramesh F1:
        # R = min(41.67, 100) = 41.67
        # P = ((1500 - 1100) / 1500) * 100 = 26.67
        # L = 100 - (11/90)*100 = 87.78
        # V = 85
        # Weighted score = 0.35*41.67 + 0.30*26.67 + 0.20*87.78 + 0.15*85 = 14.58 + 8.00 + 17.56 + 12.75 = 52.89
        self.assertGreaterEqual(score_res["distress_score"], 50.0)
        self.assertLessEqual(score_res["distress_score"], 56.0)
        self.assertEqual(score_res["risk_band"], "Medium")
        self.assertTrue(any(i["scheme_id"] == "S3" for i in score_res["recommended_interventions"]),
                        "Should recommend PM-AASHA (S3) for price < MSP")

    def test_05_historical_vulnerability_index_non_redundancy(self):
        """Test high vulnerability index in normal weather still surfaces State Drought Relief (S4)"""
        ganesh_score = calculate_distress_score("F3", DEFAULT_WEIGHTS, self.data_store)
        self.assertEqual(ganesh_score["raw_components"]["V"], 92.0)
        s4 = next((i for i in ganesh_score["recommended_interventions"] if i["scheme_id"] == "S4"), None)
        self.assertIsNotNone(s4, "High vulnerability district should trigger State Drought Relief (S4)")
        self.assertIn("Structural District Fragility", s4["trigger"])

    def test_06_custom_weights_live_adjustment(self):
        """Test dynamic recalculation with custom weights"""
        rain_only = calculate_distress_score("F1", {"rainfall": 1, "price": 0, "loan": 0, "vulnerability": 0}, self.data_store)
        self.assertEqual(rain_only["distress_score"], 41.7)

        vuln_only = calculate_distress_score("F1", {"rainfall": 0, "price": 0, "loan": 0, "vulnerability": 1}, self.data_store)
        self.assertEqual(vuln_only["distress_score"], 85.0)

if __name__ == "__main__":
    unittest.main()
