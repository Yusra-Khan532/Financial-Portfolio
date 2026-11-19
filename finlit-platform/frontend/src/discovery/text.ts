// Task #245 (the Discovery page as in the team's screenshots, 19 Nov 2026): one line per theme and per NSE macro sector, and what each stage means.
// The eight theme lines and four sector lines the screenshots show are copied word for word; the rest are written the same way. A name with no line
// (a theme or sector added later) shows none, never a made-up one.

export const THEME_ABOUT: Record<string, string> = {
  "Industrial Manufacturing & Capex": "Factories, engineering, forgings and capacity expansion.",
  "AI & GenAI": "AI, GenAI, GPU cloud and AI-led software and services.",
  "Corporate Catalysts & Growth Signals": "Orders, expansion plans, fundraises and growth announcements.",
  "EV & Automotive Technology": "Electric vehicles, auto components and mobility technology.",
  "Healthcare & Life Sciences": "Pharma, hospitals, diagnostics and healthcare services.",
  "Renewable Energy & Power": "Wind, solar and other clean power generation.",
  "Battery & Energy Storage": "Batteries, cells and grid energy storage.",
  "Solar Technology": "Solar modules, cells and related manufacturing.",
  "Agriculture & Food Technology": "Farm inputs, food processing and agri-tech.",
  "Cloud & Data Centres": "Data centres, cloud hosting and the power and cooling behind them.",
  "Cybersecurity & Connectivity": "Security software, networks, 5G and connectivity.",
  "Defence & Aerospace": "Defence equipment, aircraft parts and aerospace programmes.",
  "Electrodes & Advanced Materials": "Graphite electrodes, specialty materials and advanced chemicals.",
  "Financial Services & Trading": "Lending, broking, payments and capital-market services.",
  "Infrastructure & Transport": "Roads, rail, ports, logistics and construction.",
  "Marine & Shipbuilding": "Ships, shipyards, ports and marine equipment.",
  "Mobile & Electronics Manufacturing": "Phones, electronics assembly and components made in India.",
  "Nuclear Energy": "Nuclear power plants, fuel and equipment.",
  "Renewable Power": "Power producers running wind, solar and hydro plants.",
  "Semiconductor & Electronics": "Chips, chip packaging, displays and electronic parts.",
  "Space & Drone Technology": "Satellites, launch services and drones.",
};

export const SECTOR_ABOUT: Record<string, string> = {
  Industrials: "Machinery, engineering, infrastructure and capital goods makers.",
  "Consumer Discretionary": "Autos, durables, retail and other non-essential spending.",
  Commodities: "Metals, chemicals, materials and other raw-input producers.",
  Healthcare: "Pharma, hospitals, diagnostics and medical services.",
  "Financial Services": "Banks, lenders, insurers, brokers and asset managers.",
  "Information Technology": "Software, IT services and technology platforms.",
  Services: "Logistics, hotels, media, education and other services.",
  "Fast Moving Consumer Goods": "Food, drinks, personal care and household products.",
  Utilities: "Power generation, transmission and gas distribution.",
  Energy: "Oil, gas, coal and refining.",
  Telecommunication: "Telecom operators, towers and network equipment.",
  Diversified: "Groups with businesses across several sectors.",
  Power: "Power generation, transmission and distribution.",
  "Not classified": "Companies NSE has not placed in a sector yet.",
};

/** "What do these mean?": how the stage is read from the company's own sentences on the theme (backend finlit/discovery/keywords.py). */
export const STAGE_ABOUT: [string, string][] = [
  ["Operating", "Its own words say it is already running: commissioned, in production, delivered, supplied, or earning revenue from it."],
  ["Under execution", "Being built or delivered now: under construction, ramping up, or with orders received and an order book."],
  ["Planned", "Announced for later: plans to, proposed, expected to, or a target year."],
  ["MoU / pilot", "Early: an MoU, letter of intent, pilot, prototype or talks."],
  ["Not stated", "The presentation names the theme but no sentence says how far along it is."],
];
export const STAGES = STAGE_ABOUT.map(([s]) => s);
