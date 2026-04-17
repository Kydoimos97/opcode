import React from 'react';
import { FolderSearch } from 'lucide-react';
import { BaseTool } from '../BaseTool';

interface GlobToolProps {
  pattern: string;
  path?: string;
  result?: any;
}

export const GlobTool: React.FC<GlobToolProps> = ({ pattern, path, result }) => {
  const status = result ? (result.is_error ? 'error' : 'done') : 'loading';
  const rawContent = typeof result?.content === 'string' ? result.content
    : Array.isArray(result?.content) ? result.content.map((c: any) => c.text ?? '').join('\n')
    : null;
  const keyParam = path ? `${pattern} in ${path}` : pattern;

  return (
    <BaseTool
      icon={<FolderSearch className="h-3.5 w-3.5" />}
      iconColor="var(--color-muted-foreground)"
      label="Glob"
      keyParam={keyParam}
      status={status}
      copyValue={rawContent ?? keyParam}
    >
      {result && (
        rawContent
          ? <pre className="text-xs font-mono p-2 rounded bg-muted/40 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">{rawContent}</pre>
          : <div className="text-xs text-muted-foreground/50 italic px-2 py-1">No files matched</div>
      )}
    </BaseTool>
  );
};
