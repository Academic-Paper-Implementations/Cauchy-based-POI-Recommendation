import { describe, it, expect } from 'vitest';
import { describeAttributes, todayHours } from './attributes';

describe('describeAttributes', () => {
  it('omits missing attributes — a missing value is unknown, never "No"', () => {
    const chips = describeAttributes({ takeout: null, delivery: '', good_for_kids: undefined });
    expect(chips).toEqual([]);
  });

  it('renders a genuine false as an explicit "No ..." chip', () => {
    expect(describeAttributes({ takeout: 'false' })).toEqual(['No takeout']);
  });

  it('renders the known values in order', () => {
    const chips = describeAttributes({
      price: '2', takeout: 'true', alcohol: 'full_bar', wifi: 'free', ambience: 'casual|hipster',
    });
    expect(chips).toEqual(['Price $$', 'Takeout', 'Alcohol: full bar', 'WiFi: free', 'casual, hipster']);
  });

  it('treats an out-of-range or empty price as unknown', () => {
    expect(describeAttributes({ price: '' })).toEqual([]);
    expect(describeAttributes({ price: '9' })).toEqual([]);
  });

  it('returns nothing for a null attribute bag', () => {
    expect(describeAttributes(null)).toEqual([]);
  });
});

describe('todayHours', () => {
  it("returns the current day's range zero-padded", () => {
    const day = new Date(2026, 7, 17, 10, 0, 0);
    const name = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
      day.getDay()
    ];
    const hours = JSON.stringify({ [name]: '7:0-20:0' });
    expect(todayHours(hours, day)).toBe('07:00–20:00');
  });

  it('pads single-digit hours and minutes correctly', () => {
    const day = new Date(2026, 7, 17, 10, 0, 0);
    const name = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
      day.getDay()
    ];
    expect(todayHours(JSON.stringify({ [name]: '10:0-21:0' }), day)).toBe('10:00–21:00');
    expect(todayHours(JSON.stringify({ [name]: '9:30-17:5' }), day)).toBe('09:30–17:05');
  });

  it('returns null for missing, unparseable, or other-day hours', () => {
    expect(todayHours('')).toBeNull();
    expect(todayHours('{bad json')).toBeNull();
    const day = new Date(2026, 7, 16, 12, 0, 0);
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const otherDay = names[(day.getDay() + 1) % 7];
    expect(todayHours(JSON.stringify({ [otherDay]: '9:0-17:0' }), day)).toBeNull();
  });

  it('returns null for malformed hour ranges', () => {
    const day = new Date(2026, 7, 17, 10, 0, 0);
    const name = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
      day.getDay()
    ];
    expect(todayHours(JSON.stringify({ [name]: 'invalid' }), day)).toBeNull();
    expect(todayHours(JSON.stringify({ [name]: '10-21' }), day)).toBeNull();
  });
});
