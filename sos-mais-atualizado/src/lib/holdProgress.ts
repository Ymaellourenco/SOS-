/**
 * Pure logic for "hold to confirm" buttons (call a contact, broadcast an
 * emergency alert). Kept separate from the React components so the timing
 * math — which is safety-critical, since it controls how long a user in
 * distress has to hold a button before an action fires — can be unit
 * tested without rendering the UI.
 */

/**
 * Returns progress as a percentage (0-100) given how much time has
 * elapsed since the press started, and the total hold duration required.
 * Always clamped to [0, 100].
 */
export function calculateHoldProgress(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 100;
  if (elapsedMs <= 0) return 0;
  return Math.min((elapsedMs / durationMs) * 100, 100);
}

/** Whether the hold has been completed and the action should fire. */
export function isHoldComplete(elapsedMs: number, durationMs: number): boolean {
  return calculateHoldProgress(elapsedMs, durationMs) >= 100;
}
