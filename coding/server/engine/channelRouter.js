/**
 * Channel Router & Adaptive Capacity Module
 * Maps farmer digital profile (device type, network quality, tech literacy)
 * to appropriate contact channel and default UI experience mode.
 */

/**
 * Recommends the optimal delivery channel for advisories and alerts
 * @param {Object} farmer 
 * @returns {"in_app_voice_and_text" | "ivr_or_sms"}
 */
function getRecommendedChannel(farmer) {
  if (!farmer) return "ivr_or_sms";

  // If farmer has a smartphone and at least moderate connectivity, deliver rich in-app voice/text
  if (farmer.device_type === "smartphone" && farmer.network_quality !== "poor") {
    return "in_app_voice_and_text";
  }

  // If farmer relies on feature phone / basic smartphone OR has poor rural connectivity, deliver via voice IVR / SMS
  if (
    farmer.device_type === "feature_phone" ||
    farmer.device_type === "basic_smartphone" ||
    farmer.network_quality === "poor"
  ) {
    return "ivr_or_sms";
  }

  return "ivr_or_sms";
}

/**
 * Determines whether the UI should pre-select "Assisted Mode" (Kisan Mitra / CSC)
 * or "Self-Service Mode"
 * @param {Object} farmer 
 * @returns {"assisted" | "self"}
 */
function getDefaultUIMode(farmer) {
  if (!farmer) return "assisted";
  if (farmer.tech_literacy === "low" || farmer.device_type === "feature_phone") {
    return "assisted";
  }
  return "self";
}

module.exports = {
  getRecommendedChannel,
  getDefaultUIMode
};
