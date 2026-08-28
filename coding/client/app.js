/**
 * PS-02: Smart Crop Advisory & Farmer Distress Early-Warning System (v3)
 * Frontend Application Logic (Vanilla JS + Modern Component Architecture)
 */

// Application State
const state = {
  activeView: 'farmer',         // 'farmer' | 'officer' | 'simulator'
  farmerAccessMode: 'assisted', // 'assisted' | 'self'
  selectedFarmerId: 'F1',
  selectedLanguage: 'hi',
  activeFarmerTab: 'advisory',  // 'advisory' | 'mandi' | 'alerts' | 'schemes'
  farmers: [],
  currentFarmer: null,
  currentAdvisory: null,
  currentDistress: null,
  officerFarmers: [],
  officerMetrics: {},
  weights: {
    exposure:           0.25,   // E  — Dimension 1: Climate & Price Hazard
    sensitivity:        0.15,   // S  — Dimension 2: Irrigation Dependency
    adaptive_capacity:  0.15,   // AC — Dimension 3: Landholding & Income (inverted)
    mitigation_deficit: 0.15,   // M  — Dimension 4: PMFBY / KCC Deficit
    trigger:            0.20,   // T  — Dimension 5: Loan & Informal Debt Shock
    district_fragility: 0.10    // DF — Dimension 6: Historical Vulnerability
  },
  selectedOfficerFarmer: null,
  ivrState: null,
  currentAudio: null,
  isSpeaking: false
};

// API Base URL (relative path)
const API_BASE = '/api';

// ─── Google Cloud API Configuration ──────────────────────────────────────────
// Fill in your GCP API key below (enable Cloud Text-to-Speech + Translation APIs)
// Without a key the system automatically falls back to the browser Web Speech API
const GOOGLE_TTS_API_KEY       = '';  // e.g. 'AIzaSy...'
const GOOGLE_TRANSLATE_API_KEY = '';  // Same key works if Translation API is also enabled

// All 6 supported languages with Google Cloud TTS voice profiles
const SUPPORTED_LANGUAGES = {
  en: { name: 'English',   bcp47: 'en-IN', voice: 'en-IN-Standard-A', script: 'latin'      },
  hi: { name: '\u0939\u093f\u0902\u0926\u0940',    bcp47: 'hi-IN', voice: 'hi-IN-Standard-A', script: 'devanagari' },
  mr: { name: '\u092e\u0930\u093e\u0920\u0940',    bcp47: 'mr-IN', voice: 'mr-IN-Standard-A', script: 'devanagari' },
  or: { name: '\u0b13\u0b21\u0b3c\u0b3f\u0b06',   bcp47: 'or-IN', voice: 'or-IN-Standard-A', script: 'odia'       },
  as: { name: '\u0985\u09b8\u09ae\u09c0\u09af\u09bc\u09be', bcp47: 'as-IN', voice: 'as-IN-Standard-B', script: 'assamese'   },
  kn: { name: '\u0c95\u0ca8\u0ccd\u0ca8\u0ca1',  bcp47: 'kn-IN', voice: 'kn-IN-Standard-A', script: 'kannada'    },
};

