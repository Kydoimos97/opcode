import React from 'react';
import { Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BaseMessage } from '../BaseMessage';

interface AgentMessageProps {
  text: string;
}

export const AgentMessage: React.FC<AgentMessageProps> = ({ text }) => (
  <div className="max-w-[80%]">
    <BaseMessage
      icon={<Bot className="h-3.5 w-3.5" />}
      iconColor="var(--chat-final-border)"
      showCard
      borderColor="var(--chat-final-border)"
      bgColor="var(--chat-final-bg)"
      copyValue={text}
    >
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    </BaseMessage>
  </div>
);
