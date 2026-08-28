"""
PS-02: Smart Crop Advisory & Farmer Distress Early-Warning System (v3)
FastAPI Backend Application
"""

import json
import os
import sqlite3
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, HTTPException, Body, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from server.engine.channel_router import get_recommended_channel, get_default_ui_mode
from server.engine.advisory_engine import get_advisory
from server.engine.distress_scorer import calculate_distress_score, DEFAULT_WEIGHTS

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "distress_system.db")
CLIENT_DIR = os.path.join(BASE_DIR, "client")

app = FastAPI(
    title="PS-02 Smart Crop Advisory & Distress Early-Warning API",
    version="3.0.0",
    description="Comprehensive Feasibility Edition: Advisory Engine, Distress-Risk Scorer, MSP Financial Overrides & Scheme Interventions"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def load_full_datastore():
    """Loads current datastore from SQLite for pure function engines"""
    conn = get_db_connection()
    cursor = conn.cursor()

    districts = [dict(row) for row in cursor.execute("SELECT * FROM districts").fetchall()]
    mandi_prices = [dict(row) for row in cursor.execute("SELECT * FROM mandi_prices").fetchall()]
    farmers_raw = cursor.execute("SELECT * FROM farmers").fetchall()
    farmers = []
    for f in farmers_raw:
        fd = dict(f)
        # Deserialize JSON list columns
        try:
            fd["enrolled_schemes"] = json.loads(fd["enrolled_schemes"]) if fd.get("enrolled_schemes") else []
        except Exception:
            fd["enrolled_schemes"] = []
        try:
            fd["income_sources"] = json.loads(fd["income_sources"]) if fd.get("income_sources") else ["crop_cultivation"]
        except Exception:
            fd["income_sources"] = ["crop_cultivation"]
        # SQLite stores booleans as INTEGER (0/1); convert back to bool for the scorer
        fd["borewell_failed"] = bool(fd.get("borewell_failed", 0))
        fd["has_pmfby_insurance"] = bool(fd.get("has_pmfby_insurance", 0))
        fd["has_kcc"] = bool(fd.get("has_kcc", 0))
        fd["informal_debt"] = bool(fd.get("informal_debt", 0))
        farmers.append(fd)

    schemes = [dict(row) for row in cursor.execute("SELECT * FROM schemes").fetchall()]
    daily_rainfall = [dict(row) for row in cursor.execute("SELECT * FROM daily_rainfall").fetchall()]
    officers_raw = cursor.execute("SELECT * FROM officers").fetchall()
    officers = []
    for o in officers_raw:
        od = dict(o)
        try:
            od["assigned_districts"] = json.loads(od["assigned_districts"]) if od.get("assigned_districts") else []
        except Exception:
            od["assigned_districts"] = []
        officers.append(od)

    contingency_raw = cursor.execute("SELECT * FROM contingency_crops").fetchall()
    contingency_crops = []
    for c in contingency_raw:
        cd = dict(c)
        try:
            cd["recommended_contingency_crops"] = json.loads(cd["recommended_contingency_crops"]) if cd.get("recommended_contingency_crops") else []
        except Exception:
            cd["recommended_contingency_crops"] = []
        contingency_crops.append(cd)

    advisory_rules = [dict(row) for row in cursor.execute("SELECT * FROM advisory_rules").fetchall()]
    conn.close()

    return {
        "districts": districts,
        "mandi_prices": mandi_prices,
        "farmers": farmers,
        "schemes": schemes,
        "daily_rainfall": daily_rainfall,
        "officers": officers,
        "contingency_crops": contingency_crops,
        "advisory_rules": advisory_rules
    }


class WeightOverride(BaseModel):
    """
    ICAR-CRIDA FDI 6-Dimension weight overrides.
    Weights are auto-normalized to sum to 1.0 in the scorer.
    """
    exposure:           Optional[float] = 0.25   # Dimension 1 — Climate & Price Hazard
    sensitivity:        Optional[float] = 0.15   # Dimension 2 — Irrigation Dependency
    adaptive_capacity:  Optional[float] = 0.15   # Dimension 3 — Landholding & Income (inverted)
    mitigation_deficit: Optional[float] = 0.15   # Dimension 4 — PMFBY / KCC Gap
    trigger:            Optional[float] = 0.20   # Dimension 5 — Loan & Informal Debt Shock
    district_fragility: Optional[float] = 0.10   # Dimension 6 — Historical Vulnerability (officer-facing)


class IvrRequest(BaseModel):
    farmer_id: str
    digit_pressed: Optional[str] = None
    language: Optional[str] = None


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "PS-02 Smart Crop Advisory & Distress Scorer",
        "version": "3.0.0"
    }


@app.get("/api/districts")
def get_all_districts():
    data = load_full_datastore()
    return data["districts"]


@app.get("/api/farmers")
def get_all_farmers():
    data = load_full_datastore()
    result = []
    for f in data["farmers"]:
        district = next((d for d in data["districts"] if d["id"] == f["district_id"]), {})
        channel = get_recommended_channel(f)
        ui_mode = get_default_ui_mode(f)
        result.append({
            **f,
            "district_name": district.get("name", f["district_id"]),
            "recommended_channel": channel,
            "default_ui_mode": ui_mode
        })
    return result


