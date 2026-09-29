import assert from "node:assert/strict";
import { test } from "node:test";
import { sendTypingState } from "./typing";

test("announces presence and awaits chat state delivery using the original LID", async () => {
  const calls: string[] = [];
  const globals = globalThis as unknown as { WWebJS?: unknown };
  globals.WWebJS = {
    sendChatstate: async (state: string, target: string) => {
      await Promise.resolve();
      calls.push(`${state}:${target}`);
    },
  };
  const client = {
    sendPresenceAvailable: async () => {
      calls.push("online");
    },
    pupPage: { evaluate: async (fn: (args: unknown) => Promise<void>, args: unknown) => fn(args) },
  } as unknown as Parameters<typeof sendTypingState>[0];
  try {
    await sendTypingState(client, "123456789@lid", true);
    await sendTypingState(client, "123456789@lid", false);
    assert.deepEqual(calls, ["online", "typing:123456789@lid", "stop:123456789@lid"]);
  } finally {
    delete globals.WWebJS;
  }
});

test("does not report success when the WhatsApp bridge rejects typing", async () => {
  const globals = globalThis as unknown as { WWebJS?: unknown };
  globals.WWebJS = {
    sendChatstate: async () => {
      throw new Error("bridge failure");
    },
  };
  const client = {
    sendPresenceAvailable: async () => {},
    pupPage: { evaluate: async (fn: (args: unknown) => Promise<void>, args: unknown) => fn(args) },
  } as unknown as Parameters<typeof sendTypingState>[0];
  try {
    await assert.rejects(sendTypingState(client, "123456789@lid", true), /bridge failure/);
  } finally {
    delete globals.WWebJS;
  }
});
