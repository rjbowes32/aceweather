/* Device location: Capacitor native GPS in the iOS shell, navigator.geolocation on web. */

import { Capacitor } from "@capacitor/core";

export type DeviceCoords = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
};

export type GeolocationError = GeolocationPositionError | { code: number; message?: string };

function isNativePlatform(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

function toCoords(position: GeolocationPosition | import("@capacitor/geolocation").Position): DeviceCoords {
  const c = position.coords;
  return {
    latitude: c.latitude,
    longitude: c.longitude,
    altitude: Number.isFinite(c.altitude) ? c.altitude : null,
    accuracy: Number.isFinite(c.accuracy) ? c.accuracy : null,
  };
}

function browserGetCurrentPosition(
  enableHighAccuracy: boolean,
  timeoutMs: number,
  maximumAge: number,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(Object.assign(new Error("Geolocation unavailable"), { code: 2 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy,
      timeout: timeoutMs,
      maximumAge,
    });
  });
}

async function nativeGetCurrentPosition(
  enableHighAccuracy: boolean,
  timeoutMs: number,
  maximumAge: number,
): Promise<import("@capacitor/geolocation").Position> {
  const { Geolocation } = await import("@capacitor/geolocation");
  return Geolocation.getCurrentPosition({
    enableHighAccuracy,
    timeout: timeoutMs,
    maximumAge,
  });
}

export async function checkLocationPermission(): Promise<PermissionState | "unsupported"> {
  if (isNativePlatform()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    const status = await Geolocation.checkPermissions();
    if (status.location === "granted") return "granted";
    if (status.location === "denied") return "denied";
    return "prompt";
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) return "unsupported";
  if (!navigator.permissions?.query) return "prompt";
  try {
    const result = await navigator.permissions.query({ name: "geolocation" });
    return result.state;
  } catch {
    return "prompt";
  }
}

export async function requestLocationPermission(): Promise<PermissionState | "unsupported"> {
  if (isNativePlatform()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    const status = await Geolocation.requestPermissions();
    if (status.location === "granted") return "granted";
    if (status.location === "denied") return "denied";
    return "prompt";
  }
  const current = await checkLocationPermission();
  if (current === "granted" || current === "denied" || current === "unsupported") return current;
  try {
    await getDevicePosition({ enableHighAccuracy: false, timeoutMs: 12000, maximumAge: 600_000, skipPermissionRequest: true });
    return "granted";
  } catch (err) {
    const code = (err as GeolocationError)?.code;
    if (code === 1) return "denied";
    return "prompt";
  }
}

export type GetDevicePositionOptions = {
  enableHighAccuracy?: boolean;
  timeoutMs?: number;
  maximumAge?: number;
  /** When false, only checks permission — does not call requestPermissions on native. */
  skipPermissionRequest?: boolean;
};

export async function getDevicePosition(options: GetDevicePositionOptions = {}): Promise<DeviceCoords> {
  const enableHighAccuracy = options.enableHighAccuracy ?? true;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maximumAge = options.maximumAge ?? 60_000;

  if (!options.skipPermissionRequest) {
    const perm = await checkLocationPermission();
    if (perm === "denied") {
      throw Object.assign(new Error("Location permission denied"), { code: 1 });
    }
    if (perm === "prompt" || perm === "unsupported") {
      const requested = await requestLocationPermission();
      if (requested === "denied" || requested === "unsupported") {
        throw Object.assign(new Error("Location permission denied"), { code: 1 });
      }
    }
  }

  const readOnce = async (highAccuracy: boolean, maxAge: number) => {
    const position = isNativePlatform()
      ? await nativeGetCurrentPosition(highAccuracy, timeoutMs, maxAge)
      : await browserGetCurrentPosition(highAccuracy, timeoutMs, maxAge);
    return toCoords(position);
  };

  try {
    return await readOnce(enableHighAccuracy, maximumAge);
  } catch (first) {
    if (!enableHighAccuracy) throw first;
    return readOnce(false, Math.max(maximumAge, 5 * 60 * 1000));
  }
}

export type WatchDevicePositionOptions = {
  enableHighAccuracy?: boolean;
  timeoutMs?: number;
  maximumAge?: number;
};

export function watchDevicePosition(
  options: WatchDevicePositionOptions,
  onSuccess: (coords: DeviceCoords) => void,
  onError: (error: GeolocationError) => void,
): () => void {
  const enableHighAccuracy = options.enableHighAccuracy ?? true;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maximumAge = options.maximumAge ?? 60_000;

  if (isNativePlatform()) {
    let watchId: string | null = null;
    let cancelled = false;
    void (async () => {
      const { Geolocation } = await import("@capacitor/geolocation");
      if (cancelled) return;
      watchId = await Geolocation.watchPosition(
        { enableHighAccuracy, timeout: timeoutMs, maximumAge },
        (position, err) => {
          if (err) {
            onError(err as GeolocationError);
            return;
          }
          if (position) onSuccess(toCoords(position));
        },
      );
    })();
    return () => {
      cancelled = true;
      if (watchId != null) {
        void import("@capacitor/geolocation").then(({ Geolocation }) => Geolocation.clearWatch({ id: watchId! }));
      }
    };
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onError(Object.assign(new Error("Geolocation unavailable"), { code: 2 }));
    return () => {};
  }
  const watchId = navigator.geolocation.watchPosition(
    (position) => onSuccess(toCoords(position)),
    (err) => onError(err),
    { enableHighAccuracy, timeout: timeoutMs, maximumAge },
  );
  return () => navigator.geolocation.clearWatch(watchId);
}
