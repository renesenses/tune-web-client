// @vitest-environment jsdom
//
// Page artiste — maquette de Levente (Figma 616:5810 « structural header » et
// 616:5811 « Similar Artists », go de Bertrand le 15/11/2026, rc12).
//
// Ce qui est vérifié :
//  - les règles de forme (`pageArtisteMaquette.ts`) : onglets seulement quand
//    ils ont une donnée, chiffres jamais inventés ni nuls, portraits des
//    similaires sur correspondance EXACTE du nom ;
//  - l'en-tête en disposition `maquette` (chiffres à droite), la disposition
//    standard inchangée ;
//  - sur la VRAIE coquille : Lire + cœur + « … » (tous les gestes restent dans
//    la rangée), les onglets Aperçu / Albums / Artistes similaires, la grille
//    des similaires et son ouverture.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import ShellV2 from '../../components/v2/ShellV2.svelte';
import EnTeteArtiste from '../../components/v2/EnTeteArtiste.svelte';
import { activeView, vueDeRetour } from '../stores/navigation';
import { departSimilaires } from '../retourAuxSimilaires';
import { ficheArtisteService } from '../stores/streaming';
import { t } from '../i18n';
import { chiffresEnTete, ongletsArtiste, ongletValide, portraitsSimilaires } from '../pageArtisteMaquette';

const libelle = (cle: string) => get(t)(cle as any);

describe('maquette de Levente — règles de forme', () => {
  it('onglets : seulement ceux qui ont une donnée, et pas de barre pour un seul', () => {
    expect(ongletsArtiste({ discographie: true, similaires: 3 })).toEqual(['apercu', 'albums', 'similaires']);
    expect(ongletsArtiste({ discographie: true, similaires: 0 })).toEqual(['apercu', 'albums']);
    expect(ongletsArtiste({ discographie: false, similaires: 2 })).toEqual(['apercu', 'similaires']);
    expect(ongletsArtiste({ discographie: false, similaires: 0 })).toEqual([]);
    expect(ongletValide('similaires', ['apercu', 'albums'])).toBe('apercu');
    expect(ongletValide('albums', ['apercu', 'albums'])).toBe('albums');
  });

  it('chiffres : jamais un zéro, jamais une donnée absente', () => {
    const l = (k: string) => `<${k}>`;
    expect(chiffresEnTete({ albums: null, compteurs: null }, l)).toEqual([]);
    expect(chiffresEnTete({ albums: 0, compteurs: { performing: { tracks: 0 }, writing: undefined } }, l)).toEqual([]);
    const c = chiffresEnTete({ albums: 11, compteurs: { performing: { tracks: 120, albums: 9 }, writing: { tracks: 4, albums: 0 } } }, l);
    expect(c.map((x) => [x.cle, x.valeur, x.libelle, x.albums])).toEqual([
      ['albums', 11, '<artist.page.statAlbums>', undefined],
      // Relecture du 15/11 : le compte d'albums des compteurs reste lisible.
      ['interprete', 120, '<artist.page.statPerforming>', 9],
      ['ecriture', 4, '<artist.page.statWriting>', undefined],
    ]);
  });

  it('portraits : nom exact seulement, une requête en échec n’emporte pas les autres', async () => {
    const chercher = vi.fn(async (n: string) => {
      if (n === 'Panne') throw new Error('502');
      if (n === 'Bill Evans') return { artists: [{ id: 3, name: 'Bill Evans Trio', image_path: '/x.jpg' }] };
      return { artists: [{ id: 7, name: n.toUpperCase(), image_path: '/p.jpg' }] };
    });
    const p = await portraitsSimilaires(['John Coltrane', 'Bill Evans', 'Panne', 'John Coltrane', ''], chercher);
    expect(p).toEqual({ 'John Coltrane': { id: 7, image: '/p.jpg' } });
    expect(chercher).toHaveBeenCalledTimes(3);
  });
});

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

