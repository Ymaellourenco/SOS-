/**
 * Thin wrapper around console.* that only prints in development.
 * Use this instead of console.log/warn/error directly in app code so
 * production builds don't leak internal state, tokens, or stack traces
 * to the browser console.
 *
 * `logger.error` still forwards to console.error in production, since
 * unexpected errors should remain visible for real-world debugging —
 * just without verbose debug noise around them.
 */

const isDev = import.meta.env?.DEV ?? false;

export const logger = {
  log: (...args: unknown[]) => {
    if (isDev) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    // Errors are always logged, even in production, so real issues
    // remain diagnosable — they just won't include dev-only chatter.
    console.error(...args);
  },
};
