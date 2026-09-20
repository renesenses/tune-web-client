/**
 * #1081 — Favoris ▸ filtre « Bibliothèque » : une piste locale au cœur plein
 * n'y figurait pas.
 *
 * ## La mesure, faite sur le .18 le 20/09/2026 (profil 1)
 *
 * Elle a été conduite AVANT d'écrire une ligne de correctif, et elle donne les
 * trois objets du ticket et le lien entre eux :
 *
 *   - `GET /api/v1/profiles/1/favorites?item_type=track`  → **0** ligne.
 *     Aucun favori de piste dans la table LOCALE.
 *   - `GET /api/v1/profiles/1/favorites/streaming?item_type=track` → **53**
 *     objets, tous `id` numérique de leur propre table, `service` +
 *     `service_id`, `title`, `artist` — jamais d'identifiant de bibliothèque.
 *   - pour chacun, `GET /api/v1/library/search?q=<titre>` puis comparaison par
 *     la règle du serveur, `lower(trim(titre))` + `lower(trim(artiste))` :
 *     **23** des 53 ont au moins un jumeau LOCAL, **30** n'en ont aucun, et
 *     ces 23 favoris rejoignent **44** pistes locales (un favori peut en
 *     toucher plusieurs — « Canopée » de Polo & Pan en touche 3).
 *
 * ⭐ **Le lien entre les deux objets n'est porté par AUCUN champ** : ni le
 * favori de service ni la piste locale ne référence l'autre. Le seul lien est
 * le couple titre+artiste normalisé — la clé de `clePisteJumelee`, celle que
 * le serveur emploie dans `track_favorites_sub`. C'est donc ce lien-là, et pas
 * un identifiant, que le filtre doit suivre.
 *
 * ## La contre-épreuve que le ticket réclamait, faite sur les données
 *
 * Le ticket demandait d'ouvrir l'onglet Qobuz des favoris du testeur ; ça n'a
 * jamais été fait. La mesure ci-dessus la remplace et la tranche : l'écran
 * Favoris du .18 montre **53** lignes sous « Toutes », **53** sous « Qobuz »
 * et « Tidal » réunis, et **0** sous « Bibliothèque » — alors que 23 de ces
 * titres sont possédés localement et portent, dans la bibliothèque, un cœur
 * plein. Le symptôme de FabienM est reproduit à l'identique sans lui rien
 * demander.
 *
 * ## La décision (Bertrand, 20/09/2026)
 *
 * LE JUMELAGE COMPTE COMME BIBLIOTHÈQUE. Une piste dont le cœur vient d'un
 * jumelage figure sous « Bibliothèque ». On ne retire aucun cœur, et on ne la
 * fait PAS apparaître deux fois : l'objet reste UNIQUE dans la liste et gagne
 * seulement une seconde appartenance de filtre. Le filtre du service garde son
 * comportement actuel.
 *
 * ⚠️ Pourquoi on ne « développe » pas le favori en ses pistes locales : les 23
 * favoris jumelés touchent 44 pistes locales. Les déplier ferait passer
 * l'onglet Titres de 53 à 74 lignes, et « Canopée » y paraîtrait trois fois.
 * C'est exactement ce que le témoin 2 interdit.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  sourcesDe, sourcesPresentes, trierEtFiltrer, SOURCE_BIBLIOTHEQUE,
} from '../favorisTriFiltre';
import { cleJumelage } from '../cleJumelage';
import { clesAvecJumeauLocal } from '../favorisJumeles';

/* Extrait RÉEL de la mesure du 20/09/2026 sur le .18, profil 1. */
const AVEC_JUMEAU = [
  { service: 'qobuz', service_id: '96521853', title: 'I Could Never Take The Place Of Your Man ', artist: 'Prince' },
  { service: 'qobuz', service_id: '172107193', title: 'The Bitter End', artist: 'Placebo' },
  { service: 'qobuz', service_id: '33930451', title: 'Everything In Its Right Place', artist: 'Radiohead' },
];
const SANS_JUMEAU = [
  { service: 'qobuz', service_id: '1067234', title: 'I Belong To You', artist: 'Lenny Kravitz' },
  { service: 'qobuz', service_id: '39487625', title: 'Passionfruit', artist: 'Drake' },
  { service: 'qobuz', service_id: '252243', title: 'Empire State of Mind (Part II) Broken Down', artist: 'Alicia Keys' },
];
/* Les pistes locales que la recherche a rendues, avec leurs identifiants réels.
 * « Everything in Its Right Place » en porte DEUX : deux éditions possédées. */
