// Trading Lab > Global trade: the world map's shapes. Geometry: Natural Earth's 1:110m countries (public domain), as packaged by world-atlas 2.0.2
// (ISC licence; countries-110m.json, 107.8 KB of TopoJSON, already a site dependency and pinned in package-lock). It is loaded only when the map is
// drawn (its own chunk), projected once (Natural Earth projection, Antarctica left out) and kept for the session.
// ATLAS_ISO3 joins a shape (ISO 3166 numeric id) to UN Comtrade's partner (ISO alpha-3), read from Comtrade's own partner list (partnerAreas.json,
// 27 Nov 2026). Three shapes have no id in the atlas (Northern Cyprus, Somaliland, Kosovo) and are drawn without trade.
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";

export const ATLAS_ISO3: Record<string, string> = { "004": "AFG", "008": "ALB", "010": "ATA", "012": "DZA", "024": "AGO", "031": "AZE", "032": "ARG", "036": "AUS", "040": "AUT", "044": "BHS", "050": "BGD", "051": "ARM", "056": "BEL", "064": "BTN", "068": "BOL", "070": "BIH", "072": "BWA", "076": "BRA", "084": "BLZ", "090": "SLB", "096": "BRN", "100": "BGR", "104": "MMR", "108": "BDI", "112": "BLR", "116": "KHM", "120": "CMR", "124": "CAN", "140": "CAF", "144": "LKA", "148": "TCD", "152": "CHL", "156": "CHN", "158": "TWN", "170": "COL", "178": "COG", "180": "COD", "188": "CRI", "191": "HRV", "192": "CUB", "196": "CYP", "203": "CZE", "204": "BEN", "208": "DNK", "214": "DOM", "218": "ECU", "222": "SLV", "226": "GNQ", "231": "ETH", "232": "ERI", "233": "EST", "238": "FLK", "242": "FJI", "246": "FIN", "250": "FRA", "260": "ATF", "262": "DJI", "266": "GAB", "268": "GEO", "270": "GMB", "275": "PSE", "276": "DEU", "288": "GHA", "300": "GRC", "304": "GRL", "320": "GTM", "324": "GIN", "328": "GUY", "332": "HTI", "340": "HND", "348": "HUN", "352": "ISL", "356": "IND", "360": "IDN", "364": "IRN", "368": "IRQ", "372": "IRL", "376": "ISR", "380": "ITA", "384": "CIV", "388": "JAM", "392": "JPN", "398": "KAZ", "400": "JOR", "404": "KEN", "408": "PRK", "410": "KOR", "414": "KWT", "417": "KGZ", "418": "LAO", "422": "LBN", "426": "LSO", "428": "LVA", "430": "LBR", "434": "LBY", "440": "LTU", "442": "LUX", "450": "MDG", "454": "MWI", "458": "MYS", "466": "MLI", "478": "MRT", "484": "MEX", "496": "MNG", "498": "MDA", "499": "MNE", "504": "MAR", "508": "MOZ", "512": "OMN", "516": "NAM", "524": "NPL", "528": "NLD", "540": "NCL", "548": "VUT", "554": "NZL", "558": "NIC", "562": "NER", "566": "NGA", "578": "NOR", "586": "PAK", "591": "PAN", "598": "PNG", "600": "PRY", "604": "PER", "608": "PHL", "616": "POL", "620": "PRT", "624": "GNB", "626": "TLS", "630": "PRI", "634": "QAT", "642": "ROU", "643": "RUS", "646": "RWA", "682": "SAU", "686": "SEN", "688": "SRB", "694": "SLE", "703": "SVK", "704": "VNM", "705": "SVN", "706": "SOM", "710": "ZAF", "716": "ZWE", "724": "ESP", "728": "SSD", "729": "SDN", "732": "ESH", "740": "SUR", "748": "SWZ", "752": "SWE", "756": "CHE", "760": "SYR", "762": "TJK", "764": "THA", "768": "TGO", "780": "TTO", "784": "ARE", "788": "TUN", "792": "TUR", "795": "TKM", "800": "UGA", "804": "UKR", "807": "MKD", "818": "EGY", "826": "GBR", "834": "TZA", "840": "USA", "854": "BFA", "858": "URY", "860": "UZB", "862": "VEN", "887": "YEM", "894": "ZMB" };

export type Shape = { id: string; iso3: string | null; name: string; d: string };
export type World = { w: number; h: number; shapes: Shape[] };
export const MAP_W = 1000;

let world: Promise<World> | null = null;

/** The projected shapes, read once. */
export function loadWorld(): Promise<World> {
  world ??= (async () => {
    const [atlas, topo, geo] = await Promise.all([import("world-atlas/countries-110m.json"), import("topojson-client"), import("d3-geo")]);
    const t = (atlas.default ?? atlas) as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
    const all = topo.feature(t, t.objects.countries) as FeatureCollection<Geometry, { name: string }>;
    const land: Feature<Geometry, { name: string }>[] = all.features.filter((f) => String(f.id ?? "") !== "010");
    const fc: FeatureCollection<Geometry, { name: string }> = { type: "FeatureCollection", features: land };
    const proj = geo.geoNaturalEarth1().fitWidth(MAP_W, fc);
    const path = geo.geoPath(proj).digits(1);
    const [[, y0], [, y1]] = path.bounds(fc);
    proj.translate([proj.translate()[0], proj.translate()[1] - y0 + 2]);
    const shapes = land.map((f) => {
      const id = f.id == null ? "" : String(f.id);
      return { id, iso3: ATLAS_ISO3[id] ?? null, name: f.properties?.name ?? "", d: path(f) ?? "" };
    }).filter((s) => s.d);
    return { w: MAP_W, h: Math.ceil(y1 - y0 + 4), shapes };
  })();
  world.catch(() => { world = null; });   // a failed load is tried again next time
  return world;
}
