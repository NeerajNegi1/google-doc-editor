import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";

/**
 * Must mirror the frontend editor's extension list exactly — this is what
 * lets the server construct/read a Y.Doc's shared content as valid
 * ProseMirror JSON that matches what the client renders.
 */
export const editorExtensions = [StarterKit, Underline];
export const editorSchema = getSchema(editorExtensions);

/** Matches @tiptap/extension-collaboration's own default `field` option. */
export const COLLAB_FIELD = "default";