@app.get("/api/farmers/{farmer_id}")
def get_farmer_by_id(farmer_id: str):
    data = load_full_datastore()
    farmer = next((f for f in data["farmers"] if f["id"] == farmer_id), None)
    if not farmer:
        raise HTTPException(status_code=404, detail=f"Farmer {farmer_id} not found")

    district = next((d for d in data["districts"] if d["id"] == farmer["district_id"]), {})
    weather = next((w for w in data["daily_rainfall"] if w["district_id"] == farmer["district_id"]), {})
    channel = get_recommended_channel(farmer)
    ui_mode = get_default_ui_mode(farmer)

    return {
        **farmer,
        "district_name": district.get("name", farmer["district_id"]),
        "district_details": {
            "soil_type": district.get("soil_type"),
            "avg_rainfall_mm": district.get("avg_rainfall_mm")
            # Note: historical_vulnerability_index is intentionally excluded from individual farmer-facing query
        },
        "weather_summary": weather,
        "recommended_channel": channel,
        "default_ui_mode": ui_mode
    }


@app.get("/api/farmers/{farmer_id}/advisory")
def get_farmer_advisory(farmer_id: str):
    """
    Executes Advisory Engine:
    - Evaluates crop stage, weather, onset delay, and dry spells.
    - Evaluates Mandi price vs MSP: if harvest + price < MSP -> returns Rule R-30 market intervention!
    """
    data = load_full_datastore()
    try:
        advisory = get_advisory(farmer_id, data)
        return advisory
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/farmers/{farmer_id}/distress")
def get_farmer_distress(farmer_id: str, weights: WeightOverride = Body(default=None)):
    """
    Executes ICAR-CRIDA 6-Dimension FDI Distress Scorer for a single farmer.
    Dimensions: Exposure(E) · Sensitivity(S) · Adaptive Capacity(AC) · Mitigation Deficit(M) · Trigger(T) · District Fragility(DF)
    Weights are auto-normalized if custom values do not sum to 1.0.
    """
    data = load_full_datastore()
    custom_weights = weights.model_dump() if weights else DEFAULT_WEIGHTS
    try:
        score_data = calculate_distress_score(farmer_id, custom_weights, data)
        return score_data
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/officer/farmers")
def get_officer_farmer_list(weights: WeightOverride = Body(default=None)):
    """
    Officer Dashboard Aggregation Endpoint:
    - Computes distress scores for all farmers using active/custom weights.
    - Determines risk bands, top contributing signals, recommended schemes.
    - Attaches recommended contact channels (App / Call/IVR) and device reachability.
    - Sorts descending by distress score.
    """
    data = load_full_datastore()
    custom_weights = weights.model_dump() if weights else DEFAULT_WEIGHTS

    scored_farmers = []
    for farmer in data["farmers"]:
        district = next((d for d in data["districts"] if d["id"] == farmer["district_id"]), {})
        channel = get_recommended_channel(farmer)
        score_info = calculate_distress_score(farmer["id"], custom_weights, data)

        scored_farmers.append({
            "farmer_id": farmer["id"],
            "farmer_name": farmer["name"],
            "phone": farmer.get("phone", ""),
            "village": farmer.get("village", ""),
            "district_id": district.get("id"),
            "district_name": district.get("name", farmer["district_id"]),
            "crop": farmer["crop"],
            "crop_stage": farmer["crop_stage"],
            "landholding_hectares": farmer["landholding_hectares"],
            "device_type": farmer["device_type"],
            "network_quality": farmer["network_quality"],
            "tech_literacy": farmer["tech_literacy"],
            "recommended_channel": channel,
            "distress_score": score_info["distress_score"],
            "risk_band": score_info["risk_band"],
            "band_color": score_info["band_color"],
            "top_contributing_signal": score_info["top_contributing_signal"],
            "primary_recommended_scheme": score_info["primary_recommended_scheme"],
            "recommended_interventions": score_info["recommended_interventions"],
            "explanation": score_info["explanation"],
            "landholding_context": score_info["landholding_context"],
            "structural_risk_context": score_info["structural_risk_context"],
            "raw_dimensions": score_info["raw_dimensions"],
            "sub_components": score_info["sub_components"],
            "points_breakdown": score_info["points_breakdown"],
            "days_until_loan_due": score_info["days_until_loan_due"]
        })

    # Sort descending by distress score
    scored_farmers.sort(key=lambda x: x["distress_score"], reverse=True)

    # Summary metrics for officer dashboard header
    high_count = sum(1 for f in scored_farmers if f["risk_band"] == "High")
    med_count = sum(1 for f in scored_farmers if f["risk_band"] == "Medium")
    low_count = sum(1 for f in scored_farmers if f["risk_band"] == "Low")

    return {
        "farmers": scored_farmers,
        "weights_applied": score_info["weights_used"] if scored_farmers else DEFAULT_WEIGHTS,
        "metrics": {
            "total_farmers": len(scored_farmers),
            "high_risk_count": high_count,
            "medium_risk_count": med_count,
            "low_risk_count": low_count
        }
    }


