import { describe, expect, it } from "vitest";
import { markdownToTiptap, plainTextToTiptap } from "../src/lib/markdownToTiptap";

type AnyNode = Record<string, any>;

describe("markdownToTiptap", () => {
  it("converts a # heading to a level-1 heading node", () => {
    const doc = markdownToTiptap("# Title") as AnyNode;
    expect(doc.content[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
  });

  it("converts **bold** and *italic* to marked text runs", () => {
    const doc = markdownToTiptap("This is **bold** and *italic*.") as AnyNode;
    const runs: AnyNode[] = doc.content[0].content;

    const bold = runs.find((r) => r.marks?.[0]?.type === "bold");
    const italic = runs.find((r) => r.marks?.[0]?.type === "italic");

    expect(bold?.text).toBe("bold");
    expect(italic?.text).toBe("italic");
  });

  it("groups consecutive '- ' lines into one bulletList", () => {
    const doc = markdownToTiptap("- one\n- two") as AnyNode;
    expect(doc.content[0].type).toBe("bulletList");
    expect(doc.content[0].content).toHaveLength(2);
  });

  it("groups consecutive '1. ' lines into one orderedList", () => {
    const doc = markdownToTiptap("1. one\n2. two") as AnyNode;
    expect(doc.content[0].type).toBe("orderedList");
    expect(doc.content[0].content).toHaveLength(2);
  });

  it("falls back to a single empty paragraph for empty input", () => {
    const doc = markdownToTiptap("") as AnyNode;
    expect(doc.content).toEqual([{ type: "paragraph", content: [] }]);
  });
});

describe("plainTextToTiptap", () => {
  it("does not interpret markdown syntax", () => {
    const doc = plainTextToTiptap("# Not a heading\n**not bold**") as AnyNode;
    expect(doc.content[0].type).toBe("paragraph");
    expect(doc.content[0].content[0].text).toBe("# Not a heading");
    expect(doc.content[0].content[0].marks).toBeUndefined();
  });

  it("turns each non-blank line into its own paragraph", () => {
    const doc = plainTextToTiptap("line one\n\nline two") as AnyNode;
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0].content[0].text).toBe("line one");
    expect(doc.content[1].content[0].text).toBe("line two");
  });
});
