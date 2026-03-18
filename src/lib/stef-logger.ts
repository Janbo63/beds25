const STEF_LOG_URL = process.env.STEF_LOG_URL || 'https://stef.futuresolutionsai.com/api/logs';
const STEF_LOG_KEY = process.env.STEF_LOG_KEY || 'fs-log-key-2026';
const APP_NAME = 'beds25';

export async function logToStef(
  level: 'info' | 'warn' | 'error' | 'critical',
  message: string,
  metadata?: Record<string, unknown>
) {
  try {
    await fetch(STEF_LOG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': STEF_LOG_KEY },
      body: JSON.stringify({ app: APP_NAME, level, message, stack: new Error().stack, metadata }),
    });
  } catch {
    // Don't let logging failures crash the app
    console.error('[stef-logger] Failed to send log:', message);
  }
}
