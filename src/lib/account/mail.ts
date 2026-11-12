/**
 * Sends the sign-in code through Resend's HTTP API (RESEND_API_KEY, AUTH_EMAIL_FROM such as
 * "AceWeather <signin@aceweather.app>"). Outside production, with no key set, the code is printed to the server log.
 */
import { CODE_MINUTES } from "./session.ts";

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.AUTH_EMAIL_FROM?.trim()) || process.env.NODE_ENV !== "production";
}

export async function sendCode(email: string, code: string): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  if (!key || !from) {
    console.info(`[account] sign-in code for ${email}: ${code}`);
    return;
  }
  const text = `Your AceWeather sign-in code is ${code}\n\nIt works for ${CODE_MINUTES} minutes. If you didn't ask for it, you can ignore this email.`;
  const html = `<p style="font:15px/1.5 system-ui,sans-serif">Your AceWeather sign-in code is</p>`
    + `<p style="font:600 28px/1.2 system-ui,sans-serif;letter-spacing:4px">${code}</p>`
    + `<p style="font:13px/1.5 system-ui,sans-serif;color:#666">It works for ${CODE_MINUTES} minutes. If you didn't ask for it, you can ignore this email.</p>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [email], subject: `${code} is your AceWeather code`, text, html }),
  });
  if (!res.ok) throw new Error(`mail: ${res.status} ${await res.text().catch(() => "")}`);
}
