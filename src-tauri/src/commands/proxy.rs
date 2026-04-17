use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProxySettings {
    pub http_proxy: Option<String>,
    pub https_proxy: Option<String>,
    pub no_proxy: Option<String>,
    pub all_proxy: Option<String>,
    pub enabled: bool,
}

impl Default for ProxySettings {
    fn default() -> Self {
        Self {
            http_proxy: None,
            https_proxy: None,
            no_proxy: None,
            all_proxy: None,
            enabled: false,
        }
    }
}

fn read_proxy_from_ccode() -> ProxySettings {
    let path = match dirs::home_dir() {
        Some(h) => h.join(".ccode").join("settings.json"),
        None => return ProxySettings::default(),
    };
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return ProxySettings::default(),
    };
    let map: serde_json::Map<String, serde_json::Value> = match serde_json::from_str(&content) {
        Ok(m) => m,
        Err(_) => return ProxySettings::default(),
    };
    ProxySettings {
        enabled: map.get("proxy_enabled").and_then(|v| v.as_str()).map(|s| s == "true").unwrap_or(false),
        http_proxy: map.get("proxy_http").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from),
        https_proxy: map.get("proxy_https").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from),
        no_proxy: map.get("proxy_no").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from),
        all_proxy: map.get("proxy_all").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(String::from),
    }
}

fn write_proxy_to_ccode(settings: &ProxySettings) -> Result<(), String> {
    let ccode_dir = match dirs::home_dir() {
        Some(h) => h.join(".ccode"),
        None => return Err("Failed to get home directory".to_string()),
    };
    std::fs::create_dir_all(&ccode_dir).map_err(|e| e.to_string())?;
    let path = ccode_dir.join("settings.json");
    let mut map: serde_json::Map<String, serde_json::Value> = if path.exists() {
        let c = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&c).unwrap_or_default()
    } else {
        serde_json::Map::new()
    };
    map.insert("proxy_enabled".to_string(), settings.enabled.to_string().into());
    map.insert("proxy_http".to_string(), settings.http_proxy.clone().unwrap_or_default().into());
    map.insert("proxy_https".to_string(), settings.https_proxy.clone().unwrap_or_default().into());
    map.insert("proxy_no".to_string(), settings.no_proxy.clone().unwrap_or_default().into());
    map.insert("proxy_all".to_string(), settings.all_proxy.clone().unwrap_or_default().into());
    let content = serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, &content).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Load proxy settings at app startup (sync, used before async runtime is set up)
pub fn load_proxy_at_startup() -> ProxySettings {
    read_proxy_from_ccode()
}

/// Get proxy settings
#[tauri::command]
pub async fn get_proxy_settings() -> Result<ProxySettings, String> {
    Ok(read_proxy_from_ccode())
}

/// Save proxy settings
#[tauri::command]
pub async fn save_proxy_settings(settings: ProxySettings) -> Result<(), String> {
    write_proxy_to_ccode(&settings)?;
    apply_proxy_settings(&settings);
    Ok(())
}

/// Apply proxy settings as environment variables
pub fn apply_proxy_settings(settings: &ProxySettings) {
    log::info!("Applying proxy settings: enabled={}", settings.enabled);

    if !settings.enabled {
        log::info!("Clearing proxy environment variables");
        std::env::remove_var("HTTP_PROXY");
        std::env::remove_var("HTTPS_PROXY");
        std::env::remove_var("NO_PROXY");
        std::env::remove_var("ALL_PROXY");
        std::env::remove_var("http_proxy");
        std::env::remove_var("https_proxy");
        std::env::remove_var("no_proxy");
        std::env::remove_var("all_proxy");
        return;
    }

    let mut no_proxy_list = vec!["localhost", "127.0.0.1", "::1", "0.0.0.0"];
    if let Some(user_no_proxy) = &settings.no_proxy {
        if !user_no_proxy.is_empty() {
            no_proxy_list.push(user_no_proxy.as_str());
        }
    }
    let no_proxy_value = no_proxy_list.join(",");

    if let Some(http_proxy) = &settings.http_proxy {
        if !http_proxy.is_empty() {
            log::info!("Setting HTTP_PROXY={}", http_proxy);
            std::env::set_var("HTTP_PROXY", http_proxy);
        }
    }

    if let Some(https_proxy) = &settings.https_proxy {
        if !https_proxy.is_empty() {
            log::info!("Setting HTTPS_PROXY={}", https_proxy);
            std::env::set_var("HTTPS_PROXY", https_proxy);
        }
    }

    log::info!("Setting NO_PROXY={}", no_proxy_value);
    std::env::set_var("NO_PROXY", &no_proxy_value);

    if let Some(all_proxy) = &settings.all_proxy {
        if !all_proxy.is_empty() {
            log::info!("Setting ALL_PROXY={}", all_proxy);
            std::env::set_var("ALL_PROXY", all_proxy);
        }
    }
}
