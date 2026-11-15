// @vitest-environment jsdom
//
// Tune Circle rc12 (maquettes de Levente) — l'onglet Playlists partagées :
// grille de cartes, filtres, tri, bascule grille/liste, « Vos playlists ».
// Rien d'inventé : ni abonnés, ni écoutes, ni tendances, ni pochette.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Grille from '../../components/v2/PlaylistsGrilleCercleV2.svelte';
import { preparerLocale } from '../i18n';
import { filtrerPlaylists, compteursCercle, nouveauxDansLeCercle, activiteRecente, conversationsRecentes, initiales } from '../circleHabillage';
import fr from '../locales/fr';

const MAINTENANT = Date.parse('2026-11-15T12:00:00Z');
const pl = (id: string, name: string, o: Record<string, unknown> = {}) => ({
  id, name, owner: { user_id: 9, name: 'Élise' }, count: 4, version: 1, updated_at: '2026-11-01T10:00:00Z',
  mine: false, circle_id: null, circle_name: 'Famille', ...o,
}) as any;
const LISTE = [
  pl('a', 'Dimanche', { updated_at: '2026-11-14T10:00:00Z', count: 12 }),
  pl('b', 'Apéro', { mine: true, owner: { user_id: 1, name: 'Moi' }, circle_id: 7, count: 3 }),
  pl('c', 'Vide', { count: 0, updated_at: null }),
];

let hote: HTMLDivElement;
let vue: ReturnType<typeof mount> | null = null;
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const noms = () => [...hote.querySelectorAll('li.playlist-cercle .nom')].map(texte);
let appels: { quoi: string; arg: unknown }[] = [];
function poser(props: Record<string, unknown> = {}) {
  appels = [];
  vue = mount(Grille as any, { target: hote, props: {
    playlists: LISTE, occupe: false, cercles: [{ id: 7, name: 'Famille', member_ids: [] }],
    invitePar: [{ circle_id: 3, circle_name: 'Bêta', owner_name: 'Yves' }],
    onOuvrir: (id: unknown) => appels.push({ quoi: 'ouvrir', arg: id }),
    onLire: (p: any) => appels.push({ quoi: 'lire', arg: p.id }),
    onCreer: (c: any) => appels.push({ quoi: 'creer', arg: c.id }),
    onPartager: (m: any) => appels.push({ quoi: 'partager', arg: m.circle_id }),
    ...props,
  } });
  flushSync();
}
const clic = (el: Element | null) => { (el as HTMLButtonElement).click(); flushSync(); };

beforeAll(async () => { await preparerLocale('fr'); });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(MAINTENANT); hote = document.createElement('div'); document.body.append(hote); });
afterEach(() => { if (vue) unmount(vue); vue = null; hote.remove(); vi.useRealTimers(); });

