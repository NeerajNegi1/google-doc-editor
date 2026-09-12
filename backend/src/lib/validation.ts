import { z } from "zod";

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
});

/**
 * Loose on purpose — we don't want to hard-couple the backend to Tiptap's
 * exact node schema — but rejecting anything that isn't at least a
 * `{ type: "doc", content: [...] }` object catches the obvious cases of a
 * client sending garbage (or nothing) into a document's saved content.
 */
const tiptapDocSchema = z
  .object({
    type: z.literal("doc"),
    content: z.array(z.record(z.unknown())),
  })
  .passthrough();

export const updateDocumentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200).optional(),
  contentJson: tiptapDocSchema.optional(),
});

export const shareDocumentSchema = z.object({
  email: z.string().trim().email("A valid email is required"),
  permission: z.enum(["VIEW", "EDIT"]),
});

export const loginSchema = z.object({
  email: z.string().trim().email("A valid email is required"),
});
