// Task #183 part 2 (MF portfolio): the dark "Your MF list" box that opens the top of the page, beside one tile per tab (the Equity page's TopGrid).
import { Tip } from "../../components/sectors/pack/Common";
import type { listBox } from "../../lib/mfTop";

export function ListBox({ box, onUnits }: { box: ReturnType<typeof listBox>; onUnits: () => void }) {
  return (
    <div className="mfp-listbox">
      <p className="mfp-lb-k">Your MF list<Tip text="The funds in your list, by type, and how many stocks sit inside them, from the fund houses' latest monthly files." how="Until units are added every fund counts the same, so a liquid fund weighs as much as an equity fund. Add units to weigh them by your money." label="About “Your MF list”" /></p>
      <p className="mfp-lb-v"><b>{box.n}</b> {box.n === 1 ? "fund" : "funds"}</p>
      <p className="mfp-lb-x">{box.line} {box.weights}</p>
      <button type="button" className="mfp-lb-go" onClick={onUnits}>{box.valued ? "Change units" : "Add units"}</button>
    </div>
  );
}
