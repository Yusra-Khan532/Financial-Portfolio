import { renderToStaticMarkup } from "react-dom/server";
import AssistantMarkdown from "./AssistantMarkdown";

describe("AssistantMarkdown", () => {
  test("renders paragraphs, bold, lists, and line breaks without raw Markdown", () => {
    const html = renderToStaticMarkup(
      <AssistantMarkdown content={"Saving is **accessible** money.\nIt is usually for near-term needs.\n\n- First point\n- **Second point**\n\n1. One\n2. Two"} />,
    );

    expect(html).toMatch(/Saving is <strong\b[^>]*>accessible<\/strong> money\.<br\b[^>]*\/>It is usually for near-term needs\./);
    expect(html).toMatch(/<ul\b[^>]*><li\b[^>]*>First point<\/li><li\b[^>]*><strong\b[^>]*>Second point<\/strong><\/li><\/ul>/);
    expect(html).toMatch(/<ol\b[^>]*><li\b[^>]*>One<\/li><li\b[^>]*>Two<\/li><\/ol>/);
    expect(html).not.toContain("**");
  });

  test("keeps long response endings visible in the rendered output", () => {
    const longResponse = `${"A complete explanatory sentence. ".repeat(160)}FINAL_SENTENCE_MARKER`;
    const html = renderToStaticMarkup(<AssistantMarkdown content={longResponse} />);

    expect(html).toContain("FINAL_SENTENCE_MARKER");
    expect(html.length).toBeGreaterThan(5000);
  });

  test("renders model supplied HTML as text instead of interpreting it", () => {
    const html = renderToStaticMarkup(<AssistantMarkdown content={'<img src=x onerror="alert(1)">'} />);

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  test("renders Markdown tables as readable comparison bullets", () => {
    const html = renderToStaticMarkup(
      <AssistantMarkdown content={"| Feature | Savings account | Fixed deposit |\n| --- | --- | --- |\n| Access | Usually available | At maturity; early withdrawal may have conditions |\n| Risk | Low | Low"} />,
    );

    expect(html).toContain("<ul");
    expect(html).toMatch(/<strong\b[^>]*>Access<\/strong>/);
    expect(html).toContain("Savings account: Usually available; Fixed deposit: At maturity");
    expect(html).not.toContain("| Feature |");
    expect(html).not.toContain("| --- |");
  });
});
