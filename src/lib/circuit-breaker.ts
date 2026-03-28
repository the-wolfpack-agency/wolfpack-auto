/**
 * Circuit Breaker for database connections.
 *
 * Prevents cascading failures by detecting repeated DB errors and
 * short-circuiting queries for a cooldown period.
 *
 * States:
 *   CLOSED    — normal operation, queries go through
 *   OPEN      — DB is failing, skip queries and return shadow data
 *   HALF_OPEN — cooldown expired, test one query to see if DB recovered
 */

export type CircuitBreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit. */
  failureThreshold: number;
  /** How long (ms) to stay OPEN before testing recovery. */
  cooldownMs: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  cooldownMs: 30_000, // 30 seconds
};

class CircuitBreaker {
  private state: CircuitBreakerState = "CLOSED";
  private consecutiveFailures = 0;
  private openedAt: number | null = null;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Current circuit state. */
  getState(): CircuitBreakerState {
    // Check if OPEN has expired → transition to HALF_OPEN
    if (this.state === "OPEN" && this.openedAt !== null) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.config.cooldownMs) {
        this.transition("HALF_OPEN");
      }
    }
    return this.state;
  }

  /** Whether queries should be skipped (OPEN state). */
  isOpen(): boolean {
    return this.getState() === "OPEN";
  }

  /** Record a successful DB query. Resets failure count and closes circuit. */
  recordSuccess(): void {
    if (this.state !== "CLOSED") {
      this.transition("CLOSED");
    }
    this.consecutiveFailures = 0;
    this.openedAt = null;
  }

  /** Record a failed DB query. Opens circuit after threshold reached. */
  recordFailure(): void {
    this.consecutiveFailures += 1;

    if (this.state === "HALF_OPEN") {
      // Recovery probe failed — back to OPEN
      this.openedAt = Date.now();
      this.transition("OPEN");
      return;
    }

    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.openedAt = Date.now();
      this.transition("OPEN");
    }
  }

  /** How many consecutive failures have occurred. */
  getFailureCount(): number {
    return this.consecutiveFailures;
  }

  /** Time (ms) remaining before the circuit tries recovery, or 0. */
  getCooldownRemaining(): number {
    if (this.state !== "OPEN" || this.openedAt === null) return 0;
    const remaining = this.config.cooldownMs - (Date.now() - this.openedAt);
    return Math.max(0, remaining);
  }

  /** Reset to initial state (for testing). */
  reset(): void {
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.openedAt = null;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private transition(to: CircuitBreakerState): void {
    const from = this.state;
    if (from === to) return;
    this.state = to;
    console.log(`[circuit-breaker] ${from} → ${to}`);

    // Fire-and-forget analytics tracking
    this.trackTransition(from, to).catch(() => {
      /* analytics must not break the circuit breaker */
    });
  }

  private async trackTransition(
    from: CircuitBreakerState,
    to: CircuitBreakerState,
  ): Promise<void> {
    try {
      const { trackSystem } = await import("@/lib/analytics-hooks");
      if (to === "OPEN") {
        trackSystem("system.circuit_breaker_opened", "system", {
          from,
          to,
          failures: this.consecutiveFailures,
        });
      } else if (to === "CLOSED") {
        trackSystem("system.circuit_breaker_closed", "system", {
          from,
          to,
          failures: this.consecutiveFailures,
        });
      }
    } catch {
      /* analytics import may not be available — ignore */
    }
  }
}

/** Singleton circuit breaker for the database pool. */
const globalForCB = globalThis as unknown as { __circuitBreaker?: CircuitBreaker };

if (!globalForCB.__circuitBreaker) {
  globalForCB.__circuitBreaker = new CircuitBreaker();
}

export const circuitBreaker: CircuitBreaker = globalForCB.__circuitBreaker;

export default CircuitBreaker;
