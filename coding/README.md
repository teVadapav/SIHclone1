# Smart Krishi (PS-02) — Smart Crop Advisory & Farmer Distress Early-Warning System (v3)

> **Comprehensive Feasibility Edition**: An integrated agro-climatic & market-intelligence decision-support system featuring the **Advisory Engine** (with CRIDA contingency logic and MSP market interventions) and the **Distress-Risk Scorer** (with 4-factor risk weighting, MSP price signals, historical district fragility index, and actionable government scheme mapping).

---

## 🎯 Key Innovation & Architectural Pillars

1. **Market Distress Override (`R-30`)**:
   Agronomy advice alone cannot prevent distress sales. When a farmer's crop reaches the `harvest` stage and the local Mandi price drops below the Government Minimum Support Price (`govt_msp_per_quintal`), the Advisory Engine forces a **Market Intervention Alert (`R-30`)** instructing the farmer to avoid panic selling and leverage e-NAM APMC enrollment or WDRA negotiable warehouse receipt pledge loans.

2. **4-Factor Distress-Risk Scorer**:
   Combines real-time agro-climatic stress with structural socio-economic fragility:
   $$\text{Distress Score} = 0.35 \times R + 0.30 \times P + 0.20 \times L + 0.15 \times V$$
   - **$R$ (Rainfall Deficit)**: $\min(|\text{deviation}\%|, 100)$
   - **$P$ (Price vs MSP)**: $\max(0, \frac{\text{MSP} - \text{Price}}{\text{MSP}} \times 100)$
   - **$L$ (Loan Due Proximity)**: $100 - \min(100, (\frac{\text{Days to Due}}{90}) \times 100)$
   - **$V$ (District Fragility Index)**: $0\text{--}100$ proxy for historical agrarian crisis sensitivity.

3. **Actionable Government Scheme Mapping (`recommended_interventions`)**:
   Instead of displaying abstract distress scores, the Officer Dashboard maps every trigger signal directly to an actionable policy intervention:
   - **Rainfall Deficit / Dry Spell** $\rightarrow$ **PMFBY** (Crop Insurance claim forms)
   - **Mandi Price < MSP** $\rightarrow$ **PM-AASHA / e-NAM** (MSP procurement & pledge loans)
   - **Loan Due Proximity** $\rightarrow$ **KCC Debt Restructuring** & **PM-KISAN DBT release**
   - **High District Fragility** $\rightarrow$ **State Special Drought Relief Package (S4)**

4. **Adaptive Capacity & Digital Inclusivity**:
   - **Assisted Mode (Kisan Mitra / CSC)**: Allows Village Level Entrepreneurs (VLEs) or extension workers to manage multiple farmers on a shared device.
   - **Automated Channel Routing (`getRecommendedChannel`)**: Evaluates `device_type` and `network_quality` to direct outreach to **In-App Voice/Text** (smartphones) or **IVR Phone Calls / Plain-Text SMS** (2G feature phones).
   - **Ethical Safeguard**: The *District Fragility Index* ($V$) is strictly an officer-facing structural context metric and is never exposed on the farmer interface.

---

## 🏗️ System Architecture

```
                                  +-----------------------------+
                                  |   SQLite Seeded Datastore   |
                                  |  (/data/*.json + Schema)    |
                                  +--------------+--------------+
                                                 |
                                                 v
                     +---------------------------+---------------------------+
                     |                                                       |
                     v                                                       v
      +------------------------------+                       +------------------------------+
      |      Advisory Engine         |                       |     Distress-Risk Scorer     |
      | - CRIDA Contingency Logic    |                       | - 4-Factor Weighted Model    |
      | - Harvest Price < MSP (R-30) |                       | - Actionable Scheme Mapping  |
      +--------------+---------------+                       +--------------+---------------+
                     |                                                       |
                     +---------------------------+---------------------------+
                                                 |
                                                 v
                                  +-----------------------------+
                                  |     FastAPI REST Server     |
                                  |      (server/main.py)       |
                                  +--------------+--------------+
                                                 |
                     +---------------------------+---------------------------+
                     |                                                       |
                     v                                                       v
      +------------------------------+                       +------------------------------+
      |       Farmer Portal UI       |                       |      Officer Dashboard       |
      | - Large Touch Targets (4-Btn)|                       | - Live Re-ranking Sliders    |
      | - Voice TTS (Hi / Mr / En)   |                       | - Contact Channels (App/IVR) |
      | - MSP Line & Warning Badge   |                       | - Field Paperwork Checklist  |
      | - Assisted vs Self Mode      |                       | - Structural Risk Context    |
      +------------------------------+                       +------------------------------+
```

