import { useEffect, useState } from 'react';
import { Select } from '@mantine/core';
import { supabase } from '../lib/supabaseClient';
import { useTaskStore } from '../stores/taskStore';

interface CalendarOption {
    id: string;
    summary: string;
    backgroundColor?: string;
}

export function CalendarTargetSelector() {
    const { targetCalendarId, setTargetCalendarId } = useTaskStore();
    const [calendars, setCalendars] = useState<CalendarOption[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchWritableCalendars = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();

                if (!session?.provider_token) {
                    setLoading(false);
                    return;
                }

                console.log('[Calendar Selector] Fetching writable calendars...');

                const response = await fetch(
                    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
                    {
                        headers: {
                            Authorization: `Bearer ${session.provider_token}`,
                        },
                    }
                );

                if (!response.ok) {
                    console.error('[Calendar Selector] Failed to fetch calendars:', response.status);
                    setLoading(false);
                    return;
                }

                const data = await response.json();

                // Filter for writable calendars only (owner or writer)
                const writableCalendars: CalendarOption[] = data.items
                    ?.filter((item: any) =>
                        item.accessRole === 'owner' || item.accessRole === 'writer'
                    )
                    .map((item: any) => ({
                        id: item.id,
                        summary: item.summary || item.id,
                        backgroundColor: item.backgroundColor,
                    })) || [];

                console.log('[Calendar Selector] Found writable calendars:', writableCalendars.length);
                setCalendars(writableCalendars);
                setLoading(false);
            } catch (err) {
                console.error('[Calendar Selector] Error fetching calendars:', err);
                setLoading(false);
            }
        };

        fetchWritableCalendars();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
            fetchWritableCalendars();
        });

        return () => subscription.unsubscribe();
    }, []);

    // Don't show if no session or no calendars
    if (loading) {
        return null;
    }

    if (calendars.length === 0) {
        return null;
    }

    return (
        <Select
            label="書き込み先カレンダー"
            description="新しいタスクを作成するカレンダー"
            placeholder="カレンダーを選択"
            value={targetCalendarId}
            onChange={(value) => value && setTargetCalendarId(value)}
            data={calendars.map(cal => ({
                value: cal.id,
                label: cal.summary,
            }))}
            searchable
            size="sm"
        />
    );
}
