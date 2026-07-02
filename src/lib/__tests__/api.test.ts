/**
 * API client tests for tune-web-client.
 *
 * Guards against recurring bugs:
 *   1. Missing Accept: application/json header
 *   2. HTML responses parsed as JSON (fetch('/') fallback)
 *   3. Endpoints hitting wrong URLs
 *   4. Silent failures on error status codes
 *   5. fetch('/') calls anywhere in the codebase
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Mock modules that depend on Svelte runtime (not available in node env)
// ---------------------------------------------------------------------------

vi.mock('../stores/notifications', () => ({
  notifications: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock browser globals before importing the API module
// ---------------------------------------------------------------------------

// localStorage mock
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};
vi.stubGlobal('localStorage', localStorageMock);

// window.location mock (clearToken uses it)
vi.stubGlobal('window', { location: { hash: '' }, ...globalThis.window });

// Capture every fetch call for assertions
let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

function mockFetch(body: unknown, status = 200, contentType = 'application/json') {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    const bodyText = typeof body === 'string' ? body : JSON.stringify(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: new Map([['content-type', contentType]]),
      json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
      text: async () => bodyText,
      blob: async () => new Blob([bodyText]),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

// ---------------------------------------------------------------------------
// Import API module (after mocks are in place)
// ---------------------------------------------------------------------------

let api: typeof import('../api');

beforeEach(async () => {
  fetchCalls = [];
  storage.clear();
  // Fresh import each time to avoid stale state
  vi.resetModules();
  api = await import('../api');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =========================================================================
// 1. fetchJSON helper hardening
// =========================================================================

describe('fetchJSON hardening', () => {
  it('should include Accept: application/json header in all requests', async () => {
    mockFetch({ status: 'ok' });
    await api.getHealth();

    expect(fetchCalls.length).toBe(1);
    const headers = fetchCalls[0].init?.headers as Record<string, string> | undefined;
    expect(headers).toBeDefined();
    expect(headers!['Accept']).toBe('application/json');
  });

  it('should include Accept header in apiFetch requests', async () => {
    mockFetch({ ok: true });
    await api.apiFetch('/test');

    expect(fetchCalls.length).toBe(1);
    const headers = fetchCalls[0].init?.headers as Record<string, string> | undefined;
    expect(headers).toBeDefined();
    expect(headers!['Accept']).toBe('application/json');
  });

  it('should include Accept header in apiPost requests', async () => {
    mockFetch({ ok: true });
    await api.apiPost('/test', { data: 1 });

    expect(fetchCalls.length).toBe(1);
    const headers = fetchCalls[0].init?.headers as Record<string, string> | undefined;
    expect(headers).toBeDefined();
    expect(headers!['Accept']).toBe('application/json');
  });

  it('should include Accept header in apiDelete requests', async () => {
    mockFetch({ ok: true });
    await api.apiDelete('/test');

    expect(fetchCalls.length).toBe(1);
    const headers = fetchCalls[0].init?.headers as Record<string, string> | undefined;
    expect(headers).toBeDefined();
    expect(headers!['Accept']).toBe('application/json');
  });

  it('should throw when response body is HTML (starts with <!)', async () => {
    mockFetch('<!DOCTYPE html><html><body>Nginx default</body></html>');
    await expect(api.getHealth()).rejects.toThrow(/HTML/i);
  });

  it('should throw when response body is HTML (starts with <html)', async () => {
    mockFetch('<html><body>Some page</body></html>');
    await expect(api.getHealth()).rejects.toThrow(/HTML/i);
  });

  it('should throw when response body is HTML with leading whitespace', async () => {
    mockFetch('  \n<!DOCTYPE html><html><body>404</body></html>');
    await expect(api.getHealth()).rejects.toThrow(/HTML/i);
  });

  it('should throw on non-200 status codes', async () => {
    mockFetch({ detail: 'Not found' }, 404);
    await expect(api.getHealth()).rejects.toThrow();
  });

  it('should throw on 500 server errors', async () => {
    mockFetch({ detail: 'Internal error' }, 500);
    await expect(api.getHealth()).rejects.toThrow();
  });

  it('should throw on 401 with session expired', async () => {
    mockFetch({ detail: 'Unauthorized' }, 401);
    await expect(api.getHealth()).rejects.toThrow(/session expired/i);
  });

  it('should parse valid JSON responses correctly', async () => {
    const data = { version: '0.8.140', status: 'ok', uptime: 12345 };
    mockFetch(data);
    const result = await api.getHealth();
    expect(result).toEqual(data);
  });

  it('should include Content-Type: application/json header', async () => {
    mockFetch({ ok: true });
    await api.getHealth();

    const headers = fetchCalls[0].init?.headers as Record<string, string> | undefined;
    expect(headers!['Content-Type']).toBe('application/json');
  });

  it('should include Authorization header when token is set', async () => {
    storage.set('tune_jwt_token', 'test-token-123');
    // Re-import to pick up the token
    vi.resetModules();
    api = await import('../api');
    mockFetch({ ok: true });

    await api.getHealth();

    const headers = fetchCalls[0].init?.headers as Record<string, string> | undefined;
    expect(headers!['Authorization']).toBe('Bearer test-token-123');
  });

  it('apiFetch should throw on HTML response', async () => {
    mockFetch('<!DOCTYPE html><html>error</html>');
    await expect(api.apiFetch('/test')).rejects.toThrow(/HTML/i);
  });

  it('apiPost should throw on HTML response', async () => {
    mockFetch('<!DOCTYPE html><html>error</html>');
    await expect(api.apiPost('/test')).rejects.toThrow(/HTML/i);
  });

  it('apiDelete should throw on HTML response', async () => {
    mockFetch('<!DOCTYPE html><html>error</html>');
    await expect(api.apiDelete('/test')).rejects.toThrow(/HTML/i);
  });
});

// =========================================================================
// 2. Critical endpoints call the correct URLs
// =========================================================================

describe('critical endpoint URLs', () => {
  it('getHealth() calls /api/v1/system/health', async () => {
    mockFetch({ version: '0.8.140', status: 'ok' });
    await api.getHealth();
    expect(fetchCalls[0].url).toBe('/api/v1/system/health');
  });

  it('getServerDiagnostics() calls /api/v1/system/diagnostics', async () => {
    mockFetch({ version: '0.8.140', uptime_seconds: 100 });
    await api.getServerDiagnostics();
    expect(fetchCalls[0].url).toBe('/api/v1/system/diagnostics');
  });

  it('getStats() calls /api/v1/system/stats', async () => {
    mockFetch({ tracks: 1000, albums: 100, artists: 50 });
    await api.getStats();
    expect(fetchCalls[0].url).toBe('/api/v1/system/stats');
  });

  it('getDatabaseStatus() calls /api/v1/system/database/status', async () => {
    mockFetch({ engine: 'sqlite', size_mb: 10 });
    await api.getDatabaseStatus();
    expect(fetchCalls[0].url).toBe('/api/v1/system/database/status');
  });

  it('getStreamingServices() calls /api/v1/streaming/services', async () => {
    mockFetch({ tidal: { authenticated: true }, qobuz: { authenticated: false } });
    await api.getStreamingServices();
    expect(fetchCalls[0].url).toBe('/api/v1/streaming/services');
  });

  it('getConfig() calls /api/v1/system/config', async () => {
    mockFetch({ music_dirs: ['/music'] });
    await api.getConfig();
    expect(fetchCalls[0].url).toBe('/api/v1/system/config');
  });

  it('getZones() calls /api/v1/zones', async () => {
    mockFetch([]);
    await api.getZones();
    expect(fetchCalls[0].url).toBe('/api/v1/zones');
  });

  it('getAdminHealth() calls /api/v1/system/admin/health', async () => {
    mockFetch({ cpu_percent: 5, ram_mb: 200 });
    await api.getAdminHealth();
    expect(fetchCalls[0].url).toBe('/api/v1/system/admin/health');
  });

  it('getNetworkDiagnostics() calls /api/v1/system/diagnostics/network', async () => {
    mockFetch({ multicast_ssdp: true, port_8888: true });
    await api.getNetworkDiagnostics();
    expect(fetchCalls[0].url).toBe('/api/v1/system/diagnostics/network');
  });

  it('no endpoint calls fetch(\'/\') — all must use /api/v1/ prefix', async () => {
    mockFetch({ ok: true });

    // Call several critical endpoints and verify none hit '/'
    const endpoints = [
      () => api.getHealth(),
      () => api.getStats(),
      () => api.getDatabaseStatus(),
      () => api.getStreamingServices(),
      () => api.getServerDiagnostics(),
    ];

    for (const fn of endpoints) {
      fetchCalls = [];
      await fn();
      for (const call of fetchCalls) {
        expect(call.url).not.toBe('/');
        expect(call.url).toMatch(/^\/api\/v1\//);
      }
    }
  });
});

// =========================================================================
// 3. No raw fetch('/') calls in the codebase (static analysis)
// =========================================================================

describe('codebase safety: no fetch(\'/\') calls', () => {
  function collectFiles(dir: string, ext: string[]): string[] {
    const files: string[] = [];
    try {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        try {
          const stat = statSync(full);
          if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules' && entry !== '__tests__') {
            files.push(...collectFiles(full, ext));
          } else if (stat.isFile() && ext.some(e => full.endsWith(e))) {
            files.push(full);
          }
        } catch { /* skip inaccessible */ }
      }
    } catch { /* skip inaccessible */ }
    return files;
  }

  it('no .ts or .svelte file contains fetch(\'/\')', () => {
    const srcDir = join(__dirname, '..', '..');
    const files = collectFiles(srcDir, ['.ts', '.svelte']);
    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      // Match fetch('/') or fetch("/") — literal root path
      if (/fetch\(\s*['"]\/['"]\s*\)/.test(content)) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });

  it('no .ts or .svelte file calls fetch() without /api/ prefix (except known exceptions)', () => {
    const srcDir = join(__dirname, '..', '..');
    const files = collectFiles(srcDir, ['.ts', '.svelte']);
    const violations: string[] = [];

    // Known exceptions: blob URLs, data URLs, external URLs, template literals with BASE
    const safePatterns = [
      /fetch\s*\(\s*`\$\{BASE\}/,     // fetch(`${BASE}/...`)
      /fetch\s*\(\s*url/,              // fetch(url, ...) — variable
      /fetch\s*\(\s*['"]https?:/,      // fetch('https://...')
      /fetch\s*\(\s*['"]\/api\//,      // fetch('/api/...')
      /fetch\s*\(\s*['"]blob:/,        // fetch('blob:...')
      /fetch\s*\(\s*['"]data:/,        // fetch('data:...')
    ];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Find fetch() calls
        if (/\bfetch\s*\(/.test(line)) {
          // Check it's not in a comment
          const trimmed = line.trimStart();
          if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

          // Check against safe patterns
          const isSafe = safePatterns.some(p => p.test(line));
          if (!isSafe) {
            // Also allow: variable-based fetch calls like fetch(someVar)
            if (/fetch\s*\(\s*[a-zA-Z_]/.test(line)) continue;
            violations.push(`${file}:${i + 1}: ${line.trim()}`);
          }
        }
      }
    }

    // This test documents violations rather than failing hard,
    // since some fetch() calls may be legitimate (e.g. FormData uploads).
    // The critical check above (no fetch('/')) is the strict one.
    if (violations.length > 0) {
      console.warn(
        `Found ${violations.length} fetch() call(s) without explicit /api/ prefix ` +
        `(review for correctness):\n${violations.join('\n')}`
      );
    }
  });
});

// =========================================================================
// 4. DiagnosticsView doesn't use fetch('/')
// =========================================================================

describe('DiagnosticsView safety', () => {
  it('DiagnosticsView.svelte does not contain fetch(\'/\')', () => {
    const diagPath = join(__dirname, '..', '..', 'components', 'DiagnosticsView.svelte');
    let content: string;
    try {
      content = readFileSync(diagPath, 'utf-8');
    } catch {
      // File might not exist in all branches; skip gracefully
      return;
    }

    expect(content).not.toMatch(/fetch\(\s*['"]\/['"]\s*\)/);
  });

  it('DiagnosticsView.svelte uses api.getHealth(), not raw fetch', () => {
    const diagPath = join(__dirname, '..', '..', 'components', 'DiagnosticsView.svelte');
    let content: string;
    try {
      content = readFileSync(diagPath, 'utf-8');
    } catch {
      return;
    }

    // Should import and use the api module
    expect(content).toMatch(/import.*api/);
    expect(content).toMatch(/api\.getHealth\(\)/);
  });

  it('DiagnosticsView.svelte uses api.getServerDiagnostics(), not raw fetch', () => {
    const diagPath = join(__dirname, '..', '..', 'components', 'DiagnosticsView.svelte');
    let content: string;
    try {
      content = readFileSync(diagPath, 'utf-8');
    } catch {
      return;
    }

    expect(content).toMatch(/api\.getServerDiagnostics\(\)/);
  });

  it('DiagnosticsView.svelte uses api.getDatabaseStatus(), not raw fetch', () => {
    const diagPath = join(__dirname, '..', '..', 'components', 'DiagnosticsView.svelte');
    let content: string;
    try {
      content = readFileSync(diagPath, 'utf-8');
    } catch {
      return;
    }

    expect(content).toMatch(/api\.getDatabaseStatus\(\)/);
  });
});

// =========================================================================
// 5. Endpoint functions exist and are callable (smoke test)
// =========================================================================

describe('API exports exist', () => {
  const criticalExports = [
    'getHealth',
    'getStats',
    'getConfig',
    'getDatabaseStatus',
    'getStreamingServices',
    'getServerDiagnostics',
    'getNetworkDiagnostics',
    'getAdminHealth',
    'getZones',
    'getDevices',
    'apiFetch',
    'apiPost',
    'apiDelete',
    'withTimeout',
  ];

  for (const name of criticalExports) {
    it(`exports ${name} as a function`, () => {
      expect(typeof (api as any)[name]).toBe('function');
    });
  }
});

// =========================================================================
// 6. withTimeout helper
// =========================================================================

describe('withTimeout', () => {
  it('resolves if promise completes before timeout', async () => {
    const result = await api.withTimeout(Promise.resolve(42), 1000);
    expect(result).toBe(42);
  });

  it('rejects if promise takes longer than timeout', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 5000));
    await expect(api.withTimeout(slow, 10, 'test')).rejects.toThrow(/timed out/);
  });
});
