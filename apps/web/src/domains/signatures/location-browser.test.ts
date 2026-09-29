import { afterEach, expect, it, vi } from "vitest";
import { captureSigningLocation } from "./location-browser";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("takes one fresh permitted sample with accuracy and timestamp", async () => {
  const getCurrentPosition = vi.fn(success => success({ coords: { latitude: -15.6, longitude: -56.1, accuracy: 25 }, timestamp: Date.parse("2026-09-29T20:00:00.000Z") }));
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
  expect(await captureSigningLocation()).toEqual({ status: "captured", source: "browser_geolocation", latitude: -15.6, longitude: -56.1, accuracyMeters: 25, capturedAt: "2026-09-29T20:00:00.000Z" });
  expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  expect(getCurrentPosition.mock.calls[0]).toEqual([expect.any(Function), expect.any(Function), { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }]);
});

it.each([[1, "denied"], [2, "unavailable"], [3, "timeout"]])("records browser failure %s without inventing coordinates", async (code, status) => {
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: (_success: unknown, failure: (e: { code: number }) => void) => failure({ code: Number(code) }) } });
  expect(await captureSigningLocation()).toEqual({ status });
});

it("handles unavailable APIs and permission prompts that never resolve", async () => {
  vi.stubGlobal("navigator", {});
  expect(await captureSigningLocation()).toEqual({ status: "unsupported" });
  vi.useFakeTimers();
  let lateSuccess: PositionCallback | undefined;
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: (success: PositionCallback) => { lateSuccess = success; } } });
  const pending = captureSigningLocation();
  await vi.advanceTimersByTimeAsync(12000);
  expect(await pending).toEqual({ status: "timeout" });
  lateSuccess?.({ coords: { latitude: 1, longitude: 2, accuracy: 3 }, timestamp: Date.now() } as GeolocationPosition);
  expect(await pending).toEqual({ status: "timeout" });
});
