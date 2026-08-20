// Two ways to read the same mined result. Mining view is the algorithm's own
// evidence; Investor view answers the two questions an owner actually asks.
// Switching is a pure view change — the dataset, the job and the result stay put.

const MODES = [
  { id: 'investor', label: 'Investor view' },
  { id: 'mining', label: 'Mining view' },
];

export default function ModeToggle({ mode, onChange }) {
  return (
    <div className="flex rounded-lg border border-slate-700 p-0.5" role="group" aria-label="View">
      {MODES.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={mode === item.id}
          onClick={() => onChange(item.id)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            mode === item.id
              ? 'bg-primary-600 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
