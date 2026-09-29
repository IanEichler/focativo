/** Coalesces quick messages and prevents overlapping replies within this app process. */
export function createTurnQueue(delayMs = 900) {
  const conversations = new Map<string, { version: number; tail: Promise<void> }>();
  return (conversationId: string, work: (isCurrent: () => boolean) => Promise<void>): Promise<void> => {
    const state = conversations.get(conversationId) ?? { version: 0, tail: Promise.resolve() };
    conversations.set(conversationId, state);
    const version = ++state.version;
    const current = () => state.version === version;
    const turn = state.tail
      .catch(() => {})
      .then(async () => {
        if (!current()) return;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (current()) await work(current);
      });
    state.tail = turn;
    return turn.finally(() => {
      if (current() && conversations.get(conversationId) === state) conversations.delete(conversationId);
    });
  };
}
