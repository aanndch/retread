import { useState, useEffect, useRef } from 'preact/hooks';

interface ToastProps {
  message: string;
  type?: 'error' | 'success' | 'info';
  onClose: () => void;
}

export function Toast({ message, type = 'error', onClose }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 200);
    }, 3000);
    return () => clearTimeout(timerRef.current);
  }, [onClose]);

  return (
    <div class={`toast ${type}${visible ? ' toast-visible' : ''}`} onClick={() => {
      clearTimeout(timerRef.current);
      setVisible(false);
      setTimeout(onClose, 200);
    }}>
      <span class="toast-message">{message}</span>
      <span class="toast-close">×</span>
    </div>
  );
}

interface ToastItem {
  id: number;
  message: string;
  type: 'error' | 'success' | 'info';
}

let toastId = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = (message: string, type: 'error' | 'success' | 'info' = 'error') => {
    const id = Date.now() + (toastId++);
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return { toasts, showToast, removeToast };
}

interface ToastHostProps {
  toasts: ToastItem[];
  removeToast: (id: number) => void;
}

// Shared toast stack host: renders the fixed container every page used to
// duplicate. Consumers keep their own useToast() state and hand it down.
export function ToastHost({ toasts, removeToast }: ToastHostProps) {
  return (
    <div class="toast-container">
      {toasts.map(t => (
        <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
      ))}
    </div>
  );
}
