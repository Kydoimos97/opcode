import React from 'react';
import { Terminal } from 'lucide-react';
import { BaseTool } from '../BaseTool';

interface BashToolProps {
  command: string;
  description?: string;
  result?: any;
}

export const BashTool: React.FC<BashToolProps> = ({ command, description, result }) => {
  const status = result ? (result.is_error ? 'error' : 'done') : 'loading';

  const outputText = typeof result?.content === 'string' ? result.content
    : Array.isArray(result?.content) ? result.content.map((c: any) => c.text ?? '').join('\n')
    : null;

  const copyValue = outputText ? `$ ${command}\n\n${outputText}` : command;

  return (
    <BaseTool
      icon={<Terminal className="h-3.5 w-3.5" />}
      iconColor="var(--chat-terminal-command)"
      label="Bash"
      keyParam={description || command}
      status={status}
      copyValue={copyValue}
    >
      <div className="space-y-1">
        <div className="px-2 py-1 rounded bg-muted/40 font-mono text-xs" style={{ color: 'var(--chat-terminal-command)' }}>
          $ {command}
        </div>
        {outputText && (
          <div
            className="px-2 py-1 rounded bg-muted/30 font-mono text-xs whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto"
            style={{ color: result?.is_error ? 'var(--color-destructive)' : 'var(--chat-terminal-output)' }}
          >
            {outputText}
          </div>
        )}
      </div>
    </BaseTool>
  );
};
