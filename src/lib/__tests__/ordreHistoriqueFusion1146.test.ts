/**
 * #1146 — « l'ordre chronologique est rompu » dans l'Historique v2.
 *
 * FabienM, fil forum 1774, 13/09/2026, point 12, v0.9.147 :
 *
 *   « Menu historique : l'ordre chronologique n'est pas respecté. J'ai en
 *     premier des titres qui ont été joués il y a plusieurs jours alors qu'une
 *     playlist plus récente et d'autres titres ont été joués plus récemment. »
 *
 * ## Ce qui était DÉJÀ fait, et qu'il ne faut pas re-corriger
 *
 * #989 a posé le tri (`rendu.sort(duPlusRecent)`) et l'a mis AVANT le plafond.
 * La concaténation « local en tête » ne décide donc plus de l'ordre rendu.
 * Les cas 1 à 4 ci-dessous le REDISENT sur la donnée, dans le désordre, parce
 * que #1146 est rouvert sur ce symptôme : ils sont VERTS avant ce lot, et
 * c'est un résultat qu'il faut écrire, pas masquer.
 *
 * ## 🔴 Ce qui restait, et que ce lot corrige
 *
 * Le tri ne peut ordonner que ce que la ligne PORTE. Or la déduplication
 * gardait la première occurrence rencontrée — donc toujours la LOCALE, quelle
 * que soit sa date — alors que la fonction promet dans sa propre en-tête :
 *
 *   « ne garde qu'une ligne par piste : sa plus récente écoute (demandé par
 *     Elie) »
 *
 * Une piste écoutée AUJOURD'HUI depuis un autre client (donc connue du seul
 * serveur) et présente dans le magasin local du navigateur avec une écoute
 * d'IL Y A UN MOIS ressortait datée d'il y a un mois, et se rangeait en bas.
 * L'écoute récente disparaissait. C'est exactement ce que montre la capture de
 * FabienM — « The Cure … il y a 34 j », « ABBA … il y a 46 j » — et c'est sa
 * propre réserve : « peut-être que c'est dû à mon historique qui n'était pas
 * prêt avec cette nouvelle fonctionnalité ».
 *
 * ## La clé de l'instant d'écoute — LUE, pas supposée
 *
 * Serveur : `listened_at`, traduit en `playedAt` par `entreesDepuisServeur`.
 * Écrit par `tune-core/src/db/migrations.rs:65` en
 * `strftime('%Y-%m-%dT%H:%M:%SZ')` et par la migration Postgres 004 en
 * `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')` : toujours
 * ISO 8601, toujours avec le `Z`.
 * Local : `stores/history.add` écrit `new Date().toISOString()` — ISO, `Z`.
 *
 * Les deux portent donc leur fuseau. Le test `fuseau` ci-dessous le tient :
 * deux écritures du MÊME instant, l'une en `Z` l'autre en `+02:00`, doivent se
 * comparer comme égales, et l'heure de la machine qui lance les tests ne doit
 * jamais entrer dans le classement.
 *
 * ## Les valeurs manquantes
 *
 * Une entrée sans instant lisible (`listened_at` absent, chaîne vide, date
 * illisible) est renvoyée en QUEUE — jamais en tête. C'est déjà le cas
 * (`instant()` rend `-Infinity`) ; la garde l'inscrit, parce que le piège
 * naturel d'un `sort` par date est qu'un `NaN` ou un `0` remonte au sommet.
 */
import { describe, it, expect } from 'vitest';
import { fusionnerHistorique, entreesDepuisServeur } from '../historiqueLecture';
import type { HistoryEntry } from '../stores/history';

/** Une entrée locale : ce que la fusion regarde, et rien d'autre. */
function loc(titre: string, quand: string | undefined, id: number | null = null): HistoryEntry {
  return {
    track: { id, title: titre, artist_name: 'A', source: id == null ? 'radio' : 'library' },
    playedAt: quand,
    zoneName: 'Salon',
  } as unknown as HistoryEntry;
}

/** Une entrée SERVEUR, fabriquée par le vrai traducteur — donc par la vraie clé. */
function srv(titre: string, listenedAt: string | undefined, id: number | null = null): HistoryEntry {
  return entreesDepuisServeur([
    { track_id: id, title: titre, artist_name: 'A', source: 'library', listened_at: listenedAt, zone_id: 3 },
  ])[0];
}

const titres = (l: HistoryEntry[]) => l.map((x) => x.track.title);
const instants = (l: HistoryEntry[]) => l.map((x) => x.playedAt);

