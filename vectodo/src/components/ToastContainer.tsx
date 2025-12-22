import { useEffect, useRef } from 'react';
import { notifications } from '@mantine/notifications';
import { useToastStore } from '../stores/useToastStore';
import { IconCheck, IconX, IconInfoCircle, IconAlertTriangle } from '@tabler/icons-react';

const toastIcons = {
    success: IconCheck,
    error: IconX,
    info: IconInfoCircle,
    warning: IconAlertTriangle,
};

const toastColors = {
    success: 'green',
    error: 'red',
    info: 'blue',
    warning: 'yellow',
};

export function ToastContainer() {
    const toasts = useToastStore(state => state.toasts);
    const removeToast = useToastStore(state => state.removeToast);
    const shownToastsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        // Show notifications for new toasts only
        toasts.forEach((toast) => {
            // Skip if already shown
            if (shownToastsRef.current.has(toast.id)) {
                return;
            }

            // Mark as shown
            shownToastsRef.current.add(toast.id);

            const Icon = toastIcons[toast.type];

            console.log('[Toast] Showing notification:', toast.message);

            notifications.show({
                id: toast.id,
                title: toast.type === 'success' ? '成功'
                    : toast.type === 'error' ? 'エラー'
                        : toast.type === 'warning' ? '警告'
                            : '情報',
                message: toast.message,
                color: toastColors[toast.type],
                icon: <Icon size={18} />,
                autoClose: 3000,
                onClose: () => {
                    removeToast(toast.id);
                    shownToastsRef.current.delete(toast.id);
                },
            });
        });

        // Clean up shown IDs for toasts that were removed
        const currentIds = new Set(toasts.map(t => t.id));
        shownToastsRef.current.forEach(id => {
            if (!currentIds.has(id)) {
                shownToastsRef.current.delete(id);
            }
        });
    }, [toasts, removeToast]);

    return null; // Mantine handles the rendering
}
