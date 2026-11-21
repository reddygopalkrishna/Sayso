/** The parts of Electron's `app` used here, so tests can pass a fake. */
export interface InstanceLock {
  requestSingleInstanceLock(): boolean;
  onSecondInstance(listener: () => void): void;
}

export interface ClaimOptions {
  /**
   * Dev builds: a newly started copy replaces the running one (it has the latest code), so the
   * running copy quits when another starts, and the new one waits for the lock.
   * Packaged builds: the running copy stays and is brought forward.
   */
  newestWins: boolean;
  /** Called in the running copy when another copy starts (and newestWins is false). */
  onSecondInstance: () => void;
  /** Called in the running copy when a newer copy starts and newestWins is true. */
  onReplaced: () => void;
  timeoutMs?: number;
  pollMs?: number;
}

/**
 * Makes sure only one Sayso runs. Two copies would both hear Fn and both paste every dictation.
 * Resolves true when this process may run, false when it must quit.
 */
export async function claimSingleInstance(
  lock: InstanceLock,
  opts: ClaimOptions,
): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const pollMs = opts.pollMs ?? 250;
  let held = lock.requestSingleInstanceLock();
  if (!held && opts.newestWins) {
    // The running copy got a 'second-instance' event and is quitting; wait for its lock.
    const deadline = Date.now() + timeoutMs;
    while (!held && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      held = lock.requestSingleInstanceLock();
    }
  }
  if (!held) return false;
  lock.onSecondInstance(() => (opts.newestWins ? opts.onReplaced() : opts.onSecondInstance()));
  return true;
}
