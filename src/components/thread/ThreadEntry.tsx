import React from 'react';
import { cn } from '@/lib/utils';

interface ThreadEntryProps {
  depth: 0 | 1 | 2 | 3;
  children: React.ReactNode;
  className?: string;
}

export const ThreadEntry: React.FC<ThreadEntryProps> = ({
  depth,
  children,
  className,
}) => {
  const depthClasses = {
    0: '',
    1: 'ml-6',
    2: 'ml-14 pl-3 border-l',
    3: 'ml-20 pl-3 border-l',
  };

  const borderStyle = depth >= 2 ? { borderColor: 'var(--chat-work-border)' } : {};

  return (
    <div
      className={cn(depthClasses[depth], className)}
      style={borderStyle}
    >
      {children}
    </div>
  );
};
