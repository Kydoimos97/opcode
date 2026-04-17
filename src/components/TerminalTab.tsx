import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { listen } from '@tauri-apps/api/event';
import { api } from '@/lib/api';

interface TerminalTabProps {
  path?: string;
}

export const TerminalTab: React.FC<TerminalTabProps> = ({ path = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({ convertEol: true, cursorBlink: true });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    let ptyId: string | null = null;
    let unlisten: (() => void) | null = null;

    api.spawnPty(path).then(async (id) => {
      ptyId = id;
      ptyIdRef.current = id;

      unlisten = await listen<string>(`pty-output:${id}`, (event) => {
        const bytes = Uint8Array.from(atob(event.payload), c => c.charCodeAt(0));
        term.write(bytes);
      });

      term.onData((data) => {
        const encoded = btoa(unescape(encodeURIComponent(data)));
        api.writePty(id, encoded).catch(console.error);
      });
    }).catch((err) => {
      term.writeln(`\r\nFailed to spawn terminal: ${err}`);
    });

    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
      if (ptyId && termRef.current) {
        api.resizePty(ptyId, termRef.current.cols, termRef.current.rows).catch(() => {});
      }
    });
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      unlisten?.();
      resizeObserver.disconnect();
      if (ptyId) api.killPty(ptyId).catch(() => {});
      term.dispose();
    };
  }, [path]);

  return <div ref={containerRef} className="h-full w-full bg-black p-1" />;
};
