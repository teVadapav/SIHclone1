"""
Module A: Advisory Engine (Python)
Pure agronomy & market intervention logic.
Combines weather, soil, phenological crop stage, CRIDA contingency logic,
and Mandi price vs Govt MSP evaluations.
"""

def format_rule_i18n(rule: dict, replacements: dict) -> tuple:
    languages = ['en', 'hi', 'mr', 'or', 'as', 'kn']
    titles = {}
    texts = {}
    for lang in languages:
        title = rule.get(f"title_{lang}") or rule.get("title_en", "")
        template = rule.get(f"template_{lang}") or rule.get("template_en", "")
        for k, v in replacements.items():
            template = template.replace(f"{{{k}}}", str(v))
        titles[lang] = title
        texts[lang] = template
    return titles, texts

def get_advisory(farmer_id: str, data: dict) -> dict:
    """
    Generates plain-language spoken and text advisory for a farmer across all supported languages.
    """
    farmers = data.get("farmers", [])
    districts = data.get("districts", [])
    mandi_prices = data.get("mandi_prices", [])
    daily_rainfall = data.get("daily_rainfall", [])
    advisory_rules = data.get("advisory_rules", [])
    contingency_crops = data.get("contingency_crops", [])

    farmer = next((f for f in farmers if f["id"] == farmer_id), None)
    if not farmer:
        raise ValueError(f"Farmer with id {farmer_id} not found")

    district = next((d for d in districts if d["id"] == farmer["district_id"]), {})
    weather = next((w for w in daily_rainfall if w["district_id"] == farmer["district_id"]), {
        "rainfall_deviation_pct": 0,
        "dry_spell_days": 0,
        "onset_status": "normal",
        "onset_delay_days": 0
    })

    crop_name = farmer.get("crop", "").lower()
    mandi_price = next(
        (p for p in mandi_prices if p["district_id"] == farmer["district_id"] and p["crop"].lower() == crop_name),
        {
            "price_per_quintal": 0,
            "govt_msp_per_quintal": 0,
            "market_name": "Local APMC",
            "date": "2026-08-25"
        }
    )

    current_price = mandi_price.get("price_per_quintal", 0)
    govt_msp = mandi_price.get("govt_msp_per_quintal", 0)
    is_below_msp = govt_msp > 0 and current_price < govt_msp

    msp_shortfall_pct = round(((govt_msp - current_price) / govt_msp * 100), 1) if is_below_msp else 0.0

    # 1. [CRITICAL SPEC] Harvest stage + Price < MSP:
    # Force action_type = 'market_intervention' and prioritize Rule R-30
    if farmer.get("crop_stage") == "harvest" and is_below_msp:
        r30 = next((r for r in advisory_rules if r["rule_id"] == "R-30"), {})
        price_str = f"{current_price:,}"
        msp_str = f"{govt_msp:,}"
        titles, texts = format_rule_i18n(r30, {"price": price_str, "msp": msp_str})

        return {
            "farmer_id": farmer["id"],
            "farmer_name": farmer["name"],
            "district_name": district.get("name", farmer["district_id"]),
            "crop": farmer["crop"],
            "crop_stage": farmer["crop_stage"],
            "rule_id": "R-30",
            "action_type": "market_intervention",
            "priority": "CRITICAL",
            "title": titles,
            "text": texts,
            "audio_stub_url": f"/audio/advisories/{farmer.get('language', 'hi')}_R-30.mp3",
            "contingency_crops": [],
            "price_data": {
                "crop": farmer["crop"],
                "current_price": current_price,
                "govt_msp": govt_msp,
                "is_below_msp": True,
                "shortfall_pct": msp_shortfall_pct,
                "market_name": mandi_price.get("market_name", "District APMC"),
                "date": mandi_price.get("date", "2026-08-25")
            },
            "weather_data": {
                "rainfall_deviation_pct": weather.get("rainfall_deviation_pct", 0),
                "dry_spell_days": weather.get("dry_spell_days", 0),
                "onset_status": weather.get("onset_status", "normal"),
                "onset_delay_days": weather.get("onset_delay_days", 0)
            }
        }

    # 2. Delayed Onset (>15 days delay) in Sowing Stage -> Contingency Crop Switch (R-10)
    onset_delay = weather.get("onset_delay_days", 0)
    if farmer.get("crop_stage") == "sowing" and (weather.get("onset_status") == "delayed" or onset_delay > 15):
        r10 = next((r for r in advisory_rules if r["rule_id"] == "R-10"), {})
        delay_days = onset_delay if onset_delay > 0 else 20
        titles, texts = format_rule_i18n(r10, {"onset_delay_days": delay_days})

        relevant_contingency = [
            c for c in contingency_crops
            if c.get("crop", "").lower() == crop_name or c.get("soil_type") == district.get("soil_type")
        ]
        contingency_list = relevant_contingency[0].get("recommended_contingency_crops", []) if relevant_contingency else []

        return {
            "farmer_id": farmer["id"],
            "farmer_name": farmer["name"],
            "district_name": district.get("name", farmer["district_id"]),
            "crop": farmer["crop"],
            "crop_stage": farmer["crop_stage"],
            "rule_id": "R-10",
            "action_type": "contingency_crop_switch",
            "priority": "HIGH",
            "title": titles,
            "text": texts,
            "audio_stub_url": f"/audio/advisories/{farmer.get('language', 'mr')}_R-10.mp3",
            "contingency_crops": contingency_list,
            "price_data": {
                "crop": farmer["crop"],
                "current_price": current_price,
                "govt_msp": govt_msp,
                "is_below_msp": is_below_msp,
                "shortfall_pct": msp_shortfall_pct,
                "market_name": mandi_price.get("market_name", "District APMC"),
                "date": mandi_price.get("date", "2026-08-25")
            },
            "weather_data": {
                "rainfall_deviation_pct": weather.get("rainfall_deviation_pct", 0),
                "dry_spell_days": weather.get("dry_spell_days", 0),
                "onset_status": weather.get("onset_status", "delayed"),
                "onset_delay_days": weather.get("onset_delay_days", 0)
            }
        }

    # 3. Flowering Stage + Severe Dry Spell (>= 12 days) -> R-12
    dry_spell = weather.get("dry_spell_days", 0)
    if farmer.get("crop_stage") == "flowering" and dry_spell >= 12:
        r12 = next((r for r in advisory_rules if r["rule_id"] == "R-12"), {})
        titles, texts = format_rule_i18n(r12, {"dry_spell_days": dry_spell})

        return {
            "farmer_id": farmer["id"],
            "farmer_name": farmer["name"],
            "district_name": district.get("name", farmer["district_id"]),
            "crop": farmer["crop"],
            "crop_stage": farmer["crop_stage"],
            "rule_id": "R-12",
            "action_type": "critical_irrigation_and_claim",
            "priority": "HIGH",
            "title": titles,
            "text": texts,
            "audio_stub_url": f"/audio/advisories/{farmer.get('language', 'mr')}_R-12.mp3",
            "contingency_crops": [],
            "price_data": {
                "crop": farmer["crop"],
                "current_price": current_price,
                "govt_msp": govt_msp,
                "is_below_msp": is_below_msp,
                "shortfall_pct": msp_shortfall_pct,
                "market_name": mandi_price.get("market_name", "District APMC"),
                "date": mandi_price.get("date", "2026-08-25")
            },
            "weather_data": {
                "rainfall_deviation_pct": weather.get("rainfall_deviation_pct", 0),
                "dry_spell_days": weather.get("dry_spell_days", 0),
                "onset_status": weather.get("onset_status", "normal"),
                "onset_delay_days": weather.get("onset_delay_days", 0)
            }
        }

    # 4. Vegetative Stage + Moderate Dry Spell (>= 7 days) -> R-11
    if farmer.get("crop_stage") == "vegetative" and dry_spell >= 7:
        r11 = next((r for r in advisory_rules if r["rule_id"] == "R-11"), {})
        titles, texts = format_rule_i18n(r11, {"dry_spell_days": dry_spell})

        return {
            "farmer_id": farmer["id"],
            "farmer_name": farmer["name"],
            "district_name": district.get("name", farmer["district_id"]),
            "crop": farmer["crop"],
            "crop_stage": farmer["crop_stage"],
            "rule_id": "R-11",
            "action_type": "moisture_conservation",
            "priority": "MEDIUM",
            "title": titles,
            "text": texts,
            "audio_stub_url": f"/audio/advisories/{farmer.get('language', 'hi')}_R-11.mp3",
            "contingency_crops": [],
            "price_data": {
                "crop": farmer["crop"],
                "current_price": current_price,
                "govt_msp": govt_msp,
                "is_below_msp": is_below_msp,
                "shortfall_pct": msp_shortfall_pct,
                "market_name": mandi_price.get("market_name", "District APMC"),
                "date": mandi_price.get("date", "2026-08-25")
            },
            "weather_data": {
                "rainfall_deviation_pct": weather.get("rainfall_deviation_pct", 0),
                "dry_spell_days": weather.get("dry_spell_days", 0),
                "onset_status": weather.get("onset_status", "normal"),
                "onset_delay_days": weather.get("onset_delay_days", 0)
            }
        }

    # 5. Normal / Favorable Conditions -> R-20
    r20 = next((r for r in advisory_rules if r["rule_id"] == "R-20"), {})
    titles, texts = format_rule_i18n(r20, {})
    return {
        "farmer_id": farmer["id"],
        "farmer_name": farmer["name"],
        "district_name": district.get("name", farmer["district_id"]),
        "crop": farmer["crop"],
        "crop_stage": farmer["crop_stage"],
        "rule_id": "R-20",
        "action_type": "optimal_management",
        "priority": "NORMAL",
        "title": titles,
        "text": texts,
        "audio_stub_url": f"/audio/advisories/{farmer.get('language', 'mr')}_R-20.mp3",
        "contingency_crops": [],
        "price_data": {
            "crop": farmer["crop"],
            "current_price": current_price,
            "govt_msp": govt_msp,
            "is_below_msp": is_below_msp,
            "shortfall_pct": msp_shortfall_pct,
            "market_name": mandi_price.get("market_name", "District APMC"),
            "date": mandi_price.get("date", "2026-08-25")
        },
        "weather_data": {
            "rainfall_deviation_pct": weather.get("rainfall_deviation_pct", 0),
            "dry_spell_days": weather.get("dry_spell_days", 0),
            "onset_status": weather.get("onset_status", "normal"),
            "onset_delay_days": weather.get("onset_delay_days", 0)
        }
    }
