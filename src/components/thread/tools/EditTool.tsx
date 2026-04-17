import React from 'react';
import { PenLine } from 'lucide-react';
import { BaseTool } from '../BaseTool';

interface EditToolProps {
  filePath: string;
  oldString?: string;
  newString?: string;
  result?: any;
}

export const EditTool: React.FC<EditToolProps> = ({ filePath, oldString, newString, result }) => {
  const status = result ? (result.is_error ? 'error' : 'done') : 'loading';
  const copyValue = [
    oldString ? `- ${oldString}` : '',
    newString ? `+ ${newString}` : '',
  ].filter(Boolean).join('\n') || filePath;

  return (
    <BaseTool
      icon={<PenLine className="h-3.5 w-3.5" />}
      iconColor="rgba(251, 191, 36, 0.8)"
      label="Edit"
      keyParam={filePath}
      status={status}
      copyValue={copyValue}
    >
      {(oldString !== undefined || newString !== undefined) ? (
        <div className="text-xs font-mono rounded bg-muted/40 overflow-x-auto max-h-64 overflow-y-auto">
          {oldString?.split('\n').map((line, i) => (
            <div key={`rem-${i}`} className="px-2 py-px bg-red-500/10 text-red-400 whitespace-pre">- {line}</div>
          ))}
          {newString?.split('\n').map((line, i) => (
            <div key={`add-${i}`} className="px-2 py-px bg-green-500/10 whitespace-pre" style={{ color: 'var(--chat-terminal-command)' }}>+ {line}</div>
          ))}
        </div>
      ) : result ? (
        (() => {
          const txt = typeof result.content === 'string' ? result.content
            : Array.isArray(result.content) ? result.content.map((c: any) => c.text ?? '').join('\n') : '';
          return txt
            ? <div className="text-xs text-muted-foreground p-2 rounded bg-muted/40 whitespace-pre-wrap max-h-32 overflow-y-auto">{txt}</div>
            : <div className="text-xs text-muted-foreground/50 italic px-2 py-1">Applied</div>;
        })()
      ) : null}
    </BaseTool>
  );
};
