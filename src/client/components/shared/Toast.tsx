import { useState, useEffect, useCallback, createContext, useContext } from "react";
import type { ReactNode } from "react";

type ToastType = "success" | "error" | "info";

type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  toast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

export const useToast = () => useContext(ToastContext);

let nextId = 0;

const TOAST_COLORS: Record<ToastType, string> = {
  success: "bg-green-900/90 border-green-700 text-green-100",
  error: "bg-red-900/90 border-red-700 text-red-100",
  info: "bg-blue-900/90 border-blue-700 text-blue-100",
};

const ToastItem = ({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) => {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), 3000);
    return () => clearTimeout(timer);
  }, [item.id, onDismiss]);

  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur-sm transition-all animate-in slide-in-from-right ${TOAST_COLORS[item.type]}`}
    >
      {item.message}
    </div>
  );
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};
