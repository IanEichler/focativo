import { afterEach, expect, it, vi } from "vitest";
import { startTypingPresence } from "./reply-delivery";
import { createTurnQueue } from "./turn-queue";

afterEach(() => vi.useRealTimers());

it("refreshes typing during work and clears it once on completion", async () => {
  vi.useFakeTimers();
  const update = vi.fn().mockResolvedValue(undefined);
  const presence = await startTypingPresence(update);
  await vi.advanceTimersByTimeAsync(17000);
  await presence.stop();
  await presence.stop();
  await vi.advanceTimersByTimeAsync(30000);
  expect(update.mock.calls.map(([typing]) => typing)).toEqual([true, true, true, false]);
});

it("a failed presence request never blocks the reply", async () => {
  const update = vi.fn().mockRejectedValue(new Error("offline"));
  const presence = await startTypingPresence(update);
  await expect(presence.pulse()).resolves.toBeUndefined();
  await expect(presence.stop()).resolves.toBeUndefined();
});

it("waits for an in-flight refresh before clearing presence", async () => {
  let release!: () => void;
  const calls: boolean[] = [];
  const update = vi.fn(async (typing: boolean) => {
    calls.push(typing);
  });
  const presence = await startTypingPresence(update);
  update.mockImplementationOnce(async (typing) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    calls.push(typing);
  });
  const pulse = presence.pulse();
  await Promise.resolve();
  const stop = presence.stop();
  release();
  await Promise.all([pulse, stop]);
  expect(calls).toEqual([true, true, false]);
});

it("coalesces quick inbound messages and prevents overlapping turns", async () => {
  vi.useFakeTimers();
  const queue = createTurnQueue();
  const first = vi.fn();
  const second = vi.fn().mockResolvedValue(undefined);
  const a = queue("conversation", first);
  const b = queue("conversation", second);
  await vi.runAllTimersAsync();
  await Promise.all([a, b]);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
});

it("invalidates an older answer while waiting for its cleanup before the next turn", async () => {
  vi.useFakeTimers();
  const queue = createTurnQueue();
  let release!: () => void;
  let current!: () => boolean;
  const first = queue("conversation", async (isCurrent) => {
    current = isCurrent;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  await vi.advanceTimersByTimeAsync(900);
  const work = vi.fn().mockResolvedValue(undefined);
  const second = queue("conversation", work);
  expect(current()).toBe(false);
  expect(work).not.toHaveBeenCalled();
  release();
  await vi.runAllTimersAsync();
  await Promise.all([first, second]);
  expect(work).toHaveBeenCalledOnce();
});
