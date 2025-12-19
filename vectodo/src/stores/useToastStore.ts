import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastStore {
    toasts: Toast[];
    addToast: (message: string, type: ToastType, duration?: number) => void;
    removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
    toasts: [],

    addToast: (message: string, type: ToastType, duration: number = 3000) => {
        const id = `toast-${Date.now()}-${Math.random()}`;

        console.log('[ToastStore] Adding toast:', { id, message, type });

        set((state) => ({
            toasts: [...state.toasts, { id, message, type }],
        }));

        // Auto-remove after duration
        setTimeout(() => {
            console.log('[ToastStore] Auto-removing toast:', id);
            set((state) => ({
                toasts: state.toasts.filter((toast) => toast.id !== id),
            }));
        }, duration);
    },

    removeToast: (id: string) => {
        console.log('[ToastStore] Manually removing toast:', id);
        set((state) => ({
            toasts: state.toasts.filter((toast) => toast.id !== id),
        }));
    },
}));