describe('maquette de Levente — en-tête', () => {
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    hote = null;
  });
  const poser = (props: Record<string, unknown>) => {
    hote = document.createElement('div');
    document.body.appendChild(hote);
    monte = mount(EnTeteArtiste, { target: hote, props: { nom: 'Miles Davis', onRetour: () => {}, ...props } as any });
    flushSync();
    return hote;
  };
  const CHIFFRES = [
    { cle: 'albums', valeur: 60, libelle: 'Albums', icone: 'albums' },
    { cle: 'interprete', valeur: 500, libelle: 'Tracks as performer', icone: 'interprete', albums: 37 },
  ];

  it('disposition `maquette` : les chiffres à droite, la ligne d’identité ne les répète pas', () => {
    const h = poser({ disposition: 'maquette', chiffres: CHIFFRES, sousTitre: '60 albums', provenance: 'Library' });
    const tete = h.querySelector('header.tete')!;
    expect(tete.classList.contains('maquette')).toBe(true);
    expect(tete.classList.contains('avec-chiffres')).toBe(true);
    const items = [...h.querySelectorAll('[data-chiffres-artiste] li')];
    expect(items.map((li) => li.getAttribute('data-chiffre'))).toEqual(['albums', 'interprete']);
    expect(items[1].querySelector('.valeur')!.textContent).toMatch(/500/);
    // Le nombre d'albums du compteur, masqué de la ligne d'identité, reste sous le chiffre.
    expect(items[1].querySelector('[data-chiffre-albums]')?.textContent).toMatch(/37/);
    expect(items[0].querySelector('[data-chiffre-albums]')).toBeNull();
    // La ligne « 60 albums » reste dans le DOM (#1356) — c'est le CSS qui la
    // cède à la colonne des chiffres.
    expect(h.querySelector('.ident .cpt')?.textContent).toContain('60');
  });

  it('vérification du .18 (15/11) : les écoutes quittent le titre pour les chiffres ; place pour les icônes fixes sur mobile', () => {
    expect(chiffresEnTete({ ecoutes: 308 }, (k) => k).map((c) => [c.cle, c.valeur, c.libelle]))
      .toEqual([['ecoutes', 308, 'library.communityListensTip']]);
    expect(chiffresEnTete({ ecoutes: null }, (k) => k)).toEqual([]);
    const h = poser({ nom: 'Pink Floyd', disposition: 'maquette', ecoutes: { community_listens: 308 },
      chiffres: [{ cle: 'ecoutes', valeur: 308, libelle: 'Tune community listens', icone: 'ecoutes' }] });
    expect(h.querySelector('h1')!.textContent?.trim()).toBe('Pink Floyd');
    expect(h.querySelector('[data-chiffre="ecoutes"] .valeur')?.textContent).toMatch(/308/);
    const src = readFileSync('src/components/v2/EnTeteArtiste.svelte', 'utf8');
    const mobile = src.slice(src.lastIndexOf('@media (max-width: 640px)'));
    expect(mobile).toMatch(/\.tete\.maquette\{[^}]*padding-top:\s*\d+px/);
    // Recette du 15/11 : hors mobile, les chiffres laissent la place de la
    // grappe fixe du haut à droite (réserve commune, comme la fiche album).
    expect(src).toMatch(/@media \(min-width: 641px\)\{\s*\.tete\.maquette\{padding-right:var\(--v2-grappe-w, 172px\)\}/);
  });

  it('disposition standard : les écoutes restent à côté du nom', () => {
    const h = poser({ nom: 'Pink Floyd', ecoutes: { community_listens: 308 } });
    expect(h.querySelector('h1 [data-ecoutes-communaute]')).not.toBeNull();
  });

  it('disposition standard (défaut) : rien ne change, même si des chiffres sont passés', () => {
    const h = poser({ chiffres: CHIFFRES });
    expect(h.querySelector('header.tete')!.classList.contains('maquette')).toBe(false);
    expect(h.querySelector('[data-chiffres-artiste]')).toBeNull();
  });
});

// ── Sur la vraie coquille ────────────────────────────────────────────────
const ID_LOCAL = 51;
const ARTISTE_LOCAL = { id: ID_LOCAL, name: 'Dionne Warwick', image_path: '/covers/dionne.jpg', bio: 'Une voix.', sort_name: 'Warwick, Dionne' };
const ALBUMS_LOCAUX = [{ id: 900, title: 'Promises, Promises', artist_name: 'Dionne Warwick', year: 1968, cover_path: null }];
const META = {
  similar_artists: [{ name: 'Burt Bacharach', reason: 'compositeur' }, { name: 'Aretha Franklin', reason: 'soul' }],
};
const COLLECTIONS =
  /\/(profiles|zones|playlists|devices|shortcuts|collections|tags|favorites|history|radios|podcasts|artists|albums|tracks|top-artists|recent|genres)(\?|\/|$)/;
let urls: string[] = [];
let CREDITS: unknown[] = [];

