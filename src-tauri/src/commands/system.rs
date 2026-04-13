use serde::{Deserialize, Serialize};
use sysinfo::{CpuRefreshKind, Disks, MemoryRefreshKind, RefreshKind, System};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemResources {
    pub ram_used_mb: u64,
    pub ram_total_mb: u64,
    pub cpu_percent: f32,
    pub disk_used_gb: f64,
    pub disk_total_gb: f64,
}

/// Returns a single snapshot of system resources.
/// This is provided as a fallback command; the primary path is the background push via events.
#[tauri::command]
pub fn get_system_resources() -> Result<SystemResources, String> {
    let mut sys = System::new_with_specifics(
        RefreshKind::new()
            .with_memory(MemoryRefreshKind::everything())
            .with_cpu(CpuRefreshKind::everything()),
    );
    sys.refresh_memory();
    // First CPU refresh just initializes counters; second gets real usage
    sys.refresh_cpu_usage();
    std::thread::sleep(Duration::from_millis(100));
    sys.refresh_cpu_usage();

    let disks = Disks::new_with_refreshed_list();
    let (disk_used, disk_total) = disks.iter().fold((0u64, 0u64), |(used, total), d| {
        (
            used + (d.total_space().saturating_sub(d.available_space())),
            total + d.total_space(),
        )
    });

    Ok(SystemResources {
        ram_used_mb: sys.used_memory() / 1_048_576,
        ram_total_mb: sys.total_memory() / 1_048_576,
        cpu_percent: sys.global_cpu_usage(),
        disk_used_gb: disk_used as f64 / 1_073_741_824.0,
        disk_total_gb: disk_total as f64 / 1_073_741_824.0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_system_resources_returns_nonzero_ram() {
        let result = get_system_resources();
        assert!(result.is_ok());
        let resources = result.unwrap();
        assert!(resources.ram_total_mb > 0, "RAM total should be non-zero");
    }
}
