// @vitest-environment jsdom
// Réglages › Bibliothèque — « Détecter les faux Hi-Res » (rc12, décision du 13/11).
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import DetectionFauxHiRes from '../../components/partages/DetectionFauxHiRes.svelte';
import { locale } from '../i18n';

let host: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
let etat: Record<string, unknown>;
let requetes: { url: string; method: string; body?: string }[];
const response = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
async function attendre() { for (let n = 0; n < 5; n++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } }
const interrupteur = () => host.querySelector('[data-faux-hires] input[type="checkbox"]') as HTMLInputElement | null;

beforeEach(() => {
  locale.set('fr');
  etat = { active: false, douteux_visible: false, restantes: 12, rangees: 0 };
  requetes = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    requetes.push({ url: String(url), method, body: init?.body as string | undefined });
    if (method === 'POST') {
      const b = JSON.parse(String(init?.body));
      etat.active = b.active; etat.douteux_visible = b.active;
    }
    return response(etat);
  }));
  host = document.createElement('div'); document.body.append(host);
});
afterEach(async () => { if (component) await unmount(component); component = undefined; host.remove(); vi.unstubAllGlobals(); });

it('éteint par défaut, avec la phrase d\'aide, sans rien envoyer au montage', async () => {
  component = mount(DetectionFauxHiRes, { target: host }); await attendre();
  expect(interrupteur()?.checked).toBe(false);
  expect(host.textContent).toContain('Détecter les faux Hi-Res');
  expect(host.textContent).toContain("s'efface pendant la lecture");
  expect(host.querySelector('[data-faux-hires-avancement]')).toBeNull();
  expect(requetes.some((r) => r.method !== 'GET')).toBe(false);
});

it("l'allumer envoie {active: true} et montre l'avancement", async () => {
  component = mount(DetectionFauxHiRes, { target: host }); await attendre();
  const i = interrupteur()!;
  i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); await attendre();
  const post = requetes.find((r) => r.method === 'POST');
  expect(post?.url).toBe('/api/v1/library/hires-check');
  expect(JSON.parse(post!.body!)).toEqual({ active: true });
  expect(interrupteur()?.checked).toBe(true);
  expect(host.querySelector('[data-faux-hires-avancement]')?.textContent).toContain('12 restantes');
});

it('dit « terminée » quand il ne reste rien', async () => {
  Object.assign(etat, { active: true, douteux_visible: true, restantes: 0, rangees: 7 });
  component = mount(DetectionFauxHiRes, { target: host }); await attendre();
  expect(host.querySelector('[data-faux-hires-avancement]')?.textContent).toContain('Analyse terminée');
});

it('un serveur sans la route ne montre pas de ligne', async () => {
  vi.mocked(fetch).mockResolvedValue(response({ error: 'not found' }, 404));
  component = mount(DetectionFauxHiRes, { target: host }); await attendre();
  expect(host.querySelector('[data-faux-hires]')).toBeNull();
});

it('un échec du réglage le dit', async () => {
  component = mount(DetectionFauxHiRes, { target: host }); await attendre();
  vi.mocked(fetch).mockImplementation(async (_u, init?: RequestInit) => (init?.method === 'POST' ? response({}, 500) : response(etat)));
  const i = interrupteur()!;
  i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); await attendre();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("n'a pas pu changer");
});
