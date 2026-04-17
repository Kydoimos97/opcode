import React from 'react';
import { Brain } from 'lucide-react';
import { BaseTool } from '../BaseTool';

interface ThinkingToolProps {
  thinking: string;
  signature?: string;
}

export const ThinkingTool: React.FC<ThinkingToolProps> = ({ thinking }) => (
  <BaseTool
    icon={<Brain className="h-3.5 w-3.5" />}
    iconColor="rgba(167, 139, 250, 0.8)"
    label="Thinking"
    keyParam="extended thinking"
    status="done"
    copyValue={thinking}
  >
    <div className="text-xs text-muted-foreground p-2 rounded bg-muted/40 whitespace-pre-wrap max-h-64 overflow-y-auto">
      {thinking}
    </div>
  </BaseTool>
);
