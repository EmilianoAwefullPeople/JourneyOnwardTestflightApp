// Logger
// Development-only log/warn; error always runs for critical debugging.
// Use in production builds to avoid noisy device logs and internal detail leakage.

declare const __DEV__: boolean;

export const logger = {
  log: (...args: unknown[]) => {
    if (__DEV__) {
      console.log(...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (__DEV__) {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
