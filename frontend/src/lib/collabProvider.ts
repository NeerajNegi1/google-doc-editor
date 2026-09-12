import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:4000";

type Entry = { ydoc: Y.Doc; provider: WebsocketProvider };

const cache = new Map<string, Entry>();
const pendingTeardown = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * React 18 StrictMode double-invokes effects in dev: mount -> cleanup -> mount,
 * synchronously. A naive "create in effect, destroy in cleanup" pattern would
 * create two independent Y.Doc/WebsocketProvider pairs back-to-back — each
 * gets its own random Yjs client id, so if the first pair's WebSocket close
 * doesn't reach the server before the second connects, both show up as
 * separate "participants" server-side and never get cleaned up promptly.
 *
 * Caching by document id and delaying teardown by one tick — cancelled if
 * the same document is re-acquired before the tick fires — collapses
 * StrictMode's phantom remount into a no-op while still tearing down
 * normally on a real unmount (navigating away, switching documents).
 */
export function acquireCollabSession(documentId: string): Entry {
  const pending = pendingTeardown.get(documentId);
  if (pending) {
    clearTimeout(pending);
    pendingTeardown.delete(documentId);
  }

  let entry = cache.get(documentId);
  if (!entry) {
    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(WS_URL, `collab/${documentId}`, ydoc);
    entry = { ydoc, provider };
    cache.set(documentId, entry);
  }
  return entry;
}

export function releaseCollabSession(documentId: string): void {
  const timer = setTimeout(() => {
    pendingTeardown.delete(documentId);
    const entry = cache.get(documentId);
    if (!entry) return;
    entry.provider.destroy();
    entry.ydoc.destroy();
    cache.delete(documentId);
  }, 0);
  pendingTeardown.set(documentId, timer);
}
