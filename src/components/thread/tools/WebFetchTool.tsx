import React from 'react';
import { Link } from 'lucide-react';
import { BaseTool } from '../BaseTool';

interface WebFetchToolProps {
  url: string;
  prompt?: string;
  result?: any;
}

export const WebFetchTool: React.FC<WebFetchToolProps> = ({ url, result }) => {
  const status = result ? (result.is_error ? 'error' : 'done') : 'loading';
  const rawContent = typeof result?.content === 'string' ? result.content
    : Array.isArray(result?.content) ? result.content.map((c: any) => c.text ?? '').join('\n')
    : null;

  return (
    <BaseTool
      icon={<Link className="h-3.5 w-3.5" />}
      iconColor="rgba(125, 211, 252, 0.8)"
      label="Fetch"
      keyParam={url}
      status={status}
      copyValue={rawContent ?? url}
    >
      {result && (
        rawContent
          ? <div className="text-xs p-2 rounded bg-muted/40 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">{rawContent}</div>
          : <div className="text-xs text-muted-foreground/50 italic px-2 py-1">No content</div>
      )}
    </BaseTool>
  );
};
