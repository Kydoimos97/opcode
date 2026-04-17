import React, { useState, useEffect } from 'react';
import { api, type SessionLogEntry } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { X, RefreshCw } from 'lucide-react';
import { BreathingDots } from '@/components/ui/spinner';

interface SessionLogsProps {
  onClose?: () => void;
}

export const SessionLogs: React.FC<SessionLogsProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<SessionLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<SessionLogEntry | null>(null);
  const [content, setContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.listSessionLogs();
      setLogs(result);
      setSelectedLog(null);
      setContent('');
    } catch (err) {
      setError(`Failed to load logs: ${String(err)}`);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLogClick = async (log: SessionLogEntry) => {
    try {
      setSelectedLog(log);
      setContentLoading(true);
      setError(null);
      const fileContent = await api.readClaudeFile(log.file_path);
      setContent(fileContent);
    } catch (err) {
      setError(`Failed to read log: ${String(err)}`);
      setContent('');
    } finally {
      setContentLoading(false);
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString();
    } catch {
      return isoString;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const renderLogContent = () => {
    if (!selectedLog) return null;

    if (contentLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <BreathingDots className="h-6 w-6 text-muted-foreground" />
        </div>
      );
    }

    const lines = content.split('\n').filter(l => l.trim());
    return (
      <div className="p-4 overflow-auto h-full space-y-2">
        {lines.map((line, idx) => {
          try {
            const parsed = JSON.parse(line);
            return (
              <div key={idx} className="text-xs font-mono p-2 bg-muted/50 rounded break-all">
                <pre>{JSON.stringify(parsed, null, 2)}</pre>
              </div>
            );
          } catch {
            return (
              <div key={idx} className="text-xs font-mono p-2 bg-muted/50 rounded break-all">
                {line}
              </div>
            );
          }
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {onClose && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <h2 className="text-sm font-semibold">Session Logs</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadLogs}
              className="h-6 w-6 p-0"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-64 border-r border-border overflow-auto flex flex-col">
          <div className="sticky top-0 bg-muted/50 border-b border-border p-2">
            <div className="text-xs font-semibold text-muted-foreground">
              Recent Sessions
            </div>
          </div>

          {error && (
            <div className="p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center p-4">
              <BreathingDots className="h-4 w-4 text-muted-foreground" />
            </div>
          )}

          {!loading && logs.length === 0 && !error && (
            <div className="p-3 text-xs text-muted-foreground">
              No sessions found
            </div>
          )}

          {!loading && (
            <div className="space-y-1 p-2 flex-1">
              {logs.map((log) => (
                <button
                  key={log.file_path}
                  onClick={() => handleLogClick(log)}
                  className={`w-full text-left px-2 py-2 text-xs rounded transition-colors text-left ${
                    selectedLog?.file_path === log.file_path
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <div className="truncate font-mono">
                    {log.session_id.slice(0, 8)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {log.project_path}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(log.modified)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto bg-muted/30 flex flex-col">
          {selectedLog ? (
            <div className="h-full flex flex-col">
              <div className="sticky top-0 bg-background border-b border-border px-4 py-2 text-xs text-muted-foreground">
                <div>Session: {selectedLog.session_id}</div>
                <div>Project: {selectedLog.project_path}</div>
                <div>Size: {formatBytes(selectedLog.size)} • Modified: {formatDate(selectedLog.modified)}</div>
              </div>
              <div className="flex-1 overflow-auto">
                {renderLogContent()}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Select a session to view its logs
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
