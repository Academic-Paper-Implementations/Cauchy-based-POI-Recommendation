import { Component } from 'react';

// A render error anywhere below this point would otherwise unmount the whole
// tree and leave a blank page with the cause visible only in the console. React
// still has no hook equivalent for this, so it stays a class.

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the stack in the console: the message shown to the user is short on
    // purpose, and this is the only place the component trace survives.
    console.error('Unhandled render error', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 p-6 text-slate-100">
        <div className="card max-w-lg space-y-3 p-6">
          <h1 className="text-lg font-semibold text-red-300">Something broke while rendering</h1>
          <p className="text-sm text-slate-300">
            The view failed to draw. Reloading starts from a clean state; the mined
            results stay in the server cache.
          </p>
          <p className="break-all font-mono text-xs text-slate-500">{String(error.message || error)}</p>
          <button className="btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
