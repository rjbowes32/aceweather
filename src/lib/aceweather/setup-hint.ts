export const SETUP_HINT_DISMISS_KEY = "awx-setup-hint-dismissed";

export type LocationPermission = "granted" | "prompt" | "denied" | "unknown";
export type InstallMode = "button" | "ios" | "none";

export type SetupHintInput = {
  permission: LocationPermission;
  standalone: boolean;
  canPromptInstall: boolean;
  isIosSafari: boolean;
  dismissed: boolean;
};

export type SetupHintState = {
  show: boolean;
  location: "allow" | "blocked" | null;
  install: InstallMode;
};

/** Decides what the setup hint shows. Pure so it can be tested without a browser. */
export function setupHintState(input: SetupHintInput): SetupHintState {
  const location = input.permission === "prompt" ? "allow" : input.permission === "denied" ? "blocked" : null;
  const install: InstallMode = input.standalone
    ? "none"
    : input.canPromptInstall ? "button" : input.isIosSafari ? "ios" : "none";
  const show = !input.dismissed && (location !== null || install !== "none");
  return { show, location, install };
}

export function isIosSafari(userAgent: string, maxTouchPoints = 0): boolean {
  const ios = /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(userAgent);
  return ios && !otherBrowser && /Safari/.test(userAgent);
}
