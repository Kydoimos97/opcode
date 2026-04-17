use std::sync::OnceLock;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FontFamily {
    pub name: String,
    pub is_monospace: bool,
}

static FONT_CACHE: OnceLock<Vec<FontFamily>> = OnceLock::new();

/// Lists system font families. Result is cached after first call.
/// Returns alphabetically sorted list of unique family names.
#[tauri::command]
pub fn list_system_fonts() -> Result<Vec<FontFamily>, String> {
    let cached = FONT_CACHE.get_or_init(|| {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();

        // Collect unique family names
        let mut seen = std::collections::HashSet::new();
        let mut families: Vec<FontFamily> = Vec::new();

        for face in db.faces() {
            let family_name = face.families.first()
                .map(|(name, _)| name.clone())
                .unwrap_or_default();

            if family_name.is_empty() || !seen.insert(family_name.clone()) {
                continue;
            }

            // Heuristic for monospace: check if monospace style or family name contains
            // common monospace keywords
            let name_lower = family_name.to_lowercase();
            let is_monospace = matches!(face.monospaced, true)
                || name_lower.contains("mono")
                || name_lower.contains("code")
                || name_lower.contains("courier")
                || name_lower.contains("console")
                || name_lower.contains("terminal")
                || name_lower.contains("fixed")
                || name_lower.contains("typewriter");

            families.push(FontFamily { name: family_name, is_monospace });
        }

        families.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        families
    });

    Ok(cached.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_system_fonts_returns_nonempty() {
        let result = list_system_fonts();
        assert!(result.is_ok());
        // On any OS with fonts installed, we expect at least 1 font family
        assert!(!result.unwrap().is_empty());
    }
}
