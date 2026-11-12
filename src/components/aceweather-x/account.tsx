"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { parseAccountData, type AccountData, type Prefs } from "@/lib/account/data";
import type { AwLocation } from "@/lib/aceweather/open-meteo";

/** "merge": first sign-in on this device, so this device's places join the account's. "load": the account wins. */
export type ApplyAccount = (data: AccountData, mode: "load" | "merge") => void;

export type Account = {
  status: "checking" | "off" | "out" | "in";
  email: string | null;
  signedIn: (email: string, data: AccountData) => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const DIRTY = "awx-sync-dirty";
const PUSH_DELAY = 800;

async function call(path: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Something went wrong");
  return json;
}

const markDirty = (dirty: boolean) => { try { if (dirty) localStorage.setItem(DIRTY, "1"); else localStorage.removeItem(DIRTY); } catch { /* */ } };
const isDirty = () => { try { return localStorage.getItem(DIRTY) === "1"; } catch { return false; } };

/**
 * Keeps saved places and display settings in step with the signed-in account. Every change is pushed after a
 * short pause; a change that couldn't be pushed (offline) is kept as "dirty" and pushed on the next load
 * instead of being overwritten by the account's copy.
 */
export function useAccountSync(saved: AwLocation[], prefs: Prefs, apply: ApplyAccount): Account {
  const [status, setStatus] = useState<Account["status"]>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const applyRef = useRef(apply);
  useEffect(() => { applyRef.current = apply; });
  const lastPushed = useRef<string | null>(null);
  const snapshot = JSON.stringify({ saved, prefs });

  useEffect(() => {
    let cancelled = false;
    call("/account/me", "GET").then((me) => {
      if (cancelled) return;
      if (!me.enabled) { setStatus("off"); return; }
      if (typeof me.email !== "string") { setStatus("out"); return; }
      setEmail(me.email);
      setStatus("in");
      const data = parseAccountData(me.data);
      // Nothing synced yet, or local changes still waiting: this device's copy goes up instead.
      if (data.updatedAt && !isDirty()) {
        lastPushed.current = JSON.stringify({ saved: data.saved, prefs: data.prefs });
        applyRef.current(data, "load");
      }
      setReady(true);
    }).catch(() => { if (!cancelled) setStatus("off"); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (status !== "in" || !ready || snapshot === lastPushed.current) return undefined;
    markDirty(true);
    const t = window.setTimeout(() => {
      call("/account/me", "PUT", JSON.parse(snapshot)).then(() => {
        lastPushed.current = snapshot;
        markDirty(false);
      }).catch((error: Error) => { if (error.message === "Signed out") { setStatus("out"); setEmail(null); } });
    }, PUSH_DELAY);
    return () => window.clearTimeout(t);
  }, [status, ready, snapshot]);

  return {
    status,
    email,
    signedIn(nextEmail, data) {
      lastPushed.current = null;
      applyRef.current(data, "merge");
      setEmail(nextEmail);
      setStatus("in");
      setReady(true);
    },
    async signOut() {
      await call("/account/signout", "POST", {}).catch(() => {});
      markDirty(false);
      setStatus("out");
      setEmail(null);
      setReady(false);
    },
    async deleteAccount() {
      await call("/account/me", "DELETE", {});
      markDirty(false);
      setStatus("out");
      setEmail(null);
      setReady(false);
    },
  };
}

const UserIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
);

/** Sign in with an emailed six-digit code, or show who is signed in. */
export function AccountPanel({ account, compact, onStart, startOpen }: {
  account: Account;
  /** The rail: no room for the form, so the button hands off to `onStart` and the signed-in line has no links. */
  compact?: boolean;
  /** Opens the Settings sheet; `true` to land on the email step. */
  onStart?: (signIn: boolean) => void;
  startOpen?: boolean;
}) {
  const [step, setStep] = useState<"idle" | "email" | "code">(startOpen ? "email" : "idle");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (account.status === "checking" || account.status === "off") return null;

  if (account.status === "in") {
    return (
      <div className="awx-account">
        {compact ? (
          <button type="button" className="awx-account-who" title={`Signed in as ${account.email}`} onClick={() => onStart?.(false)}>
            <UserIcon /><span>Syncing as <strong>{account.email}</strong></span>
          </button>
        ) : (
          <p className="awx-account-who"><UserIcon /><span>Places and settings sync to <strong>{account.email}</strong></span></p>
        )}
        {compact ? null : <div className="awx-account-links">
          <button type="button" className="awx-link-btn" onClick={() => { void account.signOut(); setStep("idle"); }}>Sign out</button>
          <button
            type="button"
            className="awx-link-btn awx-account-danger"
            onClick={() => {
              if (!window.confirm("Delete your AceWeather account? Places stay on this device but stop syncing.")) return;
              account.deleteAccount().catch((e: Error) => setError(e.message));
            }}
          >Delete account</button>
        </div>}
        {error ? <p className="awx-account-error" role="alert">{error}</p> : null}
      </div>
    );
  }

  if (step === "idle") {
    return (
      <div className="awx-account">
        <button type="button" className="awx-btn awx-btn-ghost awx-account-start" title="Sign in to sync" onClick={() => { if (onStart) onStart(true); else { setStep("email"); setError(null); } }}>
          <UserIcon /><span>Sign in to sync</span>
        </button>
      </div>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === "email") {
        await call("/account/code", "POST", { email });
        setCode("");
        setStep("code");
      } else {
        const res = await call("/account/verify", "POST", { email, code });
        account.signedIn(String(res.email), parseAccountData(res.data));
        setStep("idle");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="awx-account awx-account-form" onSubmit={submit}>
      {step === "email" ? (
        <>
          <label htmlFor="awx-account-email">Sign in to keep your places and settings on every device</label>
          <input id="awx-account-email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <button className="awx-btn awx-btn-primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Email me a code"}</button>
        </>
      ) : (
        <>
          <label htmlFor="awx-account-code">Enter the code sent to {email}</label>
          <input id="awx-account-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="123456" required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
          <button className="awx-btn awx-btn-primary" type="submit" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
        </>
      )}
      {error ? <p className="awx-account-error" role="alert">{error}</p> : null}
      <div className="awx-account-links">
        {step === "code" ? <button type="button" className="awx-link-btn" onClick={() => { setStep("email"); setError(null); }}>Use another email</button> : null}
        <button type="button" className="awx-link-btn" onClick={() => { setStep("idle"); setError(null); }}>Cancel</button>
      </div>
    </form>
  );
}
