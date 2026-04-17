import React from 'react';
import { User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BaseMessage } from '../BaseMessage';

interface UserMessageProps {
  text: string;
  images?: Array<{ mediaType: string; data: string }>;
}

export const UserMessage: React.FC<UserMessageProps> = ({ text, images }) => (
  <BaseMessage
    icon={<User className="h-3.5 w-3.5" />}
    iconColor="var(--chat-user-border)"
    align="right"
    borderColor="var(--chat-user-border)"
    bgColor="var(--chat-user-bg)"
    copyValue={text || undefined}
  >
    <div className="space-y-2">
      {images?.map((img, i) => (
        <img
          key={i}
          src={`data:${img.mediaType};base64,${img.data}`}
          alt="uploaded"
          className="max-w-full rounded-lg max-h-64 object-contain"
        />
      ))}
      {text && (
        <div className="prose prose-sm dark:prose-invert max-w-none text-sm [&>p]:mb-0 [&>p:last-child]:mb-0">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      )}
    </div>
  </BaseMessage>
);
