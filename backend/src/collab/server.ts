import type { Server as HttpServer } from "http";
import { WebSocketServer } from "ws";
import { setPersistence, setupWSConnection } from "y-websocket/bin/utils";
import { userIdFromCookieHeader } from "../lib/session";
import { canEdit, resolveDocumentAccess } from "../lib/documentAccess";
import { bindState, writeState } from "./persistence";

setPersistence({ bindState, writeState });

/**
 * Live collaboration is intentionally only for people who can already edit
 * the document (OWNER or EDIT share) — a view-only collaborator never opens
 * a socket at all, so there's no separate "read-only over Yjs" mode to get
 * wrong. Rejected connections get a real HTTP status before the WebSocket
 * handshake completes, not a silently-dropped socket.
 */
export function attachCollabServer(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    void (async () => {
      const url = new URL(req.url ?? "", "http://localhost");
      const match = url.pathname.match(/^\/collab\/([^/]+)$/);
      if (!match) {
        socket.destroy();
        return;
      }
      const documentId = decodeURIComponent(match[1]);

      const userId = userIdFromCookieHeader(req.headers.cookie);
      if (!userId) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      const access = await resolveDocumentAccess(documentId, userId);
      if (!canEdit(access)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        setupWSConnection(ws, req, { docName: documentId });
      });
    })().catch((err) => {
      console.error("[collab] upgrade handling failed:", err);
      socket.destroy();
    });
  });
}
