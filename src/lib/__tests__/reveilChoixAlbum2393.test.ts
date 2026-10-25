// @vitest-environment jsdom
// web#2393 : le réveil se règle en CHERCHANT l'album (pochette, titre, artiste) ;
// l'identifiant part tel quel dans le corps du POST /alarms/.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import AlarmesV2 from '../../components/v2/AlarmesV2.svelte';

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;
let envoyes: any[] = [];
const json = (c: unknown) => new Response(JSON.stringify(c), { status: 200, headers: { 'Content-Type': 'application/json' } });
async function attendre(ms = 0, tours = 6) {
  for (let i = 0; i < tours; i++) { await new Promise((r) => setTimeout(r, ms)); flushSync(); }
}

beforeEach(() => {
  envoyes = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/library/search')) {
      return json({ tracks: [], artists: [], albums: [
        { id: 4242, title: 'The Köln Concert', artist_name: 'Keith Jarrett', cover_path: '/art/4242.jpg' },
        { id: 7, title: 'Facing You', artist_name: 'Keith Jarrett', cover_path: null },
      ] });
    }
    if (u.includes('/alarms') && init?.method === 'POST') { envoyes.push(JSON.parse(String(init.body))); return json({ id: 1 }); }
    if (u.includes('/alarms')) return json([]);
    if (u.includes('/zones')) return json([]);
    return json({});
  }));
});
afterEach(() => { if (monte) unmount(monte); hote?.remove(); monte = null; hote = null; vi.unstubAllGlobals(); });

describe('réveil : choisir l\'album par une recherche (#2393)', () => {
  it('recherche → choix → identifiant envoyé', async () => {
    hote = document.createElement('div'); document.body.appendChild(hote);
    monte = mount(AlarmesV2, { target: hote, props: {} });
    await attendre();
    (Array.from(hote.querySelectorAll('button')).find((b) => b.classList.contains('primaire')) as HTMLElement).click();
    flushSync();
    const sel = hote.querySelector('select') as HTMLSelectElement;
    sel.value = 'album'; sel.dispatchEvent(new Event('change', { bubbles: true })); sel.dispatchEvent(new Event('input', { bubbles: true }));
    await attendre();
    // Plus de champ « identifiant » : une recherche à la place.
    const champ = hote.querySelector('input[type="search"]') as HTMLInputElement;
    expect(champ).toBeTruthy();
    champ.value = 'jarrett'; champ.dispatchEvent(new Event('input', { bubbles: true }));
    await attendre(300, 3);
    const lignes = hote.querySelectorAll('.ligne-res');
    expect(lignes.length).toBe(2);
    expect(lignes[0].textContent).toContain('The Köln Concert');
    expect(lignes[0].textContent).toContain('Keith Jarrett');
    expect(lignes[0].querySelector('img')).toBeTruthy();
    (lignes[0] as HTMLElement).click();
    flushSync();
    expect(hote.querySelector('[data-testid="source-choisie"]')!.textContent).toContain('The Köln Concert');
    (Array.from(hote.querySelectorAll('button')).find((b) => b.classList.contains('primaire') && !!b.closest('.form')) as HTMLElement).click();
    await attendre();
    expect(envoyes.length).toBe(1);
    expect(envoyes[0].source_type).toBe('album');
    expect(envoyes[0].source_id).toBe('4242');
    expect(envoyes[0].source_name).toContain('Keith Jarrett');
  });
});
