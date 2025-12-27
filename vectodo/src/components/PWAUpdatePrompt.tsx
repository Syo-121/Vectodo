import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button, Group, Notification } from '@mantine/core';
import { IconRefresh, IconX } from '@tabler/icons-react';

export function PWAUpdatePrompt() {
    const [showPrompt, setShowPrompt] = useState(false);

    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r: ServiceWorkerRegistration | undefined) {
            console.log('Service Worker registered:', r);
        },
        onRegisterError(error: unknown) {
            console.error('Service Worker registration error:', error);
        },
    });

    useEffect(() => {
        if (needRefresh) {
            setShowPrompt(true);
        }
    }, [needRefresh]);

    const handleUpdate = () => {
        updateServiceWorker(true);
        setShowPrompt(false);
    };

    const handleClose = () => {
        setShowPrompt(false);
        setOfflineReady(false);
        setNeedRefresh(false);
    };

    if (!showPrompt && !offlineReady) return null;

    return (
        <div
            style={{
                position: 'fixed',
                bottom: 20,
                right: 20,
                zIndex: 10000,
                maxWidth: '400px',
            }}
        >
            {needRefresh && showPrompt && (
                <Notification
                    icon={<IconRefresh size={20} />}
                    color="blue"
                    title="新しいバージョンが利用可能です"
                    onClose={handleClose}
                    withCloseButton
                    style={{
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    }}
                >
                    <p style={{ marginBottom: '12px' }}>
                        アプリの新しいバージョンがあります。更新しますか？
                    </p>
                    <Group gap="xs">
                        <Button
                            size="sm"
                            onClick={handleUpdate}
                            leftSection={<IconRefresh size={16} />}
                        >
                            更新する
                        </Button>
                        <Button
                            size="sm"
                            variant="subtle"
                            color="gray"
                            onClick={handleClose}
                            leftSection={<IconX size={16} />}
                        >
                            後で
                        </Button>
                    </Group>
                </Notification>
            )}

            {offlineReady && !needRefresh && (
                <Notification
                    color="green"
                    title="オフライン利用が可能です"
                    onClose={handleClose}
                    withCloseButton
                    style={{
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    }}
                >
                    アプリがオフラインでも利用できるようになりました。
                </Notification>
            )}
        </div>
    );
}
