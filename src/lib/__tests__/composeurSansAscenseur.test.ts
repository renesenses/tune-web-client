// @vitest-environment jsdom
// Recette rc12 (14/11) — Tune Circle, messagerie : le champ « Écrire… »
// affichait un ascenseur blanc et coupait le texte indicatif.
// Cause : la hauteur automatique posait `scrollHeight` (sans les bordures)
// sur un champ en `box-sizing:border-box` → 2 px de contenu en trop →
// l'`overflow:auto` natif sortait l'ascenseur de 14 px. jsdom ne calcule pas
// la mise en page : on simule les mesures du champ et on garde les règles CSS.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Messagerie from '../../components/v2/MessagerieCercleV2.svelte';
import { preparerLocale } from '../i18n';
import { fetchJSON } from '../api';
import { demandeConversation, messagerieSupport, carteAPartager } from '../circleMessagerie';

vi.mock('../api', () => ({ BASE: '/api/v1', fetchJSON: vi.fn(), searchLibrary: vi.fn(), getPlaylists: vi.fn() }));
vi.mock('../circleNotifications', () => ({ relireNotifications: vi.fn(async () => {}) }));
vi.mock('../circle', async (orig) => ({ ...(await orig<typeof import('../circle')>()), getCercle: vi.fn(async () => ({ connected: true, members: [{ user_id: 7, name: 'Alice' }] })), estConnecte: () => true }));
const appel = vi.mocked(fetchJSON);
const conv = { id: 12, kind: 'direct', contact: { user_id: 7, name: 'Alice' }, unread_count: 0, last_message: null };
const finir = async () => { for (let n = 0; n < 5; n++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
let hote: HTMLDivElement;
let vue: ReturnType<typeof mount> | null = null;

beforeAll(async () => { await preparerLocale('fr'); });
beforeEach(() => {
  localStorage.clear(); demandeConversation.set(null); messagerieSupport.set(null); appel.mockReset();
  appel.mockImplementation(async (url: any) => {
    const u = String(url);
    if (u.endsWith('/conversations')) return { conversations: [conv] } as any;
    if (u.includes('/contacts/7/conversation')) return conv as any;
    if (u.includes('/messages?')) return { conversation: conv, messages: [], next_cursor: null } as any;
    return { unread_count: 0 } as any;
  });
  hote = document.createElement('div'); document.body.append(hote);
});
afterEach(async () => { if (vue) await unmount(vue); vue = null; hote.remove(); carteAPartager.set(null); });

/** Champ de 2 px de bordure (1 px haut + bas) dont le contenu mesure `contenu` px. */
function mesurer(champ: HTMLTextAreaElement, contenu: number) {
  Object.defineProperty(champ, 'scrollHeight', { configurable: true, get: () => contenu });
  Object.defineProperty(champ, 'clientHeight', { configurable: true, get: () => (parseFloat(champ.style.height) || 40) - 2 });
  Object.defineProperty(champ, 'offsetHeight', { configurable: true, get: () => (parseFloat(champ.style.height) || 40) });
}

describe('Tune Circle — champ « Écrire… » sans ascenseur', () => {
  async function ouvrir() {
    vue = mount(Messagerie, { target: hote }); await finir();
    demandeConversation.set({ contact: 7 }); await finir();
    return hote.querySelector('#message-texte') as HTMLTextAreaElement;
  }

  it('la hauteur automatique compte les bordures : le contenu tient, aucun ascenseur', async () => {
    const champ = await ouvrir();
    expect(champ).toBeTruthy();
    mesurer(champ, 62); // deux lignes de 24 px + 2 × 7 px de marge intérieure
    champ.value = 'un\ndeux'; champ.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    expect(champ.style.height).toBe('64px');
    expect(champ.clientHeight).toBeGreaterThanOrEqual(champ.scrollHeight);
    expect(champ.style.overflowY).toBe('hidden');
  });

  it('au-delà de la hauteur maximale, le défilement vertical revient', async () => {
    const champ = await ouvrir();
    mesurer(champ, 300);
    champ.value = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj'; champ.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    expect(champ.style.height).toBe('158px');
    expect(champ.style.overflowY).toBe('auto');
  });

  it('CSS : pas de défilement horizontal, texte indicatif sur une ligne, suggestion hors du flux', () => {
    const src = readFileSync(resolve(__dirname, '../../components/v2/MessagerieCercleV2.svelte'), 'utf-8');
    const regle = (sel: string) => src.match(new RegExp(`(?:^|[}\\s])${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`))?.[1] ?? '';
    const champ = regle('.composeur textarea');
    expect(champ).toMatch(/overflow-x:hidden/);
    expect(champ).toMatch(/overflow-y:hidden/);
    expect(champ).toMatch(/box-sizing:border-box/);
    expect(regle('.composeur textarea::placeholder')).toMatch(/white-space:nowrap/);
    expect(regle('.composeur')).toMatch(/position:relative/);
    const bulle = regle('.composeur :global([data-suggestion-emoji])');
    expect(bulle).toMatch(/position:absolute/);
    expect(bulle).toMatch(/bottom:100%/);
  });
});
