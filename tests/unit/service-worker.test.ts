import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../client/public/sw.js', import.meta.url), 'utf8');
const origin = 'https://frontier.test';
const js = () => new Response('export const ready = true;', { headers: { 'Content-Type': 'application/javascript' } });
const html = () => new Response('<html>App shell</html>', { headers: { 'Content-Type': 'text/html' } });
const key = (request: Request | string) => new URL(typeof request === 'string' ? request : request.url, origin).href;

type WorkerEvent = {
  request?: Request;
  waitUntil: (promise: Promise<unknown>) => void;
  respondWith: (promise: Promise<Response>) => void;
};

function worker() {
  const stores = new Map<string, Map<string, Response>>();
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const getStore = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name)!;
  };
  const caches = {
    open: vi.fn(async (name: string) => ({
      match: async (request: Request | string) => getStore(name).get(key(request))?.clone(),
      put: async (request: Request | string, response: Response) => { getStore(name).set(key(request), response.clone()); },
      delete: async (request: Request | string) => getStore(name).delete(key(request)),
      keys: async () => [...getStore(name).keys()].map((url) => new Request(url)),
    })),
    delete: vi.fn(async (name: string) => stores.delete(name)),
  };
  const fetch = vi.fn<(request: Request | string, options?: RequestInit) => Promise<Response>>();
  const self = {
    location: { origin },
    addEventListener: (name: string, handler: (event: WorkerEvent) => void) => handlers.set(name, handler),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };
  runInNewContext(source, { self, caches, fetch, Response, URL, console: { log: () => undefined } });
  const dispatch = (name: string, request?: Request) => {
    let result: Promise<unknown> | undefined;
    handlers.get(name)!({ request, waitUntil: (promise) => { result = promise; }, respondWith: (promise) => { result = promise; } });
    return result;
  };
  return { stores, getStore, fetch, caches, self, dispatch, request: (path: string) => new Request(`${origin}${path}`) };
}

describe('service worker deployment recovery', () => {
  it('discards poisoned HTML, retries past HTTP cache and serves JavaScript on subsequent loads', async () => {
    const w = worker();
    const request = w.request('/assets/js/index-new.js');
    w.getStore('frontier-static-v2').set(key(request), html());
    w.fetch.mockResolvedValueOnce(html()).mockResolvedValueOnce(js());
    const first = await w.dispatch('fetch', request) as Response;
    expect(first.headers.get('content-type')).toBe('application/javascript');
    expect(w.fetch).toHaveBeenLastCalledWith(request, { cache: 'reload' });
    const again = await w.dispatch('fetch', request) as Response;
    expect(await again.text()).toContain('export const ready');
    expect(w.fetch).toHaveBeenCalledTimes(2);
  });

  it('never returns or stores HTML as a script, even when retry also returns the SPA fallback', async () => {
    const w = worker();
    w.fetch.mockImplementation(async () => html());
    const response = await w.dispatch('fetch', w.request('/assets/js/missing.js')) as Response;
    expect(response.status).toBe(502);
    expect(w.getStore('frontier-static-v2').size).toBe(0);
  });

  it('uses valid assets from its own cache rather than old or unrelated caches', async () => {
    const w = worker();
    const request = w.request('/assets/js/index-new.js');
    w.getStore('frontier-static-v1').set(key(request), html());
    w.getStore('frontier-static-v2').set(key(request), js());
    expect((await w.dispatch('fetch', request) as Response).headers.get('content-type')).toBe('application/javascript');
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it('preserves pending actions and unrelated caches when migrating old response caches', async () => {
    const w = worker();
    for (const name of ['frontier-static-v1', 'frontier-dynamic-v1', 'frontier-pending-actions', 'frontier-api-v1', 'other-app']) w.getStore(name).set(`${origin}/item`, html());
    await w.dispatch('activate');
    expect([...w.stores.keys()]).toEqual(['frontier-pending-actions', 'frontier-api-v1', 'other-app']);
    expect(w.self.clients.claim).toHaveBeenCalledOnce();
  });

  it('uses the app shell only for offline navigations, never for scripts or API requests', async () => {
    const w = worker();
    w.getStore('frontier-static-v2').set(`${origin}/index.html`, html());
    w.fetch.mockRejectedValue(new TypeError('Offline'));
    const navigation = w.request('/portfolio');
    Object.defineProperty(navigation, 'mode', { value: 'navigate' });
    expect(await (await w.dispatch('fetch', navigation) as Response).text()).toContain('App shell');
    expect((await w.dispatch('fetch', w.request('/api/v1/portfolio')) as Response).status).toBe(503);
    expect((await w.dispatch('fetch', w.request('/assets/js/missing.js')) as Response).status).toBe(503);
  });
});
