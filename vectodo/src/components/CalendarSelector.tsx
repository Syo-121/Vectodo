import { Checkbox, Stack, Group, Box, Text } from '@mantine/core';
import type { GoogleCalendar } from '../hooks/useGoogleCalendar';

interface CalendarSelectorProps {
    calendars: GoogleCalendar[];
    selectedIds: string[];
    onChange: (selectedIds: string[]) => void;
}

export function CalendarSelector({ calendars, selectedIds, onChange }: CalendarSelectorProps) {
    const handleToggle = (calendarId: string) => {
        if (selectedIds.includes(calendarId)) {
            // Don't allow deselecting all calendars
            if (selectedIds.length === 1) {
                console.log('[CalendarSelector] Cannot deselect all calendars');
                return;
            }
            onChange(selectedIds.filter(id => id !== calendarId));
        } else {
            onChange([...selectedIds, calendarId]);
        }
    };

    if (calendars.length === 0) {
        return <Text size="sm" c="dimmed">カレンダーがありません</Text>;
    }

    return (
        <Stack gap="xs">
            {calendars.map((calendar) => (
                <Group key={calendar.id} gap="xs" wrap="nowrap">
                    <Box
                        w={12}
                        h={12}
                        style={{
                            backgroundColor: calendar.backgroundColor,
                            borderRadius: 2,
                            flexShrink: 0,
                        }}
                    />
                    <Checkbox
                        label={calendar.summary}
                        checked={selectedIds.includes(calendar.id)}
                        onChange={() => handleToggle(calendar.id)}
                        size="sm"
                        styles={{
                            label: {
                                fontSize: '0.875rem',
                            },
                        }}
                    />
                </Group>
            ))}
        </Stack>
    );
}