function reponsePour(url: string) {
  let corps: unknown;
  if (url.includes(`/library/artists/${ID_LOCAL}/albums`)) corps = ALBUMS_LOCAUX;
  else if (url.includes(`/library/artists/${ID_LOCAL}/metadata`)) corps = META;
  else if (url.includes(`/library/artists/${ID_LOCAL}/credits`)) corps = CREDITS;
  else if (url.includes(`/library/artists/${ID_LOCAL}/bio`)) corps = { bio: null };
  else if (url.includes(`/library/artists/${ID_LOCAL}`)) corps = ARTISTE_LOCAL;
  else if (url.includes('/library/search') && url.includes('Burt')) corps = { artists: [{ id: 77, name: 'Burt Bacharach', image_path: '/covers/burt.jpg' }] };
  else corps = COLLECTIONS.test(url) ? [] : {};
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => corps,
    text: async () => JSON.stringify(corps),
  } as unknown as Response;
}
const respirer = (ms = 80) => new Promise((r) => setTimeout(r, ms));
class ObservateurInerte { observe() {} unobserve() {} disconnect() {} }

async function ouvrirFiche() {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(ShellV2, { target: hote });
  flushSync();
  ficheArtisteService.set({ service: null, id: String(ID_LOCAL), nom: 'Dionne Warwick' } as any);
  activeView.set('streamingartist');
  flushSync();
  await respirer();
  flushSync();
  const f = hote.querySelector<HTMLElement>('.v2-fas');
  if (!f) throw new Error('la fiche artiste n’est pas montée');
  return f;
}
const onglet = (f: HTMLElement, o: string) => f.querySelector<HTMLButtonElement>(`[data-onglet-artiste="${o}"]`);

