import * as React from 'react';
import { Toast, ToastContainer } from './toast';
import { useToast } from '@/hooks/useToast';

export const Toaster: React.FC = () => {
  const { toasts, dismiss } = useToast();
  return (
    <ToastContainer>
      {toasts.map(t => (
        <Toast
          key={t.id}
          message={t.message}
          type={t.type}
          duration={t.duration}
          onDismiss={() => dismiss(t.id)}
        />
      ))}
    </ToastContainer>
  );
};
