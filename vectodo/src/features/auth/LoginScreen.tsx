import { useState } from 'react';
import { Container, Paper, Title, Text, Button, Stack, Center } from '@mantine/core';
import { CheckSquare } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useToastStore } from '../../stores/useToastStore';

export function LoginScreen() {
    const [loading, setLoading] = useState(false);
    const addToast = useToastStore(state => state.addToast);

    const handleLogin = async () => {
        try {
            setLoading(true);
            console.log('[Auth] Starting Google OAuth login...');

            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: window.location.origin,
                    queryParams: {
                        access_type: 'offline', // Required for refresh token
                        prompt: 'consent',      // Force consent screen to ensure we get all permissions
                        scope: 'openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events'
                    }
                }
            });

            if (error) {
                console.error('[Auth] Login error:', error);
                addToast(`ログインエラー: ${error.message}`, 'error');
                setLoading(false);
            } else {
                console.log('[Auth] Redirecting to Google OAuth...', data);
                // User will be redirected to Google, no need to setLoading(false)
            }
        } catch (error: any) {
            console.error('[Auth] Unexpected error:', error);
            addToast(`予期しないエラー: ${error.message}`, 'error');
            setLoading(false);
        }
    };

    return (
        <Center style={{ minHeight: '100vh', backgroundColor: '#1a1b1e' }}>
            <Container size="xs">
                <Paper shadow="xl" p="xl" radius="md" withBorder>
                    <Stack gap="xl" align="center">
                        {/* App Icon & Title */}
                        <CheckSquare size={48} strokeWidth={2.5} color="#5c7cfa" />

                        <Title order={1} size="h1" fw={700} ta="center">
                            Vectodo
                        </Title>

                        {/* Login Button */}
                        <Button
                            size="lg"
                            fullWidth
                            loading={loading}
                            onClick={handleLogin}
                            variant="filled"
                            color="blue"
                        >
                            Googleでログイン
                        </Button>

                        <Text size="xs" c="dimmed" ta="center">
                            ログインすることで、利用規約に同意したものとみなされます
                        </Text>
                    </Stack>
                </Paper>
            </Container>
        </Center>
    );
}
