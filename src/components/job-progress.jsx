// Job progress. The miner reports which stage it has reached, not a percentage,
// and nothing here invents one: a fake percentage on a run that can last twenty
// minutes is worse than an honest stage name and a clock.

const STAGE_LABELS = {
  load: 'Loading data',
  neighbor_graph: 'Building neighbour graph',
  maximal_clique: 'Enumerating maximal cliques',
  mining: 'Mining prevalent patterns',
  export: 'Collecting participating instances',
  done: 'Finished',
};

const STATUS_STYLES = {
  running: 'bg-sky-500/20 text-sky-300',
  done: 'bg-emerald-500/20 text-emerald-300',
  failed: 'bg-red-500/20 text-red-300',
  cancelled: 'bg-amber-500/20 text-amber-300',
  queued: 'bg-slate-500/20 text-slate-300',
};

export default function JobProgress({ job, error }) {
  if (error) {
    return (
      <div className="card border-red-500/40 p-4 text-sm text-red-300">{error}</div>
    );
  }
  if (!job) {
    return (
      <div className="card p-4 text-sm text-slate-400">
        No job yet. Pick a dataset and run mining.
      </div>
    );
  }

  const stages = Object.keys(STAGE_LABELS);
  const reached = stages.indexOf(job.stage);

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span
          className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${
            STATUS_STYLES[job.status] || STATUS_STYLES.queued
          }`}
        >
          {job.status}
        </span>
        <span className="font-mono text-sm text-slate-400">{job.elapsed_s.toFixed(1)} s</span>
      </div>

      {job.from_cache && (
        <p className="text-xs text-emerald-400">
          Served from the disk cache — the miner did not run again.
        </p>
      )}

      {!job.from_cache && (
        <ol className="space-y-1 text-sm">
          {stages.map((stage, index) => (
            <li
              key={stage}
              className={
                index < reached
                  ? 'text-slate-500'
                  : index === reached
                    ? 'font-medium text-sky-300'
                    : 'text-slate-600'
              }
            >
              {index < reached ? '✓' : index === reached ? '▸' : '·'} {STAGE_LABELS[stage]}
            </li>
          ))}
        </ol>
      )}

      {job.error && <p className="text-sm text-red-300">{job.error}</p>}
    </div>
  );
}