describe('maquette de Levente — la page artiste montée', () => {
  beforeEach(() => {
    urls = [];
    CREDITS = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(String(url)); return reponsePour(String(url)); }));
    vi.stubGlobal('ResizeObserver', ObservateurInerte);
    vi.stubGlobal('WebSocket', class { close() {} addEventListener() {} removeEventListener() {} send() {} } as unknown as typeof WebSocket);
    activeView.set('home');
    vueDeRetour.set(null);
    ficheArtisteService.set(null);
    departSimilaires.set(null);
  });
  afterEach(() => {
    if (monte) unmount(monte);
    monte = null;
    hote?.remove();
    hote = null;
    vi.unstubAllGlobals();
  });

  it('Lire, puis « … » : les autres gestes y sont, repliés, et se déplient', async () => {
    const f = await ouvrirFiche();
    const gestes = f.querySelector<HTMLElement>('header.tete .gestes')!;
    expect(gestes.querySelector('[data-bouton-lecture]')).not.toBeNull();
    const menu = gestes.querySelector<HTMLElement>('[data-plus-gestes]')!;
    expect(menu.hidden).toBe(true);
    // Rien de ce qui marchait n'a disparu : la radio, « Toutes les pistes »,
    // Modifier et Étiquettes sont dans le menu.
    expect(menu.textContent).toContain(libelle('v2.fas.radio'));
    expect(menu.querySelector('[data-toutes-pistes-artiste]')).not.toBeNull();
    expect(menu.textContent).toContain(libelle('common.edit'));
    const bouton = gestes.querySelector<HTMLButtonElement>('[data-plus-gestes-bouton]')!;
    expect(bouton.getAttribute('aria-label')).toBe(libelle('artist.page.moreActions'));
    bouton.click();
    flushSync();
    expect(menu.hidden).toBe(false);
    expect(bouton.getAttribute('aria-expanded')).toBe('true');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    flushSync();
    expect(menu.hidden).toBe(true);
    // Relecture du 15/11 : un geste choisi dans le menu le referme.
    bouton.click();
    flushSync();
    expect(menu.hidden).toBe(false);
    menu.querySelector<HTMLButtonElement>('[data-toutes-pistes-artiste]')!.click();
    flushSync();
    expect(menu.hidden, 'le menu reste ouvert après un geste').toBe(true);
  });

  it('ALÉATOIRE (décision de Bertrand, 15/11) : il reste sous la flèche du bouton Lire, aucun bouton « Shuffle » séparé', async () => {
    const f = await ouvrirFiche();
    const gestes = f.querySelector<HTMLElement>('header.tete .gestes')!;
    const lecture = gestes.querySelector<HTMLElement>('[data-bouton-lecture]')!;
    const fleche = lecture.querySelector<HTMLButtonElement>('[data-lecture-options]');
    expect(fleche, 'la flèche du bouton Lire, qui porte l’aléatoire, a disparu').not.toBeNull();
    const menu = gestes.querySelector<HTMLElement>('[data-plus-gestes]')!;
    expect(menu.contains(lecture), 'le bouton Lire est passé dans le menu « … »').toBe(false);
    // Aucun bouton séparé : ni dans la rangée, ni dans le menu « … ».
    const aleatoire = libelle('library.shuffleArtist');
    const separes = [...gestes.querySelectorAll<HTMLButtonElement>('button')]
      .filter((b) => !lecture.contains(b))
      .filter((b) => b.hasAttribute('data-aleatoire-artiste') || (b.textContent ?? '').trim() === aleatoire || b.title === aleatoire);
    expect(separes, 'un bouton « Lecture aléatoire » séparé est apparu').toHaveLength(0);
    // Le même geste qu'avant : la flèche ouvre l'entrée « aléatoire ».
    fleche!.click();
    flushSync();
    expect(document.querySelector('[data-aleatoire-artiste]'), 'l’entrée « aléatoire » de la flèche a disparu').not.toBeNull();
    expect(menu.querySelector('[data-aleatoire-artiste]')).toBeNull();
  });

  it('recette du 15/11 : des crédits sans instrument n’ouvrent pas un titre « Crédits » vide', async () => {
    CREDITS = [{ role: 'producer', track_id: 1 }, { role: 'composer', track_id: 2 }];
    const f = await ouvrirFiche();
    const apropos = f.querySelector<HTMLElement>('.apropos')!;
    expect(apropos.textContent).toContain('Burt Bacharach');
    expect(apropos.textContent, 'titre « Crédits » sans contenu').not.toContain(libelle('artist.credits'));
  });

  it('recette du 15/11 : avec un instrument, « Crédits » et l’instrument sont là', async () => {
    CREDITS = [{ role: 'performer', instrument: 'Vibraphone', track_id: 1 }];
    const f = await ouvrirFiche();
    const apropos = f.querySelector<HTMLElement>('.apropos')!;
    expect(apropos.textContent).toContain(libelle('artist.credits'));
    expect(apropos.textContent).toContain('Vibraphone');
  });

  it('les chiffres de l’en-tête : le compte d’albums de la bibliothèque, rien d’inventé', async () => {
    const f = await ouvrirFiche();
    const items = [...f.querySelectorAll('[data-chiffres-artiste] li')].map((li) => li.getAttribute('data-chiffre'));
    expect(items).toEqual(['albums']);
  });

  it('onglets Aperçu / Albums / Artistes similaires ; la grille ouvre le voisin de la bibliothèque', async () => {
    const f = await ouvrirFiche();
    expect([...f.querySelectorAll('[data-onglet-artiste]')].map((b) => b.getAttribute('data-onglet-artiste')))
      .toEqual(['apercu', 'albums', 'similaires']);
    expect(onglet(f, 'apercu')!.getAttribute('aria-selected')).toBe('true');
    // L'aperçu montre tout : les similaires (puces) ET la discographie.
    expect(f.querySelector('.apropos')?.textContent).toContain('Burt Bacharach');
    expect(f.textContent).toContain('Promises, Promises');
    expect(urls.some((u) => u.includes('/library/search')), 'aucune recherche de portrait sur l’aperçu').toBe(false);

    onglet(f, 'albums')!.click();
    flushSync();
    expect(f.querySelector('.apropos')).toBeNull();
    expect(f.textContent).toContain('Promises, Promises');

    f.querySelector<HTMLButtonElement>('[data-onglet-artiste="apercu"]')!.click();
    flushSync();
    f.querySelector<HTMLButtonElement>('[data-voir-similaires]')!.click();
    flushSync();
    await respirer();
    flushSync();
    const grille = f.querySelector<HTMLElement>('[data-similaires-grille]')!;
    expect(grille).not.toBeNull();
    expect(grille.textContent).toContain(libelle('artist.page.similarIntro').replace('{nom}', 'Dionne Warwick'));
    expect([...grille.querySelectorAll('[data-similaire]')].map((b) => b.getAttribute('data-similaire')))
      .toEqual(['Burt Bacharach', 'Aretha Franklin']);
    expect(grille.textContent).toContain('compositeur');
    expect(f.textContent, 'la discographie n’est pas sur l’onglet des similaires').not.toContain('Promises, Promises');
    expect(urls.some((u) => u.includes('/library/search') && u.includes('Burt'))).toBe(true);

    grille.querySelector<HTMLButtonElement>('[data-similaire="Burt Bacharach"]')!.click();
    await respirer();
    flushSync();
    expect(get(ficheArtisteService)).toMatchObject({ service: null, id: '77', nom: 'Burt Bacharach' });
    // Un autre artiste : retour à l'aperçu.
    expect(f.querySelector('[data-similaires-grille]')).toBeNull();
  });
});