// ─── i18n Translation Table (Natural, Modern & Colloquial Indian Languages) ───
const i18n = {
  en: {
    accessMode: 'Access Mode', assistedMode: '🤝 Assisted Mode (Kisan Mitra / CSC)',
    selfService: '📱 Self-Service', selectFarmer: 'Select Farmer:', language: 'Language:',
    cropAdvisory: 'Crop Advisory', cropAdvisorySub: 'Weather & Crop Care Guidance',
    mandiPrice: 'Mandi Price', mandiPriceSub: 'Current Market vs Govt MSP',
    myAlerts: 'My Alerts', myAlertsSub: 'Rainfall & Loan Due Notices',
    govtSchemes: 'Govt Schemes', govtSchemesSub: 'PMFBY, KCC & Debt Relief',
    tapToListen: 'Tap to listen 🔊', playAdvisory: 'Play Spoken Advisory (Voice)',
    stopAudio: 'Stop Audio ⏹️', playing: 'Playing advisory audio…',
    optimalChannel: 'Recommended Channel', translating: 'Translating…',

    // Weather & Soil Context
    weatherContextTitle: 'Weather & Soil Indicators',
    listenAllWeather: 'Listen Weather & Soil 🔊',
    tapToListenShort: 'Tap to listen 🔊',
    rainDevLabel: 'Rainfall Deviation',
    drySpellLabel: 'Dry Spell Length',
    monsoonOnsetLabel: 'Monsoon Onset',
    soilTypeLabel: 'Soil Type',

    // Officer Dashboard
    officerBadge: 'Administration & Extension Portal',
    officerMainTitle: 'District Agro-Distress Monitoring & Interventions',
    officerMainSub: 'ICAR-CRIDA FDI framework early-warning dashboard for block agriculture officers and field workers.',
    playOfficerBriefing: 'Listen to District Briefing 🔊',
    metricTotal: 'Total Monitored', metricTotalSub: 'Across 3 Agro-Districts',
    metricHigh: 'High Risk Alert', metricHighSub: 'Immediate intervention required',
    metricMed: 'Medium Risk', metricMedSub: 'Under advisory monitoring',
    metricLow: 'Low Risk', metricLowSub: 'Stable agronomic conditions',
    calibratorTitle: 'CRIDA FDI Weight Calibrator — 6 Dimensions',
    calibratorSub: 'Adjust dimension weights (ICAR-CRIDA FDI Framework). Sliders auto-normalize to 100% and re-rank the farmer list live. DF shown to officer only.',
    resetDefaults: 'Reset to CRIDA Defaults (25/15/15/15/20/10)',
    sliderExposure: '🌦️ E — Exposure (Climate & Price)', sliderExposureSub: 'Rainfall deficit + MSP price shortfall exposure (Dim. 1)',
    sliderSensitivity: '💧 S — Sensitivity (Irrigation)', sliderSensitivitySub: 'Irrigation dependency: rainfed / borewell / canal (Dim. 2)',
    sliderAC: '🌱 AC — Adaptive Capacity (Inverted)', sliderACSub: 'Landholding size + income diversification (Dim. 3, inverted)',
    sliderMitigation: '🏛️ M — Mitigation Deficit (PMFBY/KCC)', sliderMitigationSub: 'Uninsured & no KCC = maximum deficit (Dim. 4)',
    sliderTrigger: '💳 T — Trigger (Loan & Informal Debt)', sliderTriggerSub: 'Loan urgency + moneylender informal debt shock (Dim. 5)',
    sliderDF: '🏔️ DF — District Fragility (Officer-only)', sliderDFSub: 'Historical agrarian crisis index — not shown to farmers (Dim. 6)',
    registryTitle: 'Farmer Distress Early-Warning Registry',
    registrySub: 'Ranked by compound distress risk score. Maps individual triggers directly to actionable government interventions.',
    filterLabel: 'Filter:', filterAll: 'All Risk Bands', filterHigh: 'High Risk Only (71-100)', filterMed: 'Medium Risk (41-70)', filterLow: 'Low Risk (0-40)',
    thFarmerVillage: 'Farmer & Village', thDistrict: 'District', thCropStage: 'Crop & Stage', thDistressScore: 'Distress Score',
    thTopTrigger: 'Top Trigger Signal', thRecommendedScheme: 'Recommended Scheme', thContactChannel: 'Contact Channel', thActions: 'Actions',
    viewDetails: 'View Details 🔍', callIvr: 'Call / IVR', appPush: 'App Push',

    // Modal
    modalListenBriefing: 'Listen Case Summary 🔊',
    modalReachabilityTitle: 'Field Contact & Reachability Guidance:',
    modalBreakdownTitle: 'Distress Score Breakdown — ICAR-CRIDA 6-Dimension FDI (Reddy et al., 2021):',
    modalExplanationsTitle: 'Contributing Signal Explanations:',
    modalLandTitle: 'Landholding Context', modalFragilityTitle: 'District Fragility Index (Structural)',
    modalInterventionsTitle: 'Actionable Scheme Interventions (Field Paperwork to Bring):',
    modalCloseBtn: 'Close Registry Detail',

    // Simulator & Keypad
    simBadge: 'Adaptive Capacity Fallback Layer',
    simTitle: 'Interactive IVR Voice & Plain-Text SMS Simulator',
    simSub: 'Over 65% of smallholder farmers in vulnerable districts operate basic feature phones or suffer from 2G/poor rural network. This simulator demonstrates how the system delivers actionable advisories and distress warnings via automated voice calls (IVR) and plain-text SMS.',
    ivrHeaderTitle: 'Interactive IVR Voice Call', ivrSpeakPrompt: 'Speak Prompt (TTS)', ivrRestartCall: 'Restart Call 🔄',
    pressKeypad: 'Press Phone Keypad:', keyAdvisory: 'ADVISORY', keyMandi: 'MANDI/MSP', keySchemes: 'SCHEMES', keyOfficer: 'OFFICER',
    quickLangSwitch: 'Keypad Language Direct Switch:',
    smsEmulatorTitle: 'Feature Phone SMS Emulator', smsEmulatorSub: 'Plain-text 160-character GSM SMS Delivery', sendTestSms: 'Send Test SMS 📨',
    simDesignNoteTitle: 'Adaptive Capacity Design Validation:',
    simDesignNote1: '• Plain text without markdown ensures 100% compatibility on 2G feature phones.',
    simDesignNote2: '• Standardized toll-free helpline number allows immediate one-touch callback.',
    simDesignNote3: '• Automatically localized into farmer\'s registered language preference.'
  },
  hi: {
    accessMode: 'उपयोग का तरीका', assistedMode: '🤝 सहायता मोड (किसान मित्र / सीएससी केंद्र)',
    selfService: '📱 स्वयं उपयोग', selectFarmer: 'किसान चुनें:', language: 'भाषा:',
    cropAdvisory: 'फसल सलाह', cropAdvisorySub: 'मौसम एवं फसल देखभाल मार्गदर्शन',
    mandiPrice: 'मंडी भाव', mandiPriceSub: 'वर्तमान बाजार भाव बनाम सरकारी एमएसपी',
    myAlerts: 'जरूरी अलर्ट', myAlertsSub: 'बारिश का हाल एवं ऋण सूचनाएं',
    govtSchemes: 'सरकारी योजनाएं', govtSchemesSub: 'फसल बीमा (PMFBY), केसीसी एवं राहत',
    tapToListen: 'सुनने के लिए दबाएं 🔊', playAdvisory: 'पूरी सलाह सुनें (आवाज)',
    stopAudio: 'आवाज रोकें ⏹️', playing: 'सलाह सुनाई जा रही है…',
    optimalChannel: 'सुझाया गया संपर्क माध्यम', translating: 'अनुवाद हो रहा है…',

    // Weather & Soil Context
    weatherContextTitle: 'मौसम एवं मिट्टी के मुख्य संकेतक',
    listenAllWeather: 'मौसम व मिट्टी रिपोर्ट सुनें 🔊',
    tapToListenShort: 'सुनने के लिए दबाएं 🔊',
    rainDevLabel: 'वर्षा विचलन (कमी/अधिक)',
    drySpellLabel: 'सूखे के दिन (खंड)',
    monsoonOnsetLabel: 'मानसून आगमन',
    soilTypeLabel: 'मिट्टी का प्रकार',

    // Officer Dashboard
    officerBadge: 'प्रशासन एवं कृषि विस्तार पोर्टल',
    officerMainTitle: 'जिला कृषि संकट निगरानी एवं सरकारी सहायता डैशबोर्ड',
    officerMainSub: 'प्रखंड कृषि अधिकारियों एवं फील्ड कार्यकर्ताओं के लिए ICAR-CRIDA FDI आधारित पूर्व-चेतावनी प्रणाली।',
    playOfficerBriefing: 'जिला सारांश सुनें 🔊',
    metricTotal: 'कुल पंजीकृत किसान', metricTotalSub: '3 कृषि जिलों में',
    metricHigh: 'गंभीर संकट (High Risk)', metricHighSub: 'तत्काल सहायता एवं फील्ड विजिट आवश्यक',
    metricMed: 'मध्यम संकट (Medium Risk)', metricMedSub: 'सलाहकारी निगरानी के तहत',
    metricLow: 'कम जोखिम (Low Risk)', metricLowSub: 'संतोषजनक कृषि स्थिति',
    calibratorTitle: 'CRIDA FDI भार कैलिब्रेटर — 6 आयाम',
    calibratorSub: 'आयामों के भार समायोजित करें (ICAR-CRIDA रूपरेखा)। स्लाइडर स्वतः 100% पर संतुलित होकर लाइव रैंकिंग बदलते हैं।',
    resetDefaults: 'CRIDA मूल भार पर रीसेट करें (25/15/15/15/20/10)',
    sliderExposure: '🌦️ E — मौसम व भाव जोखिम (Exposure)', sliderExposureSub: 'वर्षा कमी + मंडी भाव में गिरावट जोखिम (आयाम 1)',
    sliderSensitivity: '💧 S — सिंचाई संवेदनशीलता (Sensitivity)', sliderSensitivitySub: 'सिंचाई पर निर्भरता: वर्षा आधारित / बोरवेल / नहर (आयाम 2)',
    sliderAC: '🌱 AC — अनुकूलन क्षमता (Adaptive Capacity)', sliderACSub: 'भूमि का आकार + आय के अन्य साधन (आयाम 3, उल्टा)',
    sliderMitigation: '🏛️ M — सुरक्षा में कमी (Mitigation Deficit)', sliderMitigationSub: 'बिना बीमा व बिना केसीसी = सर्वाधिक जोखिम (आयाम 4)',
    sliderTrigger: '💳 T — ऋण का दबाव (Trigger Signal)', sliderTriggerSub: 'ऋण चुकाने की जल्दी + साहूकार का कर्ज (आयाम 5)',
    sliderDF: '🏔️ DF — जिला संवेदनशीलता (District Fragility)', sliderDFSub: 'ऐतिहासिक संकट सूचकांक — केवल अधिकारियों हेतु (आयाम 6)',
    registryTitle: 'किसान संकट पूर्व-चेतावनी पंजी (Registry)',
    registrySub: 'संयुक्त संकट स्कोर के आधार पर क्रमित। विशिष्ट कारणों को सीधे सरकारी योजनाओं से जोड़ता है।',
    filterLabel: 'फिल्टर:', filterAll: 'सभी जोखिम स्तर', filterHigh: 'केवल गंभीर संकट (71-100)', filterMed: 'मध्यम संकट (41-70)', filterLow: 'कम जोखिम (0-40)',
    thFarmerVillage: 'किसान व गांव', thDistrict: 'जिला', thCropStage: 'फसल व अवस्था', thDistressScore: 'संकट स्कोर',
    thTopTrigger: 'मुख्य संकट कारण', thRecommendedScheme: 'प्रस्तावित योजना', thContactChannel: 'संपर्क माध्यम', thActions: 'कार्रवाई',
    viewDetails: 'विवरण देखें 🔍', callIvr: 'कॉल / IVR', appPush: 'ऐप नोटिफिकेशन',

    // Modal
    modalListenBriefing: 'केस का सारांश सुनें 🔊',
    modalReachabilityTitle: 'फील्ड संपर्क एवं संचार मार्गदर्शन:',
    modalBreakdownTitle: 'संकट स्कोर विश्लेषण — ICAR-CRIDA 6-आयाम FDI (रेड्डी एवं सहयोगी, 2021):',
    modalExplanationsTitle: 'संकट के मुख्य कारण:',
    modalLandTitle: 'भूमि स्वामित्व संदर्भ', modalFragilityTitle: 'जिला संवेदनशीलता सूचकांक',
    modalInterventionsTitle: 'सरकारी सहायता योजनाएं (फील्ड में साथ ले जाने वाले दस्तावेज):',
    modalCloseBtn: 'विवरण बंद करें',

    // Simulator & Keypad
    simBadge: 'बुनियादी फोन सहायता प्रणाली',
    simTitle: 'इंटरएक्टिव आईवीआर (IVR) व एसएमएस सिमुलेटर',
    simSub: 'ग्रामीण क्षेत्रों में अधिकांश किसान 2G कीपैड फोन का उपयोग करते हैं। यह सिमुलेटर दिखाता है कि स्वचालित वॉयस कॉल और एसएमएस से किसानों तक जानकारी कैसे पहुंचती है।',
    ivrHeaderTitle: 'स्वचालित आईवीआर (IVR) वॉयस कॉल', ivrSpeakPrompt: 'आवाज में सुनें (TTS)', ivrRestartCall: 'कॉल दोबारा शुरू करें 🔄',
    pressKeypad: 'फोन कीपैड दबाएं:', keyAdvisory: 'फसल सलाह', keyMandi: 'मंडी भाव', keySchemes: 'योजनाएं', keyOfficer: 'अधिकारी',
    quickLangSwitch: 'कीपैड भाषा सीधे बदलें:',
    smsEmulatorTitle: 'फीचर फोन एसएमएस एमुलेटर', smsEmulatorSub: '160 अक्षरों का साधारण हिंदी/स्थानीय एसएमएस', sendTestSms: 'परीक्षण एसएमएस भेजें 📨',
    simDesignNoteTitle: '2G फोन अनुकूलन डिजाइन:',
    simDesignNote1: '• बिना इंटरनेट वाले 2G कीपैड फोन पर 100% सुचारू संचालन।',
    simDesignNote2: '• किसान सीधे 1800-180-1551 पर एक बटन दबाकर सहायता ले सकते हैं।',
    simDesignNote3: '• किसान की पंजीकृत स्थानीय भाषा में स्वचालित अनुवाद।'
  },
  mr: {
    accessMode: 'वापर पद्धती', assistedMode: '🤝 साहाय्य मोड (किसान मित्र / सीएससी केंद्र)',
    selfService: '📱 स्वतः वापरा', selectFarmer: 'शेतकरी निवडा:', language: 'भाषा:',
    cropAdvisory: 'पीक सल्ला', cropAdvisorySub: 'हवामान अंदाज व पीक काळजी मार्गदर्शन',
    mandiPrice: 'बाजार भाव', mandiPriceSub: 'सध्याचा बाजार भाव विरुद्ध हमीभाव (MSP)',
    myAlerts: 'महत्त्वाच्या सूचना', myAlertsSub: 'पावसाचा खंड व पीक कर्ज सूचना',
    govtSchemes: 'शासकीय योजना', govtSchemesSub: 'पीक विमा (PMFBY), केसीसी व शासकीय मदत',
    tapToListen: 'ऐकण्यासाठी टॅप करा 🔊', playAdvisory: 'सल्ला ऐका (आवाज)',
    stopAudio: 'आवाज थांबवा ⏹️', playing: 'सल्ला सुरू आहे…',
    optimalChannel: 'योग्य संपर्क माध्यम', translating: 'भाषांतर सुरू आहे…',

    // Weather & Soil Context
    weatherContextTitle: 'हवामान व मातीचे मुख्य निर्देशांक',
    listenAllWeather: 'हवामान व माती अहवाल ऐका 🔊',
    tapToListenShort: 'ऐकण्यासाठी टॅप करा 🔊',
    rainDevLabel: 'पावसाची तूट/वाढ',
    drySpellLabel: 'पावसाचा खंड (दिवस)',
    monsoonOnsetLabel: 'मान्सून आगमन',
    soilTypeLabel: 'मातीचा प्रकार',

    // Officer Dashboard
    officerBadge: 'प्रशासन व कृषी विस्तार पोर्टल',
    officerMainTitle: 'जिल्हा कृषी संकट देखरेख व शासकीय साहाय्य प्रणाली',
    officerMainSub: 'तालुका कृषी अधिकारी व कृषी सहायकांसाठी ICAR-CRIDA FDI पूर्व-सूचना डॅशबोर्ड.',
    playOfficerBriefing: 'जिल्हा सारांश ऐका 🔊',
    metricTotal: 'एकूण शेतकरी', metricTotalSub: '३ कृषी जिल्ह्यांमध्ये',
    metricHigh: 'गंभीर संकट (High Risk)', metricHighSub: 'तातडीने हस्तक्षेप व शेतावर भेट आवश्यक',
    metricMed: 'मध्यम संकट (Medium Risk)', metricMedSub: 'सल्ला देखरेखीखाली',
    metricLow: 'कमी धोका (Low Risk)', metricLowSub: 'समाधानकारक पीक स्थिती',
    calibratorTitle: 'CRIDA FDI भार कॅलिब्रेटर — ६ परिमाणे',
    calibratorSub: 'परिमाणांचे भार बदला (ICAR-CRIDA चौकट). स्लायडर आपोआप १००% वर संतुलित होऊन थेट क्रमवारी बदलतात.',
    resetDefaults: 'CRIDA मूळ भारांवर रीसेट करा (25/15/15/15/20/10)',
    sliderExposure: '🌦️ E — हवामान व बाजार भाव धोका', sliderExposureSub: 'पावसाची तूट + हमीभावापेक्षा कमी दर (परिमाण १)',
    sliderSensitivity: '💧 S — सिंचन संवेदनशीलता', sliderSensitivitySub: 'सिंचनावर अवलंबित्व: कोरडवाहू / विहीर / कालवा (परिमाण २)',
    sliderAC: '🌱 AC — जुळवून घेण्याची क्षमता', sliderACSub: 'जमिनीचा आकार + उत्पन्नाचे इतर मार्ग (परिमाण ३, उलटे)',
    sliderMitigation: '🏛️ M — संरक्षणाची कमतरता', sliderMitigationSub: 'विमा नसणे व केसीसी नसणे = सर्वाधिक तूट (परिमाण ४)',
    sliderTrigger: '💳 T — तातडीचा कर्जाचा ताण', sliderTriggerSub: 'कर्ज परतफेडीची घाई + सावकारी कर्ज (परिमाण ५)',
    sliderDF: '🏔️ DF — जिल्हा संवेदनशीलता', sliderDFSub: 'ऐतिहासिक दुष्काळ निर्देशांक — फक्त अधिकाऱ्यांसाठी (परिमाण ६)',
    registryTitle: 'शेतकरी संकट पूर्व-सूचना नोंदवही',
    registrySub: 'एकत्रित संकट गुणांकानुसार क्रमवारी. शेतकर्‍यांच्या अडचणी थेट शासकीय योजनांशी जोडल्या आहेत.',
    filterLabel: 'फिल्टर:', filterAll: 'सर्व संकट गट', filterHigh: 'फक्त गंभीर संकट (71-100)', filterMed: 'मध्यम संकट (41-70)', filterLow: 'कमी धोका (0-40)',
    thFarmerVillage: 'शेतकरी व गाव', thDistrict: 'जिल्हा', thCropStage: 'पीक व अवस्था', thDistressScore: 'संकट गुणांक',
    thTopTrigger: 'मुख्य संकट कारण', thRecommendedScheme: 'शिफारस केलेली योजना', thContactChannel: 'संपर्क मार्ग', thActions: 'कृती',
    viewDetails: 'तपशील पहा 🔍', callIvr: 'कॉल / IVR', appPush: 'अ‍ॅप सूचना',

    // Modal
    modalListenBriefing: 'केस सारांश ऐका 🔊',
    modalReachabilityTitle: 'शेतकरी संपर्क व पोहोच मार्गदर्शन:',
    modalBreakdownTitle: 'संकट गुणांक विश्लेषण — ICAR-CRIDA ६-परिमाण FDI (रेड्डी व इतर, २०२१):',
    modalExplanationsTitle: 'संकटाची मुख्य कारणे:',
    modalLandTitle: 'जमीन धारणा संदर्भ', modalFragilityTitle: 'जिल्हा संवेदनशीलता निर्देशांक',
    modalInterventionsTitle: 'शासकीय मदत योजना (भेटीदरम्यान सोबत आणायची कागदपत्रे):',
    modalCloseBtn: 'नोंदवही बंद करा',

    // Simulator & Keypad
    simBadge: 'साध्या फोनसाठी साहाय्य प्रणाली',
    simTitle: 'इंटरअ‍ॅक्टिव्ह IVR व्हॉईस व साध्या SMS चा सिमुलेटर',
    simSub: 'दुर्गम भागातील ६५% पेक्षा जास्त शेतकरी साधे कीपॅड फोन वापरतात. हा सिमुलेटर व्हॉईस कॉल व साध्या मेसेजद्वारे माहिती कशी पोहोचते हे दाखवतो.',
    ivrHeaderTitle: 'स्वयंचलित IVR व्हॉईस कॉल', ivrSpeakPrompt: 'आवाजात ऐका (TTS)', ivrRestartCall: 'कॉल पुन्हा सुरू करा 🔄',
    pressKeypad: 'फोन कीपॅड दाबा:', keyAdvisory: 'पीक सल्ला', keyMandi: 'बाजार भाव', keySchemes: 'योजना', keyOfficer: 'अधिकारी',
    quickLangSwitch: 'कीपॅड भाषा थेट बदला:',
    smsEmulatorTitle: 'साध्या फोनवरील SMS एमुलेटर', smsEmulatorSub: '१६० अक्षरांचा साधा मराठी SMS संदेश', sendTestSms: 'चाचणी SMS पाठवा 📨',
    simDesignNoteTitle: '२G फोन अनुकूलन वैशिष्ट्ये:',
    simDesignNote1: '• इंटरनेट नसलेल्या २G कीपॅड फोनवर १००% कार्यक्षम.',
    simDesignNote2: '• १८००-१८०-१५५१ या टोल-फ्री क्रमांकावर एका बटनावर साहाय्य.',
    simDesignNote3: '• शेतकर्‍यांच्या स्थानिक भाषेत स्वयंचलित संदेश.'
  },
  or: {
    accessMode: 'ବ୍ୟବହାର ମୋଡ୍', assistedMode: '🤝 ସହାୟକ ମୋଡ୍ (କୃଷକ ମିତ୍ର / CSC କେନ୍ଦ୍ର)',
    selfService: '📱 ନିଜେ ବ୍ୟବହାର କରନ୍ତୁ', selectFarmer: 'କୃଷକ ବାଛନ୍ତୁ:', language: 'ଭାଷା:',
    cropAdvisory: 'ଫସଲ ପରାମର୍ଶ', cropAdvisorySub: 'ପାଣିପାଗ ଓ ଫସଲ ଯତ୍ନ ନିର୍ଦ୍ଦେଶାବଳୀ',
    mandiPrice: 'ମଣ୍ଡି ଦର', mandiPriceSub: 'ବର୍ତ୍ତମାନ ବଜାର ଦର ବନାମ ସରକାରୀ ଏମଏସପି (MSP)',
    myAlerts: 'ଜରୁରୀ ସୂଚନା', myAlertsSub: 'ବର୍ଷା ଅଭାବ ଓ ଋଣ ସୂଚନାପତ୍ର',
    govtSchemes: 'ସରକାରୀ ଯୋଜନା', govtSchemesSub: 'ଫସଲ ବୀମା (PMFBY), କେସିସି ଓ ଆର୍ଥିକ ସହାୟତା',
    tapToListen: 'ଶୁଣିବା ପାଇଁ ଟ୍ୟାପ୍ କରନ୍ତୁ 🔊', playAdvisory: 'ପରାମର୍ଶ ଶୁଣନ୍ତୁ (ଆବାଜ)',
    stopAudio: 'ଆବାଜ ବନ୍ଦ କରନ୍ତୁ ⏹️', playing: 'ପରାମର୍ଶ ବାଜୁଛି…',
    optimalChannel: 'ଉପଯୁକ୍ତ ଯୋଗାଯୋଗ ମାଧ୍ୟମ', translating: 'ଅନୁବାଦ ହେଉଛି…',

    // Weather & Soil Context
    weatherContextTitle: 'ପାଣିପାଗ ଓ ମାଟିର ମୁଖ୍ୟ ସୂଚକ',
    listenAllWeather: 'ପାଣିପାଗ ଓ ମୃତ୍ତିକା ବିବରଣୀ ଶୁଣନ୍ତୁ 🔊',
    tapToListenShort: 'ଶୁଣିବା ପାଇଁ ଟ୍ୟାପ୍ କରନ୍ତୁ 🔊',
    rainDevLabel: 'ବର୍ଷା ପରିମାଣ ତାରତମ୍ୟ',
    drySpellLabel: 'ଶୁଖିଲା ଦିନ ଅବଧି',
    monsoonOnsetLabel: 'ମୌସୁମୀ ଆଗମନ',
    soilTypeLabel: 'ମାଟିର ପ୍ରକାର',

    // Officer Dashboard
    officerBadge: 'ପ୍ରଶାସନ ଓ କୃଷି ବିସ୍ତାର ପୋର୍ଟାଲ',
    officerMainTitle: 'ଜିଲ୍ଲା କୃଷି ସଙ୍କଟ ନିରୀକ୍ଷଣ ଓ ସରକାରୀ ସହାୟତା ଡ୍ୟାସବୋର୍ଡ',
    officerMainSub: 'ବ୍ଲକ କୃଷି ଅଧିକାରୀ ଓ କ୍ଷେତ୍ର କର୍ମଚାରୀଙ୍କ ପାଇଁ ICAR-CRIDA FDI ପୂର୍ବ-ସତର୍କତା ପ୍ରଣାଳୀ।',
    playOfficerBriefing: 'ଜିଲ୍ଲା ସାରାଂଶ ଶୁଣନ୍ତୁ 🔊',
    metricTotal: 'ମୋଟ ପଞ୍ଜୀକୃତ କୃଷକ', metricTotalSub: '୩ଟି କୃଷି ଜିଲ୍ଲାରେ',
    metricHigh: 'ଅତି ଗମ୍ଭୀର ସଙ୍କଟ (High Risk)', metricHighSub: 'ତୁରନ୍ତ କ୍ଷେତ୍ର ପରିଦର୍ଶନ ଓ ସହାୟତା ଆବଶ୍ୟକ',
    metricMed: 'ମଧ୍ୟମ ସଙ୍କଟ (Medium Risk)', metricMedSub: 'ପରାମର୍ଶ ନିରୀକ୍ଷଣ ଅଧୀନରେ',
    metricLow: 'କମ୍ ବିପଦ (Low Risk)', metricLowSub: 'ସନ୍ତୋଷଜନକ କୃଷି ଅବସ୍ଥା',
    calibratorTitle: 'CRIDA FDI ଭାର କାଲିବ୍ରେଟର୍ — ୬ଟି ଆୟାମ',
    calibratorSub: 'ଆୟାମଗୁଡ଼ିକର ଭାର ସଜାଡ଼ନ୍ତୁ (ICAR-CRIDA ଢାଞ୍ଚା)। ସ୍ଲାଇଡର୍ ସ୍ୱତଃ ୧୦୦% ରେ ସନ୍ତୁଳିତ ହୋଇ ଲାଇଭ୍ ତାଲିକା ବଦଳାଏ।',
    resetDefaults: 'CRIDA ମୂଳ ଭାରକୁ ଫେରନ୍ତୁ (25/15/15/15/20/10)',
    sliderExposure: '🌦️ E — ପାଣିପାଗ ଓ ମୂଲ୍ୟ ବିପଦ (Exposure)', sliderExposureSub: 'ବର୍ଷା ଅଭାବ + ଏମଏସପି ଠାରୁ କମ୍ ଦର ବିପଦ (ଆୟାମ ୧)',
    sliderSensitivity: '💧 S — ଜଳସେଚନ ସମ୍ବେଦନଶୀଳତା (Sensitivity)', sliderSensitivitySub: 'ଜଳସେଚନ ନିର୍ଭରତା: ବର୍ଷା ଆଧାରିତ / ନଳକୂପ / କେନାଲ (ଆୟାମ ୨)',
    sliderAC: '🌱 AC — ଅନୁକୂଳନ କ୍ଷମତା (Adaptive Capacity)', sliderACSub: 'ଜମିର ଆକାର + ଅନ୍ୟାନ୍ୟ ଆୟ ଉତ୍ସ (ଆୟାମ ୩, ଓଲଟା)',
    sliderMitigation: '🏛️ M — ସୁରକ୍ଷା ଅଭାବ (Mitigation Deficit)', sliderMitigationSub: 'ବୀମାହୀନ ଓ କେସିସି ନଥିବା = ସର୍ବାଧିକ ଅଭାବ (ଆୟାମ ୪)',
    sliderTrigger: '💳 T — ଋଣ ପରିଶୋଧ ଚାପ (Trigger Signal)', sliderTriggerSub: 'ଋଣ ଚାପ + ମହାଜନୀ ଋଣ ଝଟକା (ଆୟାମ ୫)',
    sliderDF: '🏔️ DF — ଜିଲ୍ଲା ସମ୍ବେଦନଶୀଳତା (District Fragility)', sliderDFSub: 'ଐତିହାସିକ ସଙ୍କଟ ସୂଚକାଙ୍କ — କେବଳ ଅଧିକାରୀଙ୍କ ପାଇଁ (ଆୟାମ ୬)',
    registryTitle: 'କୃଷକ ସଙ୍କଟ ପୂର୍ବ-ସତର୍କତା ପଞ୍ଜିକା',
    registrySub: 'ସମୁଦାୟ ସଙ୍କଟ ସ୍କୋର ଅନୁସାରେ ତାଲିକାଭୁକ୍ତ। ନିର୍ଦ୍ଦିଷ୍ଟ କାରଣକୁ ସିଧାସଳଖ ସରକାରୀ ଯୋଜନା ସହ ଯୋଡ଼େ।',
    filterLabel: 'ଫିଲ୍ଟର୍:', filterAll: 'ସମସ୍ତ ସଙ୍କଟ ସ୍ତର', filterHigh: 'କେବଳ ଗମ୍ଭୀର ସଙ୍କଟ (71-100)', filterMed: 'ମଧ୍ୟମ ସଙ୍କଟ (41-70)', filterLow: 'କମ୍ ବିପଦ (0-40)',
    thFarmerVillage: 'କୃଷକ ଓ ଗ୍ରାମ', thDistrict: 'ଜିଲ୍ଲା', thCropStage: 'ଫସଲ ଓ ପର୍ଯ୍ୟାୟ', thDistressScore: 'ସଙ୍କଟ ସ୍କୋର',
    thTopTrigger: 'ମୁଖ୍ୟ ସଙ୍କଟ କାରଣ', thRecommendedScheme: 'ସୁପାରିଶ କରାଯାଇଥିବା ଯୋଜନା', thContactChannel: 'ଯୋଗାଯୋଗ ମାଧ୍ୟମ', thActions: 'ପଦକ୍ଷେପ',
    viewDetails: 'ବିବରଣୀ ଦେଖନ୍ତୁ 🔍', callIvr: 'କଲ୍ / IVR', appPush: 'ଆପ୍ ନୋଟିଫିକେସନ୍',

    // Modal
    modalListenBriefing: 'କେସ୍ ସାରାଂଶ ଶୁଣନ୍ତୁ 🔊',
    modalReachabilityTitle: 'କ୍ଷେତ୍ର ସମ୍ପର୍କ ଓ ଯୋଗାଯୋଗ ମାର୍ଗଦର୍ଶିକା:',
    modalBreakdownTitle: 'ସଙ୍କଟ ସ୍କୋର ବିଶ୍ଳେଷଣ — ICAR-CRIDA ୬-ଆୟାମ FDI (ରେଡ୍ଡୀ ଏବଂ ସହଯୋଗୀ, ୨୦୨୧):',
    modalExplanationsTitle: 'ସଙ୍କଟର ମୁଖ୍ୟ କାରଣ:',
    modalLandTitle: 'ଜମି ମାଲିକାନା ସନ୍ଦର୍ଭ', modalFragilityTitle: 'ଜିଲ୍ଲା ସମ୍ବେଦନଶୀଳତା ସୂଚକାଙ୍କ',
    modalInterventionsTitle: 'ସରକାରୀ ସହାୟତା ଯୋଜନା (କ୍ଷେତ୍ର ପରିଦର୍ଶନ ସମୟରେ ଆଣିବାକୁ ଥିବା ଦଲିଲ):',
    modalCloseBtn: 'ବିବରଣୀ ବନ୍ଦ କରନ୍ତୁ',

    // Simulator & Keypad
    simBadge: 'ସାଧାରଣ ଫୋନ୍ ସହାୟତା ପ୍ରଣାଳୀ',
    simTitle: 'ଇଣ୍ଟରାକ୍ଟିଭ୍ ଆଇଭିଆର (IVR) ଓ ସରଳ ଏସଏମଏସ ସିମୁଲେଟର୍',
    simSub: 'ଗ୍ରାମାଞ୍ଚଳରେ ୬୫% ରୁ ଅଧିକ କୃଷକ ସାଧାରଣ ବଟନ ଫୋନ୍ ବ୍ୟବହାର କରନ୍ତି। ଏହି ସିମୁଲେଟର୍ ଦର୍ଶାଏ କିପରି ସ୍ୱୟଂଚାଳିତ ଭଏସ୍ କଲ୍ ଓ ମେସେଜ୍ ମାଧ୍ୟମରେ ସୂଚନା ପହଞ୍ଚାଯାଏ।',
    ivrHeaderTitle: 'ସ୍ୱୟଂଚାଳିତ IVR ଭଏସ୍ କଲ୍', ivrSpeakPrompt: 'ଆବାଜରେ ଶୁଣନ୍ତୁ (TTS)', ivrRestartCall: 'କଲ୍ ପୁନର୍ବାର ଆରମ୍ଭ କରନ୍ତୁ 🔄',
    pressKeypad: 'ଫୋନ୍ କିପ୍ୟାଡ୍ ଦବାନ୍ତୁ:', keyAdvisory: 'ଫସଲ ପରାମର୍ଶ', keyMandi: 'ମଣ୍ଡି ଦର', keySchemes: 'ଯୋଜନା', keyOfficer: 'ଅଧିକାରୀ',
    quickLangSwitch: 'କିପ୍ୟାଡ୍ ଭାଷା ସିଧାସଳଖ ବଦଳାନ୍ତୁ:',
    smsEmulatorTitle: 'ଫିଚର୍ ଫୋନ୍ SMS ଏମୁଲେଟର୍', smsEmulatorSub: '୧୬୦ ଅକ୍ଷରର ସରଳ ଓଡ଼ିଆ SMS ବାର୍ତ୍ତା', sendTestSms: 'ଟେଷ୍ଟ SMS ପଠାନ୍ତୁ 📨',
    simDesignNoteTitle: '୨G ଫୋନ୍ ଅନୁକୂଳନ ଡିଜାଇନ୍:',
    simDesignNote1: '• ଇଣ୍ଟରନେଟ୍ ବିନା ୨G କିପ୍ୟାଡ୍ ଫୋନରେ ୧୦୦% ସୁଗମ କାର୍ଯ୍ୟକ୍ଷମ।',
    simDesignNote2: '• ୧୮୦୦-୧୮୦-୧୫୫୧ ଟୋଲ୍-ଫ୍ରି ନମ୍ବରରେ ଗୋଟିଏ ବଟନ୍ ଦବାଇ ସହାୟତା।',
    simDesignNote3: '• କୃଷକଙ୍କ ପଞ୍ଜୀକୃତ ଆଞ୍ଚଳିକ ଭାଷାରେ ସ୍ୱୟଂଚାଳିତ ବାର୍ତ୍ତା।'
  },
  as: {
    accessMode: 'ব্যৱহাৰৰ মাধ্যম', assistedMode: '🤝 সহায়কাৰী মাধ্যম (কৃষক মিত্ৰ / CSC কেন্দ্ৰ)',
    selfService: '📱 নিজে ব্যৱহাৰ কৰক', selectFarmer: 'কৃষক বাছনি কৰক:', language: 'ভাষা:',
    cropAdvisory: 'শস্যৰ পৰামৰ্শ', cropAdvisorySub: 'বতৰৰ বতৰা আৰু শস্যৰ যত্নৰ নিৰ্দেশনা',
    mandiPrice: 'বজাৰ দৰ', mandiPriceSub: 'বৰ্তমান বজাৰ মূল্য বনাম চৰকাৰী সমৰ্থন মূল্য (MSP)',
    myAlerts: 'জৰুৰী সতৰ্কবাৰ্তা', myAlertsSub: 'বৰষুণৰ অভাৱ আৰু কৃষি ঋণৰ জাননী',
    govtSchemes: 'চৰকাৰী আঁচনি', govtSchemesSub: 'শস্য বীমা (PMFBY), কেচিচি আৰু ৰাজসাহায্য',
    tapToListen: 'শুনিবলৈ টেপ কৰক 🔊', playAdvisory: 'পৰামৰ্শ শুনক (আৱাজ)',
    stopAudio: 'আৱাজ বন্ধ কৰক ⏹️', playing: 'পৰামৰ্শ বাজি আছে…',
    optimalChannel: 'উপযুক্ত যোগাযোগ মাধ্যম', translating: 'অনুবাদ হৈ আছে…',

    // Weather & Soil Context
    weatherContextTitle: 'বতৰ আৰু মাটিৰ মূল সূচক',
    listenAllWeather: 'বতৰ আৰু মাটিৰ প্ৰতিবেদন শুনক 🔊',
    tapToListenShort: 'শুনিবলৈ টেপ কৰক 🔊',
    rainDevLabel: 'বৰষুণৰ তাৰতম্য',
    drySpellLabel: 'খৰাং দিনৰ দৈৰ্ঘ্য',
    monsoonOnsetLabel: 'মৌচুমীৰ আগমন',
    soilTypeLabel: 'মাটিৰ প্ৰকাৰ',

    // Officer Dashboard
    officerBadge: 'প্ৰশাসন আৰু কৃষি সম্প্ৰসাৰণ পৰ্টেল',
    officerMainTitle: 'জিলা কৃষি সংকট নিৰীক্ষণ আৰু চৰকাৰী সাহায্য ডেশ্বব’ৰ্ড',
    officerMainSub: 'খণ্ড কৃষি বিষয়া আৰু ফিল্ড ষ্টাফৰ বাবে ICAR-CRIDA FDI পূৰ্ব-সতৰ্কীকৰণ ব্যৱস্থা।',
    playOfficerBriefing: 'জিলা সাৰাংশ শুনক 🔊',
    metricTotal: 'মুঠ পঞ্জীভুক্ত কৃষক', metricTotalSub: '৩টা কৃষি জিলাত',
    metricHigh: 'গুৰুতৰ সংকট (High Risk)', metricHighSub: 'তত্কালীন ফিল্ড ভিজিট আৰু সাহায্য প্ৰয়োজন',
    metricMed: 'মধ্যম সংকট (Medium Risk)', metricMedSub: 'পৰামৰ্শ নিৰীক্ষণৰ অধীনত',
    metricLow: 'কম বিপদাশংকা (Low Risk)', metricLowSub: 'সন্তোষজনক কৃষি অৱস্থা',
    calibratorTitle: 'CRIDA FDI গুৰুত্ব কেলিব্ৰেটৰ — ৬টা মাত্ৰা',
    calibratorSub: 'মাত্ৰাৰ গুৰুত্ব সলনি কৰক (ICAR-CRIDA আৰ্হি)। স্লাইডাৰ নিজে নিজে ১০০%ত ভাৰসাম্য ৰাখি তালিকা নতুনকৈ সজায়।',
    resetDefaults: 'CRIDA মূল গুৰুত্বলৈ ঘূৰি যাওক (25/15/15/15/20/10)',
    sliderExposure: '🌦️ E — বতৰ আৰু মূল্যৰ বিপদাশংকা', sliderExposureSub: 'বৰষুণৰ নাটনি + সমৰ্থন মূল্যতকৈ কম দৰ (মাত্ৰা ১)',
    sliderSensitivity: '💧 S — জলসিঞ্চন সংবেদনশীলতা', sliderSensitivitySub: 'জলসিঞ্চন নিৰ্ভৰশীলতা: বৰষুণ ভিত্তিক / অগভীৰ নলীনাদ / খাল (মাত্ৰা ২)',
    sliderAC: '🌱 AC — অভিযোজন ক্ষমতা', sliderACSub: 'মাটিৰ পৰিমাণ + অন্যান্য উপাৰ্জনৰ উৎস (মাত্ৰা ৩, ওলোটা)',
    sliderMitigation: '🏛️ M — সুৰক্ষাৰ অভাৱ', sliderMitigationSub: 'বীমা আৰু কেচিচি নথকা = সৰ্বাধিক অভাৱ (মাত্ৰা ৪)',
    sliderTrigger: '💳 T — জৰুৰী ঋণৰ চাপ', sliderTriggerSub: 'ঋণ পৰিশোধৰ তাগিদ + মহাজনৰ ঋণ (মাত্ৰা ৫)',
    sliderDF: '🏔️ DF — জিলা সংবেদনশীলতা', sliderDFSub: 'ঐতিহাসিক সংকট সূচকাংক — কেৱল বিষয়াৰ বাবে (মাত্ৰা ৬)',
    registryTitle: 'কৃষক সংকট পূৰ্ব-সতৰ্কতা পঞ্জী',
    registrySub: 'মুঠ সংকট নম্বৰ অনুসৰি সজোৱা। বিশেষ কাৰণসমূহক পোনে পোনে চৰকাৰী আঁচনিৰ সৈতে সংযোগ কৰা হয়।',
    filterLabel: 'ফিল্টাৰ:', filterAll: 'সকলো সংকট স্তৰ', filterHigh: 'কেৱল গুৰুতৰ সংকট (71-100)', filterMed: 'মধ্যম সংকট (41-70)', filterLow: 'কম বিপদ (0-40)',
    thFarmerVillage: 'কৃষক আৰু গাঁও', thDistrict: 'জিলা', thCropStage: 'শস্য আৰু পৰ্যায়', thDistressScore: 'সংকট নম্বৰ',
    thTopTrigger: 'মূল সংকটৰ কাৰণ', thRecommendedScheme: 'প্ৰস্তাৱিত আঁচনি', thContactChannel: 'যোগাযোগৰ মাধ্যম', thActions: 'পদক্ষেপ',
    viewDetails: 'বিস্তাৰিত চাওক 🔍', callIvr: 'কল / IVR', appPush: 'এপ জাননী',

    // Modal
    modalListenBriefing: 'কেচৰ সাৰাংশ শুনক 🔊',
    modalReachabilityTitle: 'ক্ষেত্ৰ যোগাযোগ আৰু প্ৰসাৰ নিৰ্দেশনা:',
    modalBreakdownTitle: 'সংকট নম্বৰ বিশ্লেষণ — ICAR-CRIDA ৬-মাত্ৰা FDI (ৰেড্ডী আৰু সহযোগী, ২০২১):',
    modalExplanationsTitle: 'সংকটৰ মূল কাৰণসমূহ:',
    modalLandTitle: 'ভূমিৰ পৰিমাণ প্ৰসংগ', modalFragilityTitle: 'জিলা সংবেদনশীলতা সূচকাংক',
    modalInterventionsTitle: 'চৰকাৰী আঁচনিৰ সাহায্য (ক্ষেত্ৰ পৰিদৰ্শনত আনিবলগীয়া নথিপত্ৰ):',
    modalCloseBtn: 'বিৱৰণ বন্ধ কৰক',

    // Simulator & Keypad
    simBadge: 'সাধাৰণ ফোন সাহায্য ব্যৱস্থা',
    simTitle: 'ইণ্টাৰেক্টিভ IVR ভইচ আৰু সাধাৰণ SMS চিমুলেটৰ',
    simSub: 'গ্ৰামাঞ্চলৰ ৬৫% কৃষকে সাধাৰণ বুটামৰ ফোন ব্যৱহাৰ কৰে। এই চিমুলেটৰে দেখুৱায় কিদৰে স্বয়ংক্ৰিয় ভইচ কল আৰু এছএমএছ যোগে তথ্য প্ৰেৰণ কৰা হয়।',
    ivrHeaderTitle: 'স্বয়ংক্ৰিয় IVR ভইচ কল', ivrSpeakPrompt: 'আৱাজত শুনক (TTS)', ivrRestartCall: 'কল পুনৰ আৰম্ভ কৰক 🔄',
    pressKeypad: 'ফোন কিপ্যাড টিপক:', keyAdvisory: 'শস্য পৰামৰ্শ', keyMandi: 'বজাৰ দৰ', keySchemes: 'আঁচনি', keyOfficer: 'বিষয়া',
    quickLangSwitch: 'কিপ্যাডৰ ভাষা পোনে পোনে সলনি কৰক:',
    smsEmulatorTitle: 'ফিচাৰ ফোন SMS এমুলেটৰ', smsEmulatorSub: '১৬০টা আখৰৰ সাধাৰণ অসমীয়া SMS বাৰ্তা', sendTestSms: 'পৰীক্ষামূলক SMS পঠিয়াওক 📨',
    simDesignNoteTitle: '২G ফোন অনুকূলন বৈশিষ্টসমূহ:',
    simDesignNote1: '• ইণ্টাৰনেট অবিহনে ২G বুটাম থকা ফোনত ১০০% কাৰ্যকৰী।',
    simDesignNote2: '• ১৮০০-১৮০-১৫৫১ নম্বৰত এটা বুটাম টিপি সাহায্য।',
    simDesignNote3: '• কৃষকৰ পঞ্জীভুক্ত আঞ্চলিক ভাষাত স্বয়ংক্ৰিয় বাৰ্তা।'
  },
  kn: {
    accessMode: 'ಬಳಕೆಯ ವಿಧಾನ', assistedMode: '🤝 ಸಹಾಯಕರ ನೆರವು (ಕಿಸಾನ್ ಮಿತ್ರ / ಸಿಎಸ್‌ಸಿ ಕೇಂದ್ರ)',
    selfService: '📱 ಸ್ವಯಂ ಸೇವೆ', selectFarmer: 'ರೈತರನ್ನು ಆಯ್ಕೆಮಾಡಿ:', language: 'ಭಾಷೆ:',
    cropAdvisory: 'ಬೆಳೆ ಸಲಹೆ', cropAdvisorySub: 'ಹವಾಮಾನ ಮುನ್ಸೂಚನೆ ಮತ್ತು ಬೆಳೆ ರಕ್ಷಣೆ ಮಾರ್ಗದರ್ಶನ',
    mandiPrice: 'ಮಂಡಿ ಬೆಲೆ', mandiPriceSub: 'ಪ್ರಸ್ತುತ ಮಾರುಕಟ್ಟೆ ಬೆಲೆ vs ಸರ್ಕಾರದ ಬೆಂಬಲ ಬೆಲೆ (MSP)',
    myAlerts: 'ತುರ್ತು ಎಚ್ಚರಿಕೆಗಳು', myAlertsSub: 'ಮಳೆ ಕೊರತೆ ಮತ್ತು ಕೃಷಿ ಸಾಲದ ಸೂಚನೆಗಳು',
    govtSchemes: 'ಸರ್ಕಾರಿ ಯೋಜನೆಗಳು', govtSchemesSub: 'ಬೆಳೆ ವಿಮೆ (PMFBY), ಕೆಸಿಸಿ ಮತ್ತು ಪರಿಹಾರ ನೆರವು',
    tapToListen: 'ಕೇಳಲು ಟ್ಯಾಪ್ ಮಾಡಿ 🔊', playAdvisory: 'ಸಲಹೆ ಕೇಳಿ (ಧ್ವನಿ)',
    stopAudio: 'ಧ್ವನಿ ನಿಲ್ಲಿಸಿ ⏹️', playing: 'ಸಲಹೆ ಧ್ವನಿ ನುಡಿಸಲಾಗುತ್ತಿದೆ…',
    optimalChannel: 'ಸೂಕ್ತ ಸಂಪರ್ಕ ಮಾಧ್ಯಮ', translating: 'ಅನುವಾದಿಸಲಾಗುತ್ತಿದೆ…',

    // Weather & Soil Context
    weatherContextTitle: 'ಹವಾಮಾನ ಮತ್ತು ಮಣ್ಣಿನ ಪ್ರಮುಖ ಸೂಚಕಗಳು',
    listenAllWeather: 'ಹವಾಮಾನ ಮತ್ತು ಮಣ್ಣಿನ ವರದಿ ಕೇಳಿ 🔊',
    tapToListenShort: 'ಕೇಳಲು ಟ್ಯಾಪ್ ಮಾಡಿ 🔊',
    rainDevLabel: 'ಮಳೆ ಪ್ರಮಾಣದ ವ್ಯತ್ಯಾಸ',
    drySpellLabel: 'ಒಣ ಅವಧಿ (ದಿನಗಳು)',
    monsoonOnsetLabel: 'ಮುಂಗಾರು ಪ್ರವೇಶ',
    soilTypeLabel: 'ಮಣ್ಣಿನ ವಿಧ',

    // Officer Dashboard
    officerBadge: 'ಆಡಳಿತ ಮತ್ತು ಕೃಷಿ ವಿಸ್ತರಣಾ ಪೋರ್ಟಲ್',
    officerMainTitle: 'ಜಿಲ್ಲಾ ಕೃಷಿ ಸಂಕಷ್ಟ ಮೇಲ್ವಿಚಾರಣೆ ಮತ್ತು ಮಧ್ಯಸ್ಥಿಕೆ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್',
    officerMainSub: 'ತಾಲೂಕು ಕೃಷಿ ಅಧಿಕಾರಿಗಳು ಮತ್ತು ಸಿಬ್ಬಂದಿಗಾಗಿ ICAR-CRIDA FDI ಮುನ್ನೆಚ್ಚರಿಕೆ ವ್ಯವಸ್ಥೆ.',
    playOfficerBriefing: 'ಜಿಲ್ಲಾ ಸಾರಾಂಶ ಕೇಳಿ 🔊',
    metricTotal: 'ಒಟ್ಟು ರೈತರು', metricTotalSub: '೩ ಕೃಷಿ ಜಿಲ್ಲೆಗಳಲ್ಲಿ',
    metricHigh: 'ಗಂಭೀರ ಸಂಕಷ್ಟ (High Risk)', metricHighSub: 'ತಕ್ಷಣದ ಭೇಟಿ ಮತ್ತು ನೆರವು ಅಗತ್ಯವಿದೆ',
    metricMed: 'ಮಧ್ಯಮ ಸಂಕಷ್ಟ (Medium Risk)', metricMedSub: 'ಸಲಹಾ ಮೇಲ್ವಿಚಾರಣೆಯಲ್ಲಿದೆ',
    metricLow: 'ಕಡಿಮೆ ಅಪಾಯ (Low Risk)', metricLowSub: 'ಸ್ಥಿರ ಬೆಳೆ ಪರಿಸ್ಥಿತಿ',
    calibratorTitle: 'CRIDA FDI ತೂಕ ಮಾಪಕ — ೬ ಆಯಾಮಗಳು',
    calibratorSub: 'ಆಯಾಮಗಳ ತೂಕವನ್ನು ಸರಿಹೊಂದಿಸಿ (ICAR-CRIDA ಚೌಕಟ್ಟು). ಸ್ಲೈಡರ್‌ಗಳು ತಾವಾಗಿಯೇ ೧೦೦% ಗೆ ಸಮತೋಲನಗೊಂಡು ಪಟ್ಟಿಯನ್ನು ಮರುಹೊಂದಿಸುತ್ತವೆ.',
    resetDefaults: 'CRIDA ಮೂಲ ತೂಕಕ್ಕೆ ಮರುಹೊಂದಿಸಿ (25/15/15/15/20/10)',
    sliderExposure: '🌦️ E — ಹವಾಮಾನ ಮತ್ತು ಬೆಲೆ ಅಪಾಯ', sliderExposureSub: 'ಮಳೆ ಕೊರತೆ + ಎಂಎಸ್‌ಪಿಗಿಂತ ಕಡಿಮೆ ಬೆಲೆ ಅಪಾಯ (ಆಯಾಮ ೧)',
    sliderSensitivity: '💧 S — ನೀರಾವರಿ ಸೂಕ್ಷ್ಮತೆ', sliderSensitivitySub: 'ನೀರಾವರಿ ಅವಲಂಬನೆ: ಮಳೆಯಾಶ್ರಿತ / ಕೊಳವೆಬಾವಿ / ಕಾಲುವೆ (ಆಯಾಮ ೨)',
    sliderAC: '🌱 AC — ಹೊಂದಿಕೊಳ್ಳುವ ಸಾಮರ್ಥ್ಯ', sliderACSub: 'ಭೂಮಿ ವಿಸ್ತೀರ್ಣ + ಆದಾಯದ ಇತರ ಮೂಲಗಳು (ಆಯಾಮ ೩, ಹಿಮ್ಮುಖ)',
    sliderMitigation: '🏛️ M — ರಕ್ಷಣಾ ಕೊರತೆ', sliderMitigationSub: 'ವಿಮೆ ಇಲ್ಲದಿರುವುದು ಮತ್ತು ಕೆಸಿಸಿ ಇಲ್ಲದಿರುವುದು = ಗರಿಷ್ಠ ಕೊರತೆ (ಆಯಾಮ ೪)',
    sliderTrigger: '💳 T — ತುರ್ತು ಸಾಲದ ಒತ್ತಡ', sliderTriggerSub: 'ಸಾಲ ಮರುಪಾವತಿ ತುರ್ತು + ಖಾಸಗಿ ಸಾಲ (ಆಯಾಮ ೫)',
    sliderDF: '🏔️ DF — ಜಿಲ್ಲಾ ಸೂಕ್ಷ್ಮತೆ', sliderDFSub: 'ಐತಿಹಾಸಿಕ ಬರಗಾಲ ಸೂಚ್ಯಂಕ — ಅಧಿಕಾರಿಗಳಿಗೆ ಮಾತ್ರ (ಆಯಾಮ ೬)',
    registryTitle: 'ರೈತರ ಸಂಕಷ್ಟ ಮುನ್ನೆಚ್ಚರಿಕೆ ನೋಂದಣಿ',
    registrySub: 'ಸಂಕಷ್ಟ ಅಂಕಗಳ ಆಧಾರದ ಮೇಲೆ ಶ್ರೇಣೀಕರಿಸಲಾಗಿದೆ. ಪ್ರಮುಖ ಕಾರಣಗಳನ್ನು ನೇರವಾಗಿ ಸರ್ಕಾರಿ ಯೋಜನೆಗಳಿಗೆ ಜೋಡಿಸುತ್ತದೆ.',
    filterLabel: 'ಫಿಲ್ಟರ್:', filterAll: 'ಎಲ್ಲಾ ಅಪಾಯದ ಹಂತಗಳು', filterHigh: 'ಗಂಭೀರ ಸಂಕಷ್ಟ ಮಾತ್ರ (71-100)', filterMed: 'ಮಧ್ಯಮ ಸಂಕಷ್ಟ (41-70)', filterLow: 'ಕಡಿಮೆ ಅಪಾಯ (0-40)',
    thFarmerVillage: 'ರೈತರು ಮತ್ತು ಗ್ರಾಮ', thDistrict: 'ಜಿಲ್ಲೆ', thCropStage: 'ಬೆಳೆ ಮತ್ತು ಹಂತ', thDistressScore: 'ಸಂಕಷ್ಟ ಅಂಕ',
    thTopTrigger: 'ಪ್ರಮುಖ ಕಾರಣ', thRecommendedScheme: 'ಶಿಫಾರಸು ಮಾಡಿದ ಯೋಜನೆ', thContactChannel: 'ಸಂಪರ್ಕ ಮಾಧ್ಯಮ', thActions: 'ಕ್ರಮಗಳು',
    viewDetails: 'ವಿವರ ನೋಡಿ 🔍', callIvr: 'ಕರೆ / IVR', appPush: 'ಆ್ಯಪ್ ಸೂಚನೆ',

    // Modal
    modalListenBriefing: 'ಪ್ರಕರಣದ ಸಾರಾಂಶ ಕೇಳಿ 🔊',
    modalReachabilityTitle: 'ಕ್ಷೇತ್ರ ಸಂಪರ್ಕ ಮತ್ತು ಮಾರ್ಗದರ್ಶನ:',
    modalBreakdownTitle: 'ಸಂಕಷ್ಟ ಅಂಕಗಳ ವಿಶ್ಲೇಷಣೆ — ICAR-CRIDA ೬-ಆಯಾಮ FDI (ರೆಡ್ಡಿ ಮತ್ತಿತರರು, ೨೦೨೧):',
    modalExplanationsTitle: 'ಸಂಕಷ್ಟದ ಮುಖ್ಯ ಕಾರಣಗಳು:',
    modalLandTitle: 'ಭೂಹಿಡುವಳಿ ಸನ್ನಿವೇಶ', modalFragilityTitle: 'ಜಿಲ್ಲಾ ಸೂಕ್ಷ್ಮತೆ ಸೂಚ್ಯಂಕ',
    modalInterventionsTitle: 'ಸರ್ಕಾರಿ ಯೋಜನೆಗಳ ನೆರವು (ಭೇಟಿಯ ವೇಳೆ ತರಬೇಕಾದ ದಾಖಲೆಗಳು):',
    modalCloseBtn: 'ವಿವರ ಮುಚ್ಚಿ',

    // Simulator & Keypad
    simBadge: 'ಸಾಮಾನ್ಯ ಫೋನ್ ನೆರವು ವ್ಯವಸ್ಥೆ',
    simTitle: 'ಇಂಟರ್ಯಾಕ್ಟಿವ್ IVR ಧ್ವನಿ ಮತ್ತು ಸರಳ SMS ಸಿಮ್ಯುಲೇಟರ್',
    simSub: 'ಗ್ರಾಮೀಣ ಭಾಗದ ಶೇ.೬೫ ಕ್ಕೂ ಹೆಚ್ಚು ರೈತರು ಸಾಮಾನ್ಯ ಕೀಪ್ಯಾಡ್ ಫೋನ್ ಬಳಸುತ್ತಾರೆ. ಸ್ವಯಂಚಾಲಿತ ಧ್ವನಿ ಕರೆ ಮತ್ತು ಸಂದೇಶಗಳ ಮೂಲಕ ಮಾಹಿತಿ ತಲುಪಿಸುವುದನ್ನು ಈ ಸಿಮ್ಯುಲೇಟರ್ ತೋರಿಸುತ್ತದೆ.',
    ivrHeaderTitle: 'ಸ್ವಯಂಚಾಲಿತ IVR ಧ್ವನಿ ಕರೆ', ivrSpeakPrompt: 'ಧ್ವನಿಯಲ್ಲಿ ಕೇಳಿ (TTS)', ivrRestartCall: 'ಮತ್ತೆ ಕರೆ ಆರಂಭಿಸಿ 🔄',
    pressKeypad: 'ಫೋನ್ ಕೀಪ್ಯಾಡ್ ಒತ್ತಿ:', keyAdvisory: 'ಬೆಳೆ ಸಲಹೆ', keyMandi: 'ಮಂಡಿ ಬೆಲೆ', keySchemes: 'ಯೋಜನೆಗಳು', keyOfficer: 'ಅಧಿಕಾರಿ',
    quickLangSwitch: 'ಕೀಪ್ಯಾಡ್ ಭಾಷೆ ನೇರವಾಗಿ ಬದಲಾಯಿಸಿ:',
    smsEmulatorTitle: 'ಫೀಚರ್ ಫೋನ್ SMS ಎಮ್ಯುಲೇಟರ್', smsEmulatorSub: '೧೬೦ ಅಕ್ಷರಗಳ ಸರಳ ಕನ್ನಡ SMS ಸಂದೇಶ', sendTestSms: 'ಪರೀಕ್ಷಾರ್ಥ SMS ಕಳುಹಿಸಿ 📨',
    simDesignNoteTitle: '೨G ಫೋನ್ ಹೊಂದಾಣಿಕೆ ವಿನ್ಯಾಸ:',
    simDesignNote1: '• ಇಂಟರ್ನೆಟ್ ಇಲ್ಲದ ೨G ಕೀಪ್ಯಾಡ್ ಫೋನ್‌ಗಳಲ್ಲಿ ಶೇ.೧೦೦ ರಷ್ಟು ಸುಲಭ ಬಳಕೆ.',
    simDesignNote2: '• ೧೮೦೦-೧೮೦-೧೫೫೧ ಉಚಿತ ಸಹಾಯವಾಣಿಗೆ ಒಂದು ಕೀಲಿಯಲ್ಲಿ ಕರೆ.',
    simDesignNote3: '• ರೈತರ ನೋಂದಾಯಿತ ಪ್ರಾದೇಶಿಕ ಭಾಷೆಯಲ್ಲಿ ಸ್ವಯಂಚಾಲಿತ ಸಂದೇಶ.'
  },
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Initializing Smart Krishi v3 App...');
  await loadInitialData();
});

