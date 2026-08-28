"""
Module B: Distress-Risk Scorer — ICAR-CRIDA FDI Framework (Python)
================================================================
Upgraded from a 4-factor ad-hoc model to the institutionally-aligned
6-dimension Farmers' Distress Index (FDI) published by:

  Reddy et al. (2021), "Development of Farmers' Distress Index",
  ICAR-Central Research Institute for Dryland Agriculture, Land, MDPI.

Six Dimensions:
  1. Exposure to Risk       (E)   — 25% weight
  2. Sensitivity            (S)   — 15% weight
  3. Adaptive Capacity      (AC)  — 15% weight (entered as 100 - AC, inverted risk)
  4. Mitigation Deficit     (M)   — 15% weight
  5. Trigger Shock          (T)   — 20% weight
  6. District Fragility     (DF)  — 10% weight

Formula:
  Score = w_E·E + w_S·S + w_AC·(100-AC) + w_M·M + w_T·T + w_DF·DF

Scheme Mapping (unchanged — triggers now map to CRIDA dimensions):
  E > 30  → PMFBY (rainfall) + PM-AASHA (price)
  S > 70  → Watershed / Micro-Irrigation Subsidy (S4 extension)
  AC < 40 → State Drought Relief / PM-KISAN DBT
  M > 50  → PMFBY enrollment (uninsured) + KCC application (no credit)
  T > 60  → KCC Debt Restructuring (S2) + PM-KISAN (S5)
  DF >= 80 → State Drought Relief Package (S4)
"""

from datetime import datetime

DEFAULT_WEIGHTS = {
    "exposure": 0.25,
    "sensitivity": 0.15,
    "adaptive_capacity": 0.15,
    "mitigation_deficit": 0.15,
    "trigger": 0.20,
    "district_fragility": 0.10
}

REFERENCE_DATE = "2026-08-26"


def _days_until_due(due_date_str: str, ref_date_str: str = REFERENCE_DATE) -> int:
    """Returns days remaining until loan due date, minimum 0."""
    if not due_date_str:
        return 90
    try:
        due = datetime.strptime(due_date_str, "%Y-%m-%d")
        ref = datetime.strptime(ref_date_str, "%Y-%m-%d")
        return max(0, (due - ref).days)
    except Exception:
        return 90


def _compute_exposure(farmer: dict, weather: dict, mandi_price: dict) -> tuple[float, float, float]:
    """
    E (Exposure to Risk) — Dimension 1
    Combines:
      • Climatic Hazard  : |Rainfall Deviation %| capped at 100
      • Price Shock      : MSP-relative shortfall (0 if price ≥ MSP)

    E = 0.50 × rainfall_component + 0.50 × price_component
    Returns: (E, rainfall_component, price_component)
    """
    rainfall_dev_pct = float(weather.get("rainfall_deviation_pct", 0))
    rain_comp = min(abs(rainfall_dev_pct), 100.0)

    current_price = float(mandi_price.get("price_per_quintal", 0))
    msp = float(mandi_price.get("govt_msp_per_quintal", 0))
    recent_avg = float(mandi_price.get("recent_avg_price", 0))

    if msp > 0 and current_price < msp:
        price_comp = min((msp - current_price) / msp * 100.0, 100.0)
    elif recent_avg > 0 and current_price < recent_avg:
        price_comp = min((recent_avg - current_price) / recent_avg * 100.0, 100.0)
    else:
        price_comp = 0.0

    E = 0.50 * rain_comp + 0.50 * price_comp
    return round(E, 1), round(rain_comp, 1), round(price_comp, 1)


