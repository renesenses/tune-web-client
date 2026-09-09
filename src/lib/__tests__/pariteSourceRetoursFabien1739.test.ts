/**
 * FabienM, fil forum 1739, v0.9.144, 09/09/2026 — la PARITÉ local / service.
 *
 * « D'une manière générale il faut qu'on retrouve les mêmes boutons / actions
 * sur les albums / Titres / Artistes quelque soit la source (local /
 * Streaming), à l'exception de l'édition. »
 *
 * ## Ce que la mesure a montré, et qui n'était pas ce qu'on croyait
 *
 * Point 1 de Fabien — « le titre Racing in the street n'a aucun contrôle comme
 * les 2 autres titres ». Sa capture montre l'inverse de l'attendu : c'est la
 * piste LOCALE qui est nue, les deux Qobuz qui ont leurs boutons.
 *
 * Mesuré sur le .18 le 09/09/2026, `GET /library/history?limit=60` :
 *
 *     LOCALES : 38, dont track_id absent : 38   (100 %)
 *     SERVICE : 22, dont source_id absent : 0
 *
 * `entreesDepuisServeur` pose `id: e.track_id`. Une entrée locale arrive donc
 * SANS identifiant : `estPisteLocale` la refuse (`id != null` est faux), elle
 * n'a pas de `source_id` non plus, et `corpsDeLecture` rend `null`. Toute la
 * barre d'actions disparaît. C'est un trou du SERVEUR — il n'enregistre pas
 * `track_id` sur les écoutes locales — et ce fichier le CONSTATE sans le
 * corriger : le correctif est côté serveur.
 *
 * ## Ce que ce fichier garde vraiment : les points 3 et 5
 *
 * Un album de service n'était ni ouvrable ni favorisable depuis la Recherche,
 * alors que les deux chemins EXISTAIENT déjà ailleurs — quinzième « écrit mais
 * pas branché » de ce client.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { corpsDeLecture, estPisteLocale } from '../pisteFile';
import { entreesDepuisServeur } from '../historiqueLecture';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Une entrée d'historique telle que le .18 la rend RÉELLEMENT.
 * Champs relevés le 09/09/2026 sur `GET /library/history`.
 */
const ECOUTE_LOCALE = {
  id: 841,                  // l'identifiant de la LIGNE d'historique
  track_id: null,           // 🔴 absent sur 38 entrées locales sur 38
  title: 'Racing In The Street',
  artist_name: 'Bruce Springsteen',
  album_title: 'Live 1975-85 CD2',
  album_id: 2668,
  source: 'local',
  source_id: null,
  listened_at: '2026-09-09T00:14:00Z',
};
const ECOUTE_QOBUZ = {
  id: 832,
  track_id: null,
  title: 'Space Oddity',
  artist_name: 'David Bowie',
  source: 'qobuz',
  source_id: '25316308',
  listened_at: '2026-09-09T10:00:00Z',
};

describe('point 1 — l’écoute locale de l’historique est INJOUABLE', () => {
  it('🔴 le constat, nu : la piste locale n’est désignable d’aucune façon', () => {
    const [locale] = entreesDepuisServeur([ECOUTE_LOCALE]);
    expect(locale.track.id ?? null, 'le serveur a commencé à poser track_id').toBeNull();
    expect(estPisteLocale(locale.track)).toBe(false);
    expect(
      corpsDeLecture(locale.track),
      'la piste est devenue jouable : le serveur pose désormais track_id, ' +
        'ou le client sait la désigner autrement — ce témoin doit être relu',
    ).toBeNull();
  });

  it('LA CONTRE-ÉPREUVE — la même entrée AVEC son track_id est jouable', () => {
    // Ce que le correctif serveur doit produire. Sans ce cas, le témoin
    // ci-dessus serait vert contre un client qui ne sait rien jouer du tout.
    const [ok] = entreesDepuisServeur([{ ...ECOUTE_LOCALE, track_id: 29572 }]);
    expect(estPisteLocale(ok.track)).toBe(true);
    expect(corpsDeLecture(ok.track)).toEqual({ track_id: 29572 });
  });

  it('l’écoute de SERVICE, elle, reste jouable — d’où l’inversion vue par Fabien', () => {
    const [q] = entreesDepuisServeur([ECOUTE_QOBUZ]);
    expect(corpsDeLecture(q.track)).toMatchObject({ source: 'qobuz', source_id: '25316308' });
  });
});