async function loadInitialData() {
  try {
    // 1. Fetch all farmers
    const res = await fetch(`${API_BASE}/farmers`);
    state.farmers = await res.json();

    // Populate dropdowns
    populateFarmerSelects();

    // Set initial farmer (F1 - Ramesh Patil)
    if (state.farmers.length > 0) {
      await selectFarmer(state.farmers[0].id);
    }

    // 2. Fetch initial Officer Dashboard data
    await fetchOfficerData();

    // 3. Initialize IVR Simulator
    await startIvrCall();

  } catch (err) {
    console.error('Error loading initial data:', err);
  }
}

function populateFarmerSelects() {
  const farmerSelect = document.getElementById('farmer-select');
  const simSelect = document.getElementById('sim-farmer-select');

  if (farmerSelect) {
    farmerSelect.innerHTML = state.farmers.map(f => `
      <option value="${f.id}">
        ${f.name} — ${f.crop} (${f.district_name || f.district_id})
      </option>
    `).join('');
  }

  if (simSelect) {
    simSelect.innerHTML = state.farmers.map(f => `
      <option value="${f.id}">
        ${f.name} (${f.device_type === 'feature_phone' ? '☎️ Basic' : '📱 Smart'})
      </option>
    `).join('');
  }
}

// --- GLOBAL VIEW NAVIGATION ---
function switchMainView(viewName) {
  state.activeView = viewName;

  // Stop any active speech when switching views
  stopSpeech();

  // Update tabs UI
  const views = {
    farmer: document.getElementById('view-farmer'),
    officer: document.getElementById('view-officer'),
    simulator: document.getElementById('view-simulator')
  };

  const navBtns = {
    farmer: document.getElementById('nav-farmer-btn'),
    officer: document.getElementById('nav-officer-btn'),
    simulator: document.getElementById('nav-simulator-btn')
  };

  Object.keys(views).forEach(k => {
    if (views[k]) {
      if (k === viewName) {
        views[k].classList.remove('hidden');
        views[k].classList.add('block');
      } else {
        views[k].classList.add('hidden');
        views[k].classList.remove('block');
      }
    }

    if (navBtns[k]) {
      if (k === viewName) {
        navBtns[k].className = "px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center space-x-1.5 transition-all bg-emerald-600 text-white shadow";
      } else {
        navBtns[k].className = "px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center space-x-1.5 transition-all text-slate-300 hover:text-white hover:bg-slate-700";
      }
    }
  });

  if (viewName === 'officer') {
    fetchOfficerData();
    applyI18n();
  } else if (viewName === 'simulator') {
    startIvrCall();
    applyI18n();
  } else if (viewName === 'farmer') {
    applyI18n();
  }
}