def _compute_sensitivity(farmer: dict, weather: dict) -> float:
    """
    S (Sensitivity) — Dimension 2
    Driven by irrigation source and borewell reliability:
      • rainfed OR borewell_failed=True  → S = 90  (critically exposed)
      • partially irrigated (well)        → S = 50
      • canal / assured irrigation        → S = 15

    CRIDA also factors in ongoing dry spell severity — we apply an
    additive bonus of up to +10 for prolonged (>14-day) dry spells.
    """
    irrigation_type = farmer.get("irrigation_type", "rainfed")
    borewell_failed = farmer.get("borewell_failed", False)

    if irrigation_type == "rainfed" or borewell_failed:
        S = 90.0
    elif irrigation_type in ("protective_well", "mixed"):
        S = 50.0
    elif irrigation_type == "canal":
        S = 15.0
    else:
        S = 50.0  # conservative default

    # Dry-spell severity bonus
    dry_days = int(weather.get("dry_spell_days", 0))
    if dry_days > 14:
        S = min(100.0, S + 10.0)

    return round(S, 1)


def _compute_adaptive_capacity(farmer: dict) -> tuple[float, float, float]:
    """
    AC (Adaptive Capacity) — Dimension 3 (entered as 100-AC in formula)
    Measures structural resilience buffers:
      • Landholding Scale: Marginal (<1 ha)=20, Small (1-2 ha)=50, Medium/Large (>2 ha)=80
      • Income Diversification:
          - Agriculture only             → 10
          - Agri + Allied/Livestock/Dairy → 60
          - Agri + Non-farm salaried     → 90

    AC = 0.50 × Landholding Score + 0.50 × Income Diversification Score
    Returns: (AC, landholding_score, income_score)
    """
    lh = float(farmer.get("landholding_hectares", 1.0))
    if lh < 1.0:
        land_score = 20.0
    elif lh <= 2.0:
        land_score = 50.0
    else:
        land_score = 80.0

    income_sources = farmer.get("income_sources", ["crop_cultivation"])
    has_non_farm = any(s in income_sources for s in ("non_farm_salary", "government_job", "remittance"))
    has_allied = any(s in income_sources for s in ("dairy", "livestock", "poultry", "fishery", "allied"))

    if has_non_farm:
        income_score = 90.0
    elif has_allied:
        income_score = 60.0
    else:
        income_score = 10.0

    AC = round(0.50 * land_score + 0.50 * income_score, 1)
    return AC, round(land_score, 1), round(income_score, 1)


def _compute_mitigation_deficit(farmer: dict) -> tuple[float, float]:
    """
    M (Mitigation Deficit) — Dimension 4
    Evaluates access to institutional safety nets:
      • PMFBY crop insurance  → 50 protection points
      • Kisan Credit Card     → 50 protection points

    M = 100 − protection_score
    Returns: (M, protection_score)
    """
    has_pmfby = bool(farmer.get("has_pmfby_insurance", False))
    has_kcc = bool(farmer.get("has_kcc", False))

    protection_score = (50.0 if has_pmfby else 0.0) + (50.0 if has_kcc else 0.0)
    M = 100.0 - protection_score
    return round(M, 1), round(protection_score, 1)


def _compute_trigger(farmer: dict) -> tuple[float, float, float]:
    """
    T (Trigger Shock) — Dimension 5
    Combines loan repayment pressure with informal debt burden:
      Loan urgency  = 100 - min(100, days_to_due / 90 × 100)
      Informal debt = 100 if farmer.informal_debt else 0

    T = 0.60 × loan_urgency + 0.40 × informal_debt_score
    Returns: (T, loan_urgency, informal_shock)
    """
    days_to_due = _days_until_due(farmer.get("loan_due_date"), REFERENCE_DATE)
    loan_urgency = max(0.0, 100.0 - min(100.0, (days_to_due / 90.0) * 100.0))

    informal_shock = 100.0 if farmer.get("informal_debt", False) else 0.0

    T = round(0.60 * loan_urgency + 0.40 * informal_shock, 1)
    return T, round(loan_urgency, 1), round(informal_shock, 1)


