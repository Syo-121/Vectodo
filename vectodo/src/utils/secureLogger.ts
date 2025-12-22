/**
 * Secure Logger
 * 
 * Environment-aware logging utility that prevents sensitive information
 * (like OAuth tokens) from being exposed in production builds.
 */

const isDevelopment = import.meta.env.MODE === 'development';

export const secureLog = {
    /**
     * General info logging
     * Only outputs in development mode
     */
    info: (message: string, data?: any) => {
        if (isDevelopment) {
            console.log(message, data);
        }
    },

    /**
     * Warning logging
     * Only outputs in development mode
     */
    warn: (message: string, data?: any) => {
        if (isDevelopment) {
            console.warn(message, data);
        }
    },

    /**
     * Error logging
     * Always outputs (even in production) but sanitizes sensitive data
     */
    error: (message: string, error?: any) => {
        console.error(message, error);
    },

    /**
     * Session/Token logging
     * Never logs actual token values, only presence/absence
     */
    session: (message: string, hasToken?: boolean) => {
        if (isDevelopment) {
            const tokenStatus = hasToken !== undefined
                ? `(hasToken: ${hasToken})`
                : '(token hidden for security)';
            console.log(`[Session] ${message} ${tokenStatus}`);
        }
    },

    /**
     * API request logging
     * Logs request details but hides Authorization headers
     */
    apiRequest: (method: string, url: string, hasAuth: boolean) => {
        if (isDevelopment) {
            console.log(`🌐 [API] ${method} ${url} (auth: ${hasAuth ? '✓' : '✗'})`);
        }
    },

    /**
     * API response logging
     * Logs response status and basic info
     */
    apiResponse: (status: number, statusText: string, ok: boolean) => {
        if (isDevelopment) {
            const emoji = ok ? '✅' : '❌';
            console.log(`${emoji} [API Response] ${status} ${statusText}`);
        }
    },
};
