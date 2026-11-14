/**
 * A sign-in waiting for its code. Reading the email means leaving the app, and a phone often reloads an
 * installed web app on the way back; this note lets it reopen at the code step instead of asking for the
 * email and a second code. It lasts as long as the code does.
 */
export const CODE_MINUTES = 10;
export const PENDING_KEY = "awx-signin-pending";

export const pendingNote = (email: string, now = Date.now()) => JSON.stringify({ email, at: now });

/** The email a code was sent to, while that code can still work. */
export function pendingEmail(raw: string | null | undefined, now = Date.now()): string | null {
  if (!raw) return null;
  try {
    const note = JSON.parse(raw) as { email?: unknown; at?: unknown };
    if (typeof note.email !== "string" || typeof note.at !== "number") return null;
    const age = now - note.at;
    return age >= 0 && age < CODE_MINUTES * 60_000 ? note.email : null;
  } catch {
    return null;
  }
}