def calculate_distress_score(farmer_id: str, custom_weights: dict = None, data: dict = None) -> dict:
    """
    Computes the ICAR-CRIDA 6-Dimension Farmers' Distress Index (FDI) for a farmer.
    Maps active stress dimensions directly to actionable Government Scheme interventions.
    """
    if custom_weights is None:
        custom_weights = {}
    if data is None:
        data = {}

    farmers = data.get("farmers", [])
    districts = data.get("districts", [])
    mandi_prices = data.get("mandi_prices", [])
    daily_rainfall = data.get("daily_rainfall", [])
    schemes = data.get("schemes", [])

    farmer = next((f for f in farmers if f["id"] == farmer_id), None)
    if not farmer:
        raise ValueError(f"Farmer with id {farmer_id} not found")

    district = next((d for d in districts if d["id"] == farmer["district_id"]), {
        "id": farmer["district_id"], "name": farmer["district_id"],
        "historical_vulnerability_index": 50, "soil_type": "Loamy Soil"
    })

    weather = next((w for w in daily_rainfall if w["district_id"] == farmer["district_id"]), {
        "rainfall_deviation_pct": 0, "dry_spell_days": 0,
        "onset_status": "normal", "onset_delay_days": 0
    })

    crop_name = farmer.get("crop", "").lower()
    mandi_price = next(
        (p for p in mandi_prices if p["district_id"] == farmer["district_id"] and p["crop"].lower() == crop_name),
        {"price_per_quintal": 0, "govt_msp_per_quintal": 0, "recent_avg_price": 0}
    )

    # ── Resolve & normalize weights ─────────────────────────────────────────
    raw = {
        "exposure":           float(custom_weights.get("exposure",           DEFAULT_WEIGHTS["exposure"])),
        "sensitivity":        float(custom_weights.get("sensitivity",        DEFAULT_WEIGHTS["sensitivity"])),
        "adaptive_capacity":  float(custom_weights.get("adaptive_capacity",  DEFAULT_WEIGHTS["adaptive_capacity"])),
        "mitigation_deficit": float(custom_weights.get("mitigation_deficit", DEFAULT_WEIGHTS["mitigation_deficit"])),
        "trigger":            float(custom_weights.get("trigger",            DEFAULT_WEIGHTS["trigger"])),
        "district_fragility": float(custom_weights.get("district_fragility", DEFAULT_WEIGHTS["district_fragility"])),
    }
    total_w = sum(raw.values())
    weights = {k: v / total_w for k, v in raw.items()} if total_w > 0 else dict(DEFAULT_WEIGHTS)

    # ── Dimension Computation ────────────────────────────────────────────────
    E, rain_comp, price_comp = _compute_exposure(farmer, weather, mandi_price)
    S = _compute_sensitivity(farmer, weather)
    AC, land_score, income_score = _compute_adaptive_capacity(farmer)
    AC_risk = round(100.0 - AC, 1)
    M, protection_score = _compute_mitigation_deficit(farmer)
    T, loan_urgency, informal_shock = _compute_trigger(farmer)
    DF = float(min(100.0, max(0.0, district.get("historical_vulnerability_index", 50))))

    # ── Composite Score ──────────────────────────────────────────────────────
    pts_E  = weights["exposure"]           * E
    pts_S  = weights["sensitivity"]        * S
    pts_AC = weights["adaptive_capacity"]  * AC_risk
    pts_M  = weights["mitigation_deficit"] * M
    pts_T  = weights["trigger"]            * T
    pts_DF = weights["district_fragility"] * DF

    total_score = min(100.0, max(0.0, pts_E + pts_S + pts_AC + pts_M + pts_T + pts_DF))
    rounded_score = round(total_score, 1)

    # ── Risk Band ────────────────────────────────────────────────────────────
    if rounded_score >= 71.0:
        band, band_color = "High", "red"
    elif rounded_score >= 41.0:
        band, band_color = "Medium", "amber"
    else:
        band, band_color = "Low", "green"

    # ── Top Contributing Signal ──────────────────────────────────────────────
    crop_display = farmer["crop"].capitalize()
    factor_contributions = [
        {"name": "Exposure (Climate & Price)",    "signal": "exposure",           "points": pts_E,  "raw": E,       "label": f"Climate/price exposure: rain {rain_comp:.0f}%, price drop {price_comp:.0f}%"},
        {"name": "Sensitivity (Irrigation)",       "signal": "sensitivity",        "points": pts_S,  "raw": S,       "label": f"Irrigation sensitivity: {farmer.get('irrigation_type','rainfed')} ({'borewell failed' if farmer.get('borewell_failed') else 'functioning'})"},
        {"name": "Low Adaptive Capacity",          "signal": "adaptive_capacity",  "points": pts_AC, "raw": AC_risk, "label": f"Low resilience: {farmer.get('landholding_hectares',1.0)} ha, {len(farmer.get('income_sources',[]))} income source(s)"},
        {"name": "Mitigation Deficit",             "signal": "mitigation_deficit", "points": pts_M,  "raw": M,       "label": f"Scheme protection deficit: {'No PMFBY' if not farmer.get('has_pmfby_insurance') else 'PMFBY active'}, {'No KCC' if not farmer.get('has_kcc') else 'KCC active'}"},
        {"name": "Trigger / Debt Shock",           "signal": "trigger",            "points": pts_T,  "raw": T,       "label": f"Loan urgency + {'informal debt' if farmer.get('informal_debt') else 'no informal debt'}"},
        {"name": "District Fragility",             "signal": "district_fragility", "points": pts_DF, "raw": DF,      "label": "District has a history of agrarian distress — treat as elevated-priority context"},
    ]
    factor_contributions.sort(key=lambda x: x["points"], reverse=True)
    top_signal = factor_contributions[0]

    # ── Explanation List ─────────────────────────────────────────────────────
    explanation = []
    days_to_due = _days_until_due(farmer.get("loan_due_date"), REFERENCE_DATE)

    if E > 25:
        explanation.append(f"High Exposure: rain deficit {rain_comp:.1f}%, {crop_display} price drop {price_comp:.1f}% vs MSP ({pts_E:.1f} pts)")
    if S >= 70:
        irr = farmer.get("irrigation_type", "rainfed")
        explanation.append(f"High Sensitivity: {irr}/borewell failure — 100% dependent on monsoon ({pts_S:.1f} pts)")
    if AC_risk > 55:
        explanation.append(f"Low Adaptive Capacity: {farmer.get('landholding_hectares',1.0)} ha marginal holding, single income source ({pts_AC:.1f} pts)")
    if M >= 50:
        missing = []
        if not farmer.get("has_pmfby_insurance"): missing.append("PMFBY")
        if not farmer.get("has_kcc"): missing.append("KCC")
        explanation.append(f"Mitigation Deficit: Unprotected — missing {', '.join(missing)} ({pts_M:.1f} pts)")
    if T > 50:
        explanation.append(f"Trigger Shock: Loan due in {days_to_due} days{'+ informal moneylender debt' if farmer.get('informal_debt') else ''} ({pts_T:.1f} pts)")
    if DF >= 50:
        explanation.append(f"District has a history of agrarian distress — treat as elevated-priority context ({pts_DF:.1f} pts)")

    if not explanation:
        explanation.append("All six CRIDA distress dimensions currently within stable thresholds.")

    # ── Government Scheme Recommendations ────────────────────────────────────
    recommended_interventions = []

    # Dimension 1 — Exposure: Rainfall → PMFBY (S1); Price < MSP → PM-AASHA (S3)
    dry_spell = int(weather.get("dry_spell_days", 0))
    onset_delay = int(weather.get("onset_delay_days", 0))
    if rain_comp >= 25 or dry_spell >= 10 or onset_delay > 15:
        s1 = next((s for s in schemes if s["scheme_id"] == "S1"), None)
        if s1:
            recommended_interventions.append({
                "scheme_id": "S1", "scheme_name": s1["name"],
                "trigger": f"Exposure: Rainfall {rain_comp:.0f}% deficit / Dry spell {dry_spell} days",
                "action_item": "Issue PMFBY localized crop loss claim form & initiate block-level survey within 72 hrs",
                "crida_dimension": "Exposure (E)", "urgency": "HIGH"
            })

    current_price = float(mandi_price.get("price_per_quintal", 0))
    msp_val = float(mandi_price.get("govt_msp_per_quintal", 0))
    if price_comp >= 5 or (farmer.get("crop_stage") == "harvest" and msp_val > 0 and current_price < msp_val):
        s3 = next((s for s in schemes if s["scheme_id"] == "S3"), None)
        if s3:
            recommended_interventions.append({
                "scheme_id": "S3", "scheme_name": s3["name"],
                "trigger": f"Exposure: Mandi price below MSP by {price_comp:.1f}%",
                "action_item": "Facilitate e-NAM APMC MSP procurement enrollment or WDRA warehouse pledge loan",
                "crida_dimension": "Exposure (E)", "urgency": "CRITICAL"
            })

    # Dimension 2 — Sensitivity: S > 70 → Micro-Irrigation / Watershed Subsidy (via S4 extension)
    if S >= 70:
        recommended_interventions.append({
            "scheme_id": "S4-EXT",
            "scheme_name": "Micro-Irrigation / Watershed Development Subsidy (PMKSY-PDMC)",
            "trigger": f"Sensitivity: {farmer.get('irrigation_type','rainfed')} with high groundwater stress",
            "action_item": "Submit PMKSY-PDMC application for drip/sprinkler installation subsidy",
            "crida_dimension": "Sensitivity (S)", "urgency": "HIGH"
        })

    # Dimension 3 — Low Adaptive Capacity: AC_risk > 70 → State Drought Relief + PM-KISAN
    if AC_risk > 70:
        s4 = next((s for s in schemes if s["scheme_id"] == "S4"), None)
        if s4:
            recommended_interventions.append({
                "scheme_id": "S4", "scheme_name": s4["name"],
                "trigger": "Adaptive Capacity Deficit: Marginal farmer with no income diversification",
                "action_item": "Enroll in State Special Drought Relief Package for input & electricity tariff subsidies",
                "crida_dimension": "Adaptive Capacity (AC)", "urgency": "HIGH"
            })

    # Dimension 4 — Mitigation Deficit: No PMFBY → Enroll; No KCC → Apply
    if not farmer.get("has_pmfby_insurance") and M >= 50:
        recommended_interventions.append({
            "scheme_id": "S1-ENROLL",
            "scheme_name": "PMFBY Enrollment (Uninsured Farmer)",
            "trigger": "Mitigation Deficit: Farmer has NO active PMFBY crop insurance",
            "action_item": "Immediately enroll in PMFBY for ongoing Kharif season at nearest CSC / bank branch",
            "crida_dimension": "Mitigation Deficit (M)", "urgency": "CRITICAL"
        })

    # Dimension 5 — Trigger: Loan due ≤ 45 days → KCC restructuring (S2) + PM-KISAN (S5)
    if days_to_due <= 45 or informal_shock > 0:
        s2 = next((s for s in schemes if s["scheme_id"] == "S2"), None)
        if s2:
            recommended_interventions.append({
                "scheme_id": "S2", "scheme_name": s2["name"],
                "trigger": f"Trigger: Loan repayment in {days_to_due} days {'+ informal moneylender exposure' if farmer.get('informal_debt') else ''}",
                "action_item": "Submit KCC rescheduling request; counsel farmer on Aadhaar-linked bank linkage to exit informal debt",
                "crida_dimension": "Trigger (T)", "urgency": "CRITICAL" if days_to_due <= 15 else "MEDIUM"
            })
        s5 = next((s for s in schemes if s["scheme_id"] == "S5"), None)
        if s5:
            recommended_interventions.append({
                "scheme_id": "S5", "scheme_name": s5["name"],
                "trigger": "Short-Term Cashflow Constraint",
                "action_item": "Verify PM-KISAN DBT installment status for immediate ₹2,000 liquidity injection",
                "crida_dimension": "Trigger (T)", "urgency": "MEDIUM"
            })

    # Dimension 6 — District Fragility: DF ≥ 80 → State Special Relief (S4)
    if DF >= 80:
        existing_s4 = any(i["scheme_id"] == "S4" for i in recommended_interventions)
        if not existing_s4:
            s4 = next((s for s in schemes if s["scheme_id"] == "S4"), None)
            if s4:
                recommended_interventions.append({
                    "scheme_id": "S4", "scheme_name": s4["name"],
                    "trigger": "District Fragility: High historical agrarian crisis district (DF ≥ 80)",
                    "action_item": "Enroll in State Special Drought Relief Package for input & electricity tariff subsidies",
                    "crida_dimension": "District Fragility (DF)", "urgency": "HIGH"
                })

    # Fallback
    if not recommended_interventions:
        s1 = next((s for s in schemes if s["scheme_id"] == "S1"), None)
        if s1:
            recommended_interventions.append({
                "scheme_id": "S1", "scheme_name": s1["name"],
                "trigger": "Standard Seasonal Risk Protection",
                "action_item": "Verify ongoing PMFBY seasonal enrollment is active",
                "crida_dimension": "Exposure (E)", "urgency": "LOW"
            })

    # ── Landholding Context ──────────────────────────────────────────────────
    lh = farmer.get("landholding_hectares", 1.0)
    land_cat = "Marginal (≤1 ha)" if lh <= 1.0 else "Small (1–2 ha)" if lh <= 2.0 else "Medium/Large (>2 ha)"
    landholding_context = f"{lh} ha — {land_cat}; heightened price and weather volatility exposure."

    return {
        "farmer_id": farmer["id"],
        "farmer_name": farmer["name"],
        "district_id": district.get("id"),
        "district_name": district.get("name"),
        "crop": farmer["crop"],
        "crop_stage": farmer["crop_stage"],
        "distress_score": rounded_score,
        "risk_band": band,
        "band_color": band_color,
        "framework": "ICAR-CRIDA FDI (Reddy et al., 2021)",
        "weights_used": weights,
        "raw_dimensions": {
            "E":  E,
            "S":  S,
            "AC": AC,
            "AC_risk": AC_risk,
            "M":  M,
            "T":  T,
            "DF": DF
        },
        "sub_components": {
            "rain_component":      rain_comp,
            "price_component":     price_comp,
            "land_score":          land_score,
            "income_score":        income_score,
            "protection_score":    protection_score,
            "loan_urgency":        loan_urgency,
            "informal_shock":      informal_shock,
        },
        "points_breakdown": {
            "exposure_pts":           round(pts_E, 1),
            "sensitivity_pts":        round(pts_S, 1),
            "adaptive_capacity_pts":  round(pts_AC, 1),
            "mitigation_deficit_pts": round(pts_M, 1),
            "trigger_pts":            round(pts_T, 1),
            "district_fragility_pts": round(pts_DF, 1),
        },
        "top_contributing_signal": {
            "name":       top_signal["name"],
            "points":     round(top_signal["points"], 1),
            "label":      top_signal["label"],
            "signal_key": top_signal["signal"]
        },
        "explanation": explanation,
        "landholding_context": landholding_context,
        "structural_risk_context": {
            "district_fragility_index": int(DF),
            "soil_type": district.get("soil_type", "Loamy Soil"),
            "irrigation_type": farmer.get("irrigation_type", "rainfed"),
            "assessment": "High Historical Agrarian Crisis Sensitivity" if DF >= 80 else "Moderate Climate Sensitivity" if DF >= 50 else "High Structural Resilience"
        },
        "recommended_interventions": recommended_interventions,
        "primary_recommended_scheme": recommended_interventions[0]["scheme_name"] if recommended_interventions else "PMFBY",
        "days_until_loan_due": days_to_due
    }
