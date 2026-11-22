// @vitest-environment jsdom
// Task #310: the shared pieces render the ui- classes, and mark the selected state with an attribute.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button, ButtonLink, buttonClass, Card, Chip, H2, H3, Input, Label, PageTitle, Select, Tab, tabClass, Tabs } from "./index";

afterEach(cleanup);

describe("shared pieces (task #310)", () => {
  it("Button: one class per look, a real button by default, pressed via aria-pressed", () => {
    render(<><Button variant="primary">Create an alert</Button><Button>Export</Button><Button variant="quiet" size="sm">Edit</Button>
      <Button variant="prism">Open the full Prism report</Button><Button pressed>Watching</Button></>);
    expect(screen.getByRole("button", { name: "Create an alert" }).className).toBe("ui-btn ui-btn--primary");
    expect(screen.getByRole("button", { name: "Create an alert" }).getAttribute("type")).toBe("button");
    expect(screen.getByRole("button", { name: "Export" }).className).toBe("ui-btn ui-btn--secondary");
    expect(screen.getByRole("button", { name: "Edit" }).className).toBe("ui-btn ui-btn--quiet ui-btn--sm");
    expect(screen.getByRole("button", { name: "Open the full Prism report" }).className).toBe("ui-btn ui-btn--prism");
    expect(screen.getByRole("button", { name: "Watching" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Export" }).hasAttribute("aria-pressed")).toBe(false);
    expect(buttonClass("primary", "sm", "x")).toBe("ui-btn ui-btn--primary ui-btn--sm x");
    render(<ButtonLink href="/screener" variant="secondary">Fund Screener</ButtonLink>);
    expect(screen.getByRole("link", { name: "Fund Screener" }).className).toBe("ui-btn ui-btn--secondary");
  });

  it("Tabs: a tab list with aria-selected, or a toggle group with aria-pressed; never a selected class", () => {
    render(<><Tabs label="View"><Tab selected>Sectors</Tab><Tab>Industries</Tab></Tabs>
      <Tabs kind="toggle" label="Period"><Tab kind="toggle" selected>1 week</Tab><Tab kind="toggle">1 month</Tab></Tabs></>);
    expect(screen.getByRole("tablist", { name: "View" }).className).toBe("ui-tabs");
    expect(screen.getByRole("tab", { name: "Sectors" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Industries" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("group", { name: "Period" }).className).toBe("ui-tabs");
    expect(screen.getByRole("button", { name: "1 week" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "1 month" }).getAttribute("aria-pressed")).toBe("false");
    for (const el of [screen.getByRole("tab", { name: "Sectors" }), screen.getByRole("button", { name: "1 week" })]) expect(el.className).toBe("ui-tab");
    expect(tabClass()).toBe("ui-tab");
  });

  it("Card, PageTitle, headings, Input, Select and Chip render their classes", () => {
    const { container } = render(<>
      <PageTitle eyebrow="Research · Find stocks" lede="Filter every listed company.">Stock screener</PageTitle>
      <PageTitle variant="read" as="h2">Terms of use</PageTitle>
      <Card as="section" aria-label="Main card"><H2>Results</H2><H3>Valuation</H3><Label>Market cap</Label><Card size="sm">inner</Card></Card>
      <H2 marketing>Plans</H2>
      <Input aria-label="Search" /><Select aria-label="Sort"><option>Name</option></Select>
      <Chip>New</Chip><Chip tone="gold">Main theme</Chip>
    </>);
    expect(screen.getByRole("heading", { level: 1, name: "Stock screener" }).className).toBe("ui-title");
    expect(container.querySelector(".ui-eyebrow")!.textContent).toBe("Research · Find stocks");
    expect(container.querySelector(".ui-lede")!.textContent).toBe("Filter every listed company.");
    expect(screen.getByRole("heading", { name: "Terms of use" }).className).toBe("ui-title ui-title--read");
    expect(screen.getByRole("region", { name: "Main card" }).className).toBe("ui-card");
    expect(screen.getByText("inner").className).toBe("ui-card ui-card--sm");
    expect(screen.getByRole("heading", { name: "Results" }).className).toBe("ui-h2");
    expect(screen.getByRole("heading", { name: "Plans" }).className).toBe("ui-h2 ui-h2--marketing");
    expect(screen.getByRole("heading", { name: "Valuation" }).className).toBe("ui-h3");
    expect(screen.getByText("Market cap").className).toBe("ui-label");
    expect(screen.getByRole("textbox", { name: "Search" }).className).toBe("ui-input");
    expect(screen.getByRole("combobox", { name: "Sort" }).className).toBe("ui-input");
    expect(screen.getByText("New").className).toBe("ui-chip");
    expect(screen.getByText("Main theme").className).toBe("ui-chip ui-chip--gold");
  });
});
