import React from 'react';
import { Plug } from 'lucide-react';
import { BaseTool } from '../BaseTool';

interface MCPToolProps {
  toolName: string;
  input?: any;
  result?: any;
}

export const MCPTool: React.FC<MCPToolProps> = ({ toolName, input, result }) => {
  const status = result ? (result.is_error ? 'error' : 'done') : 'loading';
  const rawContent = typeof result?.content === 'string' ? result.content
    : Array.isArray(result?.content) ? result.content.map((c: any) => c.text ?? '').join('\n')
    : null;
  const displayName = toolName.replace(/^mcp__[^_]+__/, '');
  const copyValue = [
    input ? JSON.stringify(input, null, 2) : '',
    rawContent ?? '',
  ].filter(Boolean).join('\n\n') || toolName;

  return (
    <BaseTool
      icon={<Plug className="h-3.5 w-3.5" />}
      iconColor="var(--color-muted-foreground)"
      label="MCP"
      keyParam={displayName}
      status={status}
      copyValue={copyValue}
    >
      <div className="space-y-1">
        {input && (
          <pre className="text-xs font-mono p-2 rounded bg-muted/40 overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto">
            {JSON.stringify(input, null, 2)}
          </pre>
        )}
        {rawContent && (
          <pre className="text-xs font-mono p-2 rounded bg-muted/30 overflow-x-auto whitespace-pre-wrap max-h-32 overflow-y-auto">
            {rawContent}
          </pre>
        )}
      </div>
    </BaseTool>
  );
};
