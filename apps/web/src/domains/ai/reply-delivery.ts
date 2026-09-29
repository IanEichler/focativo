/** Serializes presence calls so a late "typing" cannot arrive after "stop". */
export async function startTypingPresence(update: (typing: boolean) => Promise<void>) {
  let stopped = false;
  let inFlight: Promise<void> | null = null;
  const pulse = async () => {
    if (stopped) return;
    if (!inFlight) {
      inFlight = Promise.resolve()
        .then(() => update(true))
        .catch(() => {})
        .finally(() => {
          inFlight = null;
        });
    }
    await inFlight;
  };
  await pulse();
  const timer = setInterval(() => {
    void pulse();
  }, 8000);
  return {
    pulse,
    async stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      await inFlight;
      await update(false).catch(() => {});
    },
  };
}

/** Small, bounded pause between separate ideas, with presence refreshed after each send. */
export function replyPauseMs(text: string): number {
  return Math.min(1600, Math.max(650, text.length * 8));
}
