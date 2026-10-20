/**
 * Non-serializable request bookkeeping: in-flight deduplication and abort
 * controllers live here, outside the reducer state.
 */
const inflight = new Map<string, Promise<unknown>>();
const controllers = new Map<string, AbortController>();

export function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = run().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Abort any previous request registered under `scope` and return a fresh signal. */
export function takeController(scope: string): AbortController {
  controllers.get(scope)?.abort();
  const c = new AbortController();
  controllers.set(scope, c);
  return c;
}

export function releaseController(scope: string, controller: AbortController): void {
  if (controllers.get(scope) === controller) controllers.delete(scope);
}

let counter = 0;
export function newRequestId(prefix = 'req'): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException ? e.name === 'AbortError' : (e as { name?: string })?.name === 'AbortError';
}