describe('#1146 — l’Historique est rendu du plus récent au plus ancien', () => {
  /** 1 · Le symptôme brut : du désordre entrant, de l’ordre sortant. */
  it('local et serveur MÊLÉS et en désordre ressortent chronologiques', () => {
    const local = [
      loc('L-vieux', '2026-08-10T10:00:00Z', 1),
      loc('L-frais', '2026-09-13T10:05:00Z', 2),
      loc('L-milieu', '2026-09-01T10:00:00Z', 3),
    ];
    const serveur = [
      srv('S-tres-frais', '2026-09-13T10:07:00Z', 4),
      srv('S-hier', '2026-09-12T22:00:00Z', 5),
      srv('S-antique', '2026-07-29T08:00:00Z', 6),
    ];
    expect(titres(fusionnerHistorique(local, serveur))).toEqual([
      'S-tres-frais', 'L-frais', 'S-hier', 'L-milieu', 'L-vieux', 'S-antique',
    ]);
  });

  /** 2 · La forme exacte de la capture : un bloc local ancien, un serveur récent. */
  it('un bloc local ANCIEN ne passe pas devant une playlist serveur d’il y a 8 minutes', () => {
    const local = [loc('The Cure', '2026-08-10T10:00:00Z', 11), loc('ABBA', '2026-07-29T10:00:00Z', 12)];
    const serveur = [srv('playlist-8min', '2026-09-13T10:07:00Z', 13)];
    expect(titres(fusionnerHistorique(local, serveur))[0]).toBe('playlist-8min');
  });

  /** 3 · Valeurs manquantes : en QUEUE, jamais en tête. */
  it('une entrée SANS instant d’écoute finit en queue, et ne désordonne rien', () => {
    const local = [
      loc('sans-date', undefined, 21),
      loc('recente', '2026-09-13T10:00:00Z', 22),
      loc('vide', '', 23),
      loc('ancienne', '2026-08-01T10:00:00Z', 24),
      loc('illisible', 'pas-une-date', 25),
    ];
    const rendu = titres(fusionnerHistorique(local, []));
    expect(rendu.slice(0, 2)).toEqual(['recente', 'ancienne']);
    expect(rendu.slice(2).sort()).toEqual(['illisible', 'sans-date', 'vide']);
  });

  /** 3 bis · La clé serveur, LUE : `listened_at` — et son absence ne remonte pas. */
  it('la clé serveur est `listened_at`, et son absence ne remonte pas en tête', () => {
    expect(srv('x', '2026-09-13T10:00:00Z', 31).playedAt).toBe('2026-09-13T10:00:00Z');
    // Une charge serveur qui ne porterait PAS la clé attendue : la ligne existe,
    // mais elle ne peut pas revendiquer la première place.
    const sansCle = entreesDepuisServeur([{ track_id: 32, title: 'muette', source: 'library' }]);
    expect(sansCle[0].playedAt).toBeUndefined();
    const rendu = fusionnerHistorique([], [...sansCle, srv('datee', '2026-08-01T10:00:00Z', 33)]);
    expect(titres(rendu)).toEqual(['datee', 'muette']);
  });

  /** 4 · Fuseau : l’instant compte, pas son écriture ni l’heure de la machine. */
  it('le même instant écrit en `Z` et en `+02:00` se classe au même rang', () => {
    // 12:00 Paris (UTC+2) === 10:00 UTC. L’entrée de 10:30 UTC est postérieure
    // aux deux, celle de 09:00 UTC antérieure — quelle que soit la TZ du poste.
    const local = [loc('paris-midi', '2026-09-13T12:00:00+02:00', 41)];
    const serveur = [
      srv('utc-10h30', '2026-09-13T10:30:00Z', 42),
      srv('utc-09h00', '2026-09-13T09:00:00Z', 43),
    ];
    expect(titres(fusionnerHistorique(local, serveur))).toEqual([
      'utc-10h30', 'paris-midi', 'utc-09h00',
    ]);
  });

  /**
   * 🔴 5 · LE ROUGE DE CE LOT.
   *
   * La même piste des deux côtés, avec des instants DIFFÉRENTS. La ligne
   * rendue doit porter l'écoute la plus RÉCENTE — c'est ce que l'en-tête de
   * `fusionnerHistorique` promet — et se ranger à sa place.
   *
   * Avant : la déduplication gardait la locale (première rencontrée), donc
   * l'écoute d'il y a un mois, et la piste tombait en bas de l'écran.
   */
  it('une piste connue des DEUX côtés porte sa plus RÉCENTE écoute', () => {
    const local = [loc('The Cure', '2026-08-10T10:00:00Z', 51)];
    const serveur = [
      srv('The Cure', '2026-09-13T10:07:00Z', 51),
      srv('autre', '2026-09-12T22:00:00Z', 52),
    ];
    const rendu = fusionnerHistorique(local, serveur);
    expect(rendu).toHaveLength(2);
    expect(instants(rendu)[0]).toBe('2026-09-13T10:07:00Z');
    expect(titres(rendu)).toEqual(['The Cure', 'autre']);
  });

  /** 🔴 5 bis · Et le rang suit vraiment l’instant retenu. */
  it('la ligne dédupliquée se RANGE à la date retenue, pas à l’ancienne', () => {
    const local = [loc('X', '2026-08-10T10:00:00Z', 61)];
    const serveur = [
      srv('X', '2026-09-13T10:07:00Z', 61),
      srv('Z', '2026-09-13T00:00:00Z', 62),
    ];
    expect(titres(fusionnerHistorique(local, serveur))).toEqual(['X', 'Z']);
  });

  /**
   * ⚠️ CE QU'IL NE FAUT PAS CASSER — la priorité du LOCAL à instant ÉGAL.
   *
   * Le magasin local porte le vrai nom de zone et les titres de radio que le
   * serveur ne sait pas rattacher. À date égale, c'est lui qui décrit la
   * ligne. Le tri est stable, la déduplication doit l'être aussi.
   */
  it('à instant ÉGAL, la version LOCALE l’emporte encore', () => {
    const quand = '2026-09-13T10:00:00Z';
    const rendu = fusionnerHistorique([loc('meme', quand, 71)], [srv('meme', quand, 71)]);
    expect(rendu).toHaveLength(1);
    expect(rendu[0].zoneName).toBe('Salon');
  });

  /** ⚠️ Et une entrée locale PLUS RÉCENTE reste la locale. */
  it('quand le LOCAL est le plus récent, c’est lui qui décrit la ligne', () => {
    const rendu = fusionnerHistorique(
      [loc('meme', '2026-09-13T10:10:00Z', 81)],
      [srv('meme', '2026-09-13T10:00:00Z', 81)],
    );
    expect(rendu).toHaveLength(1);
    expect(rendu[0].zoneName).toBe('Salon');
    expect(rendu[0].playedAt).toBe('2026-09-13T10:10:00Z');
  });
});