describe('points 3 et 5 — un album de SERVICE s’ouvre et se met en favori', () => {
  const src = () => sansCommentaires(lire('src/components/v2/SearchV2.svelte'));

  it('🔴 la fiche s’ouvre pour un album de service, pas seulement local', () => {
    // Le défaut : `onOuvrir={local_ ? … : null}` et un `{:else}` de texte
    // inerte. « on ne peut pas accéder à la page d'un album Qobuz (le clic ne
    // fonctionne pas) ».
    expect(src(), 'l’ouverture est encore réservée aux albums locaux')
      .not.toMatch(/onOuvrir=\{local_ \? \(\) => [^:]+ : null\}/);
    expect(src()).toContain('onOuvrir={local_ || (a.source && a.source_id) ? () => ouvrirFiche(a) : null}');
  });

  it('🔴 la fiche reçoit le SERVICE — sans lui elle cherche des pistes locales', () => {
    // `AlbumDetailV2` sait tout faire d'un album de service, mais seulement si
    // on lui passe `service`. Monté sans, il traite l'album comme local.
    expect(src()).toMatch(/<AlbumDetailV2[\s\S]{0,160}service=\{serviceOuvert\}/);
    expect(src(), 'le service n’est pas remis à zéro à la fermeture')
      .toMatch(/serviceOuvert = null/);
  });

  it('🔴 le cœur d’un album de service passe par streaming_favorites', () => {
    // Le favori de service a sa PROPRE table, clefée `service` + `service_id`
    // en TEXTE : le motif « pas d'identifiant de bibliothèque » ne le bloque
    // pas. Décision déjà prise le 03/09 pour `PageWidgets`, jamais propagée.
    expect(src()).toContain('favoriExterneService($favoriteStreamingKeys, {');
    expect(src()).toMatch(/itemType: 'album',\s*service: String\(a\.source\)/);
  });

  it('les ÉTIQUETTES restent locales — le serveur ne sait pas faire', () => {
    // `item_id: i64` côté route, quand un album Qobuz s'identifie
    // « kxend2k5wdg06 ». Une icône morte serait pire que pas d'icône.
    // Ce témoin garde la LIMITE, pour qu'on ne la lève pas sans le serveur.
    expect(src()).toContain("etiquettes={local_ ? { itemType: 'album', itemId: a.id! } : null}");
  });

  it('le TITRE mène à la fiche dans les deux cas', () => {
    expect(src()).toContain("{#if local_ || (a.source && a.source_id)}");
    expect(src()).toContain('<button class="meta" onclick={() => ouvrirFiche(a)}>');
  });

  it('le MEILLEUR RÉSULTAT ouvre la fiche au lieu de lancer la lecture', () => {
    // Deux gestes différents sous une carte identique : local → fiche,
    // service → lecture. C'est le même reproche que le point 3.
    expect(src(), 'la carte du meilleur résultat lance encore la lecture')
      .not.toMatch(/estLocal\(a\) \? \(opened = a\) : ouvrirOuLire\(a\)/);
    expect(src()).toContain('<button class="bcard" onclick={() => ouvrirFiche(a)}>');
  });

  it('l’ÉDITION reste réservée au local — Fabien l’a explicitement exclue', () => {
    expect(src()).toContain('onEditer={local_ ? () => (albumEnEdition = a) : null}');
  });
});
