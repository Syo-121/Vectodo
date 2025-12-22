import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTaskStore } from '../stores/taskStore';
import { secureLog } from '../utils/secureLogger';

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
        secureLog.error('[Google Calendar] Failed to load selected calendars:', error);
        return ['primary'];
    }
};

/**
 * Ensure we have a fresh, valid OAuth token
 * Automatically refreshes if expiring within 5 minutes
 */
const ensureFreshToken = async (): Promise<string | null> => {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
        secureLog.warn('[Google Calendar] No session available');
        return null;
    }

    // Check if token is about to expire (within 5 minutes)
    const expiresAt = session.expires_at;
    if (expiresAt && Date.now() / 1000 > expiresAt - 300) {
        secureLog.info('[Google Calendar] Token expiring soon, refreshing...');
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !data.session) {
            secureLog.error('[Google Calendar] Failed to refresh token:', refreshError);
            return null;
        }
        secureLog.info('[Google Calendar] ✓ Token refreshed successfully');
        return data.session.provider_token || null;
    }

    return session.provider_token || null;
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
            secureLog.error('[Google Calendar] Failed to save selected calendars:', error);
        }
    }, [selectedCalendarIds]);

    // Monitor session changes
    useEffect(() => {
        secureLog.info('[Google Calendar] Setting up session listener...');

        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            secureLog.session('[Google Calendar] Initial session', !!session?.provider_token);
            setSession(session);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            secureLog.session('[Google Calendar] Session changed', !!session?.provider_token);
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    // Fetch calendar list when session is available
    useEffect(() => {
        const fetchCalendarList = async () => {
            try {
                // Ensure we have a fresh token
                const token = await ensureFreshToken();
                if (!token) {
                    secureLog.warn('[Google Calendar] No valid token, skipping calendar list fetch');
                    setCalendars([]);
                    return;
                }

                secureLog.info('[Google Calendar] Fetching calendar list...');

                const response = await fetch(
                    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                );

                if (!response.ok) {
                    secureLog.error('[Google Calendar] Failed to fetch calendar list:',
                        `${response.status} ${response.statusText}`);
                    return;
                }

                const data = await response.json();
                const calendarList: GoogleCalendar[] = data.items?.map((item: any) => ({
                    id: item.id,
                    summary: item.summary || item.id,
                    backgroundColor: item.backgroundColor || '#868e96',
                })) || [];

                secureLog.info(`[Google Calendar] ✓ Fetched ${calendarList.length} calendars`);
                setCalendars(calendarList);
            } catch (err) {
                secureLog.error('[Google Calendar] Error fetching calendar list:', err);
            }
        };

        if (session?.provider_token) {
            fetchCalendarList();
        } else {
            setCalendars([]);
        }
    }, [session]);

    // Fetch events from selected calendars
    useEffect(() => {
        const fetchGoogleEvents = async () => {
            secureLog.info('[Google Calendar] Starting fetch process...');
            setLoading(true);
            setError(null);

            try {
                // Ensure we have a fresh token
                const token = await ensureFreshToken();
                if (!token) {
                    secureLog.warn('[Google Calendar] ⚠️ No valid token. Please re-login to Google.');
                    setEvents([]);
                    setLoading(false);
                    return;
                }

                secureLog.info('[Google Calendar] ✓ Token validated');
                secureLog.info(`[Google Calendar] Fetching from ${selectedCalendarIds.length} calendar(s)...`);

                // Set default time range (current month ± 1 month)
                const now = new Date();
                const defaultTimeMin = timeMin || new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const defaultTimeMax = timeMax || new Date(now.getFullYear(), now.getMonth() + 2, 0);

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
                                    Authorization: `Bearer ${token}`,
                                },
                            }
                        );

                        if (!calendarResponse.ok) {
                            secureLog.error(`[Google Calendar] Failed to fetch events for ${calendarId}:`,
                                `${calendarResponse.status}`);
                            return { calendarId, items: [] };
                        }

                        const calendarData = await calendarResponse.json();
                        secureLog.info(`[Google Calendar] Fetched ${calendarData.items?.length || 0} events from ${calendarId}`);

                        // Create a Set of google_event_ids from Vectodo tasks for efficient filtering
                        const syncedEventIds = new Set(
                            tasks
                                .map(t => t.google_event_id)
                                .filter(Boolean) as string[]
                        );

                        // Filter out events that are already in Vectodo as tasks
                        const filteredItems = (calendarData.items || []).filter((item: any) => {
                            return !syncedEventIds.has(item.id);
                        });

                        secureLog.info(`[Google Calendar] After filtering: ${filteredItems.length} unique events from ${calendarId}`);

                        return { calendarId, items: filteredItems };
                    } catch (err) {
                        secureLog.error(`[Google Calendar] Error fetching from ${calendarId}:`, err);
                        return { calendarId, items: [] };
                    }
                });

                const results = await Promise.all(promises);

                // Convert all events to FullCalendar format
                const allFormattedEvents: GoogleCalendarEvent[] = results.flatMap(({ calendarId, items }) =>
                    items.map((item: any) => {
                        // Detect all-day events: no dateTime means all-day
                        const isAllDay = !item.start?.dateTime && !!item.start?.date;

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

                const allDayCount = allFormattedEvents.filter(e => e.allDay).length;
                secureLog.info(`[Google Calendar] ✓ Formatted ${allFormattedEvents.length} events (${allDayCount} all-day)`);
                setEvents(allFormattedEvents);
            } catch (err) {
                secureLog.error('[Google Calendar] ❌ Error fetching events:',
                    err instanceof Error ? err.message : 'Unknown error');
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
                secureLog.info('[Google Calendar] Fetch process completed');
            }
        };

        fetchGoogleEvents();
    }, [timeMin, timeMax, selectedCalendarIds, tasks]);

    return {
        events,
        loading,
        error,
        calendars,
        selectedCalendarIds,
        setSelectedCalendarIds,
    };
}
