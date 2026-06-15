class SuspensionScheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  schedule(discordId: string, ends: Date, onExpiry: () => Promise<void>): void {
    this.cancel(discordId);
    const delay = Math.max(0, ends.getTime() - Date.now());
    const timer = setTimeout(() => {
      this.timers.delete(discordId);
      void onExpiry().catch((err: unknown) =>
        console.error(`[Scheduler] Expiry failed for ${discordId}:`, err),
      );
    }, delay);
    this.timers.set(discordId, timer);
  }

  cancel(discordId: string): void {
    const timer = this.timers.get(discordId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(discordId);
    }
  }

  reschedule(discordId: string, newEnds: Date, onExpiry: () => Promise<void>): void {
    this.schedule(discordId, newEnds, onExpiry);
  }
}

export const suspensionScheduler = new SuspensionScheduler();
