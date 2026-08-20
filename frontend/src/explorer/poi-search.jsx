import { useState, useMemo, useRef, useEffect } from 'react';

const MAX_RESULTS = 10;

export default function PoiSearch({ instances, onSelect }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return instances
      .filter((i) => (i.name || '').toLowerCase().includes(lower))
      .slice(0, MAX_RESULTS);
  }, [instances, query]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (poi) => {
    onSelect(poi);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        placeholder="Search by name…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500"
      />
      {open && query.trim() && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-slate-700 bg-slate-800 shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">No matches</p>
          ) : (
            <ul>
              {filtered.map((poi) => (
                <li key={poi.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(poi)}
                    className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700"
                  >
                    <span className="font-medium">{poi.name || poi.id}</span>
                    <span className="ml-2 text-xs text-slate-400">{poi.feature}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
