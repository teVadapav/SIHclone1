"""
Database Seeding Script for PS-02 (SQLite)
Populates distress_system.db from /data JSON files.
"""

import json
import os
import sqlite3
import sys

# Ensure UTF-8 stdout on Windows
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "distress_system.db")

def init_and_seed_db():
    print(f"[SEED] Initializing SQLite database at: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Disable foreign keys during re-creation
    cursor.execute("PRAGMA foreign_keys = OFF;")

    # Drop existing tables
    cursor.executescript("""
    DROP TABLE IF EXISTS farmers;
    DROP TABLE IF EXISTS districts;
    DROP TABLE IF EXISTS mandi_prices;
    DROP TABLE IF EXISTS schemes;
    DROP TABLE IF EXISTS daily_rainfall;
    DROP TABLE IF EXISTS officers;
    DROP TABLE IF EXISTS contingency_crops;
    DROP TABLE IF EXISTS advisory_rules;

    CREATE TABLE districts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        state TEXT NOT NULL,
        soil_type TEXT NOT NULL,
        avg_rainfall_mm REAL NOT NULL,
        normal_onset_week TEXT NOT NULL,
        historical_vulnerability_index INTEGER NOT NULL,
        description TEXT
    );

    CREATE TABLE mandi_prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        district_id TEXT NOT NULL,
        crop TEXT NOT NULL,
        date TEXT NOT NULL,
        price_per_quintal REAL NOT NULL,
        govt_msp_per_quintal REAL NOT NULL,
        recent_avg_price REAL NOT NULL,
        market_name TEXT,
        unit TEXT,
        FOREIGN KEY (district_id) REFERENCES districts(id)
    );

    CREATE TABLE farmers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        district_id TEXT NOT NULL,
        village TEXT NOT NULL,
        crop TEXT NOT NULL,
        crop_stage TEXT NOT NULL,
        language TEXT NOT NULL,
        loan_due_date TEXT NOT NULL,
        loan_amount_inr REAL NOT NULL,
        tech_literacy TEXT NOT NULL,
        device_type TEXT NOT NULL,
        network_quality TEXT NOT NULL,
        landholding_hectares REAL NOT NULL,
        -- CRIDA FDI Dimension Fields
        irrigation_type TEXT NOT NULL DEFAULT 'rainfed',
        borewell_failed INTEGER NOT NULL DEFAULT 0,
        income_sources TEXT,
        has_pmfby_insurance INTEGER NOT NULL DEFAULT 0,
        has_kcc INTEGER NOT NULL DEFAULT 0,
        informal_debt INTEGER NOT NULL DEFAULT 0,
        enrolled_schemes TEXT,
        officer_id TEXT NOT NULL,
        FOREIGN KEY (district_id) REFERENCES districts(id)
    );

    CREATE TABLE schemes (
        scheme_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        short_name TEXT NOT NULL,
        trigger_signal TEXT NOT NULL,
        action_summary TEXT NOT NULL,
        portal_url TEXT,
        benefit_type TEXT
    );

    CREATE TABLE daily_rainfall (
        district_id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        rainfall_last_24h_mm REAL NOT NULL,
        cumulative_season_mm REAL NOT NULL,
        normal_to_date_mm REAL NOT NULL,
        rainfall_deviation_pct REAL NOT NULL,
        onset_date TEXT NOT NULL,
        onset_status TEXT NOT NULL,
        onset_delay_days INTEGER NOT NULL,
        dry_spell_days INTEGER NOT NULL,
        soil_moisture_index TEXT,
        FOREIGN KEY (district_id) REFERENCES districts(id)
    );

    CREATE TABLE officers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        designation TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        assigned_districts TEXT,
        office_location TEXT
    );

    CREATE TABLE contingency_crops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        crop TEXT NOT NULL,
        soil_type TEXT NOT NULL,
        onset_delay_condition TEXT NOT NULL,
        recommended_contingency_crops TEXT NOT NULL,
        agronomic_measures TEXT
    );

    CREATE TABLE advisory_rules (
        rule_id TEXT PRIMARY KEY,
        crop TEXT NOT NULL,
        stage TEXT NOT NULL,
        rainfall_bucket TEXT NOT NULL,
        soil_type TEXT NOT NULL,
        onset_status TEXT NOT NULL,
        dry_spell_stage TEXT NOT NULL,
        action_type TEXT NOT NULL,
        title_en TEXT NOT NULL,
        title_hi TEXT,
        title_mr TEXT,
        title_or TEXT,
        title_as TEXT,
        title_kn TEXT,
        template_en TEXT NOT NULL,
        template_hi TEXT,
        template_mr TEXT,
        template_or TEXT,
        template_as TEXT,
        template_kn TEXT
    );
    """)

    # Seed Districts
    with open(os.path.join(DATA_DIR, "districts.json"), "r", encoding="utf-8") as f:
        districts_data = json.load(f)
        for d in districts_data:
            cursor.execute("""
            INSERT INTO districts (id, name, state, soil_type, avg_rainfall_mm, normal_onset_week, historical_vulnerability_index, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (d["id"], d["name"], d.get("state", "Maharashtra"), d["soil_type"], d["avg_rainfall_mm"], d["normal_onset_week"], d["historical_vulnerability_index"], d.get("description", "")))

    # Seed Mandi Prices
    with open(os.path.join(DATA_DIR, "mandi_prices.json"), "r", encoding="utf-8") as f:
        mandi_data = json.load(f)
        for m in mandi_data:
            cursor.execute("""
            INSERT INTO mandi_prices (district_id, crop, date, price_per_quintal, govt_msp_per_quintal, recent_avg_price, market_name, unit)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (m["district_id"], m["crop"], m["date"], m["price_per_quintal"], m["govt_msp_per_quintal"], m.get("recent_avg_price", m["price_per_quintal"]), m.get("market_name", "APMC"), m.get("unit", "₹/Quintal")))

    # Seed Farmers
    with open(os.path.join(DATA_DIR, "farmers.json"), "r", encoding="utf-8") as f:
        farmers_data = json.load(f)
        for fm in farmers_data:
            cursor.execute("""
            INSERT INTO farmers (
                id, name, phone, district_id, village, crop, crop_stage, language,
                loan_due_date, loan_amount_inr, tech_literacy, device_type, network_quality,
                landholding_hectares,
                irrigation_type, borewell_failed, income_sources,
                has_pmfby_insurance, has_kcc, informal_debt,
                enrolled_schemes, officer_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                fm["id"], fm["name"], fm.get("phone", ""), fm["district_id"], fm.get("village", ""),
                fm["crop"], fm["crop_stage"], fm["language"], fm["loan_due_date"],
                fm.get("loan_amount_inr", 50000), fm["tech_literacy"], fm["device_type"], fm["network_quality"],
                fm["landholding_hectares"],
                fm.get("irrigation_type", "rainfed"),
                1 if fm.get("borewell_failed", False) else 0,
                json.dumps(fm.get("income_sources", ["crop_cultivation"])),
                1 if fm.get("has_pmfby_insurance", False) else 0,
                1 if fm.get("has_kcc", False) else 0,
                1 if fm.get("informal_debt", False) else 0,
                json.dumps(fm.get("enrolled_schemes", [])), fm["officer_id"]
            ))

    # Seed Schemes
    with open(os.path.join(DATA_DIR, "schemes.json"), "r", encoding="utf-8") as f:
        schemes_data = json.load(f)
        for s in schemes_data:
            cursor.execute("""
            INSERT INTO schemes (scheme_id, name, short_name, trigger_signal, action_summary, portal_url, benefit_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (s["scheme_id"], s["name"], s.get("short_name", s["name"]), s["trigger_signal"], s["action_summary"], s.get("portal_url", ""), s.get("benefit_type", "")))

    # Seed Rainfall
    with open(os.path.join(DATA_DIR, "daily_rainfall.json"), "r", encoding="utf-8") as f:
        rainfall_data = json.load(f)
        for r in rainfall_data:
            cursor.execute("""
            INSERT INTO daily_rainfall (district_id, date, rainfall_last_24h_mm, cumulative_season_mm, normal_to_date_mm, rainfall_deviation_pct, onset_date, onset_status, onset_delay_days, dry_spell_days, soil_moisture_index)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (r["district_id"], r["date"], r.get("rainfall_last_24h_mm", 0), r["cumulative_season_mm"], r["normal_to_date_mm"], r["rainfall_deviation_pct"], r["onset_date"], r["onset_status"], r["onset_delay_days"], r["dry_spell_days"], r.get("soil_moisture_index", "moderate")))

    # Seed Officers
    with open(os.path.join(DATA_DIR, "officers.json"), "r", encoding="utf-8") as f:
        officers_data = json.load(f)
        for o in officers_data:
            cursor.execute("""
            INSERT INTO officers (id, name, designation, phone, email, assigned_districts, office_location)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (o["id"], o["name"], o["designation"], o["phone"], o["email"], json.dumps(o.get("assigned_districts", [])), o.get("office_location", "")))

    # Seed Contingency Crops
    with open(os.path.join(DATA_DIR, "contingency_crops.json"), "r", encoding="utf-8") as f:
        contingency_data = json.load(f)
        for c in contingency_data:
            cursor.execute("""
            INSERT INTO contingency_crops (crop, soil_type, onset_delay_condition, recommended_contingency_crops, agronomic_measures)
            VALUES (?, ?, ?, ?, ?)
            """, (c["crop"], c["soil_type"], c["onset_delay_condition"], json.dumps(c["recommended_contingency_crops"]), c.get("agronomic_measures", "")))

    # Seed Advisory Rules
    with open(os.path.join(DATA_DIR, "advisory_rules.json"), "r", encoding="utf-8") as f:
        rules_data = json.load(f)
        for ru in rules_data:
            cursor.execute("""
            INSERT INTO advisory_rules (
                rule_id, crop, stage, rainfall_bucket, soil_type, onset_status, dry_spell_stage, action_type,
                title_en, title_hi, title_mr, title_or, title_as, title_kn,
                template_en, template_hi, template_mr, template_or, template_as, template_kn
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                ru["rule_id"], ru["crop"], ru["stage"], ru["rainfall_bucket"], ru["soil_type"], ru["onset_status"], ru["dry_spell_stage"], ru["action_type"],
                ru.get("title_en", ""), ru.get("title_hi", ""), ru.get("title_mr", ""), ru.get("title_or", ""), ru.get("title_as", ""), ru.get("title_kn", ""),
                ru.get("template_en", ""), ru.get("template_hi", ""), ru.get("template_mr", ""), ru.get("template_or", ""), ru.get("template_as", ""), ru.get("template_kn", "")
            ))

    conn.commit()
    conn.close()
    print("[SEED SUCCESS] Database successfully created and seeded!")

if __name__ == "__main__":
    init_and_seed_db()
