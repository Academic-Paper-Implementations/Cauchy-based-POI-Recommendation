import { useMemo } from 'react';
import Plot from 'react-plotly.js';
import { featureColor } from '../utils/feature-colors';

// Scatter fallback for datasets that carry only projected coordinates and no
// lat/lon, so there is nothing to put a street map under. Same interactions as
// the Leaflet view: click a point, see its neighbours highlighted.

const key = (feature, number) => `${feature} ${number}`;

export default function SpatialMap({
  instances,
  colors,
  selected,
  neighbors,
  radiusM,
  onSelect,
}) {
  const traces = useMemo(() => {
    if (!instances.length) return [];

    const neighborKeys = new Set((neighbors || []).map((n) => key(n.feature, n.number)));
    const selectedKey = selected ? key(selected.feature, selected.number) : null;
    const highlighting = Boolean(selectedKey);

    const groups = {};
    instances.forEach((instance) => {
      const group = (groups[instance.feature] ||= {
        x: [], y: [], text: [], custom: [], opacity: [],
      });
      const instanceKey = key(instance.feature, instance.number);
      group.x.push(instance.x);
      group.y.push(instance.y);
      group.text.push(`${instance.feature} · ${instance.id}`);
      group.custom.push([instance.feature, instance.number]);
      group.opacity.push(
        !highlighting || instanceKey === selectedKey || neighborKeys.has(instanceKey) ? 1 : 0.12
      );
    });

    const points = Object.entries(groups).map(([feature, group]) => ({
      x: group.x,
      y: group.y,
      customdata: group.custom,
      mode: 'markers',
      type: 'scattergl',
      name: feature,
      text: group.text,
      hoverinfo: 'text',
      marker: {
        size: 6,
        color: featureColor(colors, feature),
        opacity: group.opacity,
      },
    }));

    if (selected && radiusM) {
      const theta = Array.from({ length: 120 }, (_, i) => (i / 119) * 2 * Math.PI);
      points.push({
        x: theta.map((t) => selected.x + radiusM * Math.cos(t)),
        y: theta.map((t) => selected.y + radiusM * Math.sin(t)),
        mode: 'lines',
        type: 'scatter',
        line: { color: '#38bdf8', width: 1.5, dash: 'dash' },
        hoverinfo: 'skip',
        showlegend: false,
      });
    }

    return points;
  }, [instances, colors, selected, neighbors, radiusM]);

  const layout = {
    paper_bgcolor: 'rgba(30, 41, 59, 0)',
    plot_bgcolor: 'rgba(15, 23, 42, 0.6)',
    margin: { l: 50, r: 10, t: 10, b: 40 },
    xaxis: { title: 'X (m)', gridcolor: '#334155', color: '#cbd5e1' },
    yaxis: { title: 'Y (m)', gridcolor: '#334155', color: '#cbd5e1', scaleanchor: 'x' },
    legend: { font: { color: '#e2e8f0' }, bgcolor: 'rgba(30, 41, 59, 0.8)' },
    hovermode: 'closest',
    autosize: true,
  };

  const handleClick = (event) => {
    const point = event?.points?.[0];
    if (!point?.customdata) return;
    const [feature, number] = point.customdata;
    const instance = instances.find((i) => i.feature === feature && i.number === number);
    if (instance) onSelect(instance);
  };

  if (!instances.length) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        No instances to display.
      </div>
    );
  }

  return (
    <Plot
      data={traces}
      layout={layout}
      config={{ responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'] }}
      style={{ width: '100%', height: '100%' }}
      useResizeHandler
      onClick={handleClick}
    />
  );
}
