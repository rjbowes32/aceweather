import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy - AceWeather",
  description: "What AceWeather keeps on your device, what it sends to show the weather, and what an account stores.",
};

/** Set ACEWEATHER_CONTACT_EMAIL to show a contact address; without it the Contact section is left out. */
export default function PrivacyPage() {
  const contact = process.env.ACEWEATHER_CONTACT_EMAIL?.trim();
  return (
    <main className="awx-legal">
      <p><Link href="/">← AceWeather</Link></p>
      <h1>Privacy</h1>
      <p className="awx-legal-date">Last updated 14 November 2026</p>
      <p>AceWeather works without an account. It has no adverts, no analytics and no tracking cookies.</p>

      <h2>What stays on your device</h2>
      <ul>
        <li>Your saved places, theme, units and rain alert choice are kept in your browser&apos;s storage.</li>
        <li>If you use Here, your position is rounded to about 110 metres before it is stored or used. It is kept for up to three days and deleted when you turn Here off.</li>
      </ul>

      <h2>What is sent to show the weather</h2>
      <p>To fetch a forecast, your browser sends the coordinates of the place you are looking at, or what you type into search, to:</p>
      <ul>
        <li>Open-Meteo, for forecasts, weather history and place search</li>
        <li>postcodes.io, for UK postcodes and local authority names</li>
        <li>OpenFreeMap, for map tiles</li>
        <li>AceWeather&apos;s own server, for its forecast, radar and reports</li>
      </ul>
      <p>Like any website, these services and our host, Vercel, see your IP address when your browser contacts them, and may keep standard request logs.</p>

      <h2>If you sign in</h2>
      <p>Signing in is optional. It keeps your places and settings the same on every device. An account stores:</p>
      <ul>
        <li>your email address</li>
        <li>your saved places (their names and coordinates)</li>
        <li>your theme and units</li>
      </ul>
      <p>This is held in a database run by Upstash. Sign-in codes are emailed through Resend. One cookie, <code>awx_session</code>, keeps you signed in for 30 days; it is needed for sign-in and is not used for tracking.</p>
      <p>To limit abuse, requests for sign-in codes are counted for an hour per email address and per network address. The network address is stored in scrambled form.</p>
      <p>Your details are not sold, shared for marketing, or used to send you anything other than sign-in codes.</p>

      <h2>Deleting your data</h2>
      <ul>
        <li><strong>Delete account</strong>, in Settings, removes your email address and synced places and settings straight away, and signs out every device.</li>
        <li><strong>Sign out</strong> leaves the places already on that device where they are.</li>
        <li>Clearing this site&apos;s data in your browser removes everything kept on the device.</li>
      </ul>

      {contact ? (
        <>
          <h2>Contact</h2>
          <p>Questions, or a request for a copy of your data: <a href={`mailto:${contact}`}>{contact}</a></p>
        </>
      ) : null}
    </main>
  );
}
