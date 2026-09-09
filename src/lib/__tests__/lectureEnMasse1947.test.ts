/**
 * `renesenses/tune-server-rust#1947` — « Tout lire » et « Lecture aléatoire »
 * là où ils manquaient.
 *
 * Le triage du ticket : « rien ne manque côté serveur — les routes de lecture
 * et de mise en file existent déjà pour ces sources. C'est une lacune
 * d'interface, uniformément absente selon les vues. »
 *
 * Il posait aussi une question, et ces gardes tiennent la réponse :
 *
 *   « "Lecture aléatoire" devra décider si elle ARME le drapeau `shuffle` de
 *     la zone ou si elle se contente de mettre en file dans un ordre mélangé.
 *     Ce n'est pas cosmétique : #2055 décrit un drapeau resté armé sans que
 *     l'utilisateur l'ait demandé. »
 *
 * Réponse : **jamais le drapeau**. C'est déjà la règle du dépôt — l'en-tête de
 * la Bibliothèque est une ACTION (`api.shuffleAll`), la barre de transport une
 * BASCULE (`api.setShuffle`) — et elle est gardée depuis #2261
 * (`bibliothequeAleatoireAffordance.test.ts`). Aucun point d'entrée ajouté par
 * ce lot ne touche `setShuffle`, et la garde ci-dessous l'exécute plutôt que de
 * le lire.
 *
 * 🔴 Les gestes sont INJECTÉS : les fonctions du module reçoivent `lire` et
 * `enfiler`. La garde peut donc les appeler pour de bon et regarder ce qui
 * part sur le fil, au lieu de chercher un motif dans une source.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  executer,
  lireListe,
  lireListeAleatoire,
  pistesJouables,
  planAleatoire,
  planDeLecture,
  porteeUtilisable,
} from '../lectureEnMasse';
import * as api from '../api';
import type { Track } from '../types';
const p = (o: Partial<Track>) => o as Track;
const LOCALES = [
  p({ id: 1, title: 'A' }), p({ id: 2, title: 'B' }), p({ id: 3, title: 'C' }),
];
const SERVICE = [
  p({ id: null, title: 'S1', source: 'qobuz', source_id: '11' }),
  p({ id: null, title: 'S2', source: 'qobuz', source_id: '22' }),
];
function temoin() {
  const envois: { quoi: string; corps: any }[] = [];
  return {
    envois,
    gestes: {
      lire: async (c: any) => { envois.push({ quoi: 'lire', corps: c }); },
      enfiler: async (c: any) => { envois.push({ quoi: 'enfiler', corps: c }); },
    },
  };
}
describe('#1947 — le plan de lecture d’une liste', () => {
  it('une liste entièrement LOCALE part en UNE requête', () => {
    const plan = planDeLecture(LOCALES);
    expect(plan.voie).toBe('lot');
    expect(plan).toMatchObject({ corps: { track_ids: [1, 2, 3] }, pistes: 3 });
  });
  it('une liste de SERVICE lance sa tête puis enfile le reste', () => {
    const plan = planDeLecture(SERVICE) as any;
    expect(plan.voie).toBe('tete-et-reste');
    expect(plan.tete).toMatchObject({ source: 'qobuz', source_id: '11' });
    // Le reste part en UNE requête, pas une par piste : avec un rang, chaque
    // insertion décalait la suivante et l'ordre s'inversait.
    expect(plan.reste.tracks).toHaveLength(1);
    expect(plan.reste.tracks[0]).toMatchObject({ source_id: '22' });
  });
  it('une piste qu’on ne sait pas désigner ne part pas', () => {
    expect(pistesJouables([p({ title: 'orpheline' }), LOCALES[0]])).toEqual([LOCALES[0]]);
    expect(planDeLecture([p({ title: 'orpheline' })])).toEqual({ voie: 'rien' });
  });
  it('une liste vide n’envoie RIEN — pas une requête que le serveur refusera', async () => {
    const t = temoin();
    expect(await lireListe([], t.gestes)).toBe(0);
    expect(t.envois).toEqual([]);
  });
});
describe('#1947 — « Lecture aléatoire » : mélanger la file, jamais la zone', () => {
  /**
   * 🔴 La question que le triage demandait de trancher, tenue à l'exécution.
   *
   * On espionne le module d'API en entier : si un jour quelqu'un branche
   * `setShuffle` derrière un de ces boutons, cette garde vire au rouge.
   */
  it('aucun geste de masse n’appelle `api.setShuffle`', async () => {
    const espion = vi.spyOn(api, 'setShuffle');
    const t = temoin();
    await lireListe(LOCALES, t.gestes);
    await lireListeAleatoire(LOCALES, t.gestes);
    await lireListeAleatoire(SERVICE, t.gestes);
    expect(espion, 'un bouton de surface arme le drapeau `shuffle` de la zone').not.toHaveBeenCalled();
    espion.mockRestore();
  });
  it('le mélange ne perd ni n’invente aucune piste', () => {
    const plan = planAleatoire(LOCALES) as any;
    expect(plan.voie).toBe('lot');
    expect([...plan.corps.track_ids].sort()).toEqual([1, 2, 3]);
  });
  it('il mélange VRAIMENT — et pas toujours de la même façon', () => {
    // `AlbumDetailV2` porte un mélange DÉTERMINISTE, `(i * 7 + 3) % (i + 1)` :
    // « la meme permutation pour un meme nombre de pistes ». Sur cinquante
    // pistes, cinquante tirages qui donneraient tous le même ordre seraient
    // le signe qu'on a recopié ce faux mélange.
    const liste = Array.from({ length: 50 }, (_, i) => p({ id: i + 1 }));
    const ordres = new Set<string>();
    for (let n = 0; n < 20; n++) {
      ordres.add(((planAleatoire(liste) as any).corps.track_ids as number[]).join(','));
    }
    expect(ordres.size, 'vingt tirages ont rendu le même ordre : le mélange est déterministe')
      .toBeGreaterThan(1);
  });
  it('l’ordre demandé est bien celui qui part sur le fil', async () => {
    const t = temoin();
    const n = await lireListeAleatoire(SERVICE, t.gestes);
    expect(n).toBe(2);
    expect(t.envois.map((e) => e.quoi)).toEqual(['lire', 'enfiler']);
    const partis = [
      String(t.envois[0].corps.source_id),
      ...t.envois[1].corps.tracks.map((x: any) => String(x.source_id)),
    ];
    expect(partis.sort()).toEqual(['11', '22']);
  });
});
describe('#1947 — la portée serveur, quand elle existe', () => {
  it('une portée vide n’est pas une portée', () => {
    expect(porteeUtilisable(null)).toBe(false);
    expect(porteeUtilisable({})).toBe(false);
    expect(porteeUtilisable({ genre: '' })).toBe(false);
    expect(porteeUtilisable({ album_id: 259 })).toBe(true);
    expect(porteeUtilisable({ folder: '/mnt/musique/Jazz' })).toBe(true);
  });
  it('`api.shuffleAll` porte bien les quatre portées qu’on lui demande', () => {
    // Les trois premières existaient dans la signature ET dans la route sans
    // aucun appelant : ce lot les branche, il ne les invente pas.
    const src = readFileSync(resolve(process.cwd(), 'src/lib/api.ts'), 'utf-8');
    const i = src.indexOf('export function shuffleAll(');
    expect(i, '`shuffleAll` a disparu de l’API').toBeGreaterThan(-1);
    const corps = src.slice(i, src.indexOf('\n}', i));
    for (const portee of ['album_id', 'artist_id', 'genre', 'folder']) {
      expect(corps, `\`shuffleAll\` ne transmet plus \`${portee}\``).toContain(`params.set('${portee}'`);
    }
  });
});
describe('#1947 — l’exécution suit le plan', () => {
  it('le lot n’enfile rien derrière lui', async () => {
    const t = temoin();
    expect(await executer(planDeLecture(LOCALES), t.gestes)).toBe(3);
    expect(t.envois).toEqual([{ quoi: 'lire', corps: { track_ids: [1, 2, 3] } }]);
  });
  it('une seule piste de service ne déclenche aucune mise en file', async () => {
    const t = temoin();
    expect(await lireListe([SERVICE[0]], t.gestes)).toBe(1);
    expect(t.envois.map((e) => e.quoi)).toEqual(['lire']);
  });
});
const lireSrc = (p2: string) => readFileSync(resolve(process.cwd(), p2), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/**
 * Le câblage. Ce que fait chaque bouton, les gardes montées ci-dessus le
 * prouvent ; ici on tient seulement qu'il EXISTE, sur la surface où le ticket
 * le réclamait — c'est le seul point qu'un test de module ne peut pas voir.
 */
describe('#1947 — les surfaces qui n’avaient pas ces boutons les ont', () => {
  it('la fiche d’album du client actuel a une « lecture aléatoire »', () => {
    const src = sansCommentaires(lireSrc('src/components/LibraryView.svelte'));
    expect(src).toContain('lireAlbumAleatoire');
    // Le tirage porte sur l'album, par le serveur — pas sur la page affichée.
    expect(src).toContain("api.shuffleAll(zone.id, { album_id: id })");
    expect(src).toContain('class="play-all-btn shuffle-album-btn"');
  });
  it('la fiche d’artiste du nouveau client a les deux boutons', () => {
    const src = sansCommentaires(lireSrc('src/components/v2/ArtistesV2.svelte'));
    expect(src).toContain('lireToutArtiste');
    expect(src).toContain('api.getArtistTracks(a.id)');
    expect(src).toContain("api.shuffleAll(zid, { artist_id: a.id })");
    expect(src).toContain("$t('library.playAllArtist' as any)");
    expect(src).toContain("$t('library.shuffleArtist' as any)");
  });
  it('la fiche de liste de lecture a une « lecture aléatoire »', () => {
    const src = sansCommentaires(lireSrc('src/components/v2/PlaylistDetailV2.svelte'));
    expect(src).toContain('onclick={lireAleatoire}');
    expect(src).toContain('lireListeAleatoire(tracks');
  });
  it('la fiche de collection a les deux boutons, sur TOUS ses albums', () => {
    const src = sansCommentaires(lireSrc('src/components/v2/CollectionsV2.svelte'));
    expect(src).toContain('lireCollectionEntiere(false)');
    expect(src).toContain('lireCollectionEntiere(true)');
    // Concurrence bornée et un réessai par album : un `Promise.all` nu
    // tronquait la file en silence (Sevy, 19 pistes sur 325).
    expect(src).toContain('api.getAlbumTracksBatch(ids)');
  });
  it('les résultats de recherche du nouveau client ont les deux boutons', () => {
    const src = sansCommentaires(lireSrc('src/components/v2/SearchV2.svelte'));
    expect(src).toContain('lireTousLesTitres(false)');
    expect(src).toContain('lireTousLesTitres(true)');
    // La portée est la liste FILTRÉE complète, pas la tranche affichée : le
    // « voir plus » ne doit pas changer ce que « tout lire » lit.
    expect(src).toContain('lireListe(titres as any, gestes)');
    expect(src).not.toContain('lireListe(vusTitres');
  });
  it('l’écran des répertoires tire dans le SOUS-ARBRE, pas dans la page', () => {
    const src = sansCommentaires(lireSrc('src/components/OxygenView.svelte'));
    expect(src).toContain('tirerDansLeDossier');
    expect(src).toContain('shuffleAll(zone.id, { folder: dossierOuvert })');
    // Le bouton n'apparaît que dans un répertoire : sans portée, le serveur
    // tirerait dans toute la table `tracks` — c'était tout le défaut de #2801.
    expect(src).toContain('{#if dossierOuvert}');
  });
  it('aucune de ces surfaces n’arme le drapeau de la zone', () => {
    for (const f of [
      'src/components/LibraryView.svelte',
      'src/components/v2/ArtistesV2.svelte',
      'src/components/v2/PlaylistDetailV2.svelte',
      'src/components/v2/CollectionsV2.svelte',
      'src/components/v2/SearchV2.svelte',
      'src/components/OxygenView.svelte',
    ]) {
      expect(sansCommentaires(lireSrc(f)), `${f} appelle setShuffle`).not.toContain('setShuffle');
    }
  });
});
