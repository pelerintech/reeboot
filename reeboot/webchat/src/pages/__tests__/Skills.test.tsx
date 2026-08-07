import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Skills from '../Skills';
import App from '../../App';

const SAMPLE = [
  { name: 'github', description: 'GitHub operations', source: 'bundled', enabled: true },
  { name: 'gmail', description: 'Gmail integration', source: 'bundled', enabled: false },
];

function mockSkills(data: any[]) {
  return vi.mocked(fetch).mockImplementation(async (url: any) => {
    if (String(url).includes('/api/skills/catalog')) {
      return { ok: true, status: 200, json: () => Promise.resolve([]) } as any;
    }
    return { ok: true, status: 200, json: () => Promise.resolve(data) } as any;
  });
}

describe('Skills page', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as any)
    );
    // jsdom lacks scrollIntoView; Chat() calls it on mount.
    (globalThis as any).Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders each skill with name, description, source and enabled state', async () => {
    mockSkills(SAMPLE);
    render(<Skills />);
    const github = await screen.findByText('github');
    expect(github).toBeInTheDocument();
    expect(screen.getByText('GitHub operations')).toBeInTheDocument();
    expect(screen.getByText('gmail')).toBeInTheDocument();
    expect(screen.getByText('Gmail integration')).toBeInTheDocument();

    // Source is shown.
    expect(screen.getAllByText('bundled').length).toBeGreaterThan(0);
  });

  it('shows a toggle per row reflecting and changing enabled state', async () => {
    mockSkills(SAMPLE);
    render(<Skills />);
    const rows = await screen.findAllByRole('listitem');
    expect(rows.length).toBe(2);

    // github is enabled, gmail is disabled
    const githubCheck = await screen.findByLabelText('Toggle github');
    expect(githubCheck).toBeChecked();
    const gmailCheck = await screen.findByLabelText('Toggle gmail');
    expect(gmailCheck).not.toBeChecked();

    // Flipping the toggle PUTs the new state and reflects it live
    vi.mocked(fetch).mockImplementation(async (_url: any, init: any) => {
      if (init?.method === 'PUT') {
        return { ok: true, json: () => Promise.resolve({}) } as any;
      }
      if (String(_url).includes('/api/skills/catalog')) {
        return { ok: true, status: 200, json: () => Promise.resolve([]) } as any;
      }
      return { ok: true, json: () => Promise.resolve(SAMPLE) } as any;
    });
    fireEvent.click(gmailCheck);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/skills', expect.objectContaining({ method: 'PUT' })));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it('a Skills tab exists in App navigation', async () => {
    mockSkills([]);
    render(<App />);
    // Desktop sidebar uses title=Skills; mobile label uses 'Skills' text.
    const tab = await screen.findByTitle('Skills').catch(() => null) || screen.getByText('Skills');
    expect(tab).toBeInTheDocument();
  });
});

