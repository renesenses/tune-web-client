// @vitest-environment jsdom
//
// Tune Circle rc12 (maquettes de Levente, 15/11/2026) — Messages : deux
// colonnes, recherche et filtres de la liste, « Partagé dans cette
// conversation ». Rien d'inventé : ni appel, ni présence en ligne.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import Messagerie from '../../components/v2/MessagerieCercleV2.svelte';
import { preparerLocale } from '../i18n';
import { fetchJSON } from '../api';
import { nonLusMessagerie, apercuConversations, demandeConversation, messagerieSupport } from '../circleMessagerie';
import { filtrerConversations, partagesDuFil } from '../circleHabillage';
import fr from '../locales/fr';

vi.mock('../api', () => ({ BASE: '/api/v1', fetchJSON: vi.fn(), searchLibrary: vi.fn(), getPlaylists: vi.fn() }));
vi.mock('../circleNotifications', () => ({ relireNotifications: vi.fn(async () => {}) }));
const appel = vi.mocked(fetchJSON);

const msg = (id: number, o: Record<string, unknown>) => ({ id, sender_id: 7, mine: false, body: null, card: null, created_at: '2026-11-15T10:00:00Z', ...o });
const alice = { id: 12, kind: 'direct', contact: { user_id: 7, name: 'Alice' }, unread_count: 2, last_message: msg(4, { body: 'Écoute ça' }) };
const famille = { id: 13, kind: 'circle', contact: null, circle: { id: 5, name: 'Famille', owner_id: 1, owner_name: 'Moi', mine: true, write: 'all' }, can_write: true, unread_count: 1, last_message: msg(9, { body: 'Dimanche ?' }) };
const jazz = { id: 14, kind: 'general', contact: null, circle: { id: 2, name: 'Jazz', }, name_consent_required: false, unread_count: 0, last_message: null };
const filAlice = [
  msg(1, { body: 'Salut' }),
  msg(2, { mine: true, sender_id: 1, body: 'Bonjour' }),
  msg(3, { card: { type: 'album', title: 'Kind of Blue', artist_name: 'Miles Davis' } }),
  msg(4, { card: { type: 'album', title: 'Kind of Blue', artist_name: 'Miles Davis' } }),
  msg(5, { card: { type: 'theme', title: 'Mon thème', colors: {} } }),
];

let hote: HTMLDivElement;
let vue: ReturnType<typeof mount> | null = null;
const finir = async () => { for (let n = 0; n < 6; n++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const noms = () => [...hote.querySelectorAll('.conversation strong')].map(texte);

beforeAll(async () => { await preparerLocale('fr'); });
beforeEach(() => {
  demandeConversation.set(null); messagerieSupport.set(null); appel.mockReset();
  appel.mockImplementation(async (url: any) => {
    const u = String(url);
    if (u.endsWith('/conversations')) return { conversations: [alice, famille, jazz] } as any;
    if (u.includes('/messages?')) return { conversation: alice, messages: filAlice, next_cursor: null } as any;
    return { unread_count: 0 } as any;
  });
  hote = document.createElement('div'); document.body.append(hote);
});
afterEach(async () => { if (vue) await unmount(vue); vue = null; hote.remove(); vi.restoreAllMocks(); });

describe('rc12 — liste des conversations', () => {
  it('publie les non-lus pour la pastille de l’onglet et l’aperçu pour Découvrir', async () => {
    vue = mount(Messagerie, { target: hote }); await finir();
    expect(get(nonLusMessagerie)).toBe(3);
    expect(get(apercuConversations).map((c) => c.id)).toEqual([12, 13, 14]);
    expect(texte(hote.querySelector('.pastille-non-lus'))).toBe(fr['v2.circle.tab.unread'].replace('{n}', '3'));
  });

  it('filtres Tout · Directs · Groupes, sans filtre « Playlists » (aucun genre de conversation ne le porte)', async () => {
    vue = mount(Messagerie, { target: hote }); await finir();
    const puces = [...hote.querySelectorAll('.filtres-conversations button')];
    expect(puces.map(texte)).toEqual([fr['v2.circle.msg.filterAll'], fr['v2.circle.msg.filterDirect'], fr['v2.circle.msg.filterGroups']]);
    expect(puces[0].getAttribute('aria-pressed')).toBe('true');
    (puces[1] as HTMLButtonElement).click(); await finir();
    expect(noms()).toEqual(['Alice']);
    (puces[2] as HTMLButtonElement).click(); await finir();
    expect(noms()).toEqual(['# Famille', '# Jazz']);
  });

  it('la recherche lit le nom et le dernier message, sans tenir compte des accents', async () => {
    vue = mount(Messagerie, { target: hote }); await finir();
    const champ = hote.querySelector('.champ-recherche') as HTMLInputElement;
    champ.value = 'ecoute'; champ.dispatchEvent(new Event('input', { bubbles: true })); await finir();
    expect(noms()).toEqual(['Alice']);
    champ.value = 'zzz'; champ.dispatchEvent(new Event('input', { bubbles: true })); await finir();
    expect(noms()).toEqual([]);
    expect(texte(hote.querySelector('.aucun-resultat'))).toBe(fr['v2.circle.msg.noMatch']);
  });

  it('aucune présence ni appel inventés', async () => {
    vue = mount(Messagerie, { target: hote }); await finir();
    (hote.querySelector('.conversation') as HTMLButtonElement).click(); await finir();
    const t = texte(hote).toLowerCase();
    for (const mot of ['en ligne', 'online', 'appel', 'vidéo']) expect(t).not.toContain(mot);
  });
});

describe('rc12 — le fil', () => {
  it('bulles : les miennes à droite (classe mon-message), et « Partagé dans cette conversation » sans doublon ni thème', async () => {
    vue = mount(Messagerie, { target: hote }); await finir();
    (hote.querySelector('.conversation') as HTMLButtonElement).click(); await finir();
    expect(hote.querySelectorAll('.message.mon-message .bulle')).toHaveLength(1);
    expect(hote.querySelectorAll('.message:not(.mon-message) .bulle').length).toBeGreaterThan(0);
    const bloc = hote.querySelector('.partages-fil')!;
    expect(texte(bloc.querySelector('h3'))).toBe(fr['v2.circle.msg.sharedHere']);
    expect([...bloc.querySelectorAll('.partage-fil strong')].map(texte)).toEqual(['Kind of Blue']);
  });

  it('pas de bloc « Partagé » quand le fil n’a aucune carte', () => {
    expect(partagesDuFil([msg(1, { body: 'x' }) as any])).toEqual([]);
  });
});

describe('rc12 — fonctions pures', () => {
  it('filtrerConversations : un cercle général compte parmi les groupes', () => {
    const l = [alice, famille, jazz] as any;
    expect(filtrerConversations(l, 'groupes', '').map((c) => c.id)).toEqual([13, 14]);
    expect(filtrerConversations(l, 'tout', 'JAZZ').map((c) => c.id)).toEqual([14]);
  });
});
