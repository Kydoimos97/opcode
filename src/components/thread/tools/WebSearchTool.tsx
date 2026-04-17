import React from 'react';
import { Globe } from 'lucide-react';
import { BaseTool } from '../BaseTool';

interface WebSearchToolProps {
  query: string;
  result?: any;
}

export const WebSearchTool: React.FC<WebSearchToolProps> = ({ query, result }) => {
  const status = result ? (result.is_error ? 'error' : 'done') : 'loading';
  const rawContent = typeof result?.content === 'string' ? result.content
    : Array.isArray(result?.content) ? result.content.map((c: any) => c.text ?? '').join('\n')
    : null;

  return (
    <BaseTool
      icon={<Globe className="h-3.5 w-3.5" />}
      iconColor="rgba(125, 211, 252, 0.8)"
      label="Search"
      keyParam={query}
      status={status}
      copyValue={rawContent ?? query}
    >
      {result && (
        rawContent
          ? <pre className="text-xs font-mono p-2 rounded bg-muted/40 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">{rawContent}</pre>
          : <div className="text-xs text-muted-foreground/50 italic px-2 py-1">No results</div>
      )}
    </BaseTool>
  );
};
