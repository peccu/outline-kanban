// Convert rich HTML (from the clipboard when copying web pages or rendered
// Markdown) into Markdown, so pasting preserves links, headings, lists and
// tables instead of collapsing to plain text. Used by the paste handler in
// `attachments.ts`. The reverse direction (Markdown → HTML) lives in
// `markdown.ts`.

import DOMPurify from "dompurify";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

let service: TurndownService | null = null;

function getService(): TurndownService {
  if (service) return service;
  const td = new TurndownService({
    headingStyle: "atx", // # Heading rather than underline style
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    strongDelimiter: "**",
    hr: "---",
    linkStyle: "inlined",
  });
  // Tables, strikethrough and task lists (GitHub-flavoured Markdown).
  td.use(gfm);
  service = td;
  return td;
}

// True when the clipboard HTML carries structure worth converting. Plain-text
// copies sometimes still ship a trivial `text/html` (a bare wrapper around the
// text); converting those adds no value and risks mangling, so we let the
// browser's default plain-text paste handle them.
export function htmlHasRichContent(html: string): boolean {
  return /<(a|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|blockquote|pre|code|strong|b|em|i|del|s|img|hr)\b/i.test(
    html,
  );
}

export function htmlToMarkdown(html: string): string {
  // Strip scripts / event handlers before parsing. The result is still piped
  // through DOMPurify again at render time, but sanitising the input keeps the
  // conversion well-behaved.
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  return getService().turndown(clean).trim();
}
