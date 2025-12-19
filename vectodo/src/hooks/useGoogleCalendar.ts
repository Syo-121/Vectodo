import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTaskStore } from '../stores/taskStore';

export interface GoogleCalendar {
    id: string;
    summary: string;
    backgroundColor: string;
}

interface GoogleCalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    allDay?: boolean;
    backgroundColor: string;
    borderColor: string;
    editable: boolean;
    extendedProps: {
        isGoogleEvent: true;
        calendarId?: string;
    };
}

// Load saved calendar selection from localStorage
const loadSelectedCalendars = (): string[] => {
    try {
        const saved = localStorage.getItem('vectodo-selected-calendars');
        return saved ? JSON.parse(saved) : ['primary'];
    } catch (error) {
        console.error('[Google Calendar] Failed to load selected calendars:', error);
        return ['primary'];
    }
};

export function useGoogleCalendar(timeMin?: Date, timeMax?: Date) {
    const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
    const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
    const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>(loadSelectedCalendars());
    const [loading, setLoading] = useState(false);

    // Get tasks to filter out duplicates
    const tasks = useTaskStore(state => state.tasks);
    const [error, setError] = useState<string | null>(null);
    const [session, setSession] = useState<any>(null);

    // Save selected calendars to localStorage whenever they change
    useEffect(() => {
        try {
            localStorage.setItem('vectodo-selected-calendars', JSON.stringify(selectedCalendarIds));
        } catch (error) {
            console.error('[Google Calendar] Failed to save selected calendars:', error);
        }
    }, [selectedCalendarIds]);

    // Monitor session changes
    useEffect(() => {
        console.log('[Google Calendar] Setting up session listener...');

        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            console.log('[Google Calendar] Initial session:', session ? 'Found' : 'Not found');
            setSession(session);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            console.log('[Google Calendar] Session changed:', session ? 'Logged in' : 'Logged out');
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    // Fetch calendar list when session is available
    useEffect(() => {
        if (!session?.provider_token) {
            console.log('[Google Calendar] No session/token, skipping calendar list fetch');
            setCalendars([]);
            return;
        }

        const fetchCalendarList = async () => {
            try {
                console.log('[Google Calendar] Fetching calendar list...');

                const response = await fetch(
                    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
                    {
                        headers: {
                            Authorization: `Bearer ${session.provider_token}`,
                        },
                    }
                );

                if (!response.ok) {
                    console.error('[Google Calendar] Failed to fetch calendar list:', response.status, response.statusText);
                    return;
                }

                const data = await response.json();
                const calendarList: GoogleCalendar[] = data.items?.map((item: any) => ({
                    id: item.id,
                    summary: item.summary || item.id,
                    backgroundColor: item.backgroundColor || '#868e96',
                })) || [];

                console.log('[Google Calendar] ✓ Fetched calendars:', calendarList);
                setCalendars(calendarList);
            } catch (err) {
                console.error('[Google Calendar] Error fetching calendar list:', err);
            }
        };

        fetchCalendarList();
    }, [session]);

    // Fetch events from selected calendars
    useEffect(() => {
        const fetchGoogleEvents = async () => {
            console.log('[Google Calendar] Starting fetch process...');
            setLoading(true);
            setError(null);

            try {
                // Get session
                console.log('[Google Calendar] Getting session...');
                const { data: { session } } = await supabase.auth.getSession();

                console.log('[Google Calendar] Session:', {
                    exists: !!session,
                    hasProvider: !!session?.provider_token,
                    provider: session?.user?.app_metadata?.provider,
                });

                if (!session?.provider_token) {
                    console.warn('[Google Calendar] ⚠️ No provider_token found. Please re-login to Google.');
                    console.log('[Google Calendar] Session details:', session);
                    setEvents([]);
                    setLoading(false);
                    return;
                }

                console.log('[Google Calendar] ✓ Provider token found');
                console.log('[Google Calendar] Selected calendars:', selectedCalendarIds);

                // Set default time range (current month ± 1 month)
                const now = new Date();
                const defaultTimeMin = timeMin || new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const defaultTimeMax = timeMax || new Date(now.getFullYear(), now.getMonth() + 2, 0);

                console.log('[Google Calendar] Time range:', {
                    min: defaultTimeMin.toISOString(),
                    max: defaultTimeMax.toISOString(),
                });

                // Fetch events from all selected calendars in parallel
                console.log('[Google Calendar] Fetching events from', selectedCalendarIds.length, 'calendar(s)...');

                const promises = selectedCalendarIds.map(async (calendarId) => {
                    try {
                        const calendarResponse = await fetch(
                            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
                            new URLSearchParams({
                                timeMin: defaultTimeMin.toISOString(),
                                timeMax: defaultTimeMax.toISOString(),
                                singleEvents: 'true',
                                orderBy: 'startTime',
                            }),
                            {
                                headers: {
                                    Authorization: `Bearer ${session.provider_token}`,
                                },
                            }
                        );

                        if (!calendarResponse.ok) {
                            console.error(`[Google Calendar] Failed to fetch events for ${calendarId}:`, calendarResponse.status);
                            return { calendarId, items: [] };
                        }

                        const calendarData = await calendarResponse.json();
                        console.log(`[Google Calendar] Fetched ${calendarData.items?.length || 0} events from ${calendarId}`);

                        // Create a Set of google_event_ids from Vectodo tasks for efficient filtering
                        const syncedEventIds = new Set(
                            tasks
                                .map(t => t.google_event_id)
                                .filter(Boolean) as string[]
                        );

                        console.log(`[Google Calendar] Filtering out ${syncedEventIds.size} synced events`);

                        // Filter out events that are already in Vectodo as tasks
                        const filteredItems = (calendarData.items || []).filter((item: any) => {
                            const isDuplicate = syncedEventIds.has(item.id);
                            if (isDuplicate) {
                                console.log(`[Google Calendar] Skipping duplicate event: ${item.summary} (${item.id})`);
                            }
                            return !isDuplicate;
                        });

                        console.log(`[Google Calendar] After filtering: ${filteredItems.length} unique events`);

                        return { calendarId, items: filteredItems };
                    } catch (err) {
                        console.error(`[Google Calendar] Error fetching from ${calendarId}:`, err);
                        return { calendarId, items: [] };
                    }
                });

                const results = await Promise.all(promises);

                // Convert all events to FullCalendar format
                const allFormattedEvents: GoogleCalendarEvent[] = results.flatMap(({ calendarId, items }) =>
                    items.map((item: any) => {
                        // Detect all-day events: no dateTime means all-day
                        const isAllDay = !item.start?.dateTime && !!item.start?.date;

                        console.log(`[Google Calendar] Event: "${item.summary}", isAllDay: ${isAllDay}, start:`, item.start);

                        return {
                            id: `google-${calendarId}-${item.id}`,
                            title: item.summary || '(No title)',
                            // CRITICAL: For all-day events, use pure date string (YYYY-MM-DD)
                            // For timed events, use dateTime with timezone
                            start: isAllDay ? item.start.date : item.start.dateTime,
                            end: isAllDay ? item.end.date : item.end.dateTime,
                            allDay: isAllDay, // Explicit flag for FullCalendar
                            backgroundColor: item.backgroundColor || '#868e96',
                            borderColor: item.backgroundColor || '#868e96',
                            editable: false,
                            extendedProps: {
                                isGoogleEvent: true,
                                calendarId,
                            },
                        };
                    })
                );

                console.log('[Google Calendar] ✓ Successfully formatted', allFormattedEvents.length, 'events');
                console.log('[Google Calendar] All-day events:', allFormattedEvents.filter(e => e.allDay).length);
                setEvents(allFormattedEvents);
            } catch (err) {
                console.error('[Google Calendar] ❌ Error fetching events:', err);
                console.error('[Google Calendar] Error details:', {
                    message: err instanceof Error ? err.message : 'Unknown error',
                    stack: err instanceof Error ? err.stack : undefined,
                });
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
                console.log('[Google Calendar] Fetch process completed');
            }
        };

        fetchGoogleEvents();
    }, [timeMin, timeMax, selectedCalendarIds]);

    return {
        events,
        loading,
        error,
        calendars,
        selectedCalendarIds,
        setSelectedCalendarIds,
    };
}
