import React from 'react';
import { Layers } from 'lucide-react';
import { BaseTool } from '../BaseTool';

interface TaskToolProps {
  description?: string;
  prompt?: string;
  result?: any;
}

export const TaskTool: React.FC<TaskToolProps> = ({ description, prompt, result }) => {
  const status = result ? (result.is_error ? 'error' : 'done') : 'loading';
  const rawContent = typeof result?.content === 'string' ? result.content
    : Array.isArray(result?.content) ? result.content.map((c: any) => c.text ?? '').join('\n')
    : null;
  const keyParam = description ?? prompt ?? 'task';

  return (
    <BaseTool
      icon={<Layers className="h-3.5 w-3.5" />}
      iconColor="rgba(196, 181, 253, 0.8)"
      label="Task"
      keyParam={keyParam}
      status={status}
      copyValue={rawContent ?? keyParam}
    >
      {result && (
        rawContent
          ? <div className="text-xs p-2 rounded bg-muted/40 whitespace-pre-wrap max-h-48 overflow-y-auto">{rawContent}</div>
          : <div className="text-xs text-muted-foreground/50 italic px-2 py-1">No output</div>
      )}
    </BaseTool>
  );
};
