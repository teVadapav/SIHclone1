"""
Channel Router & Adaptive Capacity Module (Python)
Maps farmer digital profile (device type, network quality, tech literacy)
to appropriate contact channel and default UI experience mode.
"""

def get_recommended_channel(farmer: dict) -> str:
    """
    Recommends the optimal delivery channel for advisories and alerts:
    - 'in_app_voice_and_text' for smartphone with moderate/good connectivity
    - 'ivr_or_sms' for feature phone, basic smartphone, or poor connectivity
    """
    if not farmer:
        return "ivr_or_sms"
    
    device_type = farmer.get("device_type", "feature_phone")
    network_quality = farmer.get("network_quality", "poor")
    
    if device_type == "smartphone" and network_quality != "poor":
        return "in_app_voice_and_text"
        
    if device_type in ["feature_phone", "basic_smartphone"] or network_quality == "poor":
        return "ivr_or_sms"
        
    return "ivr_or_sms"


def get_default_ui_mode(farmer: dict) -> str:
    """
    Determines whether the UI should pre-select "Assisted Mode" (Kisan Mitra / CSC)
    or "Self-Service Mode"
    """
    if not farmer:
        return "assisted"
        
    tech_literacy = farmer.get("tech_literacy", "low")
    device_type = farmer.get("device_type", "feature_phone")
    
    if tech_literacy == "low" or device_type == "feature_phone":
        return "assisted"
        
    return "self"
