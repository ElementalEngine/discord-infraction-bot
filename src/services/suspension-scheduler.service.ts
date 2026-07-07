const MAX_CHUNK_MS = 24 * 24 * 60 * 60 * 1000; // 24 days, safely under the 32-bit signed integer limit for setTimeout

class SuspensionScheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  schedule(discordId: string, ends: Date, onExpiry: () => Promise<void>): void {
    this.cancel(discordId);
    this.arm(discordId, ends, onExpiry);
  }

  private arm(discordId: string, ends: Date, onExpiry: () => Promise<void>): void {
    const remaining = ends.getTime() - Date.now();
    if (remaining > MAX_CHUNK_MS) {
      const timer = setTimeout(() => this.arm(discordId, ends, onExpiry), MAX_CHUNK_MS);
      this.timers.set(discordId, timer);
      return;
    }
    const timer = setTimeout(() => {
      this.timers.delete(discordId);
      void onExpiry().catch((err: unknown) =>
        console.error(`[Scheduler] Expiry failed for ${discordId}:`, err),
      );
    }, Math.max(0, remaining));
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
