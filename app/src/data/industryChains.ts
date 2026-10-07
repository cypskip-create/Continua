/** Economic exposure maps, not assertions of contractual supplier relationships. */
export const industryChains = [
  {
    title: "Kenya power system",
    description: "Generation, distribution and energy inputs.",
    stages: [
      { name: "Generation", symbols: ["KEGN"] },
      { name: "Distribution", symbols: ["KPLC"] },
      { name: "Fuel supply", symbols: ["TOTL"] },
    ],
  },
  {
    title: "Construction economy",
    description:
      "Materials, coatings and financing exposed to building activity.",
    stages: [
      { name: "Cement", symbols: ["PORT"] },
      { name: "Coatings", symbols: ["CRWN"] },
      { name: "Financing", symbols: ["KCB", "EQTY"] },
    ],
  },
  {
    title: "Digital finance",
    description: "Connectivity, payment rails and banking services.",
    stages: [
      { name: "Connectivity & payments", symbols: ["SCOM"] },
      { name: "Banking", symbols: ["NCBA", "COOP", "ABSA"] },
    ],
  },
  {
    title: "Consumer manufacturing",
    description: "Consumer goods production and distribution.",
    stages: [
      { name: "Production", symbols: ["EABL", "BAT"] },
      { name: "Distribution equipment", symbols: ["CGEN"] },
    ],
  },
];