const PISTES_LOCALES = [
  { id: 57160, title: 'I Could Never Take the Place of Your Man', artist_name: 'Prince' },
  { id: 56480, title: 'The Bitter End', artist_name: 'Placebo' },
  { id: 59014, title: 'Everything in Its Right Place', artist_name: 'Radiohead' },
  { id: 59648, title: 'Everything in Its Right Place', artist_name: 'Radiohead' },
];

/** `versPiste` de `FavoritesV2.svelte` : `id` à NUL, `source` / `source_id`. */
const versPiste = (f: { service: string; service_id: string; title: string; artist: string }) => ({
  id: null, title: f.title, artist_name: f.artist,
  source: f.service, source_id: f.service_id, created_at: '2026-09-20T09:38:52Z',
});

/** La bibliothèque du .18, telle que `library/search` la rend. */
const chercherDansLa18 = async (q: string) => ({
  tracks: PISTES_LOCALES.filter((t) => t.title.toLowerCase().includes(q.trim().toLowerCase())),
});

const LISTE = [...AVEC_JUMEAU, ...SANS_JUMEAU].map(versPiste);
const jumeles = () => clesAvecJumeauLocal(LISTE, chercherDansLa18);

describe('#1081 — le jumelage compte comme bibliothèque', () => {
  it('TÉMOIN 1 — une piste locale jumelée figure sous « Bibliothèque »', async () => {
    const j = await jumeles();
    // Le lien mesuré : aucun identifiant, le couple titre+artiste normalisé.
    expect(j.has(cleJumelage('The Bitter End', 'Placebo'))).toBe(true);

    const vus = trierEtFiltrer(LISTE, SOURCE_BIBLIOTHEQUE, 'alpha', j);
    expect(vus.map((o) => o.title)).toEqual([
      'Everything In Its Right Place',
      'I Could Never Take The Place Of Your Man ',
      'The Bitter End',
    ]);
    // Et la puce « Bibliothèque » existe, alors qu'AUCUN favori local n'est là
    // — c'est le cas du .18 : 0 ligne locale, 23 jumelages.
    expect(sourcesPresentes(LISTE, j)).toEqual([SOURCE_BIBLIOTHEQUE, 'qobuz']);
    expect(sourcesPresentes(LISTE)).toEqual(['qobuz']);
  });

  it('TÉMOIN 2 — elle n’y figure pas DEUX fois, et le compte total ne double pas', async () => {
    const j = await jumeles();

    // a) Sous « Bibliothèque », un objet jumelé occupe UNE ligne, pas une par
    //    piste locale : « Everything in Its Right Place » a deux éditions
    //    possédées (57160 et 59648) et ne doit paraître qu'une fois.
    const biblio = trierEtFiltrer(LISTE, SOURCE_BIBLIOTHEQUE, 'alpha', j);
    const cles = biblio.map((o) => `${o.source}:${o.source_id}`);
    expect(new Set(cles).size).toBe(cles.length);
    expect(biblio.filter((o) => o.title === 'Everything In Its Right Place')).toHaveLength(1);

    // b) Sous « Toutes », la liste est celle reçue — ni plus longue, ni
    //    dédoublée. Le correctif ne CRÉE aucune ligne.
    const toutes = trierEtFiltrer(LISTE, null, 'alpha', j);
    expect(toutes).toHaveLength(LISTE.length);
    expect(toutes).toHaveLength(6);

    // c) Le filtre du service garde son comportement : les 6 y sont toujours.
    expect(trierEtFiltrer(LISTE, 'qobuz', 'alpha', j)).toHaveLength(6);

    // d) Un objet jumelé appartient aux DEUX filtres, et reste UN objet.
    expect(sourcesDe(versPiste(AVEC_JUMEAU[1]), j)).toEqual([SOURCE_BIBLIOTHEQUE, 'qobuz']);
  });

  it('TÉMOIN 3 (contre-épreuve) — une piste de service SANS équivalent local n’y figure toujours pas', async () => {
    const j = await jumeles();

    // Les 30 favoris du .18 qui n'ont aucun jumeau : la garde doit les tenir
    // dehors, sinon elle ne garde rien et « Bibliothèque » devient « Toutes ».
    for (const f of SANS_JUMEAU) {
      expect(j.has(cleJumelage(f.title, f.artist))).toBe(false);
      expect(sourcesDe(versPiste(f), j)).toEqual(['qobuz']);
    }
    const biblio = trierEtFiltrer(LISTE, SOURCE_BIBLIOTHEQUE, 'alpha', j);
    expect(biblio.map((o) => o.title)).not.toContain('Passionfruit');
    expect(biblio).toHaveLength(3);
    expect(biblio).not.toHaveLength(LISTE.length);

    // Sans jumelage connu, rien ne change : l'écran d'avant le correctif.
    expect(trierEtFiltrer(LISTE, SOURCE_BIBLIOTHEQUE, 'alpha', new Set())).toHaveLength(0);
  });
});