describe('rc12 — grille des playlists partagées', () => {
  it('une carte par playlist : vignette, bouton Lire, nom, morceaux, cercle, partageur (pas « de Moi »)', () => {
    poser();
    const cartes = [...hote.querySelectorAll('ul.playlists-grille > li.carte-playlist')];
    expect(cartes).toHaveLength(3);
    const dimanche = cartes.find((c) => texte(c.querySelector('.nom')) === 'Dimanche')!;
    expect(dimanche.querySelector('.vignette button.lire-playlist-ligne')?.getAttribute('aria-label')).toBe('Lire la playlist Dimanche');
    expect(texte(dimanche)).toContain('12 titres');
    expect(texte(dimanche)).toContain('Famille');
    expect(texte(dimanche.querySelector('.proprietaire'))).toContain('de Élise');
    expect(texte(dimanche.querySelector('.avatar-mini'))).toBe('É');
    const apero = cartes.find((c) => texte(c.querySelector('.nom')) === 'Apéro')!;
    expect(apero.querySelector('.proprietaire')).toBeNull();
    // Une playlist vide ne se lit pas.
    const vide = cartes.find((c) => texte(c.querySelector('.nom')) === 'Vide')!;
    expect((vide.querySelector('button.lire-playlist-ligne') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Lire et Ouvrir passent la main à l’écran', () => {
    poser();
    clic(hote.querySelector('li.playlist-cercle button.lire-playlist-ligne'));
    clic(hote.querySelector('li.playlist-cercle button.ouvrir-playlist'));
    expect(appels).toEqual([{ quoi: 'lire', arg: 'a' }, { quoi: 'ouvrir', arg: 'a' }]);
  });

  it('aucun chiffre inventé : ni abonnés, ni écoutes, ni tendances, ni « Suivies »', () => {
    poser();
    const t = texte(hote).toLowerCase();
    for (const mot of ['abonnés', 'écoutes', 'tendances', 'suivies', 'personnes à suivre']) expect(t).not.toContain(mot);
    const chiffres = [...hote.querySelectorAll('.chiffres-playlists dd')].map(texte);
    expect(chiffres).toEqual(['3', '15']);
  });

  it('filtres : Nouveautés (7 jours), Par mes amis, Les miennes', () => {
    poser();
    const puce = (k: string) => hote.querySelector(`.filtres-playlists .filtre-${k}`);
    expect(texte(puce('nouveautes'))).toBe(fr['v2.circle.plx.filterNew']);
    clic(puce('nouveautes'));
    expect(noms()).toEqual(['Dimanche']);
    clic(puce('amis'));
    expect(noms()).toEqual(['Dimanche', 'Vide']);
    clic(puce('miennes'));
    expect(noms()).toEqual(['Apéro']);
    expect(puce('miennes')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('tri : récentes, nom, nombre de morceaux', () => {
    poser();
    expect(noms()).toEqual(['Dimanche', 'Apéro', 'Vide']);
    const tri = hote.querySelector('select.choix-tri') as HTMLSelectElement;
    tri.value = 'nom'; tri.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
    expect(noms()).toEqual(['Apéro', 'Dimanche', 'Vide']);
    tri.value = 'titres'; tri.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
    expect(noms()).toEqual(['Dimanche', 'Apéro', 'Vide']);
  });

  it('bascule grille ↔ liste', () => {
    poser();
    expect(hote.querySelector('ul.playlists-grille.en-liste')).toBeNull();
    clic(hote.querySelector('.vue-liste'));
    expect(hote.querySelector('ul.playlists-grille.en-liste')).not.toBeNull();
    expect(hote.querySelector('.vue-liste')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('« Vos playlists » : les miennes seulement', () => {
    poser();
    expect([...hote.querySelectorAll('.pl-own li strong')].map(texte)).toEqual(['Apéro']);
  });

  it('Créer et Partager proposent les cercles possibles', () => {
    poser();
    clic(hote.querySelector('.creer-une-playlist'));
    clic([...hote.querySelectorAll('.menu-cercles button')].find((b) => texte(b) === 'Famille')!);
    clic(hote.querySelector('.partager-une-playlist'));
    clic(hote.querySelector('.menu-cercles button'));
    expect(appels).toEqual([{ quoi: 'creer', arg: 7 }, { quoi: 'partager', arg: 3 }]);
  });

  it('sans cercle : ni Créer ni Partager ; sans playlist : ni filtres ni chiffres', () => {
    poser({ cercles: [], invitePar: [], playlists: [] });
    expect(hote.querySelector('.creer-une-playlist')).toBeNull();
    expect(hote.querySelector('.partager-une-playlist')).toBeNull();
    expect(hote.querySelector('.filtres-playlists')).toBeNull();
    expect(hote.querySelector('.chiffres-playlists')).toBeNull();
  });
});

describe('rc12 — fonctions pures de Découvrir', () => {
  it('filtrerPlaylists garde l’ordre du cloud à date égale', () => {
    const l = [pl('x', 'Zèbre'), pl('y', 'Alpha')];
    expect(filtrerPlaylists(l, 'tout', 'recentes', MAINTENANT).map((p) => p.id)).toEqual(['x', 'y']);
  });
  it('compteursCercle : pays cachés sans lieu, playlists cachées sans T5', () => {
    const contacts = [{ user_id: 1, name: 'A', since: '' }, { user_id: 2, name: 'B', since: '' }];
    expect(compteursCercle(contacts, new Map(), null)).toEqual({ membres: 2, pays: null, playlists: null });
    const lieux = new Map([[1, { label: 'Paris', country_code: 'fr', lat: 0, lon: 0 }], [2, { label: 'Lyon', country_code: 'FR', lat: 0, lon: 0 }]]);
    expect(compteursCercle(contacts, lieux, [])).toEqual({ membres: 2, pays: 1, playlists: 0 });
  });
  it('nouveaux, activité, conversations récentes : du plus récent au plus ancien', () => {
    const n = (id: number, kind: string, at: string) => ({ id, kind, at, read: false, actor: { user_id: id, name: 'X' }, circle_name: null, playlist: null, conversation_id: null, invitation_id: null, count: 1 }) as any;
    const notifs = [n(1, 'contact_accepted', '2026-11-01'), n(2, 'message', '2026-11-10'), n(3, 'playlist_shared', '2026-11-12'), n(4, 'contact_accepted', '2026-11-13')];
    expect(nouveauxDansLeCercle(notifs).map((x) => x.id)).toEqual([4, 1]);
    expect(activiteRecente(notifs).map((x) => x.id)).toEqual([4, 3, 1]);
    const c = (id: number, at: string | null) => ({ id, kind: 'direct', contact: { user_id: id, name: 'X' }, unread_count: 0, last_message: at ? { id, created_at: at } : null }) as any;
    expect(conversationsRecentes([c(1, '2026-11-01'), c(2, null), c(3, '2026-11-05')]).map((x) => x.id)).toEqual([3, 1]);
    expect(initiales('jean  pierre robbe')).toBe('JP');
  });
});

describe('rc12 — relecture : menus et pluriels', () => {
  it('Échap et un clic à l’extérieur ferment le menu Créer', () => {
    poser();
    clic(hote.querySelector('.creer-une-playlist'));
    expect(hote.querySelector('.menu-cercles')).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); flushSync();
    expect(hote.querySelector('.menu-cercles')).toBeNull();
    clic(hote.querySelector('.creer-une-playlist'));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })); flushSync();
    expect(hote.querySelector('.menu-cercles')).toBeNull();
  });

  it('pluriel : « 1 titre », jamais « 1 morceaux »', () => {
    poser({ playlists: [pl('u', 'Seul', { count: 1 })] });
    const t = texte(hote.querySelector('li.playlist-cercle'));
    expect(t).toContain('1 titre');
    expect(t).not.toContain('1 titres');
  });
});
