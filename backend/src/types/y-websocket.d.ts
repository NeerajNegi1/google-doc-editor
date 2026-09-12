declare module "y-websocket/bin/utils" {
  import type { IncomingMessage } from "http";
  import type { Doc as YDoc } from "yjs";
  import type WebSocket from "ws";

  export function setupWSConnection(
    conn: WebSocket,
    req: IncomingMessage,
    opts?: { docName?: string; gc?: boolean }
  ): void;

  export function setPersistence(persistence: {
    bindState: (docName: string, ydoc: YDoc) => Promise<void> | void;
    writeState: (docName: string, ydoc: YDoc) => Promise<void>;
  } | null): void;

  export const docs: Map<string, YDoc>;
}
