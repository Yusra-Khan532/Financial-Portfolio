// Task #432 (27 Nov 2026, the team: "add a clearly visible "Download AI Summary" button immediately below it, allowing users to download the entire
// summary as a professionally formatted PDF"). A small PDF writer with no library: A4 pages, the PDF standard fonts Helvetica and Helvetica-Bold (every
// reader has them, nothing to embed), the FinLit Ventures logo as a JPEG, the company, the call, the source, the headings and points with their page
// references, and on every page the disclaimer and "page n of m". The standard fonts cannot draw the rupee sign, so "₹" is written "Rs" (as the
// exchanges' own filings often do); other characters outside the fonts' set are written as their nearest plain form.
import { summaryBlocks } from "./concalls";

export type PdfSummary = {
  text: string; company: string; symbol: string; kind: string; quarter?: string | null; callDate?: string | null;
  source: "transcript" | "presentation"; written?: Date; disclaimer: string;
};
export type Logo = { jpeg: Uint8Array; width: number; height: number };

const W = 595.28, H = 841.89, M = 50;          // A4 in points, side margin
const GREEN = "0.094 0.192 0.145", GOLD = "0.741 0.553 0.165", INK = "0.13 0.13 0.13", GREY = "0.42 0.42 0.42";

// Advance widths (1/1000 em) of Helvetica and Helvetica-Bold for the characters 32-126, from Adobe's font metrics.
const HV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278,
  584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667,
  611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722,
  500, 500, 500, 334, 260, 334, 584];
const HB = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333,
  584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667,
  611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778,
  556, 556, 500, 389, 280, 389, 584];
// WinAnsi codes above 127 used here, with their widths [regular, bold].
const HIGH: Record<number, [number, number]> = { 0x85: [1000, 1000], 0x91: [222, 278], 0x92: [222, 278], 0x93: [333, 500], 0x94: [333, 500],
  0x95: [350, 350], 0x96: [556, 556], 0x97: [1000, 1000], 0xb0: [400, 400], 0xb1: [584, 584], 0xb7: [278, 278], 0xd7: [584, 584] };
const MAP: Record<string, string> = { "…": "\x85", "‘": "\x91", "’": "\x92", "“": "\x93", "”": "\x94", "•": "\x95", "–": "\x96", "—": "\x97",
  "°": "\xb0", "±": "\xb1", "·": "\xb7", "×": "\xd7", "−": "-", "≈": "~", "→": "->", "←": "<-", "≥": ">=", "≤": "<=", " ": " ", " ": " ",
  " ": " " };

/** The text in the fonts' own character set (one byte a character): "₹1,200" -> "Rs 1,200". */
export function toWinAnsi(s: string): string {
  let out = "";
  for (const ch of (s || "").replace(/₹\s?/g, "Rs ")) {
    const c = ch.codePointAt(0)!;
    if (c >= 32 && c < 127) out += ch;
    else if (MAP[ch] !== undefined) out += MAP[ch];
    else if (c >= 0xa0 && c <= 0xff) out += ch;
    else out += c === 1 ? ch : c < 32 ? " " : "?";     // \x01: the space inside a page reference, kept until the lines are wrapped
  }
  return out;
}

function width(s: string, size: number, bold: boolean): number {
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    w += c === 1 ? 278 : c >= 32 && c < 127 ? (bold ? HB : HV)[c - 32] : HIGH[c] ? HIGH[c][bold ? 1 : 0] : 556;
  }
  return (w * size) / 1000;
}

