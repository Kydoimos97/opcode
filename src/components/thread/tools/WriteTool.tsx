import React from 'react';
import { FilePlus } from 'lucide-react';
import { BaseTool } from '../BaseTool';

interface WriteToolProps {
  filePath: string;
  content: string;
  result?: any;
}

export const WriteTool: React.FC<WriteToolProps> = ({ filePath, content, result }) => {
  const status = result ? (result.is_error ? 'error' : 'done') : 'loading';

  return (
    <BaseTool
      icon={<FilePlus className="h-3.5 w-3.5" />}
      iconColor="rgba(74, 222, 128, 0.8)"
      label="Write"
      keyParam={filePath}
      status={status}
      copyValue={content}
    >
      <pre className="text-xs font-mono p-2 rounded bg-muted/40 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
        {content}
      </pre>
    </BaseTool>
  );
};