// --- MODULE 1: FARMER APP CONTROLS ---

function setFarmerAccessMode(mode) {
  state.farmerAccessMode = mode;
  const btnAssisted = document.getElementById('btn-mode-assisted');
  const btnSelf = document.getElementById('btn-mode-self');

  if (mode === 'assisted') {
    btnAssisted.className = "px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold flex items-center space-x-1.5 transition-all bg-emerald-700 text-white shadow-sm";
    btnSelf.className = "px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold flex items-center space-x-1.5 transition-all text-slate-600 hover:text-slate-900";
  } else {
    btnSelf.className = "px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold flex items-center space-x-1.5 transition-all bg-emerald-700 text-white shadow-sm";
    btnAssisted.className = "px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold flex items-center space-x-1.5 transition-all text-slate-600 hover:text-slate-900";
  }
}

async function onFarmerSelected(farmerId) {
  await selectFarmer(farmerId);
}

async function onLanguageChanged(lang) {
  state.selectedLanguage = lang;
  stopSpeech();
  applyI18n();

  // Sync IVR selector with global selector
  const simIvrSelect = document.getElementById('sim-ivr-lang-select');
  if (simIvrSelect) simIvrSelect.value = lang;
  state.ivrLanguage = lang;

  // Re-render all panels asynchronously (translating on the fly)
  await Promise.all([
    renderFarmerProfileCard(),
    renderFarmerAdvisory(),
    renderFarmerMandiPrice(),
    renderFarmerAlerts(),
    renderFarmerSchemes(),
    renderOfficerMetrics(),
    renderOfficerTable(),
    startIvrCall(null, lang)
  ]);
}

