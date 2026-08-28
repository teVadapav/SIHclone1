/**
 * Module B: Distress-Risk Scorer
 * 4-Factor Weighted Model incorporating:
 * 1. Rainfall Deviation (35%)
 * 2. MSP-Relative Price Shortfall (30%)
 * 3. Loan Due Proximity (20%)
 * 4. District Fragility / Historical Vulnerability Index (15%)
 *
 * Maps active stress signals directly to actionable Government Scheme interventions (PMFBY, KCC, PM-AASHA, State Relief, PM-KISAN).
 */

const DEFAULT_WEIGHTS = {
  rainfall: 0.35,
  price: 0.30,
  loan: 0.20,
  vulnerability: 0.15
};

const REFERENCE_DATE = "2026-08-26";

/**
 * Calculates days remaining until loan due date from reference date
 * @param {string} dueDateStr 
 * @param {string} refDateStr 
 * @returns {number}
 */
function getDaysUntilDue(dueDateStr, refDateStr = REFERENCE_DATE) {
  if (!dueDateStr) return 90;
  const due = new Date(dueDateStr);
  const ref = new Date(refDateStr);
  const diffTime = due.getTime() - ref.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Calculates complete distress risk score, explanation breakdown, and scheme recommendations
 * @param {string} farmerId 
 * @param {Object} customWeights - Optional overrides for { rainfall, price, loan, vulnerability }
 * @param {Object} data - Datastore containing farmers, districts, mandi_prices, daily_rainfall, schemes
 * @returns {Object} Comprehensive distress evaluation
 */
function calculateDistressScore(farmerId, customWeights = {}, data) {
  const {
    farmers,
    districts,
    mandi_prices,
    daily_rainfall,
    schemes
  } = data;

  const farmer = farmers.find(f => f.id === farmerId);
  if (!farmer) {
    throw new Error(`Farmer with id ${farmerId} not found`);
  }

  const district = districts.find(d => d.id === farmer.district_id) || {
    id: farmer.district_id,
    name: farmer.district_id,
    historical_vulnerability_index: 50
  };

  const weather = daily_rainfall.find(w => w.district_id === farmer.district_id) || {
    rainfall_deviation_pct: 0,
    dry_spell_days: 0
  };

  const mandiPrice = mandi_prices.find(
    p => p.district_id === farmer.district_id && p.crop.toLowerCase() === farmer.crop.toLowerCase()
  ) || {
    price_per_quintal: 0,
    govt_msp_per_quintal: 0,
    recent_avg_price: 0
  };

  // 1. Resolve Weights (ensure sum is normalized if custom weights provided)
  const rawWeights = {
    rainfall: customWeights.rainfall !== undefined ? Number(customWeights.rainfall) : DEFAULT_WEIGHTS.rainfall,
    price: customWeights.price !== undefined ? Number(customWeights.price) : DEFAULT_WEIGHTS.price,
    loan: customWeights.loan !== undefined ? Number(customWeights.loan) : DEFAULT_WEIGHTS.loan,
    vulnerability: customWeights.vulnerability !== undefined ? Number(customWeights.vulnerability) : DEFAULT_WEIGHTS.vulnerability
  };

  const weightSum = rawWeights.rainfall + rawWeights.price + rawWeights.loan + rawWeights.vulnerability;
  const weights = weightSum > 0 ? {
    rainfall: rawWeights.rainfall / weightSum,
    price: rawWeights.price / weightSum,
    loan: rawWeights.loan / weightSum,
    vulnerability: rawWeights.vulnerability / weightSum
  } : DEFAULT_WEIGHTS;

  // 2. Component R (Rainfall Deviation): R = min(abs(rainfall_deviation_pct), 100)
  const rainfallDevPct = weather.rainfall_deviation_pct || 0;
  const R = Math.min(Math.abs(rainfallDevPct), 100);

  // 3. Component P (Price Shortfall vs MSP):
  // If MSP exists: P = max(0, (govt_msp - price) / govt_msp * 100)
  // Else fallback: P = max(0, (recent_avg - current) / recent_avg * 100)
  let P = 0;
  let isMspComparison = false;
  let priceShortfallPct = 0;

  if (mandiPrice.govt_msp_per_quintal && mandiPrice.govt_msp_per_quintal > 0) {
    isMspComparison = true;
    if (mandiPrice.price_per_quintal < mandiPrice.govt_msp_per_quintal) {
      priceShortfallPct = ((mandiPrice.govt_msp_per_quintal - mandiPrice.price_per_quintal) / mandiPrice.govt_msp_per_quintal) * 100;
      P = Math.max(0, Math.min(priceShortfallPct, 100));
    }
  } else if (mandiPrice.recent_avg_price && mandiPrice.recent_avg_price > 0) {
    if (mandiPrice.price_per_quintal < mandiPrice.recent_avg_price) {
      priceShortfallPct = ((mandiPrice.recent_avg_price - mandiPrice.price_per_quintal) / mandiPrice.recent_avg_price) * 100;
      P = Math.max(0, Math.min(priceShortfallPct, 100));
    }
  }

  // 4. Component L (Loan Due Proximity):
  // L = 100 - min(100, (days_until_loan_due / 90) * 100)
  const daysUntilDue = getDaysUntilDue(farmer.loan_due_date, REFERENCE_DATE);
  const L = Math.max(0, 100 - Math.min(100, (daysUntilDue / 90) * 100));

  // 5. Component V (Historical Vulnerability Index / District Fragility):
  // V = district.historical_vulnerability_index (0-100)
  const V = Math.max(0, Math.min(100, district.historical_vulnerability_index || 0));

  // 6. Calculate Weighted Score
  const points_R = weights.rainfall * R;
  const points_P = weights.price * P;
  const points_L = weights.loan * L;
  const points_V = weights.vulnerability * V;

  const totalScore = Math.min(100, Math.max(0, points_R + points_P + points_L + points_V));
  const roundedScore = Math.round(totalScore * 10) / 10;

  // Band Categorization
  let band = "Low";
  let bandColor = "green";
  if (roundedScore >= 71) {
    band = "High";
    bandColor = "red";
  } else if (roundedScore >= 41) {
    band = "Medium";
    bandColor = "amber";
  }

  // 7. Determine Top Contributing Signals
  const factorContributions = [
    { name: "Rainfall Deficit", signal: "rainfall_deficit", points: points_R, raw: R, label: `Rainfall ${rainfallDevPct < 0 ? Math.abs(rainfallDevPct).toFixed(1) + '% below normal' : rainfallDevPct.toFixed(1) + '% above normal'}` },
    { name: "Price Below MSP", signal: "price_crash", points: points_P, raw: P, label: `${farmer.crop.charAt(0).toUpperCase() + farmer.crop.slice(1)} price below MSP by ${priceShortfallPct.toFixed(1)}%` },
    { name: "Loan Due Proximity", signal: "loan_due_proximity", points: points_L, raw: L, label: `Loan repayment due in ${daysUntilDue} days` },
    { name: "District Fragility", signal: "high_vulnerability_index", points: points_V, raw: V, label: `District has a history of agrarian distress — treat as elevated-priority context` }
  ];

  // Sort descending by points
  factorContributions.sort((a, b) => b.points - a.points);
  const topSignal = factorContributions[0];

  // 8. Explanation List (Granular breakdown)
  const explanation = [];
  if (rainfallDevPct < -15 || rainfallDevPct > 30) {
    explanation.push(`Rainfall ${rainfallDevPct < 0 ? Math.abs(rainfallDevPct).toFixed(1) + '% below normal' : rainfallDevPct.toFixed(1) + '% deviation'} (${points_R.toFixed(1)} pts)`);
  }
  if (P > 0) {
    explanation.push(`${farmer.crop.charAt(0).toUpperCase() + farmer.crop.slice(1)} price ${isMspComparison ? 'below MSP' : 'below recent average'} by ${priceShortfallPct.toFixed(1)}% (${points_P.toFixed(1)} pts)`);
  }
  if (daysUntilDue <= 60) {
    explanation.push(`Loan due in ${daysUntilDue} days (${points_L.toFixed(1)} pts)`);
  }
  if (V >= 50) {
    explanation.push(`District has a history of agrarian distress — treat as elevated-priority context (${points_V.toFixed(1)} pts)`);
  }

  // If explanation is empty for low scores, provide reassuring summary
  if (explanation.length === 0) {
    explanation.push("All primary agro-climatic and financial indicators currently within normal stability thresholds.");
  }

  // 9. Recommended Government Scheme Interventions
  // Map specific triggers to schemes.json entries
  const eligibleSchemes = [];
  const recommendedInterventions = [];

  // Weather deficit trigger -> PMFBY (S1)
  if (R >= 25 || weather.dry_spell_days >= 10 || weather.onset_delay_days > 15) {
    const s1 = schemes.find(s => s.scheme_id === "S1");
    if (s1) {
      eligibleSchemes.push(s1);
      recommendedInterventions.push({
        scheme_id: "S1",
        scheme_name: s1.name,
        trigger: "Rainfall Deficit / Delayed Sowing / Dry Spell",
        action_item: "Issue PMFBY localized loss claim form & initiate block survey within 72 hrs",
        urgency: "HIGH"
      });
    }
  }

  // Price crash / Below MSP trigger -> PM-AASHA / e-NAM (S3)
  if (P >= 5 || (farmer.crop_stage === "harvest" && mandiPrice.price_per_quintal < mandiPrice.govt_msp_per_quintal)) {
    const s3 = schemes.find(s => s.scheme_id === "S3");
    if (s3) {
      eligibleSchemes.push(s3);
      recommendedInterventions.push({
        scheme_id: "S3",
        scheme_name: s3.name,
        trigger: "Mandi Price < Govt MSP (Prevent Distress Sale)",
        action_item: "Facilitate e-NAM APMC MSP procurement enrollment or WDRA pledge financing",
        urgency: "CRITICAL"
      });
    }
  }

  // Loan due proximity -> KCC Restructuring (S2) & PM-KISAN (S5)
  if (L >= 50 || daysUntilDue <= 45) {
    const s2 = schemes.find(s => s.scheme_id === "S2");
    if (s2) {
      eligibleSchemes.push(s2);
      recommendedInterventions.push({
        scheme_id: "S2",
        scheme_name: s2.name,
        trigger: `Loan Repayment Due in ${daysUntilDue} Days`,
        action_item: "Submit KCC debt restructuring request to lead bank to avoid NPA & penalty",
        urgency: daysUntilDue <= 15 ? "CRITICAL" : "MEDIUM"
      });
    }
    const s5 = schemes.find(s => s.scheme_id === "S5");
    if (s5) {
      eligibleSchemes.push(s5);
      recommendedInterventions.push({
        scheme_id: "S5",
        scheme_name: s5.name,
        trigger: "Short-term Cashflow Constraint",
        action_item: "Check PM-KISAN DBT installment credit status for immediate ₹2,000 liquidity",
        urgency: "MEDIUM"
      });
    }
  }

  // District Structural Fragility -> State Drought Relief Package (S4)
  // Even if weather/price is normal, a high vulnerability index (>= 80) triggers State Relief package S4!
  if (V >= 80) {
    const s4 = schemes.find(s => s.scheme_id === "S4");
    if (s4) {
      eligibleSchemes.push(s4);
      recommendedInterventions.push({
        scheme_id: "S4",
        scheme_name: s4.name,
        trigger: "High Structural District Fragility (Historical Agrarian Crisis Zone)",
        action_item: "Enroll farmer in State Special Drought Relief Package for input & tariff subsidies",
        urgency: "HIGH"
      });
    }
  }

  // Fallback if no specific triggers fired (e.g. low risk farmer)
  if (recommendedInterventions.length === 0) {
    const s1 = schemes.find(s => s.scheme_id === "S1");
    if (s1) {
      recommendedInterventions.push({
        scheme_id: "S1",
        scheme_name: s1.name,
        trigger: "Standard Seasonal Risk Protection",
        action_item: "Verify ongoing PMFBY seasonal enrollment is active",
        urgency: "LOW"
      });
    }
  }

  // Landholding context
  const landholdingHa = farmer.landholding_hectares || 1.0;
  const landCategory = landholdingHa <= 1.0 ? "Marginal Farmer (≤ 1 ha)" : landholdingHa <= 2.0 ? "Small Farmer (1-2 ha)" : "Medium/Large Farmer (> 2 ha)";
  const landholdingContext = `${landholdingHa} ha — ${landCategory}; heightened exposure to price and weather volatility.`;

  return {
    farmer_id: farmer.id,
    farmer_name: farmer.name,
    district_id: district.id,
    district_name: district.name,
    crop: farmer.crop,
    crop_stage: farmer.crop_stage,
    distress_score: roundedScore,
    risk_band: band,
    band_color: bandColor,
    weights_used: weights,
    raw_components: {
      R: Math.round(R * 10) / 10,
      P: Math.round(P * 10) / 10,
      L: Math.round(L * 10) / 10,
      V: Math.round(V * 10) / 10
    },
    points_breakdown: {
      rainfall_points: Math.round(points_R * 10) / 10,
      price_points: Math.round(points_P * 10) / 10,
      loan_points: Math.round(points_L * 10) / 10,
      vulnerability_points: Math.round(points_V * 10) / 10
    },
    top_contributing_signal: {
      name: topSignal.name,
      points: Math.round(topSignal.points * 10) / 10,
      label: topSignal.label,
      signal_key: topSignal.signal
    },
    explanation,
    landholding_context: landholdingContext,
    structural_risk_context: {
      district_fragility_index: V,
      soil_type: district.soil_type,
      assessment: V >= 80 ? "High Historical Agrarian Crisis Sensitivity" : V >= 50 ? "Moderate Climate Sensitivity" : "High Structural Resilience"
    },
    recommended_interventions: recommendedInterventions,
    primary_recommended_scheme: recommendedInterventions[0] ? recommendedInterventions[0].scheme_name : "PMFBY",
    days_until_loan_due: daysUntilDue
  };
}

module.exports = {
  calculateDistressScore,
  DEFAULT_WEIGHTS,
  getDaysUntilDue
};
