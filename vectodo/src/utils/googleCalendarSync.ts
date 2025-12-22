import type { Session } from '@supabase/supabase-js';
import type { Tables } from '../supabase-types';

type Task = Tables<'tasks'>;

/**
 * Convert Vectodo task to Google Calendar event format
 */
function convertTaskToGoogleEvent(task: Task) {
    // Determine if event has time information
    const hasTimeInfo = task.planned_start?.includes('T') || task.planned_end?.includes('T');

    let start, end;

    if (task.planned_start && task.planned_end) {
        // Both start and end specified
        if (hasTimeInfo) {
            // Timed event
            start = { dateTime: task.planned_start };
            end = { dateTime: task.planned_end };
        } else {
            // All-day event
            start = { date: task.planned_start.split('T')[0] };
            end = { date: task.planned_end.split('T')[0] };
        }
    } else if (task.deadline) {
        // Deadline only - create all-day event
        const dateStr = task.deadline.split('T')[0];
        start = { date: dateStr };
        // Google Calendar all-day events: end date is exclusive
        const endDate = new Date(dateStr);
        endDate.setDate(endDate.getDate() + 1);
        end = { date: endDate.toISOString().split('T')[0] };
    } else if (task.planned_start) {
        // Planned start only - create 1-hour event
        start = { dateTime: task.planned_start };
        const endDate = new Date(task.planned_start);
        endDate.setHours(endDate.getHours() + 1);
        end = { dateTime: endDate.toISOString() };
    } else {
        throw new Error('No date information available');
    }

    const signature = '\n\n[Created by Vectodo]';
    const description = task.description
        ? `${task.description}${signature}`
        : '[Created by Vectodo]';

    return {
        summary: task.title,
        description,
        start,
        end,
        extendedProperties: {
            private: {
                createdBy: 'vectodo',
                vectodoTaskId: task.id,
            }
        }
    };
}

/**
 * Create a new event in Google Calendar
 */
