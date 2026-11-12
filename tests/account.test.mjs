import assert from "node:assert/strict";
import test from "node:test";
import { accountId, hashCode, newCode, normaliseEmail, readSession, sameHash, signSession } from "../src/lib/account/session.ts";
import { mergePlaces, parseAccountData } from "../src/lib/account/data.ts";

const SECRET = "x".repeat(40);

test("emails are trimmed, lower-cased and checked", () => {
  assert.equal(normaliseEmail("  Rob@Example.COM "), "rob@example.com");
  assert.equal(normaliseEmail("not-an-email"), null);
  assert.equal(normaliseEmail(42), null);
  assert.equal(accountId("rob@example.com"), accountId(normaliseEmail("ROB@example.com")));
});

test("codes are six digits", () => {
  for (let i = 0; i < 50; i++) assert.match(newCode(), /^\d{6}$/);
  assert.ok(sameHash(hashCode(SECRET, "a@b.co", "123456"), hashCode(SECRET, "a@b.co", "123456")));
  assert.ok(!sameHash(hashCode(SECRET, "a@b.co", "123456"), hashCode(SECRET, "a@b.co", "123457")));
});

test("sessions round-trip, and reject tampering, another secret and expiry", () => {
  const now = Date.now();
  const token = signSession(SECRET, { uid: "u1", email: "a@b.co", exp: now + 1000 });
  assert.deepEqual(readSession(SECRET, token, now), { uid: "u1", email: "a@b.co", exp: now + 1000 });
  assert.equal(readSession("y".repeat(40), token, now), null);
  assert.equal(readSession(SECRET, token, now + 2000), null);
  const [body, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ uid: "u2", email: "a@b.co", exp: now + 1000 })).toString("base64url");
  assert.equal(readSession(SECRET, `${forged}.${sig}`, now), null);
  assert.equal(readSession(SECRET, body, now), null);
  assert.equal(readSession(SECRET, undefined, now), null);
});

test("synced data keeps valid places and settings only", () => {
  const data = parseAccountData({
    saved: [{ name: "Ely", lat: 52.4, lon: 0.26 }, { name: "bad", lat: "x" }],
    prefs: { theme: "light", unit: "k", windUnit: "mph" },
  });
  assert.equal(data.saved.length, 1);
  assert.deepEqual(data.prefs, { theme: "light", windUnit: "mph" });
  assert.equal(data.updatedAt, null);
});

test("first sign-in puts the account's places first and adds this device's new ones", () => {
  const place = (name, lat) => ({ name, region: "", country: "", lat, lon: 0, elev: null, tz: "auto" });
  const merged = mergePlaces([place("A", 1), place("B", 2)], [place("B", 2), place("C", 3)]);
  assert.deepEqual(merged.map((p) => p.name), ["A", "B", "C"]);
  const many = Array.from({ length: 30 }, (_, i) => place(`P${i}`, i + 10));
  assert.equal(mergePlaces(many.slice(0, 20), many.slice(20)).length, 24);
});
