import React, { Component, type ReactNode } from 'react';

type Props = { children: ReactNode; onReturn?: () => void };

export class AppErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section role="alert" className="m-6 rounded-xl border border-rose-200 bg-white p-6 text-slate-800">
        <h1 className="text-lg font-bold">This screen could not open</h1>
        <p className="mt-2">Please try again. If this continues, contact WIPAHS IT.</p>
        <button className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-white" onClick={() => {
          if (this.props.onReturn) this.props.onReturn();
          else window.location.reload();
        }}>{this.props.onReturn ? 'Return to dashboard' : 'Reload OfficeHub'}</button>
        {this.props.onReturn && <button className="ml-3 rounded-lg border border-slate-300 px-4 py-2" onClick={()=>window.location.reload()}>Reload OfficeHub</button>}
      </section>
    );
  }
}
