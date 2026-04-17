import React, { useState, useEffect } from 'react';
import { api, type ClaudeEntry } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { X, ChevronRight } from 'lucide-react';
import { BreathingDots } from '@/components/ui/spinner';
import ReactMarkdown from 'react-markdown';

interface ClaudeExplorerProps {
  onClose?: () => void;
}

export const ClaudeExplorer: React.FC<ClaudeExplorerProps> = ({ onClose }) => {
  const [entries, setEntries] = useState<ClaudeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ClaudeEntry | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>(['']);

  useEffect(() => {
    loadDirectory('');
  }, []);

  const loadDirectory = async (path: string) => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.listClaudeDirectory(path);
      setEntries(result);

      const parts = path ? path.split('/').filter(p => p) : [];
      setBreadcrumbs(['', ...parts]);

      setSelectedEntry(null);
      setFileContent('');
    } catch (err) {
      setError(`Failed to load directory: ${String(err)}`);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEntryClick = async (entry: ClaudeEntry) => {
    if (entry.is_dir) {
      loadDirectory(entry.path);
    } else {
      try {
        setSelectedEntry(entry);
        setContentLoading(true);
        setError(null);
        const content = await api.readClaudeFile(entry.path);
        setFileContent(content);
      } catch (err) {
        setError(`Failed to read file: ${String(err)}`);
        setFileContent('');
      } finally {
        setContentLoading(false);
      }
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    const path = breadcrumbs.slice(1, index + 1).join('/');
    loadDirectory(path);
  };

  const renderContent = () => {
    if (!selectedEntry) return null;

    if (contentLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <BreathingDots className="h-6 w-6 text-muted-foreground" />
        </div>
      );
    }

    if (selectedEntry.path.endsWith('.md')) {
      return (
        <div className="prose prose-invert max-w-none prose-sm p-4 overflow-auto h-full">
          <ReactMarkdown>{fileContent}</ReactMarkdown>
        </div>
      );
    }

    if (selectedEntry.path.endsWith('.json')) {
      try {
        const parsed = JSON.parse(fileContent);
        const formatted = JSON.stringify(parsed, null, 2);
        return (
          <pre className="text-xs font-mono p-4 overflow-auto whitespace-pre-wrap h-full bg-muted/50 rounded">
            {formatted}
          </pre>
        );
      } catch {
        return (
          <pre className="text-xs font-mono p-4 overflow-auto whitespace-pre-wrap h-full">
            {fileContent}
          </pre>
        );
      }
    }

    if (selectedEntry.path.endsWith('.jsonl')) {
      const lines = fileContent.split('\n').filter(l => l.trim());
      return (
        <div className="p-4 overflow-auto h-full space-y-2">
          {lines.map((line, idx) => (
            <div key={idx} className="text-xs font-mono p-2 bg-muted/50 rounded break-all">
              {line}
            </div>
          ))}
        </div>
      );
    }

    return (
      <pre className="text-xs font-mono p-4 overflow-auto whitespace-pre-wrap h-full">
        {fileContent}
      </pre>
    );
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {onClose && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <h2 className="text-sm font-semibold">~/.claude</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-48 border-r border-border overflow-auto">
          <div className="sticky top-0 bg-muted/50 border-b border-border p-2">
            <div className="flex flex-wrap gap-1 text-xs">
              {breadcrumbs.map((part, idx) => (
                <button
                  key={idx}
                  onClick={() => handleBreadcrumbClick(idx)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {idx === 0 ? '~' : part}
                  {idx < breadcrumbs.length - 1 && <ChevronRight className="h-3 w-3 inline" />}
                </button>
              ))}
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

          {!loading && entries.length === 0 && !error && (
            <div className="p-3 text-xs text-muted-foreground">
              No items
            </div>
          )}

          {!loading && (
            <div className="space-y-1 p-2">
              {entries.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => handleEntryClick(entry)}
                  className={`w-full text-left px-2 py-1 text-xs rounded transition-colors ${
                    selectedEntry?.path === entry.path
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <div className="truncate">
                    {entry.is_dir ? '📁 ' : '📄 '}
                    {entry.name}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto bg-muted/30">
          {selectedEntry ? (
            <div className="h-full flex flex-col">
              <div className="sticky top-0 bg-background border-b border-border px-4 py-2 text-xs text-muted-foreground">
                {selectedEntry.name} ({selectedEntry.size} bytes)
              </div>
              <div className="flex-1 overflow-auto">
                {renderContent()}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Select a file to view its content
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
