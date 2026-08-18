import { useEffect } from 'react';

export default function GuideModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-title"
    >
      <div
        className="relative max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded px-2 text-slate-400 hover:text-slate-200"
        >
          ✕
        </button>

        <h2 id="guide-title" className="mb-4 text-lg font-semibold text-slate-100">
          How to use the Explorer
        </h2>

        <section className="space-y-4 text-sm text-slate-300">
          <div>
            <h3 className="font-medium text-slate-100">Search distance (ε)</h3>
            <p>
              How close two places must be (in metres) to count as together. This is
              the co-location distance used during mining.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-slate-100">Popularity (min_prev)</h3>
            <p>
              How common a pattern must be to be kept, from 0 to 1. Higher values
              show only the most frequent co-location groups.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-slate-100">Co-location</h3>
            <p>
              Places whose types repeatedly appear near each other in the mined
              patterns. The "Co-located places" list shows these.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-slate-100">Rating & review count</h3>
            <p>
              Yelp star rating (1–5) and the number of reviews for each place.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-slate-100">Price ($–$$$$)</h3>
            <p>
              Yelp price level from 1 to 4, shown as $ signs. $ is cheapest, $$$$ is
              most expensive.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-slate-100">Nearby radius</h3>
            <p>
              A view-only filter (up to 1500 m) that expands the "Other nearby" list.
              It does not re-run the mining — co-located places are still bounded by
              the original search distance.
            </p>
          </div>

          <div className="border-t border-slate-700 pt-4">
            <h3 className="font-medium text-slate-100">Quick start</h3>
            <ol className="mt-2 list-inside list-decimal space-y-1">
              <li>Pick a city from the dropdown</li>
              <li>Adjust search distance and popularity if needed</li>
              <li>Click "Find co-located spots" to run the search</li>
              <li>Click any place on the map to see its co-located and nearby types</li>
              <li>Use the radius slider to expand or contract the nearby view</li>
            </ol>
          </div>
        </section>
      </div>
    </div>
  );
}