@app.get("/api/mandi-prices")
def get_all_mandi_prices():
    data = load_full_datastore()
    result = []
    for p in data["mandi_prices"]:
        district = next((d for d in data["districts"] if d["id"] == p["district_id"]), {})
        is_below = p["govt_msp_per_quintal"] > 0 and p["price_per_quintal"] < p["govt_msp_per_quintal"]
        shortfall = round(((p["govt_msp_per_quintal"] - p["price_per_quintal"]) / p["govt_msp_per_quintal"] * 100), 1) if is_below else 0.0
        result.append({
            **p,
            "district_name": district.get("name", p["district_id"]),
            "is_below_msp": is_below,
            "shortfall_pct": shortfall
        })
    return result


@app.get("/api/schemes")
def get_all_schemes():
    data = load_full_datastore()
    return data["schemes"]


@app.post("/api/simulate/ivr")
def simulate_ivr(payload: IvrRequest):
    """
    Simulates Interactive Voice Response (IVR) phone tree for low-literacy / feature-phone farmers
    with native multi-language voice prompt support and keypad language switcher.
    """
    data = load_full_datastore()
    farmer = next((f for f in data["farmers"] if f["id"] == payload.farmer_id), None)
    if not farmer:
        raise HTTPException(status_code=404, detail="Farmer not found")

    advisory = get_advisory(farmer["id"], data)
    distress = calculate_distress_score(farmer["id"], DEFAULT_WEIGHTS, data)
    lang = (payload.language or farmer.get("language", "hi")).lower()

    # Digit mapping for language selection
    lang_digit_map = {
        "91": "hi", "92": "mr", "93": "or", "94": "as", "95": "kn", "96": "en"
    }

    digit = str(payload.digit_pressed).strip() if payload.digit_pressed else ""

    # If language switch key pressed
    if digit in lang_digit_map:
        lang = lang_digit_map[digit]
        digit = ""  # Reset to show main menu in new language

    # If no digit pressed or returned to main menu
    if not digit or digit == "*":
        if lang == "mr":
            greeting = f"नमस्कार {farmer['name']} शेतकरी बंधू! कृषी सल्ला व साहाय्य केंद्रात आपले स्वागत आहे."
            menu_text = "हवामान व पीक सल्ल्यासाठी १ दाबा. बाजार भाव व हमीभावासाठी २ दाबा. शासकीय योजना व मदतीसाठी ३ दाबा. भाषा बदलण्यासाठी ९ दाबा."
        elif lang == "or":
            greeting = f"ନମସ୍କାର {farmer['name']} କୃଷକ ଭାଇ! ସ୍ମାର୍ଟ କୃଷି ପରାମର୍ଶ ଓ ସହାୟତା କେନ୍ଦ୍ରକୁ ଆପଣଙ୍କୁ ସ୍ୱାଗତ।"
            menu_text = "ପାଣିପାଗ ଓ ଫସଲ ପରାମର୍ଶ ପାଇଁ ୧ ଦବାନ୍ତୁ। ମଣ୍ଡି ଦର ଓ ଏମଏସପି ପାଇଁ ୨ ଦବାନ୍ତୁ। ସରକାରୀ ଯୋଜନା ଓ ଋଣ ସହାୟତା ପାଇଁ ୩ ଦବାନ୍ତୁ। ଭାଷା ପରିବର୍ତ୍ତନ ପାଇଁ ୯ ଦବାନ୍ତୁ।"
        elif lang == "as":
            greeting = f"নমস্কাৰ {farmer['name']} কৃষক ভাই! স্মাৰ্ট কৃষি পৰামৰ্শ সেৱালৈ আপোনাক স্বাগতম।"
            menu_text = "বতৰ আৰু শস্যৰ দিহা-পৰামৰ্শৰ বাবে ১ টিপক। বজাৰ দৰ আৰু সমৰ্থন মূল্যৰ বাবে ২ টিপক। চৰকাৰী আঁচনি আৰু ঋণ সাহাৰ্যৰ বাবে ৩ টিপক। ভাষা সলনি কৰিবলৈ ৯ টিপক।"
        elif lang == "kn":
            greeting = f"ನಮಸ್ಕಾರ {farmer['name']} ರೈತ ಬಾಂಧವರೇ! ಸ್ಮಾರ್ಟ್ ಕೃಷಿ ಸಲಹಾ ಮತ್ತು ಸಹಾಯವಾಣಿಗೆ ತಮಗೆ ಸ್ವಾಗತ."
            menu_text = "ಹವಾಮಾನ ಮತ್ತು ಬೆಳೆ ರಕ್ಷಣೆ ಸಲಹೆಗಾಗಿ ೧ ಒತ್ತಿ. ಮಾರುಕಟ್ಟೆ ಬೆಲೆ ಮತ್ತು ಎಂಎಸ್‌ಪಿ ಹೋಲಿಕೆಗಾಗಿ ೨ ಒತ್ತಿ. ಸರ್ಕಾರಿ ಯೋಜನೆಗಳು ಮತ್ತು ಸಾಲ ಸೌಲಭ್ಯಕ್ಕಾಗಿ ೩ ಒತ್ತಿ. ಭಾಷೆ ಬದಲಾಯಿಸಲು ೯ ಒತ್ತಿ."
        elif lang == "hi":
            greeting = f"नमस्ते {farmer['name']} किसान भाई! स्मार्ट कृषि सलाह एवं सहायता केंद्र में आपका स्वागत है।"
            menu_text = "मौसम एवं फसल सलाह के लिए 1 दबाएं। मंडी भाव एवं समर्थन मूल्य के लिए 2 दबाएं। सरकारी योजनाओं व ऋण सहायता के लिए 3 दबाएं। भाषा बदलने के लिए 9 दबाएं।"
        else:
            greeting = f"Welcome {farmer['name']} to Kisan Krishi Advisory Helpline."
            menu_text = "Press 1 for Weather & Crop Advisory. Press 2 for Mandi Price & MSP comparison. Press 3 for Government Schemes & Loan Support. Press 9 to change language."

        return {
            "farmer_id": farmer["id"],
            "farmer_name": farmer["name"],
            "language": lang,
            "state": "MAIN_MENU",
            "voice_prompt_text": f"{greeting} {menu_text}",
            "options": [
                {"key": "1", "label": "Crop & Weather Advisory"},
                {"key": "2", "label": "Mandi Price vs Govt MSP"},
                {"key": "3", "label": "Govt Schemes & Debt Relief"},
                {"key": "9", "label": "Change Language (ଭାଷା / भाषा)"},
                {"key": "0", "label": "Operator / Extension Officer"}
            ]
        }

    # Handle Key 9: Language Selection Menu
    if digit == "9":
        lang_prompt = {
            "hi": "भाषा बदलने के लिए: 91 हिंदी, 92 मराठी, 93 ओड़िया, 94 असमिया, 95 कन्नड़, 96 अंग्रेजी दबाएं।",
            "mr": "भाषा बदलण्यासाठी: ९१ हिंदी, ९२ मराठी, ९३ ओडिया, ९४ आसामी, ९५ कन्नड, ९६ इंग्रजी दाबा.",
            "or": "ଭାଷା ବଦଳାଇବା ପାଇଁ: ୯୧ ହିନ୍ଦୀ, ୯୨ ମରାଠୀ, ୯୩ ଓଡ଼ିଆ, ୯୪ ଅସମୀୟା, ୯୫ କନ୍ନଡ଼, ୯୬ ଇଂରାଜୀ ଦବାନ୍ତୁ।",
            "as": "ভাষা সলনি কৰিবলৈ: ৯১ হিন্দী, ৯২ মাৰাঠী, ৯৩ ওড়িয়া, ৯৪ অসমীয়া, ৯৫ কন্নড়, ৯৬ ইংৰাজী টিপক।",
            "kn": "ಭಾಷೆ ಬದಲಾಯಿಸಲು: ೯೧ ಹಿಂದಿ, ೯೨ ಮರಾಠಿ, ೯೩ ಒಡಿಯಾ, ೯೪ ಅಸ್ಸಾಮಿ, ೯೫ ಕನ್ನಡ, ೯೬ ಇಂಗ್ಲಿಷ್ ಒತ್ತಿ.",
            "en": "To change language: Press 91 for Hindi, 92 for Marathi, 93 for Odia, 94 for Assamese, 95 for Kannada, 96 for English."
        }
        return {
            "farmer_id": farmer["id"],
            "language": lang,
            "state": "LANGUAGE_MENU",
            "digit": "9",
            "voice_prompt_text": lang_prompt.get(lang, lang_prompt["en"]),
            "options": [
                {"key": "91", "label": "हिंदी (Hindi)"},
                {"key": "92", "label": "मराठी (Marathi)"},
                {"key": "93", "label": "ଓଡ଼ିଆ (Odia)"},
                {"key": "94", "label": "অসমীয়া (Assamese)"},
                {"key": "95", "label": "ಕನ್ನಡ (Kannada)"},
                {"key": "96", "label": "English"}
            ]
        }

    if digit == "1":
        # Crop Advisory
        text = advisory["text"].get(lang, advisory["text"]["en"])
        return {
            "farmer_id": farmer["id"],
            "language": lang,
            "state": "PLAYING_ADVISORY",
            "digit": "1",
            "title": advisory["title"].get(lang, advisory["title"]["en"]),
            "voice_prompt_text": text,
            "audio_url": advisory.get("audio_stub_url"),
            "action_type": advisory.get("action_type")
        }
    elif digit == "2":
        # Mandi vs MSP
        pd = advisory["price_data"]
        crop = farmer["crop"]
        if pd["is_below_msp"]:
            if lang == "mr":
                text = f"लक्ष द्या शेतकरी बंधू! आपल्या {crop} पिकाचा सध्याचा बाजार भाव ₹{pd['current_price']} असून हमीभाव ₹{pd['govt_msp']} आहे. भाव {pd['shortfall_pct']}% कमी आहे. घाईत विक्री करू नका. वेअरहाऊस पावतीवर कर्ज घ्या किंवा ई-नाम नोंदणी करा."
            elif lang == "or":
                text = f"ଦୟାକରି ଧ୍ୟାନ ଦିଅନ୍ତୁ! ଆପଣଙ୍କ {crop} ଫସଲର ବର୍ତ୍ତମାନର ମଣ୍ଡି ଦର ₹{pd['current_price']} ରହିଛି, ଯାହାକି ସରକାରୀ ଏମଏସପି ₹{pd['govt_msp']} ଠାରୁ {pd['shortfall_pct']}% କମ୍ ଅଟେ। ଆତଙ୍କରେ ବିକ୍ରି କରନ୍ତୁ ନାହିଁ। ଇ-ନାମ କିମ୍ବା ୱାରହାଉସ୍ ରସିଦ ଋଣର ସୁବିଧା ନିଅନ୍ତୁ।"
            elif lang == "as":
                text = f"মন কৰক! আপোনাৰ {crop} শস্যৰ বৰ্তমান বজাৰ দৰ ₹{pd['current_price']}, যিটো চৰকাৰী সমৰ্থন মূল্য ₹{pd['govt_msp']} তকৈ {pd['shortfall_pct']}% কম। লোকচানত বিক্ৰী নকৰিব। ই-নাম বা গুদাম ৰচিদ ঋণৰ সুবিধা লওক।"
            elif lang == "kn":
                text = f"ಗಮನಿಸಿ! ನಿಮ್ಮ {crop} ಬೆಳೆಯ ಪ್ರಸ್ತುತ ಮಾರುಕಟ್ಟೆ ಬೆಲೆ ₹{pd['current_price']} ಇದ್ದು, ಸರ್ಕಾರದ ಬೆಂಬಲ ಬೆಲೆ ₹{pd['govt_msp']} ಗಿಂತ {pd['shortfall_pct']}% ಕಡಿಮೆಯಾಗಿದೆ. ಆತುರದಲ್ಲಿ ಮಾರಾಟ ಮಾಡಬೇಡಿ. ಇ-ನಾಮ್ ಅಥವಾ ಗೋದಾಮು ರಶೀದಿ ಸಾಲ ಸೌಲಭ್ಯ ಬಳಸಿ."
            elif lang == "hi":
                text = f"ध्यान दें किसान भाई! आपकी {crop} फसल का वर्तमान मंडी भाव ₹{pd['current_price']} है, जबकि सरकारी समर्थन मूल्य ₹{pd['govt_msp']} है। भाव {pd['shortfall_pct']}% कम है। संकट में कम दाम पर न बेचें। ई-नाम या पंजीकृत गोदाम रसीद ऋण का लाभ लें।"
            else:
                text = f"Attention: Current mandi price for {crop} is ₹{pd['current_price']}, which is below the Government MSP of ₹{pd['govt_msp']} by {pd['shortfall_pct']}%. Do not sell in panic."
        else:
            if lang == "mr":
                text = f"आपल्या {crop} पिकाचा बाजार भाव ₹{pd['current_price']} असून तो हमीभावाच्या (₹{pd['govt_msp']}) वर समाधानकारक आहे."
            elif lang == "or":
                text = f"ଆପଣଙ୍କ {crop} ଫସଲର ବଜାର ଦର ₹{pd['current_price']} ରହିଛି, ଯାହାକି ସରକାରୀ ଏମଏସପି (₹{pd['govt_msp']}) ଠାରୁ ଭଲ ଏବଂ ସନ୍ତୋଷଜନକ ଅଟେ।"
            elif lang == "as":
                text = f"আপোনাৰ {crop} শস্যৰ বজাৰ মূল্য ₹{pd['current_price']}, যিটো চৰকাৰী সমৰ্থন মূল্য (₹{pd['govt_msp']}) তকৈ সন্তোষজনক।"
            elif lang == "kn":
                text = f"ನಿಮ್ಮ {crop} ಬೆಳೆಯ ಮಾರುಕಟ್ಟೆ ಬೆಲೆ ₹{pd['current_price']} ಇದ್ದು, ಇದು ಬೆಂಬಲ ಬೆಲೆಗಿಂತ (₹{pd['govt_msp']}) ಉತ್ತಮವಾಗಿದೆ."
            elif lang == "hi":
                text = f"आपकी {crop} फसल का मंडी भाव ₹{pd['current_price']} है, जो समर्थन मूल्य ₹{pd['govt_msp']} से बेहतर व संतोषजनक है।"
            else:
                text = f"Current mandi price for {crop} is ₹{pd['current_price']}, which is stable and above Government MSP."

        return {
            "farmer_id": farmer["id"],
            "language": lang,
            "state": "PLAYING_MANDI",
            "digit": "2",
            "voice_prompt_text": text,
            "price_data": pd
        }
    elif digit == "3":
        # Schemes
        interventions = distress["recommended_interventions"]
        top_scheme = interventions[0] if interventions else {"scheme_name": "PM-KISAN", "action_item": "Verify enrollment"}
        if lang == "mr":
            text = f"आपल्यासाठी शिफारस केलेली योजना: {top_scheme['scheme_name']}. कृती: {top_scheme['action_item']}. अधिक माहितीसाठी जवळच्या कृषी कार्यालयात संपर्क साधा."
        elif lang == "or":
            text = f"ଆପଣଙ୍କ ପାଇଁ ସୁପାରିଶ କରାଯାଇଥିବା ସରକାରୀ ଯୋଜନା: {top_scheme['scheme_name']}। ପଦକ୍ଷେପ: {top_scheme['action_item']}। ଅଧିକ ସହାୟତା ପାଇଁ ନିକଟସ୍ଥ କୃଷି ଅଧିକାରୀଙ୍କ ସହ ଯୋଗାଯୋଗ କରନ୍ତୁ।"
        elif lang == "as":
            text = f"আপোনাৰ বাবে নিৰ্ধাৰিত আঁচনি: {top_scheme['scheme_name']}। নিৰ্দেশনা: {top_scheme['action_item']}। অধিক তথ্যৰ বাবে স্থানীয় কৃষি কাৰ্যালয়ত যোগাযোগ কৰক।"
        elif lang == "kn":
            text = f"ನಿಮಗಾಗಿ ಶಿಫಾರಸು ಮಾಡಲಾದ ಯೋಜನೆ: {top_scheme['scheme_name']}. ಕೈಗೊಳ್ಳಬೇಕಾದ ಕ್ರಮ: {top_scheme['action_item']}. ಹೆಚ್ಚಿನ ಮಾಹಿತಿಗಾಗಿ ಸಮೀಪದ ಕೃಷಿ ಇಲಾಖೆಯನ್ನು ಸಂಪರ್ಕಿಸಿ."
        elif lang == "hi":
            text = f"आपके लिए अनुशंसित योजना: {top_scheme['scheme_name']}। निर्देश: {top_scheme['action_item']}। अधिक सहायता हेतु ग्राम कृषि सहायक से संपर्क करें।"
        else:
            text = f"Recommended scheme intervention: {top_scheme['scheme_name']}. Action: {top_scheme['action_item']}."

        return {
            "farmer_id": farmer["id"],
            "language": lang,
            "state": "PLAYING_SCHEMES",
            "digit": "3",
            "voice_prompt_text": text,
            "interventions": interventions
        }
    elif digit == "0":
        # Operator callback
        op_text = {
            "hi": f"आपकी कॉल किसान मित्र एवं ब्लॉक कृषि अधिकारी को स्थानांतरित की जा रही है। कृपया प्रतीक्षा करें।",
            "mr": f"आपला फोन कृषी सहाय्यक आणि तालुका अधिकाऱ्यांकडे वर्ग केला जात आहे. कृपया थांबा.",
            "or": f"ଆପଣଙ୍କ କଲ୍ କୃଷି ଅଧିକାରୀ ଏବଂ କୃଷକ ମିତ୍ରଙ୍କ ସହ ସଂଯୋଗ କରାଯାଉଛି। ଦୟାକରି ଅପେକ୍ଷା କରନ୍ତୁ।",
            "as": f"আপোনাৰ কল কৃষি বিষয়া আৰু কৃষক মিত্ৰৰ সৈতে সংযোগ কৰা হৈছে। অনুগ্ৰহ কৰি অপেক্ষা কৰক।",
            "kn": f"ನಿಮ್ಮ ಕರೆಯನ್ನು ಕೃಷಿ ಅಧಿಕಾರಿ ಮತ್ತು ಕಿಸಾನ್ ಮಿತ್ರರಿಗೆ ವರ್ಗಾಯಿಸಲಾಗುತ್ತಿದೆ. ದಯವಿಟ್ಟು ನಿರೀಕ್ಷಿಸಿ.",
            "en": f"Transferring your call to the Block Agriculture Extension Officer. Please stay on the line."
        }
        return {
            "farmer_id": farmer["id"],
            "language": lang,
            "state": "CONNECTING_OPERATOR",
            "digit": "0",
            "voice_prompt_text": op_text.get(lang, op_text["en"])
        }
    else:
        return {
            "farmer_id": farmer["id"],
            "language": lang,
            "state": "INVALID_DIGIT",
            "voice_prompt_text": "Invalid choice. Please press 1 for Advisory, 2 for Mandi, 3 for Schemes, or 9 for Language."
        }


