// Turn the backend's display-only attribute bag into human popup rows.
//
// The one hard rule (a thesis-correctness invariant): a MISSING attribute is
// unknown, never rendered as "No". A missing cell arrives as null/"" and must
// simply not produce a row — only a genuine "false" becomes a "No ..." row.

const BOOL = (yes, no) => (value) =>
  value === 'true' ? yes : value === 'false' ? no : null;

const ENUM = (label, map) => (value) => {
  if (!value) return null;
  return `${label}: ${map[value] || value}`;
};

// yelp attribute column -> a function producing a display string, or null when
// the value is missing/unknown.
const RENDERERS = {
  price: (value) => {
    const n = Number.parseInt(value, 10);
    return n >= 1 && n <= 4 ? `Price ${'$'.repeat(n)}` : null;
  },
  takeout: BOOL('Takeout', 'No takeout'),
  delivery: BOOL('Delivery', 'No delivery'),
  outdoor_seating: BOOL('Outdoor seating', 'No outdoor seating'),
  good_for_kids: BOOL('Good for kids', 'Not for kids'),
  alcohol: ENUM('Alcohol', {
    full_bar: 'full bar',
    beer_and_wine: 'beer & wine',
    none: 'none',
  }),
  wifi: ENUM('WiFi', { free: 'free', paid: 'paid', no: 'none' }),
  ambience: (value) =>
    value ? value.split('|').map((word) => word.replace(/_/g, ' ')).join(', ') : null,
};

const ORDER = [
  'price', 'takeout', 'delivery', 'outdoor_seating',
  'good_for_kids', 'alcohol', 'wifi', 'ambience',
];

/**
 * Display chips for the attributes that are actually known. Missing attributes
 * (null / "") produce no chip — they are unknown, never shown as "No".
 */
export function describeAttributes(attributes) {
  if (!attributes) return [];
  const chips = [];
  for (const key of ORDER) {
    const raw = attributes[key];
    if (raw === undefined || raw === null || raw === '') continue; // unknown -> skip
    const text = RENDERERS[key](raw);
    if (text) chips.push(text);
  }
  return chips;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function padTime(time) {
  const parts = time.split(':');
  if (parts.length !== 2) return null;
  const h = parts[0].padStart(2, '0');
  const m = parts[1].padStart(2, '0');
  return `${h}:${m}`;
}

function formatHoursRange(range) {
  if (!range || typeof range !== 'string') return null;
  const parts = range.split('-');
  if (parts.length !== 2) return null;
  const start = padTime(parts[0]);
  const end = padTime(parts[1]);
  if (!start || !end) return null;
  return `${start}–${end}`;
}

/** Today's opening hours from the packaged hours JSON, or null when unknown. */
export function todayHours(hoursJson, now = new Date()) {
  if (!hoursJson) return null;
  let hours;
  try {
    hours = JSON.parse(hoursJson);
  } catch {
    return null;
  }
  const range = hours?.[DAYS[now.getDay()]];
  return formatHoursRange(range);
}
