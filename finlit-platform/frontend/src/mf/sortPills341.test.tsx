// @vitest-environment jsdom
// Task #341 PR C (the Mutual Funds refinement prompt, section 13): one "Order by" list with every order, and the first three as quick buttons.
// The same eight orders and the same sorting as the eight pills before.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SORT_PILLS } from "../lib/mfSummary";
import type { ListQuery } from "../lib/mf";
import { SortPills } from "./Summary";

const q = (sort: string, dir: "asc" | "desc") => ({ sort, dir }) as unknown as ListQuery;

afterEach(cleanup);

describe("Order by (task #341 PR C)", () => {
  it("lists all eight orders in one list, with the first three as quick buttons", () => {
    render(<SortPills q={q("aum", "desc")} onSort={() => {}} />);
    const sel = screen.getByRole("combobox") as HTMLSelectElement;
    expect([...sel.options].map((o) => o.textContent)).toEqual(SORT_PILLS.map((p) => p.label));
    expect(sel.value).toBe("0");
    const quick = within(screen.getByRole("group", { name: "Quick orders" })).getAllByRole("button");
    expect(quick.map((b) => b.textContent)).toEqual(["Largest fund size", "1Y return, highest first", "3Y return, highest first"]);
    expect(quick[0].getAttribute("aria-pressed")).toBe("true");
  });
  it("picking from the list or a quick button sorts the same way as before", () => {
    const onSort = vi.fn();
    render(<SortPills q={q("aum", "desc")} onSort={onSort} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "5" } });
    expect(onSort).toHaveBeenLastCalledWith("ter", "asc");
    fireEvent.click(screen.getByRole("button", { name: "3Y return, highest first" }));
    expect(onSort).toHaveBeenLastCalledWith("r3y", "desc");
  });
  it("a column heading's own sort shows as such in the list", () => {
    render(<SortPills q={q("nav", "asc")} onSort={() => {}} />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).selectedOptions[0].textContent).toBe("Sorted by a column heading");
  });
});
