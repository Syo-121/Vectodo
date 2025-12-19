import { useEffect, useState } from 'react';
import { Button, Stack, Text } from '@mantine/core';
import { Calendar, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import type { Session } from '@supabase/supabase-js';

export function GoogleConnectButton() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
            console.log('Google Calendar - Initial session:', session ? 'Found' : 'Not found');
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            console.log('Google Calendar - Auth state changed:', session ? 'Logged in' : 'Logged out');
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleConnect = async () => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    scopes: 'https://www.googleapis.com/auth/calendar',
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent',
                    },
                },
            });

            if (error) {
                console.error('Error connecting to Google Calendar:', error);
            }
        } catch (err) {
            console.error('Failed to connect:', err);
        }
    };

    const handleDisconnect = async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error('Error disconnecting:', error);
            } else {
                console.log('Successfully disconnected from Google Calendar');
            }
        } catch (err) {
            console.error('Failed to disconnect:', err);
        }
    };

    if (loading) {
        return <Text size="sm" c="dimmed">読み込み中...</Text>;
    }

    if (session) {
        return (
            <Stack gap="xs">
                <Text size="sm" c="dimmed">
                    Connected: {session.user.email}
                </Text>
                <Button
                    onClick={handleDisconnect}
                    variant="outline"
                    color="red"
                    leftSection={<LogOut size={16} />}
                    fullWidth
                >
                    Disconnect
                </Button>
            </Stack>
        );
    }

    return (
        <Button
            onClick={handleConnect}
            variant="outline"
            leftSection={<Calendar size={16} />}
            fullWidth
        >
            Connect Google Calendar
        </Button>
    );
}
