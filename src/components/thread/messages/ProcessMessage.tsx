import React from 'react';
import { Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BaseMessage } from '../BaseMessage';

interface ProcessMessageProps {
  text: string;
}

export const ProcessMessage: React.FC<ProcessMessageProps> = ({ text }) => (
  <div className="max-w-[80%]">
    <BaseMessage
      icon={<Bot className="h-3.5 w-3.5" />}
      iconColor="var(--color-muted-foreground)"
      showCard
      borderColor="var(--color-border)"
      bgColor="color-mix(in srgb, var(--color-muted) 25%, transparent)"
      copyValue={text}
    >
      <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground [&>p]:mb-0 [&>p:last-child]:mb-0">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    </BaseMessage>
  </div>
);
