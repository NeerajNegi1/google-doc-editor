type TiptapNode = Record<string, unknown>;

/**
 * Bold/italic only — the small inline set our editor's toolbar actually
 * exposes, so imported formatting never shows a mark the UI can't toggle.
 */
function parseInline(text: string): TiptapNode[] {
  if (!text) return [];

  const pattern = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(_([^_]+)_)/g;
  const tokens: TiptapNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    if (match[1]) tokens.push({ type: "text", text: match[2], marks: [{ type: "bold" }] });
    else if (match[3]) tokens.push({ type: "text", text: match[4], marks: [{ type: "italic" }] });
    else if (match[5]) tokens.push({ type: "text", text: match[6], marks: [{ type: "italic" }] });
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) tokens.push({ type: "text", text: text.slice(lastIndex) });

  return tokens;
}

function paragraph(text: string, inline: boolean): TiptapNode {
  return { type: "paragraph", content: text ? (inline ? parseInline(text) : [{ type: "text", text }]) : [] };
}

/**
 * Line-based block parser shared by both formats. `markdown` toggles
 * heading/list/emphasis syntax; plain text just becomes one paragraph per
 * non-blank line, with nothing in it interpreted as markup.
 */
function convert(source: string, markdown: boolean): TiptapNode {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const content: TiptapNode[] = [];

  let paraBuffer: string[] = [];
  let listBuffer: { type: "bulletList" | "orderedList"; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paraBuffer.length) {
      content.push(paragraph(paraBuffer.join(" "), markdown));
      paraBuffer = [];
    }
  };

  const flushList = () => {
    if (listBuffer) {
      content.push({
        type: listBuffer.type,
        content: listBuffer.items.map((item) => ({
          type: "listItem",
          content: [paragraph(item, markdown)],
        })),
      });
      listBuffer = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = markdown ? line.match(/^(#{1,6})\s+(.*)$/) : null;
    if (headingMatch) {
      flushParagraph();
      flushList();
      content.push({
        type: "heading",
        attrs: { level: headingMatch[1].length },
        content: parseInline(headingMatch[2]),
      });
      continue;
    }

    const bulletMatch = markdown ? line.match(/^[-*+]\s+(.*)$/) : null;
    if (bulletMatch) {
      flushParagraph();
      if (listBuffer && listBuffer.type !== "bulletList") flushList();
      if (!listBuffer) listBuffer = { type: "bulletList", items: [] };
      listBuffer.items.push(bulletMatch[1]);
      continue;
    }

    const orderedMatch = markdown ? line.match(/^\d+[.)]\s+(.*)$/) : null;
    if (orderedMatch) {
      flushParagraph();
      if (listBuffer && listBuffer.type !== "orderedList") flushList();
      if (!listBuffer) listBuffer = { type: "orderedList", items: [] };
      listBuffer.items.push(orderedMatch[1]);
      continue;
    }

    flushList();
    if (!markdown) {
      content.push(paragraph(line, false));
      continue;
    }
    paraBuffer.push(line.trim());
  }

  flushParagraph();
  flushList();

  if (content.length === 0) content.push({ type: "paragraph", content: [] });

  return { type: "doc", content };
}

export function markdownToTiptap(source: string): TiptapNode {
  return convert(source, true);
}

export function plainTextToTiptap(source: string): TiptapNode {
  return convert(source, false);
}
