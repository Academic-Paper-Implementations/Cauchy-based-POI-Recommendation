import { useState } from 'react';
import Papa from 'papaparse';
import { api } from '../config/api';

// Upload a spatial CSV and map its columns. The preview is parsed in the
// browser so the column pickers can be filled before anything is sent; the file
// itself is uploaded once, together with the mapping, and the server enforces
// the size and instance limits.

const EMPTY_MAPPING = {
  feature_column: '',
  id_column: '',
  latitude_column: '',
  longitude_column: '',
  x_column: '',
  y_column: '',
};

const FIELDS = [
  { key: 'feature_column', label: 'Feature type', required: true },
  { key: 'id_column', label: 'Instance label' },
  { key: 'latitude_column', label: 'Latitude' },
  { key: 'longitude_column', label: 'Longitude' },
  { key: 'x_column', label: 'X (metres)' },
  { key: 'y_column', label: 'Y (metres)' },
];

export default function DataUpload({ onUploaded }) {
  const [file, setFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [preview, setPreview] = useState([]);
  const [mapping, setMapping] = useState(EMPTY_MAPPING);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const guess = (headers, candidates) =>
    headers.find((header) => candidates.includes(header.toLowerCase())) || '';

  const handleFile = (event) => {
    const picked = event.target.files[0];
    setError('');
    if (!picked) return;
    setFile(picked);

    Papa.parse(picked, {
      header: true,
      preview: 5,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        setColumns(headers);
        setPreview(results.data);
        setMapping({
          feature_column: guess(headers, ['feature', 'category', 'type']),
          id_column: guess(headers, ['business_id', 'id', 'instance', 'name']),
          latitude_column: guess(headers, ['latitude', 'lat']),
          longitude_column: guess(headers, ['longitude', 'lon', 'lng']),
          x_column: guess(headers, ['x', 'locx']),
          y_column: guess(headers, ['y', 'locy']),
        });
      },
      error: (parseError) => setError(`Could not read the file: ${parseError.message}`),
    });
  };

  const submit = async () => {
    setError('');
    if (!file || !mapping.feature_column) {
      setError('Pick a file and choose the feature-type column.');
      return;
    }
    const hasXy = mapping.x_column && mapping.y_column;
    const hasLatLon = mapping.latitude_column && mapping.longitude_column;
    if (!hasXy && !hasLatLon) {
      setError('Map either X and Y, or latitude and longitude.');
      return;
    }

    const form = new FormData();
    form.append('file', file);
    form.append('label', file.name);
    Object.entries(mapping).forEach(([key, value]) => value && form.append(key, value));

    setBusy(true);
    try {
      const dataset = await api.uploadDataset(form);
      await onUploaded(dataset);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-3 p-4">
      <h2 className="text-lg font-semibold text-primary-400">Upload a CSV</h2>

      <input
        type="file"
        accept=".csv"
        onChange={handleFile}
        className="block w-full cursor-pointer text-sm text-slate-300 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-primary-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-700"
      />

      {preview.length > 0 && (
        <div className="overflow-x-auto rounded border border-slate-700">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-700/60">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="px-2 py-1 text-left font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, index) => (
                <tr key={index} className="border-t border-slate-700/60">
                  {columns.map((column) => (
                    <td key={column} className="max-w-[10rem] truncate px-2 py-1 text-slate-400">
                      {String(row[column] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {columns.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {FIELDS.map((field) => (
            <div key={field.key}>
              <label className="mb-1 block text-xs text-slate-400">
                {field.label}
                {field.required && <span className="text-red-400"> *</span>}
              </label>
              <select
                className="select-field w-full text-xs"
                value={mapping[field.key]}
                onChange={(event) =>
                  setMapping({ ...mapping, [field.key]: event.target.value })
                }
              >
                <option value="">—</option>
                {columns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {columns.length > 0 && (
        <p className="text-xs text-slate-500">
          Latitude/longitude are projected to metres locally so the miner measures real
          distances. With X/Y only, the dataset is shown as a scatter plot.
        </p>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}

      <button
        className="btn-primary w-full disabled:opacity-50"
        onClick={submit}
        disabled={busy || !file}
      >
        {busy ? 'Uploading…' : 'Upload and use'}
      </button>
    </div>
  );
}