---

## ⚡ Quick Start & Setup

### Prerequisites
- Python 3.10+ (standard installation)

### 1. Install Dependencies
```bash
pip install fastapi uvicorn pydantic httpx
```

### 2. Seed the Database
```bash
python server/seed_db.py
```

### 3. Start Application Server
```bash
python -m uvicorn server.main:app --host 127.0.0.1 --port 8000
```
Open your browser at **`http://127.0.0.1:8000`**.

### 4. Run Automated Test Suite
```bash
# Unit tests for pure engines
python -m unittest discover tests

# End-to-end acceptance criteria validation (Section 12 checklist)
python tests/test_e2e_acceptance.py
```

---

## ⏱️ 3-Minute Judge Demo Script

Follow this exact walkthrough to demonstrate all core features to hackathon evaluators in 3 minutes:

### Step 1: Market Intervention & MSP Warning (Farmer App)
1. Navigate to **`http://127.0.0.1:8000`** (Farmer App opens by default).
2. Note that **Ramesh Patil (F1)** is loaded in **Assisted Mode** (auto-selected because he is a low-literacy farmer with a feature phone).
3. Point out the top **Advisory Card**:
   - Notice the red **`MARKET INTERVENTION (R-30)`** badge.
   - Click **`Play Spoken Advisory (आवाज ऐका)`** to demonstrate regional Text-to-Speech playback.
   - *Key takeaway for judges*: *"Notice how because Ramesh is at harvest stage and Mandi price is below MSP, agronomy advice is automatically overridden with financial contingency advice to avoid panic selling."*
4. Click the **💰 Mandi Price** button:
   - Point out the prominent **Govt MSP Line (₹1,500/q)** vs **Today's Price (₹1,100/q)**.
   - Show the red warning banner advising e-NAM registration and warehouse pledge financing.

### Step 2: CRIDA Contingency Crop Switch (Farmer App)
1. Switch the farmer dropdown to **Sunita Shinde (F2)** from Vidarbha.
2. Notice how her advisory immediately switches to **`CRIDA CONTINGENCY SWITCH (R-10)`**:
   - Because the monsoon onset is delayed by 23 days, the system warns against sowing long-duration cotton and recommends short-duration **Pearl Millet (Bajra)** and **Pigeonpea (Arhar)**.

### Step 3: Officer Early-Warning Dashboard & Live Re-ranking
1. Click **📊 Officer Dashboard** in the top navigation bar.
2. Show the Registry Table:
   - **Ramesh Patil** has a **Medium Risk (52.9)** score, top signal *"Onion price below MSP by 26.7%"*, recommended scheme **PM-AASHA / e-NAM**, and contact channel **☎️ Call / IVR**.
   - **Ganesh Rao (F3)**: Notice that although Ganesh has normal weather and price, he is flagged with **State Drought Relief Package (S4)** because Vidarbha has a high **District Fragility Index (92/100)**!
3. Click **View Details 🔍** on Ramesh Patil:
   - Show the **4-Factor Points Breakdown** ($R=14.6$, $P=8.0$, $L=17.6$, $V=12.8$).
   - Show the **Field Reachability Guidance**: *"Feature phone on 2G poor network $\rightarrow$ Call directly or dispatch Kisan Mitra VLE."*
   - Show the **Field Paperwork to Bring**: *"Facilitate e-NAM APMC MSP procurement enrollment or WDRA pledge financing."*
   - Close the modal.
