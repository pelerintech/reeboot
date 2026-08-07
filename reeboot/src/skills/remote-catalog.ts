/**
 * Remote curated catalog — SDK-agnostic fetch/install domain.
 *
 * The remote catalog is a *distribution* tier only: it is a manifest
 * (index.json) + per-skill zips served from an operator-configurable URL
 * (`config.skills.catalog_url`). It is never hardcoded to a specific repo.
 *
 * Installed catalog skills are promoted into the remote catalog root
 * (`~/.reeboot/skills-remote/` or `config.skills.remote_catalog_path`), pass
 * the same Layer-1 validation pipeline as uploads, and are auto-enabled. Post
 * install they are first-class local skills (`source: 'remote'`).
 *
 * Fetching uses the platform `fetch` primitive (injectable for tests). No
 * pi/ree imports — ports to any SDK.
 */
import { promoteSkillZip } from './upload.js';
import { listUserSkills, remoteCatalogDir, type SkillSource } from './catalog.js';
import { createSkillsStore } from './enabled-store.js';
import type { Config } from '../config.js';

/** A single installable catalog entry from the manifest. */
export interface CatalogEntry {
  name: string;
  description: string;
  version?: string;
  category?: string;
  author?: string;
  license?: string;
  zip: string;
}

/** Parsed catalog manifest. */
export interface CatalogIndex {
  name?: string;
  description?: string;
  version?: string;
  skills: CatalogEntry[];
  /** Extension (tools) entries — structural only this release. */
  tools: unknown[];
}

export interface CatalogFetchResult {
  ok: boolean;
  error?: string;
  index?: CatalogIndex;
}

export interface AvailableEntry extends CatalogEntry {
  /** True if a skill with this name is already installed (bundled/user/remote). */
  collision: boolean;
}

export interface InstallResult {
  ok: boolean;
  error?: string;
  name?: string;
  description?: string;
  source?: SkillSource;
  enabled?: boolean;
}

/** Default catalog fetch primitive hints / messages. */
const NO_CATALOG_MSG = 'No remote catalog configured';

/**
 * Resolve the operator-configured catalog URL. Empty string means no remote
 * catalog configured — the caller reports that rather than erroring.
 */
export function configuredCatalogUrl(config?: Config): string {
  return ((config?.skills as any)?.catalog_url ?? '') as string;
}

/**
 * Fetch and parse the catalog manifest from the given URL. Returns a structured
 * result; never throws. `fetcher` is injectable for tests (defaults to fetch).
 */
export async function fetchCatalogIndex(
  url: string,
  fetcher: (u: string) => Promise<Response> = fetch
): Promise<CatalogFetchResult> {
  if (!url) return { ok: false, error: NO_CATALOG_MSG };
  try {
    const res = await fetcher(url);
    if (!res.ok) return { ok: false, error: `Catalog fetch failed: HTTP ${res.status}` };
    const index: unknown = await res.json();
    if (!index || typeof index !== 'object' || !Array.isArray((index as CatalogIndex).skills)) {
      return { ok: false, error: 'Catalog manifest is malformed (missing skills[])' };
    }
    return { ok: true, index: index as CatalogIndex };
  } catch (e: any) {
    return { ok: false, error: `Catalog fetch failed: ${e?.message ?? 'unknown error'}` };
  }
}

/**
 * List the *available* (not-yet-installed) remote entries, tagging each with
 * whether its name collides with an already-installed skill.
 */
export function listAvailable(index: CatalogIndex, config?: Config): AvailableEntry[] {
  const installed = new Set(listUserSkills(config).map((s) => s.name.toLowerCase()));
  return (index.skills ?? [])
    .filter((e) => e && e.name)
    .map((entry) => ({ ...entry, collision: installed.has(entry.name.toLowerCase()) }));
}

/**
 * Install a catalog skill by name:
 *  - locate the entry in the manifest (must exist)
 *  - download its zip
 *  - run the Layer-1 validation + promotion into the remote root
 *  - auto-enable it in the enabled-set
 *
 * Name collisions (bundled/user/remote already present) are rejected by the
 * shared promotion pipeline. `fetcher` is injectable for tests.
 */
export async function installCatalogSkill(
  name: string,
  opts: { index: CatalogIndex; config?: Config; root?: string; fetcher?: (u: string) => Promise<Response> }
): Promise<InstallResult> {
  const entry = (opts.index.skills ?? []).find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (!entry) return { ok: false, error: `Skill "${name}" not found in catalog` };
  if (!entry.zip) return { ok: false, error: `Catalog entry "${name}" has no zip source` };

  const fetcher = opts.fetcher ?? fetch;
  let buf: Buffer;
  try {
    const res = await fetcher(entry.zip);
    if (!res.ok) return { ok: false, error: `Zip download failed: HTTP ${res.status}` };
    const ab = await res.arrayBuffer();
    buf = Buffer.from(ab);
  } catch (e: any) {
    return { ok: false, error: `Zip download failed: ${e?.message ?? 'unknown error'}` };
  }

  const root = opts.root ?? remoteCatalogDir(opts.config);
  const promoted = promoteSkillZip(buf, opts.config, root);
  if (!promoted.ok || !promoted.name) return { ok: false, error: promoted.error };

  const store = createSkillsStore(opts.config);
  store.setEnabled(promoted.name, true);
  return { ok: true, name: promoted.name, description: promoted.description, source: 'remote', enabled: true };
}
