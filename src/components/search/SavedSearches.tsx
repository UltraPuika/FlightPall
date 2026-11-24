import { useState } from 'react';
import { Bookmark, Trash2 } from 'lucide-react';
import type { SearchParams } from '../../domain/types';
import { findDestination } from '../../data/airports';
import { formatHuman } from '../../lib/dates';
import { useSavedSearches } from '../../hooks/useAppState';
import { Button, inputClass } from '../ui/primitives';

function describe(p: SearchParams) {
  const where = p.mode === 'anywhere' ? 'Anywhere' : p.destinations.map((d) => findDestination(d).city).join(', ');
  return `${where} · ${formatHuman(p.earliestDeparture)}–${formatHuman(p.latestDeparture, { year: true })} · ${p.minDuration}–${p.maxDuration} ${p.durationMode === 'nights' ? 'nights' : 'days'}`;
}

export function SavedSearches({ params, onLoad }: { params: SearchParams; onLoad: (p: SearchParams) => void }) {
  const { saved, persist } = useSavedSearches();
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3">
      <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Bookmark className="h-3.5 w-3.5" /> Saved searches ({saved.length})
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3 animate-fade-in">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const label = name.trim() || describe(params);
              persist([{ id: crypto.randomUUID?.() ?? String(Date.now()), name: label, createdAt: new Date().toISOString(), params }, ...saved]);
              setName('');
            }}
          >
            <input className={inputClass} placeholder="Name this search (optional)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Saved search name" />
            <Button type="submit">Save</Button>
          </form>
          {saved.length === 0 && <p className="text-xs text-slate-500">No saved searches yet.</p>}
          <ul className="divide-y divide-slate-200">
            {saved.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-1.5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onLoad(s.params)}>
                  <div className="truncate text-sm font-medium text-slate-800">{s.name}</div>
                  <div className="truncate text-xs text-slate-500">{describe(s.params)}</div>
                </button>
                <button type="button" aria-label={`Delete ${s.name}`} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => persist(saved.filter((x) => x.id !== s.id))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
