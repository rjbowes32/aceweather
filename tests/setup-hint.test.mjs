import assert from "node:assert/strict";
import test from "node:test";
import { setupHintState, isIosSafari } from "../src/lib/aceweather/setup-hint.ts";

const base = { permission: "granted", standalone: true, canPromptInstall: false, isIosSafari: false, dismissed: false };
test("hidden when location granted and already installed", () => {
  assert.equal(setupHintState(base).show, false);
});
test("location part shows for prompt and denied only", () => {
  assert.equal(setupHintState({ ...base, permission: "prompt" }).location, "allow");
  assert.equal(setupHintState({ ...base, permission: "denied" }).location, "blocked");
  assert.equal(setupHintState({ ...base, permission: "granted" }).location, null);
  assert.equal(setupHintState({ ...base, permission: "unknown" }).location, null);
  assert.equal(setupHintState({ ...base, permission: "prompt" }).show, true);
});
test("install part hidden when standalone", () => {
  const s = setupHintState({ ...base, standalone: true, canPromptInstall: true, isIosSafari: true });
  assert.equal(s.install, "none");
  assert.equal(s.show, false);
});
test("install button when beforeinstallprompt fired, iOS text on Safari", () => {
  assert.equal(setupHintState({ ...base, standalone: false, canPromptInstall: true }).install, "button");
  assert.equal(setupHintState({ ...base, standalone: false, isIosSafari: true }).install, "ios");
  assert.equal(setupHintState({ ...base, standalone: false }).install, "none");
});
test("dismissed hides everything", () => {
  assert.equal(setupHintState({ ...base, permission: "prompt", standalone: false, canPromptInstall: true, dismissed: true }).show, false);
});
test("iOS Safari detection", () => {
  const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  assert.equal(isIosSafari(safari), true);
  assert.equal(isIosSafari(safari.replace("Version/18.0", "CriOS/130.0")), false);
  assert.equal(isIosSafari("Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36"), false);
});
