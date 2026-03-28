import { useCallback } from "react";
import { toast as sonnerToast } from "sonner";

type ToastType = "success" | "error" | "info";

export const useToast = () => {
  const toast = useCallback((message: string, type: ToastType = "success") => {
    if (type === "success") sonnerToast.success(message);
    else if (type === "error") sonnerToast.error(message);
    else sonnerToast.info(message);
  }, []);
  return { toast };
};