async function selectFarmer(farmerId) {
  state.selectedFarmerId = farmerId;
  const farmer = state.farmers.find(f => f.id === farmerId);
  state.currentFarmer = farmer;

  // Auto-set default UI mode based on Adaptive Capacity
  if (farmer && farmer.default_ui_mode) {
    setFarmerAccessMode(farmer.default_ui_mode);
  }

  // Pre-select language preference
  if (farmer && farmer.language) {
    state.selectedLanguage = farmer.language;
    const langSelect = document.getElementById('lang-select');
    if (langSelect) langSelect.value = farmer.language;
  }
  applyI18n();

  // Update Farmer Selector UI
  const farmerSelect = document.getElementById('farmer-select');
  if (farmerSelect) farmerSelect.value = farmerId;

  // Fetch Advisory and Distress Score
  try {
    const [advRes, disRes] = await Promise.all([
      fetch(`${API_BASE}/farmers/${farmerId}/advisory`),
      fetch(`${API_BASE}/farmers/${farmerId}/distress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.weights)
      })
    ]);

    state.currentAdvisory = await advRes.json();
    state.currentDistress = await disRes.json();

    await Promise.all([
      renderFarmerProfileCard(),
      renderFarmerAdvisory(),
      renderFarmerMandiPrice(),
      renderFarmerAlerts(),
      renderFarmerSchemes()
    ]);

  } catch (err) {
    console.error('Error fetching farmer details:', err);
  }
}

async function renderFarmerProfileCard() {
  const f = state.currentFarmer;
  if (!f) return;

  const lang = state.selectedLanguage || 'hi';
  const cropEmojis = { onion: '🧅', cotton: '🌿', soybean: '🌱', rice: '🌾', maize: '🌽' };
  const cropEmoji = cropEmojis[f.crop.toLowerCase()] || '🌾';

  // Translate labels & dynamic fields
  const translatedCrop = await getTranslation(f.crop, lang);
  const translatedStage = await getTranslation(f.crop_stage, lang);
  const translatedLocation = await getTranslation(`${f.village || ''}, ${f.district_name || f.district_id}`, lang);
  const HectaresLabel = await getTranslation('Hectares', lang);
  const loanDueLabel = await getTranslation('Loan Due', lang);
  const optimalChannelLabel = await getTranslation('Optimal Channel', lang);
  
  const isIvr = f.recommended_channel === 'ivr_or_sms';
  const channelTitle = isIvr ? 'IVR Call & Plain SMS' : 'Smartphone In-App & Voice';
  const deviceNote = `${f.device_type.replace('_', ' ')} (${f.network_quality} Network)`;

  const translatedChannelTitle = await getTranslation(channelTitle, lang);
  const translatedDeviceNote = await getTranslation(deviceNote, lang);

  document.getElementById('fp-name').textContent = f.name;
  document.getElementById('fp-crop-badge').textContent = `${cropEmoji} ${translatedCrop.toUpperCase()} — ${translatedStage.toUpperCase()}`;
  document.getElementById('fp-location').textContent = `📍 ${translatedLocation}`;
  document.getElementById('fp-landholding').textContent = `📐 ${f.landholding_hectares} ${HectaresLabel}`;
  document.getElementById('fp-loan').textContent = `💳 ${loanDueLabel}: ${f.loan_due_date}`;

  // Channel icon and note
  document.getElementById('fp-channel-icon').textContent = isIvr ? '☎️' : '📱';
  document.getElementById('fp-channel-title').textContent = translatedChannelTitle;
  document.getElementById('fp-device-note').textContent = translatedDeviceNote;
  
  const optimalChannelEl = document.querySelector('#farmer-profile-card .text-emerald-200');
  if (optimalChannelEl) {
    optimalChannelEl.textContent = optimalChannelLabel;
  }
}

function showFarmerTab(tabName) {
  state.activeFarmerTab = tabName;
  stopSpeech();

  const tabs = ['advisory', 'mandi', 'alerts', 'schemes'];
  tabs.forEach(t => {
    const el = document.getElementById(`farmer-tab-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    if (el) {
      if (t === tabName) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
    if (btn) {
      if (t === tabName) {
        btn.classList.add('ring-4', 'ring-emerald-500/30', 'border-emerald-600');
      } else {
        btn.classList.remove('ring-4', 'ring-emerald-500/30', 'border-emerald-600');
      }
    }
  });
}

async function renderFarmerAdvisory() {
  const adv = state.currentAdvisory;
  if (!adv) return;

  const lang = state.selectedLanguage || 'hi';
  
  let title = adv.title[lang];
  let text = adv.text[lang];

  if (!title || !text) {
    const srcTitle = adv.title['hi'] || adv.title['en'];
    const srcText = adv.text['hi'] || adv.text['en'];
    
    const [tTitle, tText] = await Promise.all([
      getTranslation(srcTitle, lang),
      getTranslation(srcText, lang)
    ]);
    adv.title[lang] = tTitle;
    adv.text[lang] = tText;
    title = tTitle;
    text = tText;
  }

  document.getElementById('advisory-title').textContent = title;
  document.getElementById('advisory-spoken-text').textContent = text;

  // Translate badge
  const badge = document.getElementById('advisory-badge');
  let badgeText = '';
  if (adv.action_type === 'market_intervention') {
    badge.className = "px-3 py-1 rounded-full text-xs font-extrabold bg-red-100 text-red-800 uppercase tracking-wider";
    badgeText = `MARKET INTERVENTION (${adv.rule_id})`;
  } else if (adv.action_type === 'contingency_crop_switch') {
    badge.className = "px-3 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 uppercase tracking-wider";
    badgeText = `CRIDA CONTINGENCY SWITCH (${adv.rule_id})`;
  } else {
    badge.className = "px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 uppercase tracking-wider";
    badgeText = `AGRONOMY ADVISORY (${adv.rule_id})`;
  }
  badge.textContent = await getTranslation(badgeText, lang);

  // Contingency crop list
  const contingencyBox = document.getElementById('contingency-box');
  const contingencyList = document.getElementById('contingency-crops-list');
  
  const contingencyTitleEl = document.querySelector('#contingency-box span:last-child');
  if (contingencyTitleEl) {
    contingencyTitleEl.textContent = await getTranslation('ICAR-CRIDA Contingency Crop Recommendations:', lang);
  }

  if (adv.contingency_crops && adv.contingency_crops.length > 0) {
    contingencyBox.classList.remove('hidden');
    
    const translatedCrops = await Promise.all(adv.contingency_crops.map(async c => {
      const name = await getTranslation(c.name, lang);
      const duration = await getTranslation(`Duration: ${c.duration_days} Days`, lang);
      const rationale = await getTranslation(c.rationale, lang);
      return { name, duration, rationale };
    }));

    contingencyList.innerHTML = translatedCrops.map(c => `
      <div class="bg-white p-3 rounded-xl border border-amber-200">
        <div class="font-black text-sm text-amber-950">${c.name}</div>
        <div class="text-xs text-amber-700 font-bold mt-0.5">⏱ ${c.duration}</div>
        <p class="text-xs text-slate-600 mt-1">${c.rationale}</p>
      </div>
    `).join('');
  } else {
    contingencyBox.classList.add('hidden');
  }

  // Weather summary labels
  const rainDevLabel = await getTranslation('Rainfall Deviation', lang);
  const drySpellLabel = await getTranslation('Dry Spell Length', lang);
  const monsoonOnsetLabel = await getTranslation('Monsoon Onset', lang);
  const soilTypeLabel = await getTranslation('Soil Type', lang);

  const weatherLabels = document.querySelectorAll('#farmer-tab-advisory .grid .text-slate-500');
  if (weatherLabels.length >= 4) {
    weatherLabels[0].textContent = rainDevLabel;
    weatherLabels[1].textContent = drySpellLabel;
    weatherLabels[2].textContent = monsoonOnsetLabel;
    weatherLabels[3].textContent = soilTypeLabel;
  }

  // Weather summary values
  const wd = adv.weather_data;
  const rainValue = wd.rainfall_deviation_pct < 0 
    ? `${Math.abs(wd.rainfall_deviation_pct).toFixed(1)}% Deficit`
    : `+${wd.rainfall_deviation_pct.toFixed(1)}% Normal`;
  const drySpellValue = `${wd.dry_spell_days} Days`;
  const onsetValue = wd.onset_status;
  const soilValue = state.currentFarmer ? state.currentFarmer.soil_type : 'Black Cotton';

  const tRainValue = await getTranslation(rainValue, lang);
  const tDryValue = await getTranslation(drySpellValue, lang);
  const tOnsetValue = await getTranslation(onsetValue, lang);
  const tSoilValue = await getTranslation(soilValue, lang);

  document.getElementById('ctx-rainfall').textContent = tRainValue;
  document.getElementById('ctx-dryspell').textContent = tDryValue;
  document.getElementById('ctx-onset').textContent = tOnsetValue.toUpperCase();
  
  const ctxSoil = document.getElementById('ctx-soil');
  if (ctxSoil) {
    ctxSoil.textContent = tSoilValue;
  }
}

// Spoken Audio Handler for Weather & Soil Indicators (Tap-to-Listen)
async function playWeatherMetricAudio(metricKey) {
  const adv = state.currentAdvisory;
  const f = state.currentFarmer;
  if (!adv || !adv.weather_data) return;

  const wd = adv.weather_data;
  const lang = state.selectedLanguage || 'hi';
  const soil = f ? f.soil_type : 'Black Cotton';
  const rainDev = Math.abs(wd.rainfall_deviation_pct).toFixed(1);
  const isDeficit = wd.rainfall_deviation_pct < 0;
  const dryDays = wd.dry_spell_days;
  const onset = wd.onset_status;

  let script = "";

  if (metricKey === 'rainfall') {
    const scripts = {
      hi: isDeficit 
        ? `बारिश का विवरण: मानसून की बारिश सामान्य से ${rainDev}% कम है। मिट्टी में नमी संरक्षण के लिए पलवार यानी मल्चिंग का प्रयोग करें और पीएमएफबीवाई सर्वेक्षण के लिए तैयार रहें।`
        : `बारिश का विवरण: मानसून की बारिश सामान्य से ${rainDev}% अनुकूल है। जल निकास की उचित व्यवस्था रखें।`,
      mr: isDeficit
        ? `पावसाची स्थिती: मान्सूनचा पाऊस सरासरीपेक्षा ${rainDev}% कमी आहे. जमिनीत ओलावा टिकवण्यासाठी आच्छादनाचा यानी मल्चिंगचा वापर करा आणि पीक विमा पाहणीसाठी सज्ज राहा.`
        : `पावसाची स्थिती: मान्सूनचा पाऊस सरासरीपेक्षा ${rainDev}% समाधानकारक आहे. अतिरिक्त पाण्याचा निचरा करा.`,
      or: isDeficit
        ? `ବର୍ଷା ସୂଚନା: ମୌସୁମୀ ବର୍ଷା ସ୍ୱାଭାବିକଠାରୁ ${rainDev}% କମ୍ ରହିଛି। ମାଟିରେ ଆର୍ଦ୍ରତା ରଖିବା ପାଇଁ ମଲ୍ଚିଂ ବ୍ୟବହାର କରନ୍ତୁ ଏବଂ ଫସଲ ବୀମା ସର୍ଭେ ପାଇଁ ପ୍ରସ୍ତୁତ ରୁହନ୍ତୁ।`
        : `ବର୍ଷା ସୂଚନା: ମୌସୁମୀ ବର୍ଷା ସ୍ୱାଭାବିକ ରହିଛି। କ୍ଷେତରୁ ଅଧିକ ଜଳ ନିଷ୍କାସନ ବ୍ୟବସ୍ଥା କରନ୍ତୁ।`,
      as: isDeficit
        ? `বৰষুণৰ তথ্য: মৌচুমী বৰষুণ স্বাভাৱিকতকৈ ${rainDev}% কম হৈছে। মাটিৰ আৰ্দ্ৰতা ধৰি ৰাখিবলৈ খেৰৰ আচ্ছাদন (মালচিং) ব্যৱহাৰ কৰক আৰু শস্য বীমা জৰীপৰ বাবে সাজু থাকক।`
        : `বৰষুণৰ তথ্য: মৌচুমী বৰষুণ স্বাভাৱিক হৈছে। পানী নিষ্কাষণৰ উপযুক্ত ব্যৱস্থা ৰাখক।`,
      kn: isDeficit
        ? `ಮಳೆಯ ವಿವರ: ಮುಂಗಾರು ಮಳೆ ವಾಡಿಕೆಗಿಂತ ${rainDev}% ಕಡಿಮೆ ಆಗಿದೆ. ತೇವಾಂಶ ಉಳಿಸಿಕೊಳ್ಳಲು ಒಣಹುಲ್ಲಿನ ಹೊದಿಕೆ (ಮಲ್ಚಿಂಗ್) ಬಳಸಿ ಮತ್ತು ಬೆಳೆ ವಿಮೆ ಸಮೀಕ್ಷೆಗೆ ಸಿದ್ಧರಾಗಿ.`
        : `ಮಳೆಯ ವಿವರ: ಮುಂಗಾರು ಮಳೆ ವಾಡಿಕೆಯಷ್ಟಿದೆ. ಜಮೀನಿನಿಂದ ನೀರು ಸರಾಗವಾಗಿ ಹರಿದು ಹೋಗುವಂತೆ ನೋಡಿಕೊಳ್ಳಿ.`,
      en: isDeficit
        ? `Rainfall report: Monsoon precipitation is ${rainDev}% below normal. Apply straw mulch to protect root-zone moisture and prepare for crop insurance survey.`
        : `Rainfall report: Monsoon rainfall is normal at ${rainDev}% above benchmark. Maintain optimal drainage.`
    };
    script = scripts[lang] || scripts['en'];
  } else if (metricKey === 'dryspell') {
    const scripts = {
      hi: `सूखे का दौर: लगातार पिछले ${dryDays} दिनों से बारिश का खंड यानी सूखा चल रहा है। फसलों को बचाने के लिए शाम के समय हल्की सुरक्षात्मक सिंचाई या दो प्रतिशत यूरिया का हल्का छिड़काव करें।`,
      mr: `पावसाचा खंड: सलग गेल्या ${dryDays} दिवसांपासून पाऊस पडलेला नाही. पिकांचे रक्षण करण्यासाठी थंड संध्याकाळी हलके पाणी द्या किंवा दोन टक्के युरिया फवारणी करा.`,
      or: `ଶୁଖିଲା ଦିନ ଅବଧି: ଗତ ${dryDays} ଦିନ ଧରି କୌଣସି ବର୍ଷା ହୋଇନାହିଁ। ଫସଲ ରକ୍ଷା ପାଇଁ ସନ୍ଧ୍ୟା ସମୟରେ ହାଲୁକା ଜଳସେଚନ କିମ୍ବା ୨ ପ୍ରତିଶତ ୟୁରିଆ ସ୍ପ୍ରେ କରନ୍ତୁ।`,
      as: `খৰাং দিনৰ দৈৰ্ঘ্য: যোৱা ${dryDays} দিন ধৰি কোনো বৰষুণ হোৱা নাই। শস্য সুৰক্ষাৰ বাবে গধূলি সময়ত পাতলীয়া পানী যোগান বা ২ শতাংশ ইউৰিয়া স্প্ৰে কৰক।`,
      kn: `ಒಣ ಅವಧಿ: ಸತತ ${dryDays} ದಿನಗಳಿಂದ ಮಳೆಯಾಗಿಲ್ಲ. ಬೆಳೆ ಒಣಗದಂತೆ ತಡೆಯಲು ಸಂಜೆ ವೇಳೆಯಲ್ಲಿ ಲಘು ನೀರಾವರಿ ಅಥವಾ ೨% ಯೂರಿಯಾ ಸಿಂಪಡಿಸಿ.`,
      en: `Dry spell alert: A dry spell of ${dryDays} consecutive days has been recorded. Provide protective life-saving irrigation or 2% urea foliar spray during cool evening hours.`
    };
    script = scripts[lang] || scripts['en'];
  } else if (metricKey === 'onset') {
    const onsetTrans = {
      Normal: { hi: 'समय पर (सामान्य)', mr: 'वेळेवर (सामान्य)', or: 'ସ୍ୱାଭାବିକ', as: 'স্বাভাৱিক', kn: 'ಸಮಯಕ್ಕೆ ಸರಿಯಾಗಿ (ವಾಡಿಕೆ)', en: 'Normal on time' },
      Delayed: { hi: 'देरी से', mr: 'उशिरा', or: 'ବିଳମ୍ବରେ', as: 'পলমকৈ', kn: 'ತಡವಾಗಿ', en: 'Delayed' },
      Early: { hi: 'समय से पहले', mr: 'वेळेआधी', or: 'ସମୟ ପୂର୍ବରୁ', as: 'সময়ৰ আগতেই', kn: 'ಮುಂಚಿತವಾಗಿ', en: 'Early' }
    };
    const localizedOnset = (onsetTrans[onset] && onsetTrans[onset][lang]) || onset;
    const scripts = {
      hi: `मानसून आगमन स्थिति: इस क्षेत्र में मानसून का आगमन ${localizedOnset} रहा है। फसल बुवाई और खाद प्रबंधन इसी अनुसार करें।`,
      mr: `मान्सून आगमन स्थिती: या भागात मान्सूनचे आगमन ${localizedOnset} राहिले आहे. पेरणी व खत व्यवस्थापन यानुसार करावे.`,
      or: `ମୌସୁମୀ ଆଗମନ ସ୍ଥିତି: ଏହି ଅଞ୍ଚଳରେ ମୌସୁମୀ ଆଗମନ ${localizedOnset} ହୋଇଛି। ବୁଣାବୁଣି ସେହି ଅନୁସାରେ କରନ୍ତୁ।`,
      as: `মৌচুমী আগমনৰ স্থিতি: এই অঞ্চলত মৌচুমীৰ আগমন ${localizedOnset} হৈছে। শস্য ৰোপণ সেই অনুসৰি কৰক।`,
      kn: `ಮುಂಗಾರು ಪ್ರವೇಶ ಸ್ಥಿತಿ: ಈ ಪ್ರದೇಶದಲ್ಲಿ ಮುಂಗಾರು ಪ್ರವೇಶ ${localizedOnset} ಆಗಿದೆ. ಬಿತ್ತನೆ ಕಾರ್ಯವನ್ನು ಇದಕ್ಕೆ ತಕ್ಕಂತೆ ನಡೆಸಿ.`,
      en: `Monsoon onset status: Monsoon arrival in this zone has been ${localizedOnset}. Align sowing schedule accordingly.`
    };
    script = scripts[lang] || scripts['en'];
  } else if (metricKey === 'soil') {
    const soilTrans = {
      'Black Cotton': { hi: 'काली कपास मिट्टी', mr: 'काळी कापशी जमीन', or: 'କଳା କପା ମାଟି', as: 'ক\'লা কপাহী মাটি', kn: 'ಕಪ್ಪು ಹತ್ತಿ ಮಣ್ಣು', en: 'Black Cotton soil' },
      'Red Loamy': { hi: 'लाल दोमट मिट्टी', mr: 'तांबडी दुमट जमीन', or: 'ନାଲି ଦୋରସା ମାଟି', as: 'ৰঙা পলসুৱা মাটি', kn: 'ಕೆಂಪು ಗೋಡು ಮಣ್ಣು', en: 'Red Loamy soil' },
      'Alluvial': { hi: 'जलोढ़ दोमट मिट्टी', mr: 'गाळाची जमीन', or: 'ପଟୁ ମାଟି', as: 'পলসুৱা মাটি', kn: 'ಮೆಕ್ಕಲು ಮಣ್ಣು', en: 'Alluvial soil' },
      'Sandy Loam': { hi: 'बलुई दोमट मिट्टी', mr: 'वाळूयुक्त दुमट जमीन', or: 'ବାଲିଆ ଦୋରସା ମାଟି', as: 'বালিয়া পলসুৱা মাটি', kn: 'ಮರಳು ಮಿಶ್ರಿತ ಗೋಡು ಮಣ್ಣು', en: 'Sandy Loam soil' }
    };
    const localizedSoil = (soilTrans[soil] && soilTrans[soil][lang]) || soil;
    const scripts = {
      hi: `मिट्टी का प्रकार: आपकी भूमि ${localizedSoil} है। इसमें नमी और जल धारण क्षमता को ध्यान में रखकर सिंचाई और संतुलित पोषक तत्व दें।`,
      mr: `जमिनीचा प्रकार: आपली शेतजमीन ${localizedSoil} आहे. ओलावा टिकवून ठेवण्याच्या गुणधर्मानुसार पाणी व सेंद्रिय खतांचा वापर करा.`,
      or: `ମାଟିର ପ୍ରକାର: ଆପଣଙ୍କ ଜମି ${localizedSoil} ଅଟେ। ଆର୍ଦ୍ରତା ଧାରଣ କ୍ଷମତା ଅନୁଯାୟୀ ଜଳସେଚନ ଓ ସାର ପ୍ରୟୋଗ କରନ୍ତୁ।`,
      as: `মাটিৰ প্ৰকাৰ: আপোনাৰ মাটি ${localizedSoil}। পানী ধৰি ৰখাৰ ক্ষমতা অনুসৰি উপযুক্ত সাৰ আৰু পানী ব্যৱহাৰ কৰক।`,
      kn: `ಮಣ್ಣಿನ ವಿಧ: ನಿಮ್ಮ ಕೃಷಿ ಭೂಮಿ ${localizedSoil} ಆಗಿದೆ. ತೇವಾಂಶ ಹಿಡಿದಿಟ್ಟುಕೊಳ್ಳುವ ಸಾಮರ್ಥ್ಯಕ್ಕೆ ತಕ್ಕಂತೆ ಹಿತಮಿತವಾದ ನೀರು ಮತ್ತು ಸಾವಯವ ಗೊಬ್ಬರ ನೀಡಿ.`,
      en: `Soil characteristics: Your farmland has ${localizedSoil}. Regulate moisture and fertilization based on its specific retention profile.`
    };
    script = scripts[lang] || scripts['en'];
  } else if (metricKey === 'all') {
    const soilTrans = {
      'Black Cotton': { hi: 'काली कपास मिट्टी', mr: 'काळी कापशी जमीन', or: 'କଳା କପା ମାଟି', as: 'ক\'লা কপাহী মাটি', kn: 'ಕಪ್ಪು ಹತ್ತಿ ಮಣ್ಣು', en: 'Black Cotton soil' },
      'Red Loamy': { hi: 'लाल दोमट मिट्टी', mr: 'तांबडी दुमट जमीन', or: 'ନାଲି ଦୋରସା ମାଟି', as: 'ৰঙা পলসুৱা মাটি', kn: 'ಕೆಂಪು ಗೋಡು ಮಣ್ಣು', en: 'Red Loamy soil' },
      'Alluvial': { hi: 'जलोढ़ दोमट मिट्टी', mr: 'गाळाची जमीन', or: 'ପଟୁ ମାଟି', as: 'পলসুৱা মাটি', kn: 'ಮೆಕ್ಕಲು ಮಣ್ಣು', en: 'Alluvial soil' },
      'Sandy Loam': { hi: 'बलुई दोमट मिट्टी', mr: 'वाळूयुक्त दुमट जमीन', or: 'ବାଲିଆ ଦୋରସା ମାଟି', as: 'বালিয়া পলসুৱা মাটি', kn: 'ಮರಳು ಮಿಶ್ರಿತ ಗೋಡು ಮಣ್ಣು', en: 'Sandy Loam soil' }
    };
    const localizedSoil = (soilTrans[soil] && soilTrans[soil][lang]) || soil;
    const scripts = {
      hi: `मौसम एवं मृदा रिपोर्ट: बारिश सामान्य से ${rainDev}% ${isDeficit ? 'कम' : 'अधिक'} है, और पिछले ${dryDays} दिनों से सूखा है। मिट्टी का प्रकार ${localizedSoil} है। नमी संरक्षण के लिए पलवार और जीवन रक्षक सिंचाई करें।`,
      mr: `हवामान व जमीन अहवाल: पाऊस सरासरीपेक्षा ${rainDev}% ${isDeficit ? 'कमी' : 'जास्त'} आहे, आणि गेल्या ${dryDays} दिवसांपासून पावसाचा खंड आहे. मातीचा प्रकार ${localizedSoil} आहे. ओलावा टिकवण्यासाठी आच्छादन व हलके पाणी द्यावे.`,
      or: `ପାଣିପାଗ ଓ ମୃତ୍ତିକା ବିବରଣୀ: ବର୍ଷା ସ୍ୱାଭାବିକଠାରୁ ${rainDev}% ${isDeficit ? 'କମ୍' : 'ଅଧିକ'} ରହିଛି, ଏବଂ ଗତ ${dryDays} ଦିନ ଧରି ଶୁଖିଲା ପାଗ ଅଛି। ମାଟିର ପ୍ରକାର ${localizedSoil}। ମଲ୍ଚିଂ ଓ ସୁରକ୍ଷାମୂଳକ ଜଳସେଚନ କରନ୍ତୁ।`,
      as: `বতৰ আৰু মাটিৰ প্ৰতিবেদন: বৰষুণ স্বাভাৱিকতকৈ ${rainDev}% ${isDeficit ? 'কম' : 'বেছি'} হৈছে, আৰু যোৱা ${dryDays} দিন ধৰি খৰাং চলিছে। মাটিৰ প্ৰকাৰ ${localizedSoil}। আৰ্দ্ৰতা ৰক্ষাৰ বাবে মালচিং আৰু পানী যোগান দিয়ক।`,
      kn: `ಹವಾಮಾನ ಮತ್ತು ಮಣ್ಣಿನ ವರದಿ: ಮಳೆಯು ವಾಡಿಕೆಗಿಂತ ${rainDev}% ${isDeficit ? 'ಕಡಿಮೆ' : 'ಹೆಚ್ಚು'} ಆಗಿದೆ, ಮತ್ತು ಕಳೆದ ${dryDays} ದಿನಗಳಿಂದ ಒಣ ಅವಧಿ ಇದೆ. ಮಣ್ಣಿನ ವಿಧ ${localizedSoil}. ತೇವಾಂಶ ಉಳಿಸಲು ಮಲ್ಚಿಂಗ್ ಹಾಗೂ ಲಘು ನೀರುಣಿಸಿ.`,
      en: `Agro-weather and soil report: Rainfall is ${rainDev}% ${isDeficit ? 'below' : 'above'} normal with a ${dryDays}-day dry spell. Soil profile is ${localizedSoil}. Implement straw mulching and protective irrigation.`
    };
    script = scripts[lang] || scripts['en'];
  }

  if (script) {
    await speakText(script, lang);
  }
}

async function playCurrentAdvisoryAudio() {
  const adv = state.currentAdvisory;
  if (!adv || !adv.price_data) return;

  const pd = adv.price_data;
  const lang = state.selectedLanguage || 'hi';

  const cropName = await getTranslation(pd.crop, lang);
  const marketName = await getTranslation(pd.market_name, lang);
  
  document.getElementById('mandi-name').textContent = `${marketName} • ${cropName.toUpperCase()}`;
  document.getElementById('mandi-current-price').textContent = `₹${pd.current_price.toLocaleString('en-IN')}`;
  document.getElementById('mandi-msp-price').textContent = `₹${pd.govt_msp.toLocaleString('en-IN')}`;

  const alertBox = document.getElementById('mandi-alert-box');
  const tabIndicator = document.getElementById('tab-mandi-indicator');

  // Translate static labels in Mandi Section
  const surveillanceLabel = await getTranslation('APMC Market Surveillance', lang);
  const mandiMspTitle = await getTranslation('Mandi Price vs Government MSP', lang);
  const todayMandiLabel = await getTranslation("Today's Mandi Price", lang);
  const mspLabel = await getTranslation('Government MSP', lang);
  const perQuintalLabel = await getTranslation('per Quintal', lang);
  const guaranteedLabel = await getTranslation('per Quintal (Guaranteed Benchmark)', lang);
  const recommendedActionLabel = await getTranslation('Recommended Market Action:', lang);

  const surveillanceEl = document.querySelector('#farmer-tab-mandi .bg-amber-100');
  if (surveillanceEl) surveillanceEl.textContent = surveillanceLabel;

  const titleEl = document.querySelector('#farmer-tab-mandi h2');
  if (titleEl) titleEl.textContent = mandiMspTitle;

  const todayMandiEl = document.querySelector('#farmer-tab-mandi .text-slate-500.uppercase');
  if (todayMandiEl) todayMandiEl.textContent = todayMandiLabel;

  const perQuintalEls = document.querySelectorAll('#farmer-tab-mandi .font-semibold');
  if (perQuintalEls.length > 0) perQuintalEls[0].textContent = perQuintalLabel;
  if (perQuintalEls.length > 1) perQuintalEls[1].textContent = guaranteedLabel;

  const mspLabelEl = document.querySelector('#farmer-tab-mandi .text-emerald-800');
  if (mspLabelEl) mspLabelEl.textContent = mspLabel;

  const recommendedActionEl = document.querySelector('#farmer-tab-mandi .text-emerald-400');
  if (recommendedActionEl) recommendedActionEl.textContent = recommendedActionLabel;

  // Render distress or stable message
  if (pd.is_below_msp) {
    alertBox.className = "bg-red-50 border-2 border-red-400 rounded-2xl p-5 text-red-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4";
    
    const warningBadge = await getTranslation('Distress Warning', lang);
    const belowMspTitle = await getTranslation('Price is BELOW Government MSP!', lang);
    const belowMspBody = await getTranslation(`Current Mandi price is below MSP by ${pd.shortfall_pct}%. Do NOT sell in panic. Use e-NAM APMC enrollment or WDRA pledge loan.`, lang);

    alertBox.innerHTML = `
      <div class="flex items-start space-x-3">
        <div class="text-3xl">⚠️</div>
        <div>
          <div class="font-extrabold text-lg">${belowMspTitle}</div>
          <p class="text-sm font-medium mt-0.5">${belowMspBody}</p>
        </div>
      </div>
      <span class="bg-red-600 text-white font-black text-xs px-3 py-1.5 rounded-lg whitespace-nowrap">${warningBadge}</span>
    `;

    if (tabIndicator) {
      const belowMspIndicator = await getTranslation(`Below MSP (-${pd.shortfall_pct}%)`, lang);
      tabIndicator.textContent = `⚠️ ${belowMspIndicator}`;
      tabIndicator.className = "inline-flex items-center text-xs font-bold text-red-600";
    }
  } else {
    alertBox.className = "bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-5 text-emerald-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4";
    
    const normalBadge = await getTranslation('Stable Price', lang);
    const normalTitle = await getTranslation('Price is ABOVE Government MSP', lang);
    const normalBody = await getTranslation(`Current market price is ₹${pd.current_price}, maintaining stability above the Government MSP floor benchmark.`, lang);

    alertBox.innerHTML = `
      <div class="flex items-start space-x-3">
        <div class="text-3xl">✅</div>
        <div>
          <div class="font-extrabold text-lg">${normalTitle}</div>
          <p class="text-sm font-medium mt-0.5">${normalBody}</p>
        </div>
      </div>
      <span class="bg-emerald-600 text-white font-black text-xs px-3 py-1.5 rounded-lg whitespace-nowrap">${normalBadge}</span>
    `;

    if (tabIndicator) {
      const aboveMspIndicator = await getTranslation('Above MSP', lang);
      tabIndicator.textContent = `✅ ${aboveMspIndicator}`;
      tabIndicator.className = "inline-flex items-center text-xs font-bold text-emerald-600";
    }
  }

  // Recommended actions list
  const recContainer = document.querySelector('#farmer-tab-mandi .bg-slate-900 p');
  if (recContainer) {
    const defaultActions = [
      `1. Avoid immediate Mandi distress sale: Current mandi realization causes an estimated ₹${pd.govt_msp - pd.current_price}/quintal loss.`,
      `2. e-NAM & WDRA Warehouse Receipt: Store produce in nearby WDRA warehouse and avail 70% pledge loan at 7% interest.`,
      `3. PM-AASHA Enrollment: Register at the Taluka procurement center for government price deficit support.`
    ];
    
    const translatedActions = await Promise.all(defaultActions.map(act => getTranslation(act, lang)));
    recContainer.innerHTML = translatedActions.join('<br>');
  }
}

async function renderFarmerAlerts() {
  const dis = state.currentDistress;
  const adv = state.currentAdvisory;
  const container = document.getElementById('farmer-alerts-container');
  if (!container || !dis) return;

  const lang = state.selectedLanguage || 'hi';
  const alerts = [];

  // Translate tab header
  const titleNotification = await getTranslation('Notifications & Reminders', lang);
  const titleActiveAlerts = await getTranslation('Active Notifications for Your Farm', lang);
  
  const notifEl = document.querySelector('#farmer-tab-alerts .bg-blue-100');
  if (notifEl) notifEl.textContent = titleNotification;
  
  const h2El = document.querySelector('#farmer-tab-alerts h2');
  if (h2El) h2El.textContent = titleActiveAlerts;

  // Price alert
  if (adv && adv.price_data && adv.price_data.is_below_msp) {
    alerts.push({
      icon: '🚨',
      title: 'Market Distress Warning',
      body: `Mandi price (₹${adv.price_data.current_price}) is ₹${adv.price_data.govt_msp - adv.price_data.current_price}/quintal below Government MSP. Avoid panic selling.`,
      severity: 'CRITICAL',
      color: 'border-red-400 bg-red-50 text-red-950'
    });
  }

  // Rainfall alert
  if (adv && adv.weather_data && Math.abs(adv.weather_data.rainfall_deviation_pct) > 25) {
    alerts.push({
      icon: '🌦️',
      title: 'Rainfall Deficit Notice',
      body: `Monsoon rainfall is currently ${Math.abs(adv.weather_data.rainfall_deviation_pct).toFixed(1)}% below normal with ${adv.weather_data.dry_spell_days} days dry spell. Apply soil mulch and prepare for PMFBY crop survey.`,
      severity: 'HIGH',
      color: 'border-amber-400 bg-amber-50 text-amber-950'
    });
  }

  // Loan reminder
  if (dis.days_until_loan_due <= 30) {
    alerts.push({
      icon: '💳',
      title: 'KCC Loan Due Reminder',
      body: `Loan repayment deadline is in ${dis.days_until_loan_due} days. Visit your primary cooperative bank for 3% interest subvention renewal or restructuring.`,
      severity: 'MEDIUM',
      color: 'border-purple-400 bg-purple-50 text-purple-950'
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      icon: '✅',
      title: 'All Farm Systems Normal',
      body: 'Weather conditions and market prices are currently stable for your crop.',
      severity: 'INFO',
      color: 'border-emerald-300 bg-emerald-50 text-emerald-950'
    });
  }

  // Translate all alerts
  const translatedAlerts = await Promise.all(alerts.map(async a => {
    const tTitle = await getTranslation(a.title, lang);
    const tBody = await getTranslation(a.body, lang);
    const tSeverity = await getTranslation(a.severity, lang);
    return { ...a, title: tTitle, body: tBody, severity: tSeverity };
  }));

  container.innerHTML = translatedAlerts.map(a => `
    <div class="p-5 rounded-2xl border-2 ${a.color} flex items-start space-x-4">
      <div class="text-3xl">${a.icon}</div>
      <div class="flex-grow">
        <div class="flex items-center justify-between">
          <h4 class="font-black text-base">${a.title}</h4>
          <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-black/10">${a.severity}</span>
        </div>
        <p class="text-sm font-medium mt-1 leading-relaxed">${a.body}</p>
      </div>
    </div>
  `).join('');
}

async function renderFarmerSchemes() {
  const dis = state.currentDistress;
  const container = document.getElementById('farmer-schemes-container');
  if (!container || !dis) return;

  const lang = state.selectedLanguage || 'hi';
  const interventions = dis.recommended_interventions || [];

  // Translate headers
  const safetyNetLabel = await getTranslation('Government Safety Net', lang);
  const schemesTitle = await getTranslation('Eligible Schemes Based on Your Stress Signals', lang);
  
  const safetyEl = document.querySelector('#farmer-tab-schemes .bg-purple-100');
  if (safetyEl) safetyEl.textContent = safetyNetLabel;

  const h2El = document.querySelector('#farmer-tab-schemes h2');
  if (h2El) h2El.textContent = schemesTitle;

  const triggerLabel = await getTranslation('Trigger Cause:', lang);
  const actionLabel = await getTranslation('Action for Farmer:', lang);

  const translatedInterventions = await Promise.all(interventions.map(async item => {
    const schemeName = await getTranslation(item.scheme_name, lang);
    const urgency = await getTranslation(item.urgency, lang);
    const trigger = await getTranslation(item.trigger, lang);
    const actionItem = await getTranslation(item.action_item, lang);
    return { ...item, scheme_name: schemeName, urgency, trigger, action_item: actionItem };
  }));

  container.innerHTML = translatedInterventions.map(item => `
    <div class="bg-slate-50 border-2 border-slate-200 hover:border-emerald-500 rounded-2xl p-5 space-y-3 transition">
      <div class="flex items-start justify-between">
        <div>
          <span class="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 uppercase">${item.scheme_id}</span>
          <h4 class="text-base font-extrabold text-slate-900 mt-1">${item.scheme_name}</h4>
        </div>
        <span class="text-xs font-black uppercase px-2 py-1 rounded ${item.urgency === 'CRITICAL' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}">${item.urgency}</span>
      </div>

      <div class="bg-white p-3 rounded-xl border border-slate-100">
        <div class="text-[11px] font-bold text-slate-500 uppercase">${triggerLabel}</div>
        <div class="text-xs font-semibold text-slate-800 mt-0.5">${item.trigger}</div>
      </div>

      <div class="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200">
        <div class="text-[11px] font-bold text-emerald-800 uppercase">${actionLabel}</div>
        <div class="text-xs font-semibold text-emerald-950 mt-0.5">${item.action_item}</div>
      </div>
    </div>
  `).join('');
}

// --- VOICE & SPEECH SYNTHESIS LAYER (Multi-Language Spoken Advisory) ---

async function playCurrentAdvisoryAudio() {
  const adv = state.currentAdvisory;
  if (!adv) return;

  const lang = state.selectedLanguage || 'hi';
  
  let title = adv.title[lang];
  let text = adv.text[lang];

  if (!title || !text) {
    const srcTitle = adv.title['hi'] || adv.title['en'] || '';
    const srcText = adv.text['hi'] || adv.text['en'] || '';
    const [tTitle, tText] = await Promise.all([
      getTranslation(srcTitle, lang),
      getTranslation(srcText, lang)
    ]);
    adv.title[lang] = tTitle;
    adv.text[lang] = tText;
    title = tTitle;
    text = tText;
  }

  // Include contingency crop details if present
  let contingencyDetails = "";
  if (adv.contingency_crops && adv.contingency_crops.length > 0) {
    const cropNames = adv.contingency_crops.map(c => c.crop || c).join(', ');
    const contTrans = await getTranslation(`Recommended contingency crops: ${cropNames}`, lang);
    contingencyDetails = ` ${contTrans}`;
  }

  const fullSpokenScript = `${title}। ${text}${contingencyDetails}`;
  await speakText(fullSpokenScript, lang);
}

async function speakText(textToSpeak, langCode) {
  if (!textToSpeak) return;

  // Toggle behavior: if currently speaking, stop
  if (state.isSpeaking) {
    stopSpeech();
    return;
  }

  stopSpeech();

  const lang = langCode || state.selectedLanguage || 'hi';
  const t = i18n[lang] || i18n['en'];
  showTTSToast(t.playing || 'Playing audio…');

  // 1. Primary engine: High-fidelity Server-side TTS endpoint with full Indian language support
  try {
    const audioUrl = `${API_BASE}/tts?text=${encodeURIComponent(textToSpeak)}&lang=${encodeURIComponent(lang)}`;
    const audio = new Audio(audioUrl);
    state.currentAudio = audio;
    state.isSpeaking = true;
    updateVoiceButtonUI(true);

    audio.onended = () => {
      stopSpeech();
    };

    audio.onerror = (err) => {
      console.warn('Backend TTS stream error, trying fallback:', err);
      state.isSpeaking = false;
      fallbackToWebSpeech(textToSpeak, lang);
    };

    await audio.play();
    return;
  } catch (err) {
    console.warn('Audio play failed, falling back to Web Speech:', err);
    fallbackToWebSpeech(textToSpeak, lang);
  }
}

function stopSpeech() {
  // Stop GCP Audio element if playing
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio.currentTime = 0;
    state.currentAudio = null;
  }
  // Stop browser speech synthesis
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  state.isSpeaking = false;
  updateVoiceButtonUI(false);
  // Remove pulse animation from all TTS buttons
  document.querySelectorAll('.tts-listen-btn').forEach(b => b.classList.remove('tts-playing'));
}

function updateVoiceButtonUI(isPlaying) {
  const btnText = document.getElementById('voice-btn-text');
  const icon    = document.getElementById('voice-icon');
  if (!btnText || !icon) return;

  const lang = state.selectedLanguage || 'hi';
  const t    = i18n[lang] || i18n['en'];

  if (isPlaying) {
    icon.textContent = '\u23f9\ufe0f';
    btnText.textContent = t.stopAudio;
  } else {
    icon.textContent = '\ud83d\udd0a';
    btnText.textContent = t.playAdvisory;
  }
}

// --- MODULE 2: OFFICER DASHBOARD CONTROLS & LIVE RE-RANKING ---

async function fetchOfficerData() {
  try {
    const res = await fetch(`${API_BASE}/officer/farmers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.weights)
    });

    const data = await res.json();
    state.officerFarmers = data.farmers;
    state.officerMetrics = data.metrics;

    renderOfficerMetrics();
    renderOfficerTable();

  } catch (err) {
    console.error('Error fetching officer data:', err);
  }
}

function renderOfficerMetrics() {
  const m = state.officerMetrics;
  if (!m) return;

  document.getElementById('metric-total').textContent = m.total_farmers || 0;
  document.getElementById('metric-high').textContent = m.high_risk_count || 0;
  document.getElementById('metric-med').textContent = m.medium_risk_count || 0;
  document.getElementById('metric-low').textContent = m.low_risk_count || 0;
}

// Crop and Crop Stage Translations for Officer and Multilingual Views
const CROP_TRANSLATIONS = {
  onion:   { en: 'Onion', hi: 'प्याज', mr: 'कांदा', or: 'ପିଆଜ', as: 'পিয়াঁজ', kn: 'ಈರುಳ್ಳಿ' },
  cotton:  { en: 'Cotton', hi: 'कपास', mr: 'कापूस', or: 'କପା', as: 'কপাহ', kn: 'ಹತ್ತಿ' },
  soybean: { en: 'Soybean', hi: 'सोयाबीन', mr: 'सोयाबीन', or: 'ସୋୟାବିନ୍', as: 'ছয়াবিন', kn: 'ಸೋಯಾಬೀನ್' },
  rice:    { en: 'Rice', hi: 'धान / चावल', mr: 'भात / तांदूळ', or: 'ଧାନ', as: 'ধান', kn: 'ಭತ್ತ / ಅಕ್ಕಿ' },
  paddy:   { en: 'Paddy', hi: 'धान', mr: 'भात', or: 'ଧାନ', as: 'ধান', kn: 'ಭತ್ತ' },
  maize:   { en: 'Maize', hi: 'मक्का', mr: 'मका', or: 'ମକା', as: 'মাকৈ', kn: 'ಮೆಕ್ಕೆಜೋಳ' },
  bajra:   { en: 'Bajra', hi: 'बाजरा', mr: 'बाजरी', or: 'ବାଜରା', as: 'বজৰা', kn: 'ಸಜ್ಜೆ' },
  wheat:   { en: 'Wheat', hi: 'गेहूं', mr: 'गहू', or: 'ଗହମ', as: 'গম', kn: 'ಗೋಧಿ' },
};

const STAGE_TRANSLATIONS = {
  harvest:    { en: 'Harvest Stage', hi: 'कटाई अवस्था', mr: 'कापणी अवस्था', or: 'ଅମଳ ପର୍ଯ୍ୟାୟ', as: 'চপোৱা পৰ্যায়', kn: 'ಕೊಯ್ಲು ಹಂತ' },
  sowing:     { en: 'Sowing Stage', hi: 'बुवाई अवस्था', mr: 'पेरणी अवस्था', or: 'ବୁଣା ପର୍ଯ୍ୟାୟ', as: 'সিঁচাৰ পৰ্যায়', kn: 'ಬಿತ್ತನೆ ಹಂತ' },
  flowering:  { en: 'Flowering Stage', hi: 'फूल आने की अवस्था', mr: 'फुलधारणा अवस्था', or: 'ଫୁଲ ଆସିବା ପର୍ଯ୍ୟାୟ', as: 'ফুল ফুলিবৰ পৰ্যায়', kn: 'ಹೂಬಿಡುವ ಹಂತ' },
  vegetative: { en: 'Vegetative Stage', hi: 'वानस्पतिक वृद्धि अवस्था', mr: 'शाकीय वाढ अवस्था', or: 'ବୃଦ୍ଧି ପର୍ଯ୍ୟାୟ', as: 'বৃদ্ধি পৰ্যায়', kn: 'ಬೆಳವಣಿಗೆ ಹಂತ' },
  'pod development': { en: 'Pod Development', hi: 'फली विकास अवस्था', mr: 'शेंगा भरण्याची अवस्था', or: 'ଛୁଇଁ ବିକାଶ ପର୍ଯ୍ୟାୟ', as: 'শুঁটি বিকাশ', kn: 'ಕಾಯಿ ಕಟ್ಟುವ ಹಂತ' },
};

function renderOfficerTable() {
  const tbody = document.getElementById('officer-table-body');
  if (!tbody) return;

  const lang = state.selectedLanguage || 'hi';
  const t = i18n[lang] || i18n['en'];

  const filter = document.getElementById('filter-risk')?.value || 'ALL';
  const filtered = state.officerFarmers.filter(f => {
    if (filter === 'ALL') return true;
    return f.risk_band === filter;
  });

  tbody.innerHTML = filtered.map(f => {
    const bandLabel = f.risk_band === 'High'
      ? (lang === 'hi' ? 'गंभीर' : lang === 'mr' ? 'गंभीर' : lang === 'or' ? 'ଅତି ଗମ୍ଭୀର' : lang === 'as' ? 'গুৰুতৰ' : lang === 'kn' ? 'ಗಂಭೀರ' : 'HIGH')
      : f.risk_band === 'Medium'
      ? (lang === 'hi' ? 'मध्यम' : lang === 'mr' ? 'मध्यम' : lang === 'or' ? 'ମଧ୍ୟମ' : lang === 'as' ? 'মধ্যম' : lang === 'kn' ? 'ಮಧ್ಯಮ' : 'MED')
      : (lang === 'hi' ? 'कम' : lang === 'mr' ? 'कमी' : lang === 'or' ? 'କମ୍' : lang === 'as' ? 'কম' : lang === 'kn' ? 'ಕಡಿಮೆ' : 'LOW');

    const bandBadge = f.risk_band === 'High'
      ? `<span class="px-2.5 py-1 rounded-full text-xs font-black bg-red-100 text-red-800 border border-red-300">${bandLabel} (71+)</span>`
      : f.risk_band === 'Medium'
      ? `<span class="px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300">${bandLabel} (41-70)</span>`
      : `<span class="px-2.5 py-1 rounded-full text-xs font-black bg-green-100 text-green-800 border border-green-300">${bandLabel} (0-40)</span>`;

    const channelText = f.recommended_channel === 'ivr_or_sms' ? (t.callIvr || 'Call / IVR') : (t.appPush || 'App Push');
    const channelBadge = f.recommended_channel === 'ivr_or_sms'
      ? `<span class="inline-flex items-center space-x-1 font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 text-xs"><span>☎️</span><span>${channelText}</span></span>`
      : `<span class="inline-flex items-center space-x-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 text-xs"><span>📱</span><span>${channelText}</span></span>`;

    const cropKey = (f.crop || '').toLowerCase();
    const localizedCrop = (CROP_TRANSLATIONS[cropKey] && CROP_TRANSLATIONS[cropKey][lang]) || f.crop;
    const stageKey = (f.crop_stage || '').toLowerCase();
    const localizedStage = (STAGE_TRANSLATIONS[stageKey] && STAGE_TRANSLATIONS[stageKey][lang]) || f.crop_stage;

    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="px-6 py-4">
          <div class="font-black text-slate-900">${f.farmer_name}</div>
          <div class="text-xs text-slate-500">📍 ${f.village}, ${f.district_name}</div>
        </td>
        <td class="px-4 py-4 font-bold text-slate-800">${f.district_name}</td>
        <td class="px-4 py-4">
          <div class="font-bold text-slate-900 capitalize">${localizedCrop}</div>
          <div class="text-xs text-slate-500 uppercase">${localizedStage}</div>
        </td>
        <td class="px-4 py-4">
          <div class="flex items-center space-x-2">
            <span class="text-lg font-black text-slate-900 font-mono">${f.distress_score}</span>
            ${bandBadge}
          </div>
        </td>
        <td class="px-4 py-4 text-xs font-semibold text-slate-700 max-w-xs">
          ${f.top_contributing_signal ? f.top_contributing_signal.label : 'Normal'}
        </td>
        <td class="px-4 py-4">
          <span class="text-xs font-extrabold text-indigo-900 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
            ${f.primary_recommended_scheme || 'PMFBY'}
          </span>
        </td>
        <td class="px-4 py-4">
          ${channelBadge}
        </td>
        <td class="px-6 py-4 text-right">
          <button onclick="openOfficerModal('${f.farmer_id}')" class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow transition">
            ${t.viewDetails || 'View Details 🔍'}
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function applyOfficerFilters() {
  renderOfficerTable();
}

function onWeightSliderChange() {
  const eVal  = parseFloat(document.getElementById('slider-w-exposure').value);
  const sVal  = parseFloat(document.getElementById('slider-w-sensitivity').value);
  const acVal = parseFloat(document.getElementById('slider-w-ac').value);
  const mVal  = parseFloat(document.getElementById('slider-w-mitigation').value);
  const tVal  = parseFloat(document.getElementById('slider-w-trigger').value);
  const dfVal = parseFloat(document.getElementById('slider-w-df').value);

  const sum = eVal + sVal + acVal + mVal + tVal + dfVal;
  if (sum === 0) return;

  state.weights = {
    exposure:           eVal  / sum,
    sensitivity:        sVal  / sum,
    adaptive_capacity:  acVal / sum,
    mitigation_deficit: mVal  / sum,
    trigger:            tVal  / sum,
    district_fragility: dfVal / sum
  };

  // Update live label percentages
  document.getElementById('label-w-exposure').textContent     = `${Math.round(state.weights.exposure           * 100)}%`;
  document.getElementById('label-w-sensitivity').textContent  = `${Math.round(state.weights.sensitivity        * 100)}%`;
  document.getElementById('label-w-ac').textContent           = `${Math.round(state.weights.adaptive_capacity  * 100)}%`;
  document.getElementById('label-w-mitigation').textContent   = `${Math.round(state.weights.mitigation_deficit * 100)}%`;
  document.getElementById('label-w-trigger').textContent      = `${Math.round(state.weights.trigger            * 100)}%`;
  document.getElementById('label-w-df').textContent           = `${Math.round(state.weights.district_fragility * 100)}%`;

  // Instantly re-rank table via backend recalculation
  fetchOfficerData();
}

function resetDistressWeights() {
  state.weights = {
    exposure:           0.25,
    sensitivity:        0.15,
    adaptive_capacity:  0.15,
    mitigation_deficit: 0.15,
    trigger:            0.20,
    district_fragility: 0.10
  };

  document.getElementById('slider-w-exposure').value   = 25;
  document.getElementById('slider-w-sensitivity').value = 15;
  document.getElementById('slider-w-ac').value          = 15;
  document.getElementById('slider-w-mitigation').value  = 15;
  document.getElementById('slider-w-trigger').value     = 20;
  document.getElementById('slider-w-df').value          = 10;

  document.getElementById('label-w-exposure').textContent     = '25%';
  document.getElementById('label-w-sensitivity').textContent  = '15%';
  document.getElementById('label-w-ac').textContent           = '15%';
  document.getElementById('label-w-mitigation').textContent   = '15%';
  document.getElementById('label-w-trigger').textContent      = '20%';
  document.getElementById('label-w-df').textContent           = '10%';

  fetchOfficerData();
}

// Spoken District Distress Briefing for Officers
async function playOfficerBriefingAudio() {
  const lang = state.selectedLanguage || 'hi';
  const m = state.officerMetrics || { total_farmers: 6, high_risk_count: 2, medium_risk_count: 3, low_risk_count: 1 };
  
  const officerBriefings = {
    hi: `कृषि अधिकारी सारांश: जिले के कुल ${m.total_farmers} पंजीकृत किसानों में से ${m.high_risk_count} किसान गंभीर संकट में हैं, और ${m.medium_risk_count} किसान मध्यम जोखिम में हैं। मुख्य कारण बारिश में देरी और मंडी भाव में गिरावट है। त्वरित पीएमएफबीवाई फसल सर्वेक्षण एवं ई-नाम पंजीकरण प्रारंभ करने की सिफारिश है।`,
    mr: `कृषी अधिकारी सारांश: जिल्ह्यातील एकूण ${m.total_farmers} शेतकर्‍यांपैकी ${m.high_risk_count} शेतकरी गंभीर संकटात आहेत, आणि ${m.medium_risk_count} शेतकरी मध्यम संकटात आहेत. पावसाची तूट आणि बाजारभावात झालेली घसरण ही मुख्य कारणे आहेत. तातडीने पीक विमा व ई-नाम नोंदणी मोहीम सुरू करावी.`,
    or: `କୃଷି ଅଧିକାରୀ ସାରାଂଶ: ଜିଲ୍ଲାର ମୋଟ ${m.total_farmers} ଜଣ ପଞ୍ଜୀକୃତ କୃଷକଙ୍କ ମଧ୍ୟରୁ ${m.high_risk_count} ଜଣ ଅତି ଗମ୍ଭୀର ସଙ୍କଟରେ ଅଛନ୍ତି, ଏବଂ ${m.medium_risk_count} ଜଣ ମଧ୍ୟମ ସଙ୍କଟରେ ଅଛନ୍ତି। ମୁଖ୍ୟ କାରଣ ବର୍ଷା ଅଭାବ ଏବଂ ମଣ୍ଡିରେ କମ୍ ଦର। ତୁରନ୍ତ ଫସଲ ବୀମା କ୍ଲେମ୍ ଓ ଇ-ନାମ ସହାୟତା ପଦକ୍ଷେପ ନିଅନ୍ତୁ।`,
    as: `কৃষি বিষয়া সাৰাংশ: জিলাৰ মুঠ ${m.total_farmers} গৰাকী কৃষকৰ ভিতৰত ${m.high_risk_count} গৰাকী কৃষক গুৰুতৰ সংকটত আৰু ${m.medium_risk_count} গৰাকী মধ্যম সংকটত আছে। মূল কাৰণ বৰষুণৰ নাটনি আৰু সমৰ্থন মূল্যতকৈ কম বজাৰ দৰ। তৎকালীনভাৱে শস্য বীমা আৰু ই-নাম সুবিধা প্ৰদান কৰক।`,
    kn: `ಕೃಷಿ ಅಧಿಕಾರಿಗಳ ಸಾರಾಂಶ: ಜಿಲ್ಲೆಯ ಒಟ್ಟು ${m.total_farmers} ರೈತರಲ್ಲಿ ${m.high_risk_count} ರೈತರು ಗಂಭೀರ ಸಂಕಷ್ಟದಲ್ಲಿದ್ದಾರೆ, ಮತ್ತು ${m.medium_risk_count} ರೈತರು ಮಧ್ಯಮ ಅಪಾಯದಲ್ಲಿದ್ದಾರೆ. ಮಳೆ ಕೊರತೆ ಮತ್ತು ಬೆಂಬಲ ಬೆಲೆಗಿಂತ ಕಡಿಮೆ ಮಾರುಕಟ್ಟೆ ಬೆಲೆ ಮುಖ್ಯ ಕಾರಣಗಳಾಗಿವೆ. ತಕ್ಷಣವೇ ಬೆಳೆ ವಿಮೆ ಮತ್ತು ಇ-ನಾಮ್ ನೆರವು ನೀಡಿ.`,
    en: `District Agro-Distress Briefing: Out of ${m.total_farmers} monitored farmers, ${m.high_risk_count} farmers are in High Distress and ${m.medium_risk_count} are in Medium Risk. Top triggers include delayed monsoon and below-MSP realizations. Immediate PMFBY crop loss claims and e-NAM warehouse loan mobilization are recommended.`
  };

  const script = officerBriefings[lang] || officerBriefings['en'];
  await speakText(script, lang);
}

// --- OFFICER DETAIL MODAL ---

function openOfficerModal(farmerId) {
  const farmer = state.officerFarmers.find(f => f.farmer_id === farmerId);
  if (!farmer) return;

  state.selectedOfficerFarmer = farmer;
  const lang = state.selectedLanguage || 'hi';
  const t = i18n[lang] || i18n['en'];

  const cropKey = (farmer.crop || '').toLowerCase();
  const localizedCrop = (CROP_TRANSLATIONS[cropKey] && CROP_TRANSLATIONS[cropKey][lang]) || farmer.crop;
  const stageKey = (farmer.crop_stage || '').toLowerCase();
  const localizedStage = (STAGE_TRANSLATIONS[stageKey] && STAGE_TRANSLATIONS[stageKey][lang]) || farmer.crop_stage;

  document.getElementById('modal-farmer-name').textContent = farmer.farmer_name;
  document.getElementById('modal-farmer-sub').textContent = `📍 ${farmer.village}, ${farmer.district_name} • ${localizedCrop.toUpperCase()} (${localizedStage.toUpperCase()})`;

  const bandLabel = farmer.risk_band === 'High'
    ? (lang === 'hi' ? 'गंभीर' : lang === 'mr' ? 'गंभीर' : lang === 'or' ? 'ଅତି ଗମ୍ଭୀର' : lang === 'as' ? 'গুৰুতৰ' : lang === 'kn' ? 'ಗಂಭೀರ' : 'HIGH')
    : farmer.risk_band === 'Medium'
    ? (lang === 'hi' ? 'मध्यम' : lang === 'mr' ? 'मध्यम' : lang === 'or' ? 'ମଧ୍ୟମ' : lang === 'as' ? 'মধ্যম' : lang === 'kn' ? 'ಮಧ್ಯಮ' : 'MEDIUM')
    : (lang === 'hi' ? 'कम' : lang === 'mr' ? 'कमी' : lang === 'or' ? 'କମ୍' : lang === 'as' ? 'কম' : lang === 'kn' ? 'ಕಡಿಮೆ' : 'LOW');

  const badge = document.getElementById('modal-risk-badge');
  badge.textContent = `${bandLabel.toUpperCase()} (${farmer.distress_score})`;
  badge.className = farmer.risk_band === 'High'
    ? 'px-3 py-0.5 rounded-full text-xs font-black bg-red-100 text-red-800'
    : farmer.risk_band === 'Medium'
    ? 'px-3 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800'
    : 'px-3 py-0.5 rounded-full text-xs font-black bg-green-100 text-green-800';

  // Reachability guidance
  const isIvr = farmer.recommended_channel === 'ivr_or_sms';
  document.getElementById('modal-reachability-note').innerHTML = isIvr
    ? `⚠️ <strong>High Adaptive Vulnerability:</strong> Farmer uses a <strong>${farmer.device_type.replace('_', ' ')}</strong> on <strong>${farmer.network_quality} network</strong> (tech literacy: ${farmer.tech_literacy}). <strong>Call directly or dispatch Kisan Mitra VLE. Do NOT rely on app push notifications.</strong>`
    : `✅ <strong>Digital Access Available:</strong> Farmer uses a smartphone with ${farmer.network_quality} network. In-app spoken notifications and advisories are active.`;

  // CRIDA 6-Dimension Points Breakdown (officer-facing)
  const pts = farmer.points_breakdown || {};
  const rd  = farmer.raw_dimensions   || {};
  const sub = farmer.sub_components   || {};

  // Rebuild the breakdown table dynamically if the element exists
  const breakdownEl = document.getElementById('modal-dimension-breakdown');
  if (breakdownEl) {
    const dimRows = [
      { code:'E',  label: t.sliderExposure || 'Exposure (Climate & Price)', pts: pts.exposure_pts,           raw: rd.E,       detail: `Rain ${sub.rain_component ?? 0}% + Price ${sub.price_component ?? 0}% deficit` },
      { code:'S',  label: t.sliderSensitivity || 'Sensitivity (Irrigation)',   pts: pts.sensitivity_pts,        raw: rd.S,       detail: farmer.irrigation_type ? `${farmer.irrigation_type}` : '' },
      { code:'AC', label: t.sliderAC || 'Adaptive Capacity (Inv.)',   pts: pts.adaptive_capacity_pts,  raw: rd.AC_risk, detail: `Land ${sub.land_score ?? 0}/100, Income ${sub.income_score ?? 0}/100` },
      { code:'M',  label: t.sliderMitigation || 'Mitigation Deficit',        pts: pts.mitigation_deficit_pts, raw: rd.M,       detail: `Protection score ${sub.protection_score ?? 0}/100` },
      { code:'T',  label: t.sliderTrigger || 'Trigger (Loan & Debt)',      pts: pts.trigger_pts,            raw: rd.T,       detail: `Loan urgency ${sub.loan_urgency ?? 0}, Informal ${sub.informal_shock ?? 0}` },
      { code:'DF', label: t.sliderDF || 'District Fragility',        pts: pts.district_fragility_pts, raw: rd.DF,      detail: `Structural context — not shown to farmer` },
    ];
    breakdownEl.innerHTML = dimRows.map(d => `
      <div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
        <div>
          <span class="font-black text-xs bg-slate-900 text-white px-1.5 py-0.5 rounded mr-2">${d.code}</span>
          <span class="text-sm font-semibold text-slate-800">${d.label}</span>
          <div class="text-[10px] text-slate-400 ml-7 mt-0.5">${d.detail}</div>
        </div>
        <div class="text-right min-w-[80px]">
          <span class="text-base font-black text-slate-900">${(d.pts ?? 0).toFixed(1)} pts</span>
          <div class="text-[10px] text-slate-400">raw ${(d.raw ?? 0).toFixed(0)}/100</div>
        </div>
      </div>
    `).join('');
  }

  // Explanations
  const expList = document.getElementById('modal-explanations');
  expList.innerHTML = (farmer.explanation || []).map(e => `
    <li class="flex items-center space-x-2">
      <span class="text-emerald-600 font-bold">•</span>
      <span>${e}</span>
    </li>
  `).join('');

  // Context notes
  document.getElementById('modal-land-context').textContent = farmer.landholding_context || '1.0 ha marginal landholding';
  const struct = farmer.structural_risk_context || {};
  document.getElementById('modal-fragility-context').textContent = `Fragility Index: ${struct.district_fragility_index || 0}/100 — ${struct.assessment || 'Historical Agrarian Zone'} (${struct.soil_type || 'Loamy'}).`;

  // Interventions List
  const intList = document.getElementById('modal-interventions');
  intList.innerHTML = (farmer.recommended_interventions || []).map(i => `
    <div class="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-1">
      <div class="flex items-center justify-between">
        <span class="font-black text-sm text-emerald-950">${i.scheme_name}</span>
        <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-200 text-emerald-800">${i.urgency}</span>
      </div>
      <div class="text-xs text-slate-600"><strong>Trigger:</strong> ${i.trigger}</div>
      <div class="text-xs text-emerald-900 font-bold">📋 <strong>Officer Field Action:</strong> ${i.action_item}</div>
    </div>
  `).join('');

  document.getElementById('officer-detail-modal').classList.remove('hidden');
}

function closeOfficerModal() {
  document.getElementById('officer-detail-modal').classList.add('hidden');
}

// Spoken Case Briefing for Individual Farmer in Modal
async function playModalCaseBriefingAudio() {
  const farmer = state.selectedOfficerFarmer;
  if (!farmer) return;

  const lang = state.selectedLanguage || 'hi';
  const cropKey = (farmer.crop || '').toLowerCase();
  const localizedCrop = (CROP_TRANSLATIONS[cropKey] && CROP_TRANSLATIONS[cropKey][lang]) || farmer.crop;
  const topIntervention = (farmer.recommended_interventions && farmer.recommended_interventions[0]) || { scheme_name: 'PMFBY', action_item: 'Field visit' };

  const caseBriefings = {
    hi: `किसान ${farmer.farmer_name}, गांव ${farmer.village}, फसल ${localizedCrop}। संकट स्कोर ${farmer.distress_score}, जोखिम स्तर ${farmer.risk_band}। मुख्य कारण: ${farmer.top_contributing_signal ? farmer.top_contributing_signal.label : 'जोखिम'}। अनुशंसित सरकारी योजना: ${topIntervention.scheme_name}। अधिकारी फील्ड कार्रवाई: ${topIntervention.action_item}।`,
    mr: `शेतकरी ${farmer.farmer_name}, गाव ${farmer.village}, पीक ${localizedCrop}. संकट गुणांक ${farmer.distress_score}, गट ${farmer.risk_band}. मुख्य कारण: ${farmer.top_contributing_signal ? farmer.top_contributing_signal.label : 'धोका'}. शासकीय योजना: ${topIntervention.scheme_name}. कृषी अधिकारी कृती: ${topIntervention.action_item}.`,
    or: `କୃଷକ ${farmer.farmer_name}, ଗ୍ରାମ ${farmer.village}, ଫସଲ ${localizedCrop}। ସଙ୍କଟ ସ୍କୋର ${farmer.distress_score}, ରିସ୍କ ସ୍ତର ${farmer.risk_band}। ମୁଖ୍ୟ କାରଣ: ${farmer.top_contributing_signal ? farmer.top_contributing_signal.label : 'ସଙ୍କଟ'}। ପ୍ରସ୍ତାବିତ ଯୋଜନା: ${topIntervention.scheme_name}। ଅଧିକାରୀ କାର୍ଯ୍ୟାନୁଷ୍ଠାନ: ${topIntervention.action_item}।`,
    as: `কৃষক ${farmer.farmer_name}, গাঁও ${farmer.village}, শস্য ${localizedCrop}। সংকট নম্বৰ ${farmer.distress_score}, স্তৰ ${farmer.risk_band}। মূল কাৰণ: ${farmer.top_contributing_signal ? farmer.top_contributing_signal.label : 'সংকট'}। প্ৰস্তাৱিত আঁচনি: ${topIntervention.scheme_name}। বিষয়াৰ পদক্ষেপ: ${topIntervention.action_item}।`,
    kn: `ರೈತ ${farmer.farmer_name}, ಗ್ರಾಮ ${farmer.village}, ಬೆಳೆ ${localizedCrop}. ಸಂಕಷ್ಟ ಅಂಕ ${farmer.distress_score}, ಹಂತ ${farmer.risk_band}. ಪ್ರಮುಖ ಕಾರಣ: ${farmer.top_contributing_signal ? farmer.top_contributing_signal.label : 'ಅಪಾಯ'}. ಶಿಫಾರಸು ಯೋಜನೆ: ${topIntervention.scheme_name}. ಅಧಿಕಾರಿಗಳ ಕ್ರಮ: ${topIntervention.action_item}.`,
    en: `Farmer ${farmer.farmer_name} from village ${farmer.village}, cultivating ${farmer.crop}. Compound distress score ${farmer.distress_score}, classified as ${farmer.risk_band} Risk. Primary trigger: ${farmer.top_contributing_signal ? farmer.top_contributing_signal.label : 'distress signal'}. Recommended scheme: ${topIntervention.scheme_name}. Field action item: ${topIntervention.action_item}.`
  };

  const script = caseBriefings[lang] || caseBriefings['en'];
  await speakText(script, lang);
}

// --- MODULE 3: SMS & IVR FALLBACK SIMULATOR ---

async function onSimFarmerChange(farmerId) {
  await startIvrCall(farmerId);
  await triggerSmsDelivery(farmerId);
}

// Dedicated IVR Keypad Language Switcher
async function onIvrLanguageSelect(lang) {
  state.ivrLanguage = lang;
  await startIvrCall(null, lang);
  playIvrAudioPrompt();
}

async function switchIvrLanguage(lang) {
  state.ivrLanguage = lang;
  const select = document.getElementById('sim-ivr-lang-select');
  if (select) select.value = lang;
  await startIvrCall(null, lang);
  playIvrAudioPrompt();
}

async function startIvrCall(customFarmerId, customLang) {
  const farmerId = customFarmerId || document.getElementById('sim-farmer-select')?.value || state.selectedFarmerId;
  const lang = customLang || state.ivrLanguage || state.selectedLanguage || 'hi';
  try {
    const res = await fetch(`${API_BASE}/simulate/ivr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmer_id: farmerId, language: lang })
    });

    state.ivrState = await res.json();
    state.ivrLanguage = state.ivrState.language || lang;

    // Sync select dropdown
    const select = document.getElementById('sim-ivr-lang-select');
    if (select && state.ivrState.language) select.value = state.ivrState.language;

    document.getElementById('ivr-screen-text').textContent = state.ivrState.voice_prompt_text;
    document.getElementById('ivr-status-pill').textContent = '● IN CALL (MAIN MENU)';
    document.getElementById('ivr-lang-pill').textContent = `LANG: ${(state.ivrState.language || lang).toUpperCase()}`;

    // Auto-trigger SMS emulator to match
    await triggerSmsDelivery(farmerId, state.ivrLanguage);

  } catch (err) {
    console.error('Error starting IVR call:', err);
  }
}