describe('#1081 — la règle de rapprochement est celle du serveur', () => {
  it('elle normalise comme `lower(trim(...))` — casse et espaces, rien de plus', async () => {
    // Mesuré : le favori Qobuz s'écrit « I Could Never Take The Place Of Your
    // Man » (avec une espace finale), la piste locale « …the Place of Your
    // Man ». Le serveur les rapproche ; nous aussi, et pour la même raison.
    const j = await jumeles();
    expect(j.has(cleJumelage('i could never take the place of your man', 'prince'))).toBe(true);
    // Mais pas d'approximation : un titre ORTHOGRAPHIÉ autrement ne matche pas.
    expect(cleJumelage('So What?', 'Miles Davis')).not.toBe(cleJumelage('So What', 'Miles Davis'));
  });

  it('un favori sans titre ne rapproche personne', async () => {
    const j = await clesAvecJumeauLocal(
      [{ id: null, title: '', artist_name: 'Prince', source: 'qobuz', source_id: 'x' }],
      chercherDansLa18,
    );
    expect(j.size).toBe(0);
  });

  it('une recherche en échec ne vide pas les autres', async () => {
    let n = 0;
    const capricieuse = async (q: string) => {
      if (++n === 1) throw new Error('503');
      return chercherDansLa18(q);
    };
    const j = await clesAvecJumeauLocal(LISTE, capricieuse);
    expect(j.size).toBeGreaterThan(0);
  });
});

describe('#1081 — le correctif est BRANCHÉ, pas seulement écrit', () => {
  const sansCommentaires = (s: string) =>
    s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const ecran = sansCommentaires(
    readFileSync(resolve(process.cwd(), 'src/components/v2/FavoritesV2.svelte'), 'utf-8'),
  );

  it('l’onglet Titres passe l’ensemble au filtre ET aux puces', () => {
    // « Écrit mais pas branché » : la garde porterait sur une fonction que
    // l'écran n'appelle pas.
    expect(ecran).toContain('trierEtFiltrer(fTracks, sourceFiltre, tri, jumelesLocaux)');
    expect(ecran).toContain('sourcesPresentes(fTracks, jumelesLocaux)');
    expect(ecran).toContain('clesAvecJumeauLocal(liste, (q) =>');
    expect(ecran).toContain('void resoudreJumelages(tracks);');
  });

  it('les albums et les artistes n’en héritent PAS', () => {
    // La clé est un couple titre+artiste : un album homonyme d'une piste
    // favorite se glisserait sous « Bibliothèque » sans en être.
    expect(ecran).toContain('trierEtFiltrer(fAlbums, sourceFiltre, tri)');
    expect(ecran).toContain('trierEtFiltrer(fArtists, sourceFiltre, tri)');
    expect(ecran).not.toContain('trierEtFiltrer(fAlbums, sourceFiltre, tri, jumelesLocaux)');
    expect(ecran).not.toContain('trierEtFiltrer(fArtists, sourceFiltre, tri, jumelesLocaux)');
  });

  it('la résolution ne RETARDE pas l’affichage des favoris', () => {
    // Une bibliothèque lente ne doit pas bloquer la liste déjà chargée.
    expect(ecran).not.toContain('await resoudreJumelages(');
  });

  it('une seule normalisation dans tout le client', () => {
    // Deux normalisations divergentes allumeraient un cœur que le filtre ne
    // rangerait pas — le défaut d'origine, par une autre porte.
    const store = sansCommentaires(
      readFileSync(resolve(process.cwd(), 'src/lib/stores/profile.ts'), 'utf-8'),
    );
    expect(store).toContain('return cleJumelage(titre, artiste);');
    expect(store).toContain("import { cleJumelage } from '../cleJumelage';");
    const filtre = sansCommentaires(
      readFileSync(resolve(process.cwd(), 'src/lib/favorisTriFiltre.ts'), 'utf-8'),
    );
    expect(filtre).toContain("import { cleJumelage } from './cleJumelage';");
  });
});