export async function createGoogleEvent(
    task: Task,
    calendarId: string,
    session: Session
): Promise<string | null> {
    console.log('🔄 [Google Sync] createGoogleEvent called for:', task.title);
    console.log('   Target calendar:', calendarId);

    // Skip if no date information
    if (!task.planned_start && !task.planned_end && !task.deadline) {
        console.log('ℹ️ [Google Sync] No date info, skipping sync for:', task.title);
        console.log('   - planned_start:', task.planned_start);
        console.log('   - planned_end:', task.planned_end);
        console.log('   - deadline:', task.deadline);
        return null;
    }

    // Validate session and token
    if (!session) {
        console.warn('⚠️ [Google Sync] No session available');
        return null;
    }

    if (!session.provider_token) {
        console.warn('⚠️ [Google Sync] Googleトークンがありません。再ログインが必要です。');
        console.log('   Session details:', {
            user: session.user?.email,
            provider: session.user?.app_metadata?.provider,
            hasToken: !!session.provider_token,
        });
        return null;
    }

    console.log('✓ [Google Sync] Session valid, provider_token exists');

    try {
        const event = convertTaskToGoogleEvent(task);

        console.log('📤 [Google Sync] Sending event to Google Calendar:');
        console.log('   Task:', task.title);
        console.log('   Calendar ID:', calendarId);
        console.log('   Payload:', JSON.stringify(event, null, 2));

        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${session.provider_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(event),
            }
        );

        console.log('📥 [Google Sync] API Response:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => response.text());
            console.error('❌ [Google Sync] API Error Response:', errorData);
            console.error('   Status:', response.status, response.statusText);

            if (response.status === 403) {
                console.error('   ⚠️ 403 Forbidden: スコープまたは権限が不足しています');
            } else if (response.status === 401) {
                console.error('   ⚠️ 401 Unauthorized: トークンが無効または期限切れです。再ログインしてください。');
            }

            throw new Error(`Failed to create event: ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ [Google Sync] Event created successfully!');
        console.log('   Event ID:', data.id);
        console.log('   Event Link:', data.htmlLink);
        return data.id;
    } catch (err) {
        console.error('❌ [Google Sync] Error creating event:', err);
        if (err instanceof Error) {
            console.error('   Error message:', err.message);
            console.error('   Error stack:', err.stack);
        }
        return null;
    }
}

/**
 * Update an existing event in Google Calendar
 */
export async function updateGoogleEvent(
    task: Task,
    googleEventId: string,
    calendarId: string,
    session: Session
): Promise<boolean> {
    console.log('🔄 [Google Sync] updateGoogleEvent called for:', task.title);
    console.log('   Event ID:', googleEventId);
    console.log('   Target calendar:', calendarId);

    if (!session.provider_token) {
        console.warn('⚠️ [Google Sync] No provider token available for update');
        return false;
    }

    // If dates were removed, delete the event
    if (!task.planned_start && !task.planned_end && !task.deadline) {
        console.log('ℹ️ [Google Sync] Dates removed, deleting event from calendar');
        return await deleteGoogleEvent(googleEventId, calendarId, session);
    }

    try {
        const event = convertTaskToGoogleEvent(task);

        console.log('📤 [Google Sync] Updating event in Google Calendar:');
        console.log('   Calendar ID:', calendarId);
        console.log('   Payload:', JSON.stringify(event, null, 2));

        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${googleEventId}`,
            {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${session.provider_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(event),
            }
        );

        console.log('📥 [Google Sync] API Response:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => response.text());
            console.error('❌ [Google Sync] API Error Response:', errorData);

            // If 404, the event was already deleted
            if (response.status === 404) {
                console.log('ℹ️ [Google Sync] Event not found (404), considering as success');
                return true;
            }

            throw new Error(`Failed to update event: ${response.status}`);
        }

        console.log('✅ [Google Sync] Event updated successfully!');
        return true;
    } catch (err) {
        console.error('❌ [Google Sync] Error updating event:', err);
        if (err instanceof Error) {
            console.error('   Error message:', err.message);
        }
        return false;
    }
}

/**
 * Delete an event from Google Calendar
 */
export async function deleteGoogleEvent(
    googleEventId: string,
    calendarId: string,
    session: Session
): Promise<boolean> {
    console.log('🗑️ [Google Sync] deleteGoogleEvent called');
    console.log('   Event ID:', googleEventId);
    console.log('   Target calendar:', calendarId);

    if (!session.provider_token) {
        console.warn('⚠️ [Google Sync] No provider token available for deletion');
        return false;
    }

    try {
        // SAFETY CHECK: Verify event before deletion
        console.log('🔍 [Google Sync] Verifying event origin before deletion...');
        const getResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${googleEventId}`,
            {
                headers: {
                    Authorization: `Bearer ${session.provider_token}`,
                },
            }
        );

        if (!getResponse.ok) {
            if (getResponse.status === 404) {
                console.log('ℹ️ [Google Sync] Event already deleted (404)');
                return true;
            }
            throw new Error(`Failed to verify event: ${getResponse.status}`);
        }

        const event = await getResponse.json();

        // Check if event was created by Vectodo
        const isVectodoEvent = event.description?.includes('[Created by Vectodo]') ||
            event.extendedProperties?.private?.createdBy === 'vectodo';

        if (!isVectodoEvent) {
            console.error('🚫 [Google Sync] SAFETY: Refusing to delete non-Vectodo event');
            console.error('   Event title:', event.summary);
            console.error('   Event ID:', event.id);
            throw new Error('Cannot delete events not created by Vectodo (Signature missing)');
        }

        console.log('✅ [Google Sync] Safety check passed. Deleting event...');

        const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${googleEventId}`,
            {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${session.provider_token}`,
                },
            }
        );

        console.log('📥 [Google Sync] Delete API Response:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
        });

        // 404 means already deleted, which is fine
        if (!response.ok && response.status !== 404) {
            const errorData = await response.text();
            console.error('❌ [Google Sync] API Error Response:', errorData);
            throw new Error(`Failed to delete event: ${response.status}`);
        }

        console.log('✅ [Google Sync] Event deleted successfully!');
        return true;
    } catch (err) {
        console.error('❌ [Google Sync] Error deleting event:', err);
        if (err instanceof Error) {
            console.error('   Error message:', err.message);
        }
        // Rethrow the error so the UI knows it failed
        throw err;
    }
}
