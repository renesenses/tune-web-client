// @vitest-environment jsdom
//
// Tune Circle rc12 (maquettes de Levente) — Mon cercle : la grille des membres.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import { preparerLocale } from '../i18n';
import { circlePlugin } from '../circle';
import { demandeConversation, nonLusMessagerie } from '../circleMessagerie';
import fr from '../locales/fr';

function reponse(status: number, corps?: unknown): Response {
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => corps, text: async () => (corps === undefined ? '' : JSON.stringify(corps)),
  } as unknown as Response;
}
function cloud(chemin: string): Response {
  if (chemin === '') return reponse(200, {
    members: [{ user_id: 12, name: 'Alice', since: '2026-09-01T10:00:00Z' }],
    sent: [], received: [], circles: [{ id: 7, name: 'Famille', member_ids: [12] }],
  });
  if (chemin === '/me/location') return reponse(204);
  if (chemin === '/contacts/locations') return reponse(200, [{ contact_id: 12, label: 'Lyon', country_code: 'fr', lat: 45.5, lon: 4.5 }]);
  return reponse(404, { error: 'not_found' });
}

beforeAll(async () => { await preparerLocale('fr'); });
beforeEach(() => {
  vi.useFakeTimers();
  circlePlugin.set(null); demandeConversation.set(null); nonLusMessagerie.set(0);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/ext/circle')) return cloud(u.replace(/^.*\/api\/v1\/ext\/circle/, '').replace(/\?.*$/, ''));
    if (u.endsWith('/plugins')) return reponse(200, [{ name: 'circle', installed: true, enabled: true }]);
    return reponse(200, {});
  }));
  vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
});
let hote: HTMLDivElement | null = null;
let monte: Record<string, unknown> | null = null;
afterEach(() => {
  if (monte) unmount(monte);
  monte = null; hote?.remove(); hote = null;
  vi.unstubAllGlobals(); vi.useRealTimers();
});
async function laisserFaire() { for (let i = 0; i < 10; i++) { await vi.advanceTimersByTimeAsync(0); flushSync(); } }
async function poser(): Promise<HTMLDivElement> {
  hote = document.createElement('div'); document.body.appendChild(hote);
  monte = mount(CircleV2 as any, { target: hote }); flushSync(); await laisserFaire();
  return hote;
}
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const panneau = (el: Element, o: string) => el.querySelector(`#circle-panneau-${o}`) as HTMLElement;

describe('rc12 — Mon cercle', () => {
  it('grille des membres : initiales, nom, ville montrée par le contact, et « Ajouter un membre »', async () => {
    const el = await poser();
    const carte = panneau(el, 'cercle').querySelector('ul.grille-membres li.carte-membre')!;
    expect(texte(carte.querySelector('.avatar-membre'))).toBe('A');
    expect(texte(carte.querySelector('.nom'))).toBe('Alice');
    expect(texte(carte.querySelector('.ville-membre'))).toBe('Lyon, FR');
    expect(carte.querySelector('button.revoquer')).not.toBeNull();
    const ajouter = panneau(el, 'cercle').querySelector('button.ajouter-membre') as HTMLButtonElement;
    expect(texte(ajouter)).toContain(fr['v2.circle.addMember']);
    ajouter.click(); await laisserFaire();
    expect(document.activeElement?.id).toBe('circle-email');
  });

  it('aucune présence « en ligne » inventée', async () => {
    const el = await poser();
    expect(texte(panneau(el, 'cercle')).toLowerCase()).not.toContain('en ligne');
  });
});

