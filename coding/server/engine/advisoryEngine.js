/**
 * Module A: Advisory Engine
 * Pure agronomy & market intervention logic.
 * Combines weather, soil, phenological crop stage, CRIDA contingency logic,
 * and Mandi price vs Govt MSP evaluations.
 */

/**
 * Generates plain-language spoken and text advisory for a farmer
 * @param {string} farmerId 
 * @param {Object} data - Contains farmers, districts, mandi_prices, daily_rainfall, advisory_rules, contingency_crops
 * @returns {Object} Structured advisory response
 */
function getAdvisory(farmerId, data) {
  const {
    farmers,
    districts,
    mandi_prices,
    daily_rainfall,
    advisory_rules,
    contingency_crops
  } = data;

  const farmer = farmers.find(f => f.id === farmerId);
  if (!farmer) {
    throw new Error(`Farmer with id ${farmerId} not found`);
  }

  const district = districts.find(d => d.id === farmer.district_id) || {};
  const weather = daily_rainfall.find(w => w.district_id === farmer.district_id) || {
    rainfall_deviation_pct: 0,
    dry_spell_days: 0,
    onset_status: "normal",
    onset_delay_days: 0
  };

  const mandiPrice = mandi_prices.find(
    p => p.district_id === farmer.district_id && p.crop.toLowerCase() === farmer.crop.toLowerCase()
  ) || {
    price_per_quintal: 0,
    govt_msp_per_quintal: 0,
    market_name: "Local APMC"
  };

  const isBelowMsp = mandiPrice.govt_msp_per_quintal > 0 &&
    mandiPrice.price_per_quintal < mandiPrice.govt_msp_per_quintal;

  const mspShortfallPct = isBelowMsp
    ? ((mandiPrice.govt_msp_per_quintal - mandiPrice.price_per_quintal) / mandiPrice.govt_msp_per_quintal * 100).toFixed(1)
    : 0;

  // 1. [CRITICAL SPEC] If crop_stage == 'harvest' AND Mandi Price < MSP:
  // Force action_type = 'market_intervention' and prioritize Rule R-30 over agronomy
  if (farmer.crop_stage === "harvest" && isBelowMsp) {
    const r30 = advisory_rules.find(r => r.rule_id === "R-30") || {};
    const priceStr = mandiPrice.price_per_quintal.toLocaleString("en-IN");
    const mspStr = mandiPrice.govt_msp_per_quintal.toLocaleString("en-IN");

    const textEn = (r30.template_en || "")
      .replace("{price}", priceStr)
      .replace("{msp}", mspStr);
    const textHi = (r30.template_hi || "")
      .replace("{price}", priceStr)
      .replace("{msp}", mspStr);
    const textMr = (r30.template_mr || "")
      .replace("{price}", priceStr)
      .replace("{msp}", mspStr);

    return {
      farmer_id: farmer.id,
      farmer_name: farmer.name,
      district_name: district.name || farmer.district_id,
      crop: farmer.crop,
      crop_stage: farmer.crop_stage,
      rule_id: "R-30",
      action_type: "market_intervention",
      priority: "CRITICAL",
      title: {
        en: r30.title_en || "Market Distress Warning: Price Below MSP",
        hi: r30.title_hi || "बाजार संकट चेतावनी: एमएसपी से कम भाव",
        mr: r30.title_mr || "बाजार भाव इशारा: हमीभावापेक्षा कमी भाव"
      },
      text: {
        en: textEn,
        hi: textHi,
        mr: textMr
      },
      audio_stub_url: `/audio/advisories/${farmer.language || 'hi'}_R-30.mp3`,
      contingency_crops: [],
      price_data: {
        crop: farmer.crop,
        current_price: mandiPrice.price_per_quintal,
        govt_msp: mandiPrice.govt_msp_per_quintal,
        is_below_msp: true,
        shortfall_pct: parseFloat(mspShortfallPct),
        market_name: mandiPrice.market_name || "District Mandi",
        date: mandiPrice.date
      },
      weather_data: {
        rainfall_deviation_pct: weather.rainfall_deviation_pct,
        dry_spell_days: weather.dry_spell_days,
        onset_status: weather.onset_status,
        onset_delay_days: weather.onset_delay_days
      }
    };
  }

  // 2. Delayed Onset (>15 days delay) in Sowing stage -> Contingency Crop Switch (R-10)
  if (
    farmer.crop_stage === "sowing" &&
    (weather.onset_status === "delayed" || weather.onset_delay_days > 15)
  ) {
    const r10 = advisory_rules.find(r => r.rule_id === "R-10") || {};
    const delayDays = weather.onset_delay_days || 20;

    const textEn = (r10.template_en || "").replace("{onset_delay_days}", delayDays);
    const textHi = (r10.template_hi || "").replace("{onset_delay_days}", delayDays);
    const textMr = (r10.template_mr || "").replace("{onset_delay_days}", delayDays);

    const relevantContingency = contingency_crops.filter(
      c => c.crop.toLowerCase() === farmer.crop.toLowerCase() || c.soil_type === district.soil_type
    );

    return {
      farmer_id: farmer.id,
      farmer_name: farmer.name,
      district_name: district.name || farmer.district_id,
      crop: farmer.crop,
      crop_stage: farmer.crop_stage,
      rule_id: "R-10",
      action_type: "contingency_crop_switch",
      priority: "HIGH",
      title: {
        en: r10.title_en || "CRIDA Contingency: Delayed Monsoon Onset",
        hi: r10.title_hi || "क्रीडा आकस्मिक सलाह: मानसून विलंब",
        mr: r10.title_mr || "आपत्कालीन सल्ला: मान्सून उशीर"
      },
      text: {
        en: textEn,
        hi: textHi,
        mr: textMr
      },
      audio_stub_url: `/audio/advisories/${farmer.language || 'mr'}_R-10.mp3`,
      contingency_crops: relevantContingency.length > 0 ? relevantContingency[0].recommended_contingency_crops : [],
      price_data: {
        crop: farmer.crop,
        current_price: mandiPrice.price_per_quintal,
        govt_msp: mandiPrice.govt_msp_per_quintal,
        is_below_msp: isBelowMsp,
        shortfall_pct: parseFloat(mspShortfallPct),
        market_name: mandiPrice.market_name,
        date: mandiPrice.date
      },
      weather_data: {
        rainfall_deviation_pct: weather.rainfall_deviation_pct,
        dry_spell_days: weather.dry_spell_days,
        onset_status: weather.onset_status,
        onset_delay_days: weather.onset_delay_days
      }
    };
  }

  // 3. Flowering Stage with Severe Dry Spell (>= 12 days) -> R-12 (Critical irrigation & PMFBY notice)
  if (farmer.crop_stage === "flowering" && weather.dry_spell_days >= 12) {
    const r12 = advisory_rules.find(r => r.rule_id === "R-12") || {};
    const textEn = (r12.template_en || "").replace("{dry_spell_days}", weather.dry_spell_days);
    const textHi = (r12.template_hi || "").replace("{dry_spell_days}", weather.dry_spell_days);
    const textMr = (r12.template_mr || "").replace("{dry_spell_days}", weather.dry_spell_days);

    return {
      farmer_id: farmer.id,
      farmer_name: farmer.name,
      district_name: district.name || farmer.district_id,
      crop: farmer.crop,
      crop_stage: farmer.crop_stage,
      rule_id: "R-12",
      action_type: "critical_irrigation_and_claim",
      priority: "HIGH",
      title: {
        en: r12.title_en,
        hi: r12.title_hi,
        mr: r12.title_mr
      },
      text: { en: textEn, hi: textHi, mr: textMr },
      audio_stub_url: `/audio/advisories/${farmer.language || 'mr'}_R-12.mp3`,
      contingency_crops: [],
      price_data: {
        crop: farmer.crop,
        current_price: mandiPrice.price_per_quintal,
        govt_msp: mandiPrice.govt_msp_per_quintal,
        is_below_msp: isBelowMsp,
        shortfall_pct: parseFloat(mspShortfallPct),
        market_name: mandiPrice.market_name,
        date: mandiPrice.date
      },
      weather_data: {
        rainfall_deviation_pct: weather.rainfall_deviation_pct,
        dry_spell_days: weather.dry_spell_days,
        onset_status: weather.onset_status,
        onset_delay_days: weather.onset_delay_days
      }
    };
  }

  // 4. Vegetative Stage with Moderate Dry Spell (>= 7 days) -> R-11
  if (farmer.crop_stage === "vegetative" && weather.dry_spell_days >= 7) {
    const r11 = advisory_rules.find(r => r.rule_id === "R-11") || {};
    const textEn = (r11.template_en || "").replace("{dry_spell_days}", weather.dry_spell_days);
    const textHi = (r11.template_hi || "").replace("{dry_spell_days}", weather.dry_spell_days);
    const textMr = (r11.template_mr || "").replace("{dry_spell_days}", weather.dry_spell_days);

    return {
      farmer_id: farmer.id,
      farmer_name: farmer.name,
      district_name: district.name || farmer.district_id,
      crop: farmer.crop,
      crop_stage: farmer.crop_stage,
      rule_id: "R-11",
      action_type: "moisture_conservation",
      priority: "MEDIUM",
      title: {
        en: r11.title_en,
        hi: r11.title_hi,
        mr: r11.title_mr
      },
      text: { en: textEn, hi: textHi, mr: textMr },
      audio_stub_url: `/audio/advisories/${farmer.language || 'hi'}_R-11.mp3`,
      contingency_crops: [],
      price_data: {
        crop: farmer.crop,
        current_price: mandiPrice.price_per_quintal,
        govt_msp: mandiPrice.govt_msp_per_quintal,
        is_below_msp: isBelowMsp,
        shortfall_pct: parseFloat(mspShortfallPct),
        market_name: mandiPrice.market_name,
        date: mandiPrice.date
      },
      weather_data: {
        rainfall_deviation_pct: weather.rainfall_deviation_pct,
        dry_spell_days: weather.dry_spell_days,
        onset_status: weather.onset_status,
        onset_delay_days: weather.onset_delay_days
      }
    };
  }

  // 5. Normal / Favorable Conditions -> R-20 or Default Agronomy
  const r20 = advisory_rules.find(r => r.rule_id === "R-20") || {};
  return {
    farmer_id: farmer.id,
    farmer_name: farmer.name,
    district_name: district.name || farmer.district_id,
    crop: farmer.crop,
    crop_stage: farmer.crop_stage,
    rule_id: "R-20",
    action_type: "optimal_management",
    priority: "NORMAL",
    title: {
      en: r20.title_en || "Seasonal Crop Care Advisory",
      hi: r20.title_hi || "मौसमी फसल देखभाल सलाह",
      mr: r20.title_mr || "हंगामी पीक निगा सल्ला"
    },
    text: {
      en: r20.template_en || `Crop stage is ${farmer.crop_stage}. Continue balanced fertilizer application and regular weed control.`,
      hi: r20.template_hi || `फसल ${farmer.crop_stage} अवस्था में है। संतुलित उर्वरक प्रयोग और नियमित निराई जारी रखें।`,
      mr: r20.template_mr || `पीक ${farmer.crop_stage} अवस्थेत आहे. संतुलित खत व्यवस्थापन आणि वेळेवर आंतरमशागत करा.`
    },
    audio_stub_url: `/audio/advisories/${farmer.language || 'mr'}_R-20.mp3`,
    contingency_crops: [],
    price_data: {
      crop: farmer.crop,
      current_price: mandiPrice.price_per_quintal,
      govt_msp: mandiPrice.govt_msp_per_quintal,
      is_below_msp: isBelowMsp,
      shortfall_pct: parseFloat(mspShortfallPct),
      market_name: mandiPrice.market_name,
      date: mandiPrice.date
    },
    weather_data: {
      rainfall_deviation_pct: weather.rainfall_deviation_pct,
      dry_spell_days: weather.dry_spell_days,
      onset_status: weather.onset_status,
      onset_delay_days: weather.onset_delay_days
    }
  };
}

module.exports = {
  getAdvisory
};
