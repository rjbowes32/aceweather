/** Bump when the installed icon artwork changes. iOS caches apple-touch-icon by URL. */
export const ICON_REV = "2";

export function iconUrl(path: string): string {
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}v=${ICON_REV}`;
}
