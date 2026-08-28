"""
Comprehensive Acceptance Verification Script (Section 12 Checklist)
Validates all Section 12 criteria against the live running application.
"""

import sys
import time
import httpx

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_URL = "http://127.0.0.1:8000"

def run_acceptance_checklist():
    print("\n========================================================")
    print("[TEST] RUNNING PS-02 ACCEPTANCE CHECKLIST VERIFICATION")
    print("========================================================\n")
    
    passed = 0
    total = 0

    def check(desc, assertion):
        nonlocal passed, total
        total += 1
        try:
            assertion()
            print(f"  [PASS] {desc}")
            passed += 1
        except Exception as e:
            print(f"  [FAIL] {desc}")
            print(f"     Error: {e}")

    with httpx.Client(base_url=BASE_URL, timeout=5.0) as client:

        # 1. Frontend Index & Static Assets
        def test_frontend_assets():
            resp = client.get("/")
            assert resp.status_code == 200, f"Status: {resp.status_code}"
            html = resp.text
            assert "Smart Krishi" in html
            assert "tab-btn-advisory" in html
            assert "tab-btn-mandi" in html
            assert "tab-btn-alerts" in html
            assert "tab-btn-schemes" in html
            assert "slider-w-rain" in html
            assert "slider-w-vuln" in html
            assert "btn-mode-assisted" in html
            
            resp_js = client.get("/static/app.js")
            assert resp_js.status_code == 200
            resp_css = client.get("/static/styles.css")
            assert resp_css.status_code == 200
        check("Frontend HTML & Static assets load successfully with all required IDs", test_frontend_assets)

        # 2. Advisory speed <= 2 seconds for any farmer
        def test_advisory_latency():
            farmers_res = client.get("/api/farmers")
            assert farmers_res.status_code == 200
            farmers = farmers_res.json()
            for f in farmers:
                t0 = time.time()
                res = client.get(f"/api/farmers/{f['id']}/advisory")
                duration = time.time() - t0
                assert res.status_code == 200
                assert duration < 2.0, f"Advisory for {f['id']} took {duration}s"
        check("Can select any seeded farmer and get an advisory in <= 2 seconds", test_advisory_latency)

        # 3. Delayed-onset contingency switch (Sunita Shinde F2)
        def test_contingency_switch():
            res = client.get("/api/farmers/F2/advisory")
            assert res.status_code == 200
            data = res.json()
            assert data["rule_id"] == "R-10", f"Expected R-10, got {data['rule_id']}"
            assert data["action_type"] == "contingency_crop_switch"
            assert len(data["contingency_crops"]) > 0
            assert any("Pearl Millet" in c["name"] or "Pigeonpea" in c["name"] for c in data["contingency_crops"])
        check("At least one delayed-onset farmer (Sunita F2) receives a contingency crop switch", test_contingency_switch)

        # 4. Harvest stage Mandi Price < MSP override (Ramesh Patil F1)
        def test_market_intervention_override():
            res = client.get("/api/farmers/F1/advisory")
            assert res.status_code == 200
            data = res.json()
            assert data["rule_id"] == "R-30", f"Expected R-30, got {data['rule_id']}"
            assert data["action_type"] == "market_intervention"
            assert data["price_data"]["is_below_msp"] is True
            assert "below the Govt MSP" in data["text"]["en"]
            assert "सरकारी समर्थन मूल्य" in data["text"]["hi"]
        check("At least one harvest-stage farmer where Mandi Price < MSP receives 'market_intervention' advisory (R-30) instead of agronomy advice", test_market_intervention_override)

        # 5. Distress scorer incorporates historical_vulnerability_index
        def test_distress_vulnerability_incorporation():
            res = client.post("/api/farmers/F1/distress")
            assert res.status_code == 200
            data = res.json()
            assert "vulnerability_points" in data["points_breakdown"]
            assert data["raw_components"]["V"] == 85.0
            assert data["points_breakdown"]["vulnerability_points"] > 0
        check("Distress scorer correctly incorporates the historical_vulnerability_index", test_distress_vulnerability_incorporation)

        # 6. Officer Dashboard displays Recommended Scheme
        def test_officer_scheme_recommendation():
            res = client.post("/api/officer/farmers")
            assert res.status_code == 200
            data = res.json()
            farmers = data["farmers"]
            for f in farmers:
                assert f["primary_recommended_scheme"] is not None
                assert len(f["recommended_interventions"]) > 0
            # Ramesh should get PM-AASHA (S3) or KCC (S2)
            ramesh = next(f for f in farmers if f["farmer_id"] == "F1")
            assert any(i["scheme_id"] == "S3" for i in ramesh["recommended_interventions"])
        check("Officer Dashboard displays a 'Recommended Scheme' for high/medium risk farmers based on top distress signal", test_officer_scheme_recommendation)

        # 7. Assisted Mode toggle & pre-selection based on tech_literacy / device_type
        def test_assisted_mode_preselection():
            res = client.get("/api/farmers")
            farmers = res.json()
            ramesh = next(f for f in farmers if f["id"] == "F1")
            assert ramesh["tech_literacy"] == "low"
            assert ramesh["device_type"] == "feature_phone"
            assert ramesh["default_ui_mode"] == "assisted"

            anil = next(f for f in farmers if f["id"] == "F4")
            assert anil["tech_literacy"] == "high"
            assert anil["device_type"] == "smartphone"
            assert anil["default_ui_mode"] == "self"
        check("Farmer App has 'Assisted Mode' toggle and pre-selects correctly based on tech_literacy/device_type", test_assisted_mode_preselection)

        # 8. getRecommendedChannel returns ivr_or_sms vs in_app_voice_and_text
        def test_channel_routing():
            res = client.get("/api/farmers")
            farmers = res.json()
            ramesh = next(f for f in farmers if f["id"] == "F1")
            assert ramesh["recommended_channel"] == "ivr_or_sms"
            anil = next(f for f in farmers if f["id"] == "F4")
            assert anil["recommended_channel"] == "in_app_voice_and_text"
        check("getRecommendedChannel returns 'ivr_or_sms' for feature-phone/poor-network and 'in_app_voice_and_text' for smartphone", test_channel_routing)

        # 9. MSP-relative formula for price term P
        def test_msp_price_term():
            res = client.post("/api/farmers/F1/distress")
            data = res.json()
            # Onion MSP = 1500, Price = 1100 -> shortfall = (400/1500)*100 = 26.67%
            assert abs(data["raw_components"]["P"] - 26.7) < 0.2
        check("Distress scorer's price term (P) uses MSP-relative formula whenever an MSP exists", test_msp_price_term)

        # 10. High vulnerability alone triggers State Drought Relief (S4)
        def test_vulnerability_scheme_trigger():
            res = client.post("/api/farmers/F3/distress")
            data = res.json()
            # Ganesh F3 has normal weather and price above MSP, but V=92 in Vidarbha
            s4 = next((i for i in data["recommended_interventions"] if i["scheme_id"] == "S4"), None)
            assert s4 is not None, "Ganesh must receive State Drought Relief S4 due to high district vulnerability"
            assert "Structural District Fragility" in s4["trigger"]
        check("High-historical_vulnerability_index farmer with normal rainfall/price (Ganesh F3) still surfaces State Drought Relief (S4)", test_vulnerability_scheme_trigger)

        # 11. Ethical check: fragility index never exposed in farmer-facing payload
        def test_ethical_fragility_isolation():
            res = client.get("/api/farmers/F1")
            data = res.json()
            # District details in farmer query must NOT leak historical_vulnerability_index
            assert "historical_vulnerability_index" not in data.get("district_details", {})
            adv_res = client.get("/api/farmers/F1/advisory")
            adv_data = adv_res.json()
            assert "historical_vulnerability_index" not in str(adv_data)
            assert "fragility" not in str(adv_data).lower()
        check("historical_vulnerability_index / District Fragility Index never appears in farmer-facing payload", test_ethical_fragility_isolation)

        # 12. Dynamic weight slider re-ranking
        def test_slider_reranking():
            # Standard weights
            res_std = client.post("/api/officer/farmers", json={"rainfall": 0.35, "price": 0.30, "loan": 0.20, "vulnerability": 0.15})
            farmers_std = res_std.json()["farmers"]
            top_std = farmers_std[0]["farmer_id"]

            # Weight 100% on rainfall
            res_rain = client.post("/api/officer/farmers", json={"rainfall": 1.0, "price": 0.0, "loan": 0.0, "vulnerability": 0.0})
            farmers_rain = res_rain.json()["farmers"]
            # Farmer with biggest rainfall deficit should be #1 (Sunita F2 has -50% deficit)
            assert farmers_rain[0]["farmer_id"] == "F2"

            # Weight 100% on vulnerability
            res_vuln = client.post("/api/officer/farmers", json={"rainfall": 0.0, "price": 0.0, "loan": 0.0, "vulnerability": 1.0})
            farmers_vuln = res_vuln.json()["farmers"]
            # Vidarbha farmers have V=92 (F2, F3, F6)
            assert farmers_vuln[0]["distress_score"] == 92.0
        check("Changing weight sliders visibly re-ranks the officer list dynamically", test_slider_reranking)

    print(f"\n========================================================")
    print(f"[RESULTS] ACCEPTANCE RESULTS: {passed} / {total} Checklist Items Verified")
    print(f"========================================================\n")
    return passed == total

if __name__ == "__main__":
    success = run_acceptance_checklist()
    if not success:
        exit(1)
