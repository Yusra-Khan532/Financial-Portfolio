// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CompanySize } from "./CompanySize";
import type { PageObject } from "./types";

afterEach(cleanup);
it("shows how many shares sit in each AMFI size and the rule for each", () => {
  render(<CompanySize page={{ size_count: { L: 5, M: 1, S: 29 } } as unknown as PageObject} />);
  expect(screen.getByText("Large cap")).toBeTruthy();
  expect(screen.getByText("29")).toBeTruthy();
  expect(screen.getByText(/101st to 250th/)).toBeTruthy();
  expect(screen.getByText("share in your list")).toBeTruthy();
});
