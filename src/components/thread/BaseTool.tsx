import React, { useState } from 'react';
import {
  Copy,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BaseToolProps {
  icon: React.ReactNode;
  iconColor?: string;
  label: string;
  keyParam: string;
  status: 'loading' | 'done' | 'error';
  children?: React.ReactNode;
  copyValue?: string;
  defaultExpanded?: boolean;
  className?: string;
}

export const BaseTool: React.FC<BaseToolProps> = ({
  icon,
  iconColor = 'var(--color-muted-foreground)',
  label,
  keyParam,
  children,
  copyValue,
  defaultExpanded = false,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleRowClick = () => {
    if (children) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (copyValue) {
      navigator.clipboard.writeText(copyValue);
    }
  };

  return (
    <div className={className}>
      <div
        onClick={handleRowClick}
        className={cn(
          'flex items-center gap-2 py-1.5 px-2',
          children ? 'cursor-pointer' : 'cursor-default',
          'select-none group'
        )}
      >
        {children && (
          <div className="flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            )}
          </div>
        )}

        <div
          className="flex-shrink-0 flex items-center justify-center"
          style={{ color: iconColor }}
        >
          {icon}
        </div>

        <span className="text-xs font-medium text-muted-foreground flex-shrink-0">
          {label}:
        </span>

        <span className="text-xs font-mono text-muted-foreground truncate min-w-0 flex-1 underline-offset-2 hover:underline">
          {keyParam}
        </span>

        {copyValue && (
          <button
            onClick={handleCopy}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Copy to clipboard"
          >
            <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {isExpanded && children && (
        <div className="mt-1 ml-5">
          {children}
        </div>
      )}
    </div>
  );
};