async function pressIvrKey(digit) {
  const farmerId = document.getElementById('sim-farmer-select')?.value || state.selectedFarmerId;
  const lang = state.ivrLanguage || state.selectedLanguage || 'hi';
  try {
    const res = await fetch(`${API_BASE}/simulate/ivr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmer_id: farmerId, digit_pressed: digit, language: lang })
    });

    state.ivrState = await res.json();
    if (state.ivrState.language) {
      state.ivrLanguage = state.ivrState.language;
      const select = document.getElementById('sim-ivr-lang-select');
      if (select) select.value = state.ivrState.language;
      document.getElementById('ivr-lang-pill').textContent = `LANG: ${state.ivrState.language.toUpperCase()}`;
    }

    document.getElementById('ivr-screen-text').textContent = state.ivrState.voice_prompt_text;
    document.getElementById('ivr-status-pill').textContent = `● KEY [${digit}] PRESSED`;

    // Speak response
    playIvrAudioPrompt();

  } catch (err) {
    console.error('Error pressing IVR key:', err);
  }
}

function playIvrAudioPrompt() {
  if (state.ivrState && state.ivrState.voice_prompt_text) {
    speakText(state.ivrState.voice_prompt_text, state.ivrState.language || state.ivrLanguage || state.selectedLanguage || 'hi');
  }
}

async function triggerSmsDelivery(customFarmerId, customLang) {
  const farmerId = customFarmerId || document.getElementById('sim-farmer-select')?.value || state.selectedFarmerId;
  const lang = customLang || state.ivrLanguage || state.selectedLanguage || 'hi';
  try {
    const res = await fetch(`${API_BASE}/simulate/sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmer_id: farmerId, language: lang })
    });

    const data = await res.json();
    document.getElementById('sms-screen-body').textContent = data.sms_body;
    document.getElementById('sms-char-count').textContent = `Length: ${data.character_count} chars (${data.sms_segments} SMS)`;
    document.getElementById('sms-time').textContent = '16:45 IST';

  } catch (err) {
    console.error('Error triggering SMS delivery:', err);
  }
}