@app.post("/api/simulate/sms")
def simulate_sms(payload: IvrRequest):
    """
    Simulates sending plain-text localized SMS alert to basic feature phone.
    """
    data = load_full_datastore()
    farmer = next((f for f in data["farmers"] if f["id"] == payload.farmer_id), None)
    if not farmer:
        raise HTTPException(status_code=404, detail="Farmer not found")

    advisory = get_advisory(farmer["id"], data)
    distress = calculate_distress_score(farmer["id"], DEFAULT_WEIGHTS, data)
    lang = (payload.language or farmer.get("language", "hi")).lower()

    # SMS body formatting for low-cost 160-char SMS units
    top_scheme = distress["recommended_interventions"][0] if distress["recommended_interventions"] else None
    scheme_name = top_scheme['scheme_id'] if top_scheme else "PMFBY"

    if advisory["rule_id"] == "R-30":
        if lang == "or":
            sms_text = f"[କୃଷି-ସତର୍କତା] {farmer['name']}: {farmer['crop'].upper()} ମଣ୍ଡି ଦର ₹{advisory['price_data']['current_price']} ଏମଏସପି ₹{advisory['price_data']['govt_msp']} ଠାରୁ କମ୍। ଆତଙ୍କରେ ବିକ୍ରି କରନ୍ତୁ ନାହିଁ। ଇ-ନାମ ବ୍ୟବହାର କରନ୍ତୁ। ଯୋଜନା: {scheme_name}। ହେଲ୍ପଲାଇନ୍: 1800-180-1551"
        elif lang == "as":
            sms_text = f"[কৃষি-সতৰ্কবাৰ্তা] {farmer['name']}: {farmer['crop'].upper()} বজাৰ দৰ ₹{advisory['price_data']['current_price']} সমৰ্থন মূল্য ₹{advisory['price_data']['govt_msp']} তকৈ কম। লোকচানত বিক্ৰী নকৰিব। ই-নাম ব্যৱহাৰ কৰক। আঁচনি: {scheme_name}। হেল্পলাইন: 1800-180-1551"
        elif lang == "kn":
            sms_text = f"[ಕೃಷಿ-ಎಚ್ಚರಿಕೆ] {farmer['name']}: {farmer['crop'].upper()} ಮಂಡಿ ಬೆಲೆ ₹{advisory['price_data']['current_price']} ಎಂಎಸ್‌ಪಿ ₹{advisory['price_data']['govt_msp']} ಗಿಂತ ಕಡಿಮೆ. ಆತುರದಲ್ಲಿ ಮಾರಾಟ ಮಾಡಬೇಡಿ. ಯೋಜನೆ: {scheme_name}. ಸಹಾಯವಾಣಿ: 1800-180-1551"
        elif lang == "mr":
            sms_text = f"[कृषी-अलर्ट] {farmer['name']}: {farmer['crop'].upper()} बाजार भाव ₹{advisory['price_data']['current_price']} हमीभाव ₹{advisory['price_data']['govt_msp']} पेक्षा कमी. घाईत विक्री करू नका. ई-नाम वापरा. योजना: {scheme_name}. हेल्पलाइन: 1800-180-1551"
        elif lang == "hi":
            sms_text = f"[कृषि-अलर्ट] {farmer['name']}: {farmer['crop'].upper()} मंडी भाव ₹{advisory['price_data']['current_price']} सरकारी MSP ₹{advisory['price_data']['govt_msp']} से कम है। कम दाम पर न बेचें। ई-नाम का लाभ लें। योजना: {scheme_name}। हेल्पलाइन: 1800-180-1551"
        else:
            sms_text = f"[KRISHI-ALERT] {farmer['name']}: {farmer['crop'].upper()} Mandi price ₹{advisory['price_data']['current_price']} is BELOW Govt MSP ₹{advisory['price_data']['govt_msp']}. Do not panic sell. Use e-NAM or WDRA loan. Scheme: {scheme_name}. Helpline: 1800-180-1551"
    elif advisory["rule_id"] == "R-10":
        if lang == "or":
            sms_text = f"[କୃଷି-ସତର୍କତା] {farmer['name']}: ମୌସୁମୀ {advisory['weather_data']['onset_delay_days']} ଦିନ ବିଳମ୍ବ। କମ୍ ଦିନିଆ ବାଜରା/ହରଡ଼ ଚାଷ କରନ୍ତୁ। ଯୋଜନା: {scheme_name}। ହେଲ୍ପଲାଇନ୍: 1800-180-1551"
        elif lang == "as":
            sms_text = f"[কৃষি-সতৰ্কবাৰ্তা] {farmer['name']}: মৌচুমী {advisory['weather_data']['onset_delay_days']} দিন পলম। কম দিনত হোৱা বজৰা/মাহজাতীয় শস্য সিঁচক। আঁচনি: {scheme_name}। হেল্পলাইন: 1800-180-1551"
        elif lang == "kn":
            sms_text = f"[ಕೃಷಿ-ಎಚ್ಚರಿಕೆ] {farmer['name']}: ಮುಂಗಾರು {advisory['weather_data']['onset_delay_days']} ದಿನ ವಿಳಂಬ. ಅಲ್ಪಾವಧಿ ಸಜ್ಜೆ/ತೊಗರಿ ಬಿತ್ತನೆ ಮಾಡಿ. ಯೋಜನೆ: {scheme_name}. ಸಹಾಯವಾಣಿ: 1800-180-1551"
        elif lang == "mr":
            sms_text = f"[कृषी-अलर्ट] {farmer['name']}: मान्सून {advisory['weather_data']['onset_delay_days']} दिवस उशीर. बाजरी/तूर पिकाची पेरणी करा. योजना: {scheme_name}. हेल्पलाइन: 1800-180-1551"
        elif lang == "hi":
            sms_text = f"[कृषि-अलर्ट] {farmer['name']}: मानसून {advisory['weather_data']['onset_delay_days']} दिन विलंबित। कम अवधि वाले बाजरा/अरहर की बुवाई करें। योजना: {scheme_name}। हेल्पलाइन: 1800-180-1551"
        else:
            sms_text = f"[KRISHI-ALERT] {farmer['name']}: Monsoon delayed {advisory['weather_data']['onset_delay_days']} days. Switch to short-duration Bajra/Arhar. Apply for {scheme_name}. Helpline: 1800-180-1551"
    else:
        title_text = advisory['title'].get(lang, advisory['title']['en'])
        sms_text = f"[KRISHI-ADVISORY] {farmer['name']}: {title_text}. Stage: {farmer['crop_stage']}. {scheme_name}. Helpline: 1800-180-1551."

    return {
        "farmer_id": farmer["id"],
        "farmer_name": farmer["name"],
        "language": lang,
        "phone_number": farmer.get("phone", "+91-98XXX-XXXXX"),
        "sms_body": sms_text,
        "character_count": len(sms_text),
        "sms_segments": (len(sms_text) // 160) + 1,
        "delivery_status": "DELIVERED",
        "timestamp": "2026-08-26 16:45:00 IST"
    }

# In-memory TTS audio cache
TTS_CACHE = {}

def odia_to_devanagari(text: str) -> str:
    """Phonetically maps Odia Unicode characters (0x0B00-0x0B7F) to Devanagari (0x0900-0x097F)"""
    result = []
    for ch in text:
        code = ord(ch)
        if 0x0B00 <= code <= 0x0B7F:
            dev_code = code - 0x0B00 + 0x0900
            result.append(chr(dev_code))
        else:
            result.append(ch)
    return "".join(result)

def assamese_to_bengali(text: str) -> str:
    """Phonetically maps Assamese unique letters to Bengali phonetics"""
    return text.replace('\u09F0', '\u09B0').replace('\u09F1', '\u09AC')

def synthesize_speech(text: str, lang: str) -> bytes:
    import re
    import urllib.request
    import urllib.parse

    cache_key = f"{lang}:{text}"
    if cache_key in TTS_CACHE:
        return TTS_CACHE[cache_key]

    effective_lang = (lang or 'hi').lower().split('-')[0]
    processed_text = text
    
    if effective_lang == 'or':
        processed_text = odia_to_devanagari(text)
        target_tl = 'hi'
    elif effective_lang == 'as':
        processed_text = assamese_to_bengali(text)
        target_tl = 'bn'
    else:
        target_tl = effective_lang

    # Split into chunks of max 180 chars on punctuation / sentence boundaries
    parts = re.split(r'([.!?,।\n]+)', processed_text)
    chunks = []
    current_chunk = ""
    for part in parts:
        if len(current_chunk) + len(part) < 180:
            current_chunk += part
        else:
            if current_chunk.strip():
                chunks.append(current_chunk.strip())
            current_chunk = part
    if current_chunk.strip():
        chunks.append(current_chunk.strip())
    if not chunks:
        chunks = [processed_text[:180]]

    audio_segments = []
    for chunk in chunks:
        if not chunk.strip():
            continue
        encoded_text = urllib.parse.quote(chunk.strip())
        url = f"https://translate.google.com/translate_tts?ie=UTF-8&tl={target_tl}&client=tw-ob&q={encoded_text}"
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                audio_segments.append(response.read())
        except Exception as e:
            print(f"TTS chunk fetch error ({target_tl}): {e}")

    audio_data = b"".join(audio_segments)
    if audio_data:
        if len(TTS_CACHE) > 500:
            TTS_CACHE.clear()
        TTS_CACHE[cache_key] = audio_data
        return audio_data
    raise Exception(f"Failed to synthesize speech for language {lang}")

@app.get("/api/tts")
def text_to_speech_proxy(text: str, lang: str = "hi"):
    """
    High-fidelity Text-To-Speech endpoint supporting all 6 languages:
    Odia, Assamese, Kannada, Marathi, Hindi, English.
    """
    if not text:
        raise HTTPException(status_code=400, detail="Text parameter is required")
    try:
        audio_content = synthesize_speech(text, lang)
        return Response(content=audio_content, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount static assets and serve client frontend
if os.path.exists(CLIENT_DIR):
    app.mount("/static", StaticFiles(directory=CLIENT_DIR), name="static")

    @app.get("/")
    def serve_frontend_index():
        return FileResponse(os.path.join(CLIENT_DIR, "index.html"))

