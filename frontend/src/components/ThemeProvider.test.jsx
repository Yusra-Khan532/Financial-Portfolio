import { getInitialTheme } from "./ThemeProvider";

describe("theme foundation", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  test("defaults to light when there is no saved or system preference", () => {
    window.matchMedia = () => ({ matches: false });
    expect(getInitialTheme()).toBe("light");
  });

  test("honors the system dark preference until a user choice exists", () => {
    window.matchMedia = () => ({ matches: true });
    expect(getInitialTheme()).toBe("dark");
  });

  test("saved preference wins over the system preference", () => {
    window.localStorage.setItem("finlit-theme", "light");
    window.matchMedia = () => ({ matches: true });
    expect(getInitialTheme()).toBe("light");
  });
});