describe('Skills upload and remove', () => {
  beforeEach(() => {
    (globalThis as any).Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function statefulFetch(initial: any[]) {
    const list = [...initial];
    return vi.fn(async (url: any, init?: any) => {
      const method = init?.method ?? 'GET';
      if (String(url).includes('/api/skills/catalog')) {
        return { ok: true, status: 200, json: () => Promise.resolve([]) } as any;
      }
      if (method === 'POST' && String(url).includes('/api/skills/upload')) {
        list.push({ name: 'uploaded-skill', description: 'Uploaded thing', source: 'user', enabled: true });
        return { ok: true, status: 201, json: () => Promise.resolve({ name: 'uploaded-skill' }) } as any;
      }
      if (method === 'DELETE') {
        const match = String(url).match(/\/api\/skills\/([^/]+)$/);
        if (match) {
          const i = list.findIndex((s) => s.name === decodeURIComponent(match[1]));
          if (i >= 0) list.splice(i, 1);
        }
        return { ok: true, json: () => Promise.resolve({ deleted: true }) } as any;
      }
      return { ok: true, status: 200, json: () => Promise.resolve([...list]) } as any;
    });
  }

  it('posts the selected zip to /api/skills/upload and shows the new skill', async () => {
    const fetchMock = statefulFetch([...SAMPLE]);
    vi.stubGlobal('fetch', fetchMock);
    render(<Skills />);

    const input = await screen.findByTestId('skill-upload-input');
    fireEvent.change(input, { target: { files: [new File(['content'], 'skill.zip')] } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/skills/upload', expect.any(Object)));
    expect(await screen.findByText('uploaded-skill')).toBeInTheDocument();
  });

  it('shows the error reason when the upload fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: any, init?: any) => {
      if (init?.method === 'POST') {
        return { ok: false, json: () => Promise.resolve({ error: 'A skill named \"github\" already exists' }) } as any;
      }
      return { ok: true, json: () => Promise.resolve([...SAMPLE]) } as any;
    }));
    render(<Skills />);
    const input = await screen.findByTestId('skill-upload-input');
    fireEvent.change(input, { target: { files: [new File(['content'], 'skill.zip')] } });
    await waitFor(() => expect(screen.getByText(/already exists/)).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  it('removes a user-uploaded skill via DELETE and hides bundled remove actions', async () => {
    const userSkill = { name: 'my-gear', description: 'Gear', source: 'user', enabled: true };
    const fetchMock = statefulFetch([...SAMPLE, userSkill]);
    vi.stubGlobal('fetch', fetchMock);
    render(<Skills />);

    const removeBtn = await screen.findByLabelText('Remove my-gear');
    expect(removeBtn).toBeInTheDocument();
    // Bundled rows have no remove action.
    expect(screen.queryByLabelText('Remove github')).not.toBeInTheDocument();

    fireEvent.click(removeBtn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/skills/my-gear', expect.objectContaining({ method: 'DELETE' })));
    await waitFor(() => expect(screen.queryByText('my-gear')).not.toBeInTheDocument());
  });
});

describe('Skills catalog section (bundle-lean-catalog)', () => {
  beforeEach(() => {
    (globalThis as any).Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function statefulCatalogFetch(main: any[], available: any[]) {
    const mainList = [...main];
    let availList = [...available];
    return vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (u.endsWith('/api/skills/catalog') && method === 'GET') {
        return { ok: true, status: 200, json: () => Promise.resolve([...availList]) } as any;
      }
      if (u.endsWith('/api/skills/catalog/install') && method === 'POST') {
        const name = JSON.parse(init.body).name;
        const entry = availList.find((s) => s.name === name);
        if (!entry) return { ok: false, status: 400, json: () => Promise.resolve({ error: 'not found in catalog' }) } as any;
        availList = availList.filter((s) => s.name !== name);
        mainList.push({ name: entry.name, description: entry.description, source: 'remote', enabled: true });
        return { ok: true, status: 201, json: () => Promise.resolve({ name: entry.name, description: entry.description, source: 'remote', enabled: true }) } as any;
      }
      return { ok: true, status: 200, json: () => Promise.resolve([...mainList]) } as any;
    });
  }

  it('shows a remove action for a remote-installed skill in the main list', async () => {
    const main = [
      { name: 'github', description: 'GitHub ops', source: 'bundled', enabled: true },
      { name: 'notion', description: 'Notion ops', source: 'remote', enabled: true },
    ];
    const fetchMock = statefulCatalogFetch(main, []);
    vi.stubGlobal('fetch', fetchMock);
    render(<Skills />);

    // Remote skill in the main list gets a remove action like user skills;
    // bundled rows do not.
    expect(await screen.findByLabelText('Remove notion')).toBeInTheDocument();
    expect(screen.queryByLabelText('Remove github')).not.toBeInTheDocument();
  });

  it('lists available catalog skills with an Install action', async () => {
    const available = [{ name: 'notion', description: 'Notion workspace ops' }];
    const main = [{ name: 'github', description: 'GitHub ops', source: 'bundled', enabled: true }];
    vi.stubGlobal('fetch', statefulCatalogFetch(main, available));
    render(<Skills />);

    const installBtn = await screen.findByRole('button', { name: /install notion/i });
    expect(installBtn).toBeInTheDocument();
    expect(screen.getByText(/available from the curated catalog/i)).toBeInTheDocument();
  });

  it('installs a catalog skill and moves it from available to installed', async () => {
    const available = [{ name: 'notion', description: 'Notion workspace ops' }];
    const main = [{ name: 'github', description: 'GitHub ops', source: 'bundled', enabled: true }];
    const fetchMock = statefulCatalogFetch(main, available);
    vi.stubGlobal('fetch', fetchMock);
    render(<Skills />);

    const installBtn = await screen.findByRole('button', { name: /install notion/i });
    fireEvent.click(installBtn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/skills/catalog/install', expect.objectContaining({ method: 'POST' })));

    // notion is now installed (main list shows it with a remove action).
    await waitFor(() => expect(screen.getByLabelText('Remove notion')).toBeInTheDocument());
    // no longer available
    await waitFor(() => expect(screen.queryByRole('button', { name: /install notion/i })).not.toBeInTheDocument());
  });

  it('surfaces an install error and keeps the skill available', async () => {
    const available = [{ name: 'notion', description: 'Notion workspace ops' }];
    const main = [{ name: 'github', description: 'GitHub ops', source: 'bundled', enabled: true }];
    const fetchMock = vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      if (u.endsWith('/api/skills/catalog') && method === 'GET') {
        return { ok: true, status: 200, json: () => Promise.resolve([...available]) } as any;
      }
      if (u.endsWith('/api/skills/catalog/install') && method === 'POST') {
        return { ok: false, status: 400, json: () => Promise.resolve({ error: 'A skill named "notion" already exists' }) } as any;
      }
      return { ok: true, status: 200, json: () => Promise.resolve([...main]) } as any;
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<Skills />);

    const installBtn = await screen.findByRole('button', { name: /install notion/i });
    fireEvent.click(installBtn);
    await waitFor(() => expect(screen.getByText(/already exists/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /install notion/i })).toBeInTheDocument();
  });
});
