import { Box, Center, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';

export function MobileSettings() {
    return (
        <Box style={{
            height: 'calc(100vh - 130px)',
            backgroundColor: '#1A1B1E',
            color: '#C1C2C5'
        }}>
            <Center h="100%">
                <Stack align="center" gap="lg">
                    <ThemeIcon
                        variant="transparent"
                        size={120}
                        color="gray"
                        style={{ opacity: 0.3 }}
                    >
                        <IconSettings size={120} stroke={1.5} />
                    </ThemeIcon>

                    <Stack gap="xs" align="center">
                        <Text ta="center" size="lg" fw={600} style={{ padding: '0 20px' }}>
                            設定機能は現在準備中です
                        </Text>
                        <Text ta="center" size="sm" c="dimmed" style={{ padding: '0 20px', maxWidth: '300px' }}>
                            PC版の実装に合わせてアップデートされます。
                        </Text>
                    </Stack>

                    <Text size="xs" c="dimmed" style={{ opacity: 0.5, marginTop: '40px' }}>
                        Version 0.1.0 (Alpha)
                    </Text>
                </Stack>
            </Center>
        </Box>
    );
}
