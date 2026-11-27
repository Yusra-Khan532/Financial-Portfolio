// Waits for a test page to finish loading: ticks of 20 ms until the page stops changing (two ticks in a row with the same markup),
// at least `min` ticks and at most `max` (about 3 s). A single fixed tick was enough on a quiet machine but not under load (fetches
// resolve later), which made the Order Flow and Lab access tests fail now and then. Used by tests only.
import { act } from "@testing-library/react";

export async function settle(min = 2, max = 150): Promise<void> {
  let last = "";
  for (let i = 0; i < max; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const now = document.body.innerHTML;
    if (i + 1 >= min && now === last) return;
    last = now;
  }
}
