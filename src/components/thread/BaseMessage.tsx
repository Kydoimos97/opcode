import React, { useState } from 'react';
import { Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BaseMessageProps {
  icon: React.ReactNode;
  iconColor?: string;
  children: React.ReactNode;
  align?: 'left' | 'right';
  borderColor?: string;
  bgColor?: string;
  showCard?: boolean;
  copyValue?: string;
  className?: string;
}

export const BaseMessage: React.FC<BaseMessageProps> = ({
  icon,
  iconColor = 'var(--color-muted-foreground)',
  children,
  align = 'left',
  borderColor,
  bgColor,
  showCard = false,
  copyValue,
  className,
}) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (copyValue) {
      navigator.clipboard.writeText(copyValue);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  if (align === 'right') {
    return (
      <div className={cn('flex items-end justify-end gap-2 group', className)}>
        <div className="relative max-w-[80%]">
          {copyValue && (
            <button
              onClick={handleCopy}
              className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
              title={isCopied ? 'Copied!' : 'Copy to clipboard'}
            >
              <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          )}
          <div
            className="rounded-lg border p-3"
            style={{
              borderColor: borderColor || 'var(--color-border)',
              backgroundColor: bgColor || 'var(--color-card)',
            }}
          >
            {children}
          </div>
        </div>
        <div
          className="flex-shrink-0 h-6 w-6 rounded-full bg-accent/20 flex items-center justify-center"
          style={{ color: iconColor }}
        >
          {icon}
        </div>
      </div>
    );
  }

  const content = (
    <div className={cn('flex items-start gap-3 group', className)}>
      <div
        className="flex-shrink-0 h-6 w-6 rounded-full bg-accent/20 flex items-center justify-center"
        style={{ color: iconColor }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        {children}
      </div>
      {copyValue && (
        <button
          onClick={handleCopy}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          title={isCopied ? 'Copied!' : 'Copy to clipboard'}
        >
          <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
        </button>
      )}
    </div>
  );

  if (showCard) {
    return (
      <div
        className="rounded-lg border p-4"
        style={{
          borderColor: borderColor || 'var(--color-border)',
          backgroundColor: bgColor || 'var(--color-card)',
        }}
      >
        {content}
      </div>
    );
  }

  return content;
};
