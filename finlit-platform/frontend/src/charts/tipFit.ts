/** Developer file 42: a chart's hover box stays inside the chart. It is centred on its point and slid in from an edge by its own measured
 *  width (the boxes guessed 160 px before, and a longer box, such as a candle's open, high and low, ran off a phone screen). */
export function fitTip(tip: HTMLElement, centre: number, boxWidth: number) {
  const half = tip.offsetWidth / 2;
  tip.style.left = (half * 2 + 8 >= boxWidth ? boxWidth / 2 : Math.min(Math.max(centre, half + 4), boxWidth - half - 4)) + "px";
}
