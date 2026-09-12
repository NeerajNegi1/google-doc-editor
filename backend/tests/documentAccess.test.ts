import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/prismaClient", () => ({
  prisma: {
    document: { findUnique: vi.fn() },
    documentShare: { findUnique: vi.fn() },
  },
}));

import { prisma } from "../src/lib/prismaClient";
import { canEdit, canView, resolveDocumentAccess } from "../src/lib/documentAccess";

const findDocument = prisma.document.findUnique as ReturnType<typeof vi.fn>;
const findShare = prisma.documentShare.findUnique as ReturnType<typeof vi.fn>;

describe("resolveDocumentAccess", () => {
  beforeEach(() => {
    findDocument.mockReset();
    findShare.mockReset();
  });

  it("returns null when the document does not exist", async () => {
    findDocument.mockResolvedValue(null);

    const access = await resolveDocumentAccess("missing-doc", "user-1");

    expect(access).toBeNull();
    expect(findShare).not.toHaveBeenCalled();
  });

  it("returns OWNER for the document's owner without consulting shares", async () => {
    findDocument.mockResolvedValue({ ownerId: "user-1" });

    const access = await resolveDocumentAccess("doc-1", "user-1");

    expect(access).toBe("OWNER");
    expect(findShare).not.toHaveBeenCalled();
  });

  it("returns null for a non-owner with no share row — access never falls back to a guess", async () => {
    findDocument.mockResolvedValue({ ownerId: "owner" });
    findShare.mockResolvedValue(null);

    const access = await resolveDocumentAccess("doc-1", "stranger");

    expect(access).toBeNull();
  });

  it("returns VIEW for a collaborator shared with VIEW permission", async () => {
    findDocument.mockResolvedValue({ ownerId: "owner" });
    findShare.mockResolvedValue({ permission: "VIEW" });

    const access = await resolveDocumentAccess("doc-1", "viewer");

    expect(access).toBe("VIEW");
  });

  it("returns EDIT for a collaborator shared with EDIT permission", async () => {
    findDocument.mockResolvedValue({ ownerId: "owner" });
    findShare.mockResolvedValue({ permission: "EDIT" });

    const access = await resolveDocumentAccess("doc-1", "editor");

    expect(access).toBe("EDIT");
  });
});

describe("canEdit", () => {
  it("is true only for OWNER and EDIT", () => {
    expect(canEdit("OWNER")).toBe(true);
    expect(canEdit("EDIT")).toBe(true);
    expect(canEdit("VIEW")).toBe(false);
    expect(canEdit(null)).toBe(false);
  });
});

describe("canView", () => {
  it("is true for any non-null access level, false when access is null", () => {
    expect(canView("OWNER")).toBe(true);
    expect(canView("EDIT")).toBe(true);
    expect(canView("VIEW")).toBe(true);
    expect(canView(null)).toBe(false);
  });
});