/** Splits text (already in WinAnsi) into lines no wider than `max` points; a word longer than a line is cut. */
export function wrap(s: string, max: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of s.split(/ +/).filter(Boolean)) {
    const next = cur ? cur + " " + word : word;
    if (width(next, size, bold) <= max) { cur = next; continue; }
    if (cur) lines.push(cur);
    let w = word;
    while (width(w, size, bold) > max) {      // a very long token (a link): cut it
      let k = w.length;
      while (k > 1 && width(w.slice(0, k), size, bold) > max) k--;
      lines.push(w.slice(0, k));
      w = w.slice(k);
    }
    cur = w;
  }
  if (cur) lines.push(cur);
  return (lines.length ? lines : [""]).map((l) => l.replace(/\x01/g, " "));
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
/** **bold** marks dropped; a page reference "(p. 13)" held together on one line (\x01 is a space that never breaks). */
const plain = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*\*/g, "").replace(/\((pp?\.)\s+/g, "($1\x01").replace(/,\s+(?=\d[\d,\s\-–and]*\))/g, ",\x01");

/** Width and height of a JPEG, read from its frame header; null when the bytes are not a JPEG. */
export function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + len;
  }
  return null;
}

const day = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** The PDF file of a summary, as bytes. */
export function summaryPdf(s: PdfSummary, logo?: Logo | null): Uint8Array {
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = 0;
  const text = (x: number, yy: number, str: string, size: number, bold: boolean, rgb = INK) =>
    ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${rgb} rg ${x.toFixed(2)} ${yy.toFixed(2)} Td (${esc(str)}) Tj ET`);
  const bottom = 92;                              // room for the footer
  const newPage = () => {
    ops = []; pages.push(ops);
    // header: the logo (or the name), what this is, a gold rule
    if (logo) {
      const h = 36, w = (logo.width / logo.height) * h;   // the whole logo with VENTURES (owner, 28 Nov 2026), above the gold rule at H - 80
      ops.push(`q ${w.toFixed(2)} 0 0 ${h} ${M} ${H - 40 - h} cm /Im1 Do Q`);
    } else text(M, H - 62, "FinLit Ventures", 16, true, GREEN);
    const tag = "AI summary  \x95  Concall Monitor";
    text(W - M - width(tag, 9, false), H - 56, tag, 9, false, GREY);
    ops.push(`${GOLD} RG 1.2 w ${M} ${H - 80} m ${W - M} ${H - 80} l S`);
    y = H - 104;
  };
  const need = (h: number) => { if (y - h < bottom) newPage(); };
  newPage();

  // the title block
  for (const ln of wrap(toWinAnsi(s.company), W - 2 * M, 20, true)) { need(26); text(M, y, ln, 20, true, GREEN); y -= 25; }
  const meta = [s.symbol, s.kind, s.quarter, s.callDate ? `call of ${s.callDate}` : null].filter(Boolean).join("  •  ");
  text(M, y, toWinAnsi(meta), 10, false, GREY); y -= 15;
  const src = s.source === "transcript" ? "Written by FinLit AI from the call's transcript filed with the exchange" :
    "Written by FinLit AI from the investor presentation filed with the exchange (no transcript filed yet)";
  for (const ln of wrap(toWinAnsi(src + (s.written ? `, on ${day(s.written)}` : "") + ". Page numbers refer to that document."), W - 2 * M, 9.5)) {
    text(M, y, ln, 9.5, false, GREY); y -= 13;
  }
  y -= 8;

  // the summary
  const blocks = summaryBlocks(s.text);
  blocks.forEach((b, i) => {
    if ("h" in b) {
      const sub = !!b.sub, size = sub ? 11.5 : 13.5, gap = sub ? 8 : (i === 0 ? 4 : 14);
      const lines = wrap(toWinAnsi(plain(b.h)), W - 2 * M, size, true);
      need(gap + lines.length * (size + 4) + 18);     // never a heading alone at the foot of a page
      y -= gap;
      for (const ln of lines) { text(M, y, ln, size, true, sub ? INK : GREEN); y -= size + 4; }
      if (!sub) { ops.push(`0.85 0.82 0.74 RG 0.6 w ${M} ${y + 9} m ${W - M} ${y + 9} l S`); y -= 3; }
      return;
    }
    const size = 10.5, lh = 14.6, indent = 14;
    const lines = wrap(toWinAnsi(plain(b.li)), W - 2 * M - indent, size);
    lines.forEach((ln, k) => {
      need(lh);
      if (k === 0) text(M + 3, y, "\x95", size, true, GOLD);
      text(M + indent, y, ln, size, false);
      y -= lh;
    });
    y -= 3;
  });

  // footers, now that the page count is known
  const disc = wrap(toWinAnsi(s.disclaimer), W - 2 * M, 8);
  pages.forEach((p, n) => {
    p.push(`0.85 0.82 0.74 RG 0.6 w ${M} 76 m ${W - M} 76 l S`);
    let fy = 64;
    for (const ln of disc) { p.push(`BT /F1 8 Tf ${GREY} rg ${M} ${fy} Td (${esc(ln)}) Tj ET`); fy -= 10; }
    const left = "finlitventures.com", right = `Page ${n + 1} of ${pages.length}`;
    p.push(`BT /F1 8 Tf ${GREY} rg ${M} 28 Td (${left}) Tj ET`);
    p.push(`BT /F1 8 Tf ${GREY} rg ${(W - M - width(right, 8, false)).toFixed(2)} 28 Td (${right}) Tj ET`);
  });
  return build(pages, logo || null, toWinAnsi(`${s.company}: AI summary of the call`));
}

/** The objects of the file: catalog, pages, fonts, the logo, each page and its content, then the cross-reference table. */
function build(pages: string[][], logo: Logo | null, title: string): Uint8Array {
  const objs: (string | Uint8Array)[][] = [];       // each object: parts (strings are one byte a character)
  const add = (...parts: (string | Uint8Array)[]) => { objs.push(parts); return objs.length; };
  const catalog = add(""), pagesId = add("");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const img = logo ? add(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
    `/Filter /DCTDecode /Length ${logo.jpeg.length} >>\nstream\n`, logo.jpeg, "\nendstream") : 0;
  const kids: number[] = [];
  for (const p of pages) {
    const body = p.join("\n");
    const content = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${content} 0 R /Resources << /Font << /F1 ${f1} 0 R ` +
      `/F2 ${f2} 0 R >>${img ? ` /XObject << /Im1 ${img} 0 R >>` : ""} >> >>`));
  }
  objs[catalog - 1] = [`<< /Type /Catalog /Pages ${pagesId} 0 R >>`];
  objs[pagesId - 1] = [`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`];
  const info = add(`<< /Title (${esc(title)}) /Producer (FinLit Ventures) >>`);

  const chunks: Uint8Array[] = [];
  let size = 0;
  const put = (x: string | Uint8Array) => {
    const b = typeof x === "string" ? Uint8Array.from(x, (c) => c.charCodeAt(0) & 0xff) : x;
    chunks.push(b); size += b.length;
  };
  put("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  const offsets: number[] = [];
  objs.forEach((parts, i) => { offsets.push(size); put(`${i + 1} 0 obj\n`); parts.forEach(put); put("\nendobj\n"); });
  const xref = size;
  put(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`);
  put(`trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export const LOGO_URL = "/brand/finlit-ventures-pdf-logo.jpg";

/** The logo for the PDF's header; null (the name in text instead) when it cannot be read. */
export async function loadLogo(): Promise<Logo | null> {
  try {
    const r = await fetch(LOGO_URL);
    if (!r.ok) return null;
    const jpeg = new Uint8Array(await r.arrayBuffer());
    const sz = jpegSize(jpeg);
    return sz ? { jpeg, ...sz } : null;
  } catch { return null; }
}

export function pdfName(symbol: string, d = new Date()): string {
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `FinLit-AI-summary-${(symbol || "call").replace(/[^A-Za-z0-9-]/g, "")}-${iso}.pdf`;
}

/** Builds the PDF and hands it to the browser as a download. */
export async function downloadSummaryPdf(s: PdfSummary): Promise<void> {
  const bytes = summaryPdf(s, await loadLogo());
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url; a.download = pdfName(s.symbol); a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
