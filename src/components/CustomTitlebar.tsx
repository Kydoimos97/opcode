import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Maximize2 } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getVersion } from '@tauri-apps/api/app';

const isWindows = navigator.userAgent.toLowerCase().includes('windows');

export const CustomTitlebar: React.FC = () => {
  const [isHovered, setIsHovered] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    getVersion()
      .then(v => setAppVersion(v))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isWindows) {
      getCurrentWindow().isMaximized()
        .then(setIsMaximized)
        .catch(() => {});
    }
  }, []);

  const handleMinimize = () => getCurrentWindow().minimize().catch(console.error);

  const handleMaximize = async () => {
    const win = getCurrentWindow();
    const maximized = await win.isMaximized();
    if (maximized) {
      await win.unmaximize();
      setIsMaximized(false);
    } else {
      await win.maximize();
      setIsMaximized(true);
    }
  };

  const handleClose = () => getCurrentWindow().close().catch(console.error);

  return (
    <div
      className="relative z-[200] h-11 bg-background/95 backdrop-blur-sm flex items-center justify-between select-none border-b border-border/50 tauri-drag"
      data-tauri-drag-region
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Left side */}
      <div className="flex items-center pl-3">
        {isWindows ? (
          <span className="text-xs text-muted-foreground font-mono">
            opcode {appVersion && `v${appVersion}`}
          </span>
        ) : (
          <div className="flex items-center space-x-2">
            <button
              onClick={handleClose}
              className="group relative w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-all duration-200 flex items-center justify-center tauri-no-drag"
              title="Close"
            >
              {isHovered && <X size={8} className="text-red-900 opacity-60 group-hover:opacity-100" />}
            </button>
            <button
              onClick={handleMinimize}
              className="group relative w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-all duration-200 flex items-center justify-center tauri-no-drag"
              title="Minimize"
            >
              {isHovered && <Minus size={8} className="text-yellow-900 opacity-60 group-hover:opacity-100" />}
            </button>
            <button
              onClick={handleMaximize}
              className="group relative w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-all duration-200 flex items-center justify-center tauri-no-drag"
              title="Maximize"
            >
              {isHovered && <Square size={6} className="text-green-900 opacity-60 group-hover:opacity-100" />}
            </button>
          </div>
        )}
      </div>

      {/* Windows window controls - flush right */}
      {isWindows && (
        <div className="flex items-center tauri-no-drag">
          <button
            onClick={handleMinimize}
            className="w-11 h-11 flex items-center justify-center hover:bg-accent transition-colors"
            title="Minimize"
          >
            <Minus size={16} />
          </button>
          <button
            onClick={handleMaximize}
            className="w-11 h-11 flex items-center justify-center hover:bg-accent transition-colors"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Square size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            onClick={handleClose}
            className="w-11 h-11 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
};
