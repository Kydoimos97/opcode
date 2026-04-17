import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

interface SystemResourcesPayload {
  ram_used_mb: number;
  ram_total_mb: number;
  cpu_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
}

function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function formatGb(gb: number): string {
  return `${gb.toFixed(0)} GB`;
}

export function SystemFooter() {
  const [resources, setResources] = useState<SystemResourcesPayload | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<SystemResourcesPayload>('system-resources', (event) => {
      setResources(event.payload);
    }).then((fn) => { unlisten = fn; }).catch(() => {});

    return () => { unlisten?.(); };
  }, []);

  if (!resources) return null;

  return (
    <div className="h-6 border-t bg-background flex items-center px-3 gap-4 text-xs text-muted-foreground shrink-0 select-none">
      <span>RAM {formatMb(resources.ram_used_mb)} / {formatMb(resources.ram_total_mb)}</span>
      <span>CPU {resources.cpu_percent.toFixed(1)}%</span>
      <span>Disk {formatGb(resources.disk_used_gb)} / {formatGb(resources.disk_total_gb)}</span>
    </div>
  );
}