// =============================================================================
// GOOGLE CLOUD TTS & TRANSLATION INTEGRATION
// =============================================================================

/**
 * Calls the Google Cloud Text-to-Speech REST API and plays the returned MP3.
 * Returns true on success, false to signal fallback to browser Web Speech API.
 */
async function gcpTTS(text, langCode) {
  const lang = SUPPORTED_LANGUAGES[langCode] || SUPPORTED_LANGUAGES['hi'];
  try {
    showTTSToast((i18n[state.selectedLanguage] || i18n['en']).playing);
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: lang.bcp47, name: lang.voice },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9, pitch: 0.0 }
        })
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `HTTP ${response.status}`);
    }

    const data  = await response.json();
    const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);

    state.currentAudio = audio;
    state.isSpeaking   = true;
    updateVoiceButtonUI(true);

    audio.onended = () => {
      state.isSpeaking   = false;
      state.currentAudio = null;
      updateVoiceButtonUI(false);
      document.querySelectorAll('.tts-listen-btn').forEach(b => b.classList.remove('tts-playing'));
    };
    audio.onerror = () => {
      state.isSpeaking   = false;
      state.currentAudio = null;
      updateVoiceButtonUI(false);
      document.querySelectorAll('.tts-listen-btn').forEach(b => b.classList.remove('tts-playing'));
    };

    await audio.play();
    return true;

  } catch (err) {
    console.warn('\u26a0\ufe0f GCP TTS failed, falling back to browser speech:', err.message);
    return false;
  }
}

