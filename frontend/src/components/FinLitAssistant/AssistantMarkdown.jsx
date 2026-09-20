import { Fragment } from "react";

const INLINE_MARKDOWN = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|(?<![\w])_[^_\n]+_(?![\w])|`[^`\n]+`|\[[^\]]+\]\([^)]+\))/g;
const UNORDERED_ITEM = /^\s*[-+*]\s+(.+)$/;
const ORDERED_ITEM = /^\s*(\d+)\.\s+(.+)$/;
const TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/;

function tableCells(line) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;
  return trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function isTableStart(lines, index) {
  const headings = tableCells(lines[index]);
  const separators = tableCells(lines[index + 1] || "");
  return Boolean(
    headings?.length > 1 &&
    separators?.length === headings.length &&
    separators.every((cell) => TABLE_SEPARATOR_CELL.test(cell)),
  );
}

function renderInline(text, prefix) {
  const nodes = [];
  let cursor = 0;
  let tokenIndex = 0;

  for (const match of text.matchAll(INLINE_MARKDOWN)) {
    const index = match.index;
    if (index > cursor) nodes.push(text.slice(cursor, index));

    const token = match[0];
    const key = `${prefix}-${tokenIndex++}`;
    if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") || token.startsWith("_")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else {
      const closeLabel = token.indexOf("](");
      const label = token.slice(1, closeLabel);
      const href = token.slice(closeLabel + 2, -1);
      try {
        if (new URL(href).protocol === "https:") {
          nodes.push(<a key={key} href={href} target="_blank" rel="noopener noreferrer">{label}</a>);
        } else {
          nodes.push(label);
        }
      } catch {
        nodes.push(label);
      }
    }
    cursor = index + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes.length ? nodes : text;
}

function listItem(line) {
  const unordered = line.match(UNORDERED_ITEM);
  if (unordered) return { type: "ul", text: unordered[1] };
  const ordered = line.match(ORDERED_ITEM);
  if (ordered) return { type: "ol", text: ordered[2], start: Number(ordered[1]) };
  return null;
}

export default function AssistantMarkdown({ content }) {
  const lines = String(content || "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    if (!lines[lineIndex].trim()) {
      lineIndex += 1;
      continue;
    }

    if (isTableStart(lines, lineIndex)) {
      const headings = tableCells(lines[lineIndex]);
      lineIndex += 2; // Skip the header and Markdown separator rows.
      const rows = [];
      while (lineIndex < lines.length) {
        const cells = tableCells(lines[lineIndex]);
        if (!cells || cells.length < 2) break;
        rows.push(cells);
        lineIndex += 1;
      }
      blocks.push(
        <ul key={`table-${blocks.length}`} className="finlit-assistant__table-list">
          {rows.map((row, rowIndex) => {
            const label = row[0] || `Item ${rowIndex + 1}`;
            const comparisons = row.slice(1).map((value, columnIndex) => {
              const heading = headings[columnIndex + 1];
              return `${heading ? `${heading}: ` : ""}${value}`;
            });
            return (
              <li key={`table-row-${rowIndex}`}>
                <strong>{renderInline(label, `table-label-${rowIndex}`)}</strong>
                {comparisons.length > 0 && <> — {comparisons.map((item, index) => <Fragment key={`table-value-${index}`}>{index > 0 && "; "}{renderInline(item, `table-value-${rowIndex}-${index}`)}</Fragment>)}</>}
              </li>
            );
          })}
        </ul>,
      );
      continue;
    }

    const firstItem = listItem(lines[lineIndex]);
    if (firstItem) {
      const items = [];
      const listType = firstItem.type;
      const listStart = firstItem.start;
      while (lineIndex < lines.length) {
        const item = listItem(lines[lineIndex]);
        if (!item || item.type !== listType) break;
        items.push(item.text);
        lineIndex += 1;
      }
      const ListTag = listType;
      blocks.push(
        <ListTag key={`list-${blocks.length}`} start={listType === "ol" ? listStart : undefined}>
          {items.map((item, itemIndex) => <li key={`item-${itemIndex}`}>{renderInline(item, `list-${blocks.length}-${itemIndex}`)}</li>)}
        </ListTag>,
      );
      continue;
    }

    const heading = lines[lineIndex].match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      blocks.push(<p key={`heading-${blocks.length}`} className="finlit-assistant__markdown-heading"><strong>{renderInline(heading[1], `heading-${blocks.length}`)}</strong></p>);
      lineIndex += 1;
      continue;
    }

    const paragraph = [];
    while (lineIndex < lines.length && lines[lineIndex].trim() && !listItem(lines[lineIndex])) {
      paragraph.push(lines[lineIndex].replace(/^#{1,6}\s+/, ""));
      lineIndex += 1;
    }
    blocks.push(
      <p key={`paragraph-${blocks.length}`}>
        {paragraph.map((line, index) => <Fragment key={`line-${index}`}>{index > 0 && <br />}{renderInline(line, `paragraph-${blocks.length}-${index}`)}</Fragment>)}
      </p>,
    );
  }

  return <div className="finlit-assistant__markdown">{blocks}</div>;
}
