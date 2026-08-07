import { useState, useEffect, useCallback } from 'react';

interface Skill {
  name: string;
  description: string;
  source: 'bundled' | 'user' | 'remote';
  enabled: boolean;
}

interface CatalogEntry {
  name: string;
  description: string;
  version?: string;
  category?: string;
  collision?: boolean;
}

export default function Skills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [available, setAvailable] = useState<CatalogEntry[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  const fetchSkills = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/skills');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSkills(await res.json());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/skills/catalog');
      if (!res.ok) {
        // No catalog configured (or error) — leave the section hidden/empty.
        setAvailable([]);
        return;
      }
      const data = await res.json();
      setAvailable(Array.isArray(data) ? data : []);
      setCatalogError(null);
    } catch {
      setAvailable([]);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
    fetchCatalog();
  }, [fetchSkills, fetchCatalog]);

  const toggleSkill = async (skill: Skill) => {
    const next = !skill.enabled;
    try {
      const res = await fetch('/api/skills', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: skill.name, enabled: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSkills((prev) => prev.map((s) => (s.name === skill.name ? { ...s, enabled: next } : s)));
    } catch (e: any) {
      setError(e?.message ?? 'Failed to update skill');
    }
  };

  const onUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/skills/upload', { method: 'POST', body: form });
      const body = await res.json();
      if (!res.ok) {
        setUploadError(body?.error ?? 'Upload failed');
        return;
      }
      await fetchSkills();
    } catch (e: any) {
      setUploadError(e?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const removeSkill = async (name: string) => {
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSkills((prev) => prev.filter((s) => s.name !== name));
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete skill');
    }
  };

  const installCatalogSkill = async (entry: CatalogEntry) => {
    setInstalling(entry.name);
    setCatalogError(null);
    try {
      const res = await fetch('/api/skills/catalog/install', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: entry.name }),
      });
      const body = await res.json();
      if (!res.ok) {
        setCatalogError(body?.error ?? 'Install failed');
        return;
      }
      setAvailable((prev) => prev.filter((a) => a.name !== entry.name));
      await fetchSkills();
    } catch (e: any) {
      setCatalogError(e?.message ?? 'Install failed');
    } finally {
      setInstalling(null);
    }
  };

  const isRemovable = (source: Skill['source']) => source === 'user' || source === 'remote';

  return (
    <div className="p-6 h-full overflow-y-auto">
      <h1 className="text-xl font-semibold mb-4">Skills</h1>

      {error && <div className="text-red-500 mb-3">Error: {error}</div>}

      {/* Upload control */}
      <div className="mb-6 p-4 border border-border rounded-lg">
        <p className="text-sm mb-2">Upload a skill zip (SKILL.md + helpers at root)</p>
        <input
          data-testid="skill-upload-input"
          type="file"
          accept=".zip,application/zip"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = '';
          }}
        />
        {uploading && <p className="text-sm text-muted-foreground mt-1">Uploading…</p>}
        {uploadError && <p className="text-sm text-red-500 mt-1">{uploadError}</p>}
      </div>

      {loading ? (
        <p>Loading skills…</p>
      ) : (
        <ul className="space-y-2" data-testid="skills-list">
          {skills.map((skill) => (
            <li
              key={skill.name}
              className="flex items-center justify-between p-3 border border-border rounded-lg"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{skill.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {skill.source}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground truncate">{skill.description}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {isRemovable(skill.source) && (
                  <button
                    aria-label={`Remove ${skill.name}`}
                    className="text-red-500 hover:text-red-400"
                    onClick={() => removeSkill(skill.name)}
                  >
                    Remove
                  </button>
                )}
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`Toggle ${skill.name}`}
                    checked={skill.enabled}
                    onChange={() => toggleSkill(skill)}
                  />
                  {skill.enabled ? 'Enabled' : 'Disabled'}
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Catalog browse/install section */}
      {available.length > 0 && (
        <div className="mt-6 p-4 border border-border rounded-lg" data-testid="catalog-section">
          <h2 className="text-lg font-medium mb-1">Available from the curated catalog</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Optional extras you can install from the remote catalog. Installed skills join your
            local list and can be toggled or removed.
          </p>
          {catalogError && <div className="text-red-500 mb-2">{catalogError}</div>}
          <ul className="space-y-2">
            {available.map((entry) => (
              <li
                key={entry.name}
                className="flex items-center justify-between p-3 border border-border rounded-lg"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{entry.name}</span>
                    {entry.category && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {entry.category}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{entry.description}</p>
                </div>
                <button
                  aria-label={`Install ${entry.name}`}
                  disabled={installing === entry.name}
                  className="px-3 py-1 rounded bg-primary text-primary-foreground text-sm disabled:opacity-50"
                  onClick={() => installCatalogSkill(entry)}
                >
                  {installing === entry.name ? 'Installing…' : 'Install'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
