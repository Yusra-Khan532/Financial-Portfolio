// One spelling for every NSE group name on the sector pages (task #192, sector pack rules T3 and T12): NSE's own name, with its commas. The sector job's board writes
// some names without NSE's commas ("Oil Gas & Consumable Fuels"); every page shows them through nseName, so a name reads the same everywhere. There are no home-made
// short names ("Pharma & Biotech", "Industrial Mfg", "Cement"): the two short-name lists that were here and in lib/rotation.ts are gone.

/** NSE's names that carry commas (NSE Indices' Industry Classification Structure, backend/finlit/data/nse_classification.json; nseName.test.ts checks this list against
 *  that file, so it cannot drift). */
export const NSE_COMMA_NAMES = [
  "Agricultural, Commercial & Construction Vehicles", "Aluminium, Copper & Zinc Products", "Compressors, Pumps & Diesel Engines",
  "Dealers– Commercial Vehicles, Tractors, Construction Vehicles", "Depositories, Clearing Houses and Other Intermediaries", "Film Production, Distribution & Exhibition",
  "Furniture, Home Furnishing", "Gems, Jewellery And Watches", "Healthcare Research, Analytics & Technology", "Media, Entertainment & Publication",
  "Oil, Gas & Consumable Fuels", "Paper, Forest & Jute Products", "Residential, Commercial Projects", "Road Assets–Toll, Annuity, Hybrid- Annuity", "Tour, Travel Related Services",
] as const;

/** The matching key the server uses (finlit/taxonomy.py `key`): lower case, "and" as "&", only letters, digits and "&". */
const k = (name: string) => name.toLowerCase().replace(/ and /g, " & ").replace(/[^a-z0-9&]/g, "");
const BY_KEY = new Map<string, string>(NSE_COMMA_NAMES.map((n) => [k(n), n]));

/** A group's name in NSE's spelling: "Oil Gas & Consumable Fuels" -> "Oil, Gas & Consumable Fuels"; any other name is returned as it is. */
export const nseName = (name: string): string => BY_KEY.get(k(name)) ?? name;
