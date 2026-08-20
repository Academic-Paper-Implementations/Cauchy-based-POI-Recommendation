// One colour per feature, shared by the map, the scatter fallback, and the
// pattern tables. Assignment is by sorted feature name so a feature keeps its
// colour across datasets, re-renders, and the two map implementations.

// Red is deliberately absent: it is reserved for the instance count of a rare
// feature, and a feature name printed in red would read as a rarity marker.
const PALETTE = [
  '#38bdf8', '#f0abfc', '#34d399', '#fbbf24', '#a78bfa',
  '#f472b6', '#2dd4bf', '#fb923c', '#818cf8', '#a3e635',
  '#e879f9', '#22d3ee', '#facc15', '#4ade80', '#a5b4fc',
  '#c084fc', '#5eead4', '#fdba74', '#93c5fd', '#d9f99d',
];

export function buildFeatureColors(features) {
  const sorted = [...new Set(features)].sort();
  const colors = {};
  sorted.forEach((feature, index) => {
    colors[feature] = PALETTE[index % PALETTE.length];
  });
  return colors;
}

export function featureColor(colors, feature) {
  return colors[feature] || '#94a3b8';
}
