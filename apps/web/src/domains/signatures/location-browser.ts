import type { SignatureLocation } from "./location";

/** One permission-based sample per signing attempt; no background tracking. */
export function captureSigningLocation(): Promise<SignatureLocation> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve({ status: "unsupported" });
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: SignatureLocation) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    // Some browsers leave their permission prompt open beyond the API timeout.
    const timer = setTimeout(() => finish({ status: "timeout" }), 12000);
    try {
      navigator.geolocation.getCurrentPosition(position => {
        const { latitude, longitude, accuracy } = position.coords;
        if (![latitude, longitude, accuracy, position.timestamp].every(Number.isFinite) ||
            Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0) {
          finish({ status: "unavailable" }); return;
        }
        finish({ status: "captured", source: "browser_geolocation", latitude, longitude,
          accuracyMeters: accuracy, capturedAt: new Date(position.timestamp).toISOString() });
      }, error => finish({ status: error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable" }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    } catch { finish({ status: "unavailable" }); }
  });
}
