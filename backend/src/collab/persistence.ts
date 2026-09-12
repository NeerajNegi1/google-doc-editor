import * as Y from "yjs";
import { Prisma } from "@prisma/client";
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from "y-prosemirror";
import { prisma } from "../lib/prismaClient";
import { COLLAB_FIELD, editorSchema } from "./schema";

const SAVE_DEBOUNCE_MS = 2000;
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

const emptyDoc = { type: "doc", content: [{ type: "paragraph" }] };

async function persistNow(docName: string, ydoc: Y.Doc): Promise<void> {
  const json = yDocToProsemirrorJSON(ydoc, COLLAB_FIELD);
  try {
    await prisma.document.update({ where: { id: docName }, data: { contentJson: json as object } });
  } catch (err) {
    // The document was deleted (or the seed script ran) while this room was
    // still live in memory — nothing more to do, so log a one-liner instead
    // of the full Prisma stack trace.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      console.warn(`[collab] document ${docName} no longer exists — dropping its pending save`);
      return;
    }
    console.error(`[collab] failed to save document ${docName}:`, err);
  }
}

function scheduleSave(docName: string, ydoc: Y.Doc): void {
  if (saveTimers.has(docName)) return;
  const timer = setTimeout(() => {
    saveTimers.delete(docName);
    void persistNow(docName, ydoc);
  }, SAVE_DEBOUNCE_MS);
  saveTimers.set(docName, timer);
}

/**
 * Called once by y-websocket when a document's room is first created —
 * seeds the shared Y.Doc from whatever is currently saved in Postgres, then
 * starts debounce-saving every subsequent update back to it.
 */
export async function bindState(docName: string, ydoc: Y.Doc): Promise<void> {
  const document = await prisma.document.findUnique({
    where: { id: docName },
    select: { contentJson: true },
  });
  const json = (document?.contentJson as object) ?? emptyDoc;

  const seeded = prosemirrorJSONToYDoc(editorSchema, json, COLLAB_FIELD);
  Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(seeded));
  seeded.destroy();

  ydoc.on("update", () => scheduleSave(docName, ydoc));
}

/**
 * Called once by y-websocket when the last connection to a room closes —
 * flushes any pending debounced save immediately so nothing is lost between
 * the last edit and the room being torn down.
 */
export async function writeState(docName: string, ydoc: Y.Doc): Promise<void> {
  const timer = saveTimers.get(docName);
  if (timer) {
    clearTimeout(timer);
    saveTimers.delete(docName);
  }
  await persistNow(docName, ydoc);
}
