import type { Client } from "whatsapp-web.js";

/** Await the underlying bridge: Chat.sendStateTyping in 1.34 returns before it settles. */
export async function sendTypingState(
  client: Pick<Client, "sendPresenceAvailable" | "pupPage">,
  chatId: string,
  typing: boolean,
) {
  if (typing) await client.sendPresenceAvailable();
  if (!client.pupPage) throw new Error("typing_page_unavailable");
  await client.pupPage.evaluate(
    async ({ target, state }) => {
      const bridge = (
        globalThis as unknown as {
          WWebJS?: { sendChatstate(state: string, target: string): Promise<unknown> };
        }
      ).WWebJS;
      if (!bridge) throw new Error("typing_bridge_unavailable");
      await bridge.sendChatstate(state, target);
    },
    { target: chatId, state: typing ? "typing" : "stop" },
  );
}
