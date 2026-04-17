import React from 'react';
import { File } from 'lucide-react';
import { BaseTool } from '../BaseTool';

interface ReadToolProps {
  filePath: string;
  result?: any;
}

export const ReadTool: React.FC<ReadToolProps> = ({ filePath, result }) => {
  const status = result ? (result.is_error ? 'error' : 'done') : 'loading';
  const content = typeof result?.content === 'string' ? result.content
    : Array.isArray(result?.content) ? result.content.map((c: any) => c.text ?? '').join('\n')
    : null;

  return (
    <BaseTool
      icon={<File className="h-3.5 w-3.5" />}
      iconColor="var(--color-muted-foreground)"
      label="Read"
      keyParam={filePath}
      status={status}
      copyValue={content ?? filePath}
    >
      {result && (
        content
          ? <pre className="text-xs font-mono p-2 rounded bg-muted/40 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">{content}</pre>
          : <div className="text-xs text-muted-foreground/50 italic px-2 py-1">No content</div>
      )}
    </BaseTool>
  );
};
