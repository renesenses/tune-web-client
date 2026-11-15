// @vitest-environment jsdom
//
// Tune Circle rc12 (maquettes de Levente) — l'onglet Découvrir : compteurs
// de MON cercle, « Nouveau sur Tune Circle », messages récents, mon cercle,
// playlists, activité récente. Aucune donnée inventée : un bloc sans donnée
// n'est pas affiché, un compteur inconnu ou nul non plus.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, flushSync, createRawSnippet } from 'svelte';
import Decouvrir from '../../components/v2/DecouvrirCercleV2.svelte';
import { preparerLocale } from '../i18n';
import { notifsCercle } from '../circleNotifications';
import { apercuConversations, demandeConversation } from '../circleMessagerie';
import fr from '../locales/fr';

const scene = createRawSnippet(() => ({ render: () => '<div class="scene-factice">globe</div>' }));
const contacts = [{ user_id: 12, name: 'Alice Martin', since: '2026-09-01T10:00:00Z' }, { user_id: 13, name: 'Bruno', since: '2026-09-02T10:00:00Z' }];
const notif = (id: number, kind: string, at: string, o: Record<string, unknown> = {}) =>
  ({ id, kind, at, read: false, actor: { user_id: id, name: `Ami ${id}` }, circle_name: null, playlist: null, conversation_id: null, invitation_id: null, count: 1, ...o });

let hote: HTMLDivElement;
let vue: ReturnType<typeof mount> | null = null;
let onglets: string[] = [];
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
function poser(props: Record<string, unknown> = {}) {
  onglets = [];
  vue = mount(Decouvrir as any, { target: hote, props: {
    scene, contacts, lieux: new Map(), playlists: null, occupe: false,
    onOnglet: (o: string) => onglets.push(o), onInviter: () => onglets.push('inviter'),
    onOuvrirPlaylist: () => {}, onLirePlaylist: () => {}, ...props,
  } });
  flushSync();
}

beforeAll(async () => { await preparerLocale('fr'); });
beforeEach(() => {
  notifsCercle.set({ relais: 'ok', nonLues: 0, liste: [] });
  apercuConversations.set([]); demandeConversation.set(null);
  hote = document.createElement('div'); document.body.append(hote);
});
afterEach(() => { if (vue) unmount(vue); vue = null; hote.remove(); });

describe('rc12 — Découvrir', () => {
  it('la scène (globe) est rendue ; sans donnée, ni nouveaux, ni messages, ni playlists, ni activité', () => {
    poser({ contacts: [] });
    expect(hote.querySelector('.hero .scene-factice')).not.toBeNull();
    for (const s of ['.nouveaux', '.messages-recents', '.playlists-apercu', '.activite', '.chiffres-cercle']) expect(hote.querySelector(s)).toBeNull();
    // Mon cercle reste là, avec « Ajouter un membre ».
    expect(hote.querySelector('.ton-cercle button.ajouter')).not.toBeNull();
  });

  it('compteurs de MON cercle : membres, pays des lieux montrés, playlists — rien de nul', () => {
    const lieux = new Map([[12, { label: 'Lyon', country_code: 'FR', lat: 45.5, lon: 4.5 }], [13, { label: 'Budapest', country_code: 'HU', lat: 47.5, lon: 19 }]]);
    poser({ lieux, playlists: [] });
    const chiffres = [...hote.querySelectorAll('.chiffres-cercle .chiffre')].map((c) => [texte(c.querySelector('dt')), texte(c.querySelector('dd'))]);
    expect(chiffres).toEqual([[fr['v2.circle.disc.statMembers'], '2'], [fr['v2.circle.disc.statCountries'], '2']]);
    expect(texte(hote.querySelector('.ton-cercle'))).toContain('Lyon, FR');
    expect(texte(hote.querySelector('.ton-cercle .avatar'))).toBe('AM');
  });

  it('« Nouveau sur Tune Circle » et « Activité récente » viennent des notifications', () => {
    notifsCercle.set({ relais: 'ok', nonLues: 2, liste: [
      notif(1, 'contact_accepted', '2026-11-10T10:00:00Z'),
      notif(2, 'playlist_shared', '2026-11-12T10:00:00Z', { playlist: { id: 4, name: 'FIP Select' }, circle_name: 'Bêta' }),
      notif(3, 'message', '2026-11-13T10:00:00Z'),
    ] as any });
    poser();
    expect([...hote.querySelectorAll('.nouveaux strong')].map(texte)).toEqual(['Ami 1']);
    const lignes = [...hote.querySelectorAll('.activite .texte-rang')].map(texte);
    expect(lignes[0]).toContain('FIP Select');
    expect(lignes[1]).toBe(fr['v2.circle.disc.joined'].replace('{name}', 'Ami 1'));
    expect(lignes).toHaveLength(2);
  });

  it('messages récents : un clic ouvre la conversation (et l’écran passe à Messages)', () => {
    apercuConversations.set([{ id: 12, kind: 'direct', contact: { user_id: 12, name: 'Alice Martin' }, unread_count: 1,
      last_message: { id: 4, sender_id: 12, mine: false, body: 'Écoute ça', card: null, created_at: '2026-11-15T09:00:00Z' } }] as any);
    poser();
    const rang = hote.querySelector('.messages-recents .rang-bouton') as HTMLButtonElement;
    expect(texte(rang)).toContain('Écoute ça');
    expect(rang.querySelector('.point-non-lu')).not.toBeNull();
    let demande: unknown = null;
    const fin = demandeConversation.subscribe((d) => { demande = d; });
    rang.click(); fin();
    expect(demande).toEqual({ conversation: 12 });
    (hote.querySelector('.messages-recents .voir-tout') as HTMLButtonElement).click();
    expect(onglets).toEqual(['messages']);
  });

  it('playlists : six au plus, « Tout voir » mène à l’onglet', () => {
    const pls = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, owner: { user_id: 9, name: 'Yves' }, count: 2, version: 1, updated_at: null, mine: false, circle_id: null }));
    poser({ playlists: pls });
    expect(hote.querySelectorAll('.playlists-apercu .mini-playlist')).toHaveLength(6);
    (hote.querySelector('.playlists-apercu .voir-tout') as HTMLButtonElement).click();
    expect(onglets).toEqual(['playlists']);
  });

  it('ni « Personnes près de vous », ni présence, ni compteurs mondiaux', () => {
    poser();
    const t = texte(hote).toLowerCase();
    for (const mot of ['près de vous', 'en ligne', 'monde entier']) expect(t).not.toContain(mot);
  });
});

describe('rc12 — relecture sur le .18 : légende de la carte du monde', () => {
  it('PaysMondeV2 habille lui-même son interrupteur et ses notes (les styles du parent ne le traversent pas)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, '../../components/v2/PaysMondeV2.svelte'), 'utf8');
    const style = src.slice(src.indexOf('<style>'));
    expect(style).toMatch(/\.lnk\{[^}]*font:/);
    expect(style).toMatch(/\.note\{/);
    expect(style).toMatch(/\.pays-monde\{[^}]*font-family:var\(--v2-sans\)/);
  });
});
