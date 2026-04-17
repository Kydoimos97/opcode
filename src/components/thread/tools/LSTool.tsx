import React from 'react';
import { FolderOpen } from 'lucide-react';
import { BaseTool } from '../BaseTool';

interface LSToolProps {
  path: string;
  result?: any;
}

export const LSTool: React.FC<LSToolProps> = ({ path, result }) => {
  const status = result ? (result.is_error ? 'error' : 'done') : 'loading';
  const rawContent = typeof result?.content === 'string' ? result.content
    : Array.isArray(result?.content) ? result.content.map((c: any) => c.text ?? '').join('\n')
    : null;

  return (
    <BaseTool
      icon={<FolderOpen className="h-3.5 w-3.5" />}
      iconColor="var(--color-muted-foreground)"
      label="LS"
      keyParam={path}
      status={status}
      copyValue={rawContent ?? path}
    >
      {result && (
        rawContent
          ? <pre className="text-xs font-mono p-2 rounded bg-muted/40 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">{rawContent}</pre>
          : <div className="text-xs text-muted-foreground/50 italic px-2 py-1">Empty directory</div>
      )}
    </BaseTool>
  );
};
