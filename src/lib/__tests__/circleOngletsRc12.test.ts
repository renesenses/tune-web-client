// @vitest-environment jsdom
//
// Tune Circle rc12 (maquettes de Levente) — en-tête et onglets de l'écran.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CircleV2 from '../../components/v2/CircleV2.svelte';
import { preparerLocale } from '../i18n';
import { circlePlugin } from '../circle';
import { demandeConversation, nonLusMessagerie } from '../circleMessagerie';
import { ongletVoisin, ONGLETS_CIRCLE } from '../circleOnglets';
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

describe('rc12 — en-tête', () => {
  it('titre, sous-titre traduit, bouton Inviter', async () => {
    const el = await poser();
    expect(texte(el.querySelector('h1.titre-circle'))).toBe('Tune Circle');
    expect(texte(el.querySelector('.sous-titre'))).toBe(fr['v2.circle.tagline']);
    expect(el.querySelector('.inviter-entete')).not.toBeNull();
  });

  it('Inviter mène à Mon cercle, curseur dans l’adresse', async () => {
    const el = await poser();
    (el.querySelector('.inviter-entete') as HTMLButtonElement).click();
    await laisserFaire();
    expect(panneau(el, 'cercle').hidden).toBe(false);
    expect(document.activeElement?.id).toBe('circle-email');
  });
});

describe('rc12 — onglets', () => {
  it('quatre onglets, Découvrir choisi ; un seul panneau visible ; les vues existantes restent montées', async () => {
    const el = await poser();
    const onglets = [...el.querySelectorAll('[role="tab"]')];
    expect(onglets.map((o) => texte(o.querySelector('.libelle-onglet')))).toEqual([
      fr['v2.circle.tab.discover'], fr['v2.circle.tab.messages'], fr['v2.circle.tab.playlists'], fr['v2.circle.tab.myCircle'],
    ]);
    expect(onglets[0].getAttribute('aria-selected')).toBe('true');
    expect(ONGLETS_CIRCLE.filter((o) => !panneau(el, o).hidden)).toEqual(['decouvrir']);
    // Mon cercle caché mais monté : ses blocs sont là.
    expect(panneau(el, 'cercle').querySelector('section.contacts')).not.toBeNull();
    (onglets[3] as HTMLButtonElement).click(); await laisserFaire();
    expect(ONGLETS_CIRCLE.filter((o) => !panneau(el, o).hidden)).toEqual(['cercle']);
    expect(onglets[3].getAttribute('aria-selected')).toBe('true');
    expect(onglets[3].getAttribute('tabindex')).toBe('0');
    expect(onglets[0].getAttribute('tabindex')).toBe('-1');
  });

  it('la pastille de Messages suit les non-lus, et disparaît à zéro', async () => {
    const el = await poser();
    expect(el.querySelector('.onglet-messages .pastille-onglet')).toBeNull();
    nonLusMessagerie.set(4); flushSync();
    expect(texte(el.querySelector('.onglet-messages .pastille-onglet'))).toBe('4');
  });

  it('une conversation demandée (Écrire, notification) mène à Messages', async () => {
    const el = await poser();
    demandeConversation.set({ contact: 12 }); await laisserFaire();
    expect(panneau(el, 'messages').hidden).toBe(false);
  });

  it('clavier : flèches, Début, Fin, en boucle', () => {
    expect(ongletVoisin('decouvrir', 'ArrowRight')).toBe('messages');
    expect(ongletVoisin('decouvrir', 'ArrowLeft')).toBe('cercle');
    expect(ongletVoisin('playlists', 'Home')).toBe('decouvrir');
    expect(ongletVoisin('messages', 'End')).toBe('cercle');
    expect(ongletVoisin('messages', 'a')).toBeNull();
  });
});