4. **Interactive Sliders**:
   - Drag the **🌦️ Rainfall Deficit** slider to 80%. Notice the list instantly re-ranks in real-time, placing **Sunita Shinde** at the top with a High Risk score without any page reload!
   - Click **Reset to Standard**.

### Step 4: IVR & SMS Fallback Simulator
1. Click **📟 IVR / SMS Fallback** in the top navigation bar.
2. In the virtual phone on the left, press **`1`** (Advisory), **`2`** (Mandi vs MSP), and **`3`** (Govt Schemes).
3. On the right, click **Send Test SMS** to demonstrate the compact, 160-character plain-text SMS alert formatted for basic feature phones.

---

## 📊 Acceptance Checklist (Section 12 Verification Matrix)

| Acceptance Requirement | Status | Verification Detail |
| :--- | :---: | :--- |
| **Advisory Response $\le$ 2s** | ✅ PASS | Verified across all farmers in `< 0.02s` execution time. |
| **Delayed-Onset Contingency Switch** | ✅ PASS | Sunita Shinde (F2) receives `R-10` with Pearl Millet & Pigeonpea. |
| **Harvest Price < MSP Override** | ✅ PASS | Ramesh Patil (F1) receives `R-30` market intervention alert. |
| **Vulnerability Index Integration** | ✅ PASS | 4th weight ($0.15 \times V$) accurately computed in composite score. |
| **Recommended Scheme Mapping** | ✅ PASS | Triggers map to PMFBY, PM-AASHA, KCC, and State Drought Relief. |
| **Assisted Mode Toggle & Pre-selection** | ✅ PASS | Auto-selects based on `tech_literacy` and `device_type`. |
| **Adaptive Channel Routing** | ✅ PASS | `getRecommendedChannel` maps feature phone $\rightarrow$ `ivr_or_sms`, smartphone $\rightarrow$ `in_app`. |
| **MSP-Relative Price Formula ($P$)** | ✅ PASS | Computed as $((MSP - Price)/MSP) \times 100$ whenever MSP exists. |
| **Vulnerability Signal Non-Redundancy** | ✅ PASS | Ganesh Rao (F3) surfaces State Drought Relief (S4) from vulnerability alone. |
| **Ethical Fragility Isolation** | ✅ PASS | Fragility index is strictly excluded from all farmer-facing endpoints/UI. |
| **Live Slider Re-ranking** | ✅ PASS | Dragging any of the 4 sliders re-ranks dashboard instantaneously. |
| **Network-Independent Offline Demo** | ✅ PASS | Zero external API dependencies; 100% seeded locally in SQLite. |

---

## 👥 Seed Dataset Summary

| ID | Farmer Name | District | Crop | Stage | Tech Literacy | Device | Primary Trigger | Recommended Scheme | Channel |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F1** | Ramesh Patil | Nashik ($V=85$) | Onion | Harvest | Low | Feature Phone | Price < MSP (-26.7%) | PM-AASHA / e-NAM | ☎️ Call/IVR |
| **F2** | Sunita Shinde | Vidarbha ($V=92$) | Cotton | Sowing | Low | Basic Smartphone | Rain Deficit (-50%), Delay | PMFBY Crop Insurance | ☎️ Call/IVR |
| **F3** | Ganesh Rao | Vidarbha ($V=92$) | Soybean | Vegetative | High | Smartphone | Structural District Fragility | State Drought Relief (S4) | 📱 App Push |
| **F4** | Anil Kadam | Konkan ($V=30$) | Rice | Vegetative | High | Smartphone | Favorable Rainfall | PMFBY (Standard) | 📱 App Push |
| **F5** | Rekha Devi | Nashik ($V=85$) | Maize | Flowering | Low | Feature Phone | Loan Due in 7 Days | KCC Restructuring | ☎️ Call/IVR |
| **F6** | Prakash Deshmukh | Vidarbha ($V=92$) | Cotton | Flowering | Low | Basic Smartphone | Dry Spell 16 Days & Loan | PMFBY & KCC | ☎️ Call/IVR |