/**
 * Translates text using Google Cloud Translation API.
 * Used for Odia, Assamese and Kannada where backend advisory data may not have pre-translated variants.
 */
async function translateText(text, targetLang) {
  if (!text) return '';
  if (targetLang === 'en') return text;

  // Let's use the Google Cloud Translation API if key is present
  if (GOOGLE_TRANSLATE_API_KEY) {
    try {
      const res = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: text, target: targetLang, format: 'text' })
        }
      );
      const data = await res.json();
      if (data.data?.translations?.[0]?.translatedText) {
        return data.data.translations[0].translatedText;
      }
    } catch (err) {
      console.warn('GCP Translate API failed, using fallback:', err);
    }
  }

  // Fallback: Free unauthenticated Google Translate API (highly reliable, no key needed)
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data && data[0]) {
      let translated = "";
      for (let i = 0; i < data[0].length; i++) {
        if (data[0][i][0]) {
          translated += data[0][i][0];
        }
      }
      return translated || text;
    }
  } catch (err) {
    console.warn('Fallback translate failed:', err);
  }
  return text;
}

/**
 * Speaks a button label + subtitle in the current language.
 * Called by the "Tap to listen" spans inside each of the 4 farmer action cards.
 */
async function playButtonAudio(buttonKey, event) {
  if (event) event.stopPropagation();

  const lang = state.selectedLanguage || 'hi';
  const t    = i18n[lang] || i18n['en'];

  // Compose the text to speak
  const textMap = {
    cropAdvisory: `${t.cropAdvisory}. ${t.cropAdvisorySub}`,
    mandiPrice:   `${t.mandiPrice}. ${t.mandiPriceSub}`,
    myAlerts:     `${t.myAlerts}. ${t.myAlertsSub}`,
    govtSchemes:  `${t.govtSchemes}. ${t.govtSchemesSub}`,
  };
  const textToSpeak = textMap[buttonKey] || t[buttonKey] || buttonKey;

  // Pulse the clicked button while audio plays
  if (event) {
    const btn = event.currentTarget || event.target.closest('.tts-listen-btn');
    if (btn) {
      document.querySelectorAll('.tts-listen-btn').forEach(b => b.classList.remove('tts-playing'));
      btn.classList.add('tts-playing');
    }
  }

  await speakText(textToSpeak, lang);
}

/**
 * Displays a brief status toast at the bottom of the screen.
 */
function showTTSToast(msg) {
  const toast = document.getElementById('tts-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
}

/**
 * Applies i18n translations for the current language to all translatable DOM elements.
 * Called on language change and after each farmer selection.
 */
function applyI18n() {
  const lang = state.selectedLanguage || 'hi';
  const t    = i18n[lang] || i18n['en'];

  // Main button labels
  const directMap = {
    'btn-text-advisory': t.cropAdvisory,
    'btn-text-mandi':    t.mandiPrice,
    'btn-text-alerts':   t.myAlerts,
    'btn-text-schemes':  t.govtSchemes,
    'label-access-mode': t.accessMode + ':',
  };
  Object.entries(directMap).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });

  // data-i18n elements (subtitles, labels)
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key] !== undefined) el.textContent = t[key];
  });

  // "Tap to listen" button labels
  document.querySelectorAll('.tts-listen-btn .tts-label').forEach(el => {
    el.textContent = t.tapToListen;
  });

  // Update the main voice button (advisory play/stop)
  if (!state.isSpeaking) updateVoiceButtonUI(false);

  // Apply appropriate font-script class to <body>
  const scriptMap = {
    en: 'script-latin',
    hi: 'script-devanagari',
    mr: 'script-devanagari',
    or: 'script-odia',
    as: 'script-assamese',
    kn: 'script-kannada',
  };
  const allScripts = Object.values(scriptMap);
  document.body.classList.remove(...allScripts);
  document.body.classList.add(scriptMap[lang] || 'script-latin');
}

/**
 * Translation helper to translate text and store it in state cache.
 */
async function getTranslation(text, lang) {
  if (!text || typeof text !== 'string') return text;
  if (/^[0-9\s.,\/#!$%\^&\*;:{}=\-_`~()₹]*$/.test(text)) return text;
  if (lang === 'en') return text;

  if (!state.translationCache) state.translationCache = {};
  if (!state.translationCache[lang]) state.translationCache[lang] = {};

  if (state.translationCache[lang][text]) {
    return state.translationCache[lang][text];
  }

  const translated = await translateText(text, lang);
  if (translated) {
    state.translationCache[lang][text] = translated;
    return translated;
  }
  return text;
}

/**
 * Splits text into segments smaller than a specific character length.
 */
function splitTextIntoSegments(text, maxLength = 180) {
  const sentences = text.match(/[^.!?।]+[.!?।]?/g) || [text];
  const segments = [];
  
  let currentSegment = "";
  for (let sentence of sentences) {
    if ((currentSegment + sentence).length > maxLength) {
      if (currentSegment.trim()) {
        segments.push(currentSegment.trim());
      }
      currentSegment = sentence;
    } else {
      currentSegment += sentence;
    }
  }
  if (currentSegment.trim()) {
    segments.push(currentSegment.trim());
  }
  return segments;
}

/**
 * Plays multiple audio sentences sequentially.
 */
async function playSequentialTTS(sentences, langCode) {
  let index = 0;
  
  function playNext() {
    if (index >= sentences.length || !state.isSpeaking) {
      stopSpeech();
      return;
    }
    
    const textSegment = sentences[index].trim();
    if (!textSegment) {
      index++;
      playNext();
      return;
    }
    
    const audioUrl = `${API_BASE}/tts?text=${encodeURIComponent(textSegment)}&lang=${encodeURIComponent(langCode)}`;
    const audio = new Audio(audioUrl);
    state.currentAudio = audio;
    
    audio.onended = () => {
      index++;
      playNext();
    };
    
    audio.onerror = (err) => {
      console.warn('TTS segment failure, trying fallback:', err);
      const remainingText = sentences.slice(index).join('. ');
      fallbackToWebSpeech(remainingText, langCode);
    };
    
    audio.play().catch(e => {
      console.warn('Audio play interrupted:', e);
      stopSpeech();
    });
  }
  
  state.isSpeaking = true;
  updateVoiceButtonUI(true);
  playNext();
}

/**
 * Fallback to browser SpeechSynthesis API.
 */
function fallbackToWebSpeech(textToSpeak, langCode) {
  if (!('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported on this device.');
    stopSpeech();
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(textToSpeak);
  const langMap = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN', or: 'hi-IN', as: 'bn-IN', kn: 'kn-IN' };
  utterance.lang  = langMap[langCode] || 'hi-IN';
  utterance.rate  = 0.9;
  utterance.pitch = 1.0;

  // Search for available Indian voices if present
  try {
    const voices = window.speechSynthesis.getVoices() || [];
    const targetTag = (langMap[langCode] || 'hi-IN').toLowerCase();
    const voice = voices.find(v => v.lang.toLowerCase().startsWith(targetTag)) ||
                  voices.find(v => v.lang.toLowerCase().includes('in')) ||
                  voices.find(v => v.lang.toLowerCase().startsWith('hi')) ||
                  null;
    if (voice) utterance.voice = voice;
  } catch (e) {
    console.warn('Voice picker fallback error:', e);
  }

  utterance.onstart = () => { state.isSpeaking = true;  updateVoiceButtonUI(true);  };
  utterance.onend   = () => { stopSpeech(); };
  utterance.onerror = (e) => {
    console.warn('SpeechSynthesis error:', e);
    stopSpeech();
  };

  window.speechSynthesis.speak(utterance);
}
