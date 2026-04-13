import { useState, useEffect } from 'react';
import type { ToastType } from '@/components/ui/toast';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

const MAX_TOASTS = 3;
const emitter = new EventTarget();
const TOAST_EVENT = 'toast:show';

function emit(item: Omit<ToastItem, 'id'>) {
  emitter.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { ...item, id: crypto.randomUUID() } }));
}

export function showError(message: string, duration = 8000): void {
  emit({ message, type: 'error', duration });
}

export function showSuccess(message: string, duration = 5000): void {
  emit({ message, type: 'success', duration });
}

export function showWarning(message: string, duration = 6000): void {
  emit({ message, type: 'info', duration });
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const item = (e as CustomEvent<ToastItem>).detail;
      setToasts(prev => {
        const next = [...prev, item];
        return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
      });
    };
    emitter.addEventListener(TOAST_EVENT, handler);
    return () => emitter.removeEventListener(TOAST_EVENT, handler);
  }, []);

  const dismiss = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return { toasts, dismiss };
}
