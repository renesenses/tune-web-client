/**
 * #1519 — « Sur page d'accueil je ne vois plus le nombre de morceaux ».
 *
 * jfpaquet, forum mozaiklabs fil 1900, ticket support 159, le 23/09/2026 en
 * 0.9.162 sous Windows : 79 940 pistes en bibliothèque, et la ligne de
 * chiffres de l'accueil n'en disait rien. Sa capture montre exactement les
 * cinq cartes du défaut du 19/09 — ALBUMS, ARTISTS, PLAYS, HOURS HEARD, ON
 * DISK — donc il n'avait pas composé sa ligne : il voyait le défaut.
 *
 * La carte « titres » existait DÉJÀ au catalogue (`CHIFFRES`) depuis le
 * premier jour ; elle n'était simplement pas retenue par `CHOIX_DEFAUT`. Ce
 * n'est donc pas une régression de `1d8da641` : la ligne d'avant ne montrait
 * pas davantage de nombre de pistes. Bertrand a arbitré le 24/09/2026 : la
 * carte entre dans le défaut.
 *
 * ## Les deux cas, et pourquoi le second commande tout
 *
 * 1. un profil qui n'a JAMAIS touché la ligne — aucun `home_stats` enregistré :
 *    il doit voir le nombre de titres ;
 * 2. un profil qui a un choix ENREGISTRÉ — c'est le cas de la plupart des
 *    testeurs, la ligne étant configurable depuis le 19/09 : son choix ne
 *    bouge pas d'un identifiant. Ajouter une carte à un défaut ne doit JAMAIS
 *    réécrire en silence ce que quelqu'un a choisi. Qui veut la carte la coche
 *    dans « Modifier ».
 *
 * 🔴 La conséquence est assumée : un profil du cas 2 — y compris, peut-être,
 * celui de jfpaquet si un geste sur l'accueil a figé son `home_stats` — ne
 * verra rien changer tant qu'il n'aura pas coché la carte lui-même.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as api from '../api';
import { widgetParId } from '../accueilWidgets';
import {
  CHOIX_DEFAUT,
  cartes,
  chiffreParId,
  choixAEnregistrer,
  choixAuChargement,
  type SourcesChiffres,
} from '../chiffresAccueil';

/** Les chiffres de jfpaquet, tels que sa fiche système les rapporte. */
const JFPAQUET: SourcesChiffres = {
  bibliotheque: {
    albums: 6672, artists: 2516, tracks: 79940,
    total_duration_ms: 1_000_000_000, total_size_bytes: 2_100_000_000_000,
  },
  ecoute: { total_listens: 86, unique_tracks: 40, unique_artists: 20, total_duration_ms: 28_800_000 },
  genres: 115,
};

/** Le défaut du 19/09, tel qu'un profil a pu l'enregistrer sans y penser. */
const DEFAUT_DU_19_09 = ['albums', 'artistes', 'lectures', 'heures-ecoutees', 'taille'];

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('#1519 — cas 1 : un profil qui n’a jamais choisi voit le nombre de titres', () => {
  it('🔴 le choix par défaut retient « titres »', () => {
    expect(CHOIX_DEFAUT).toContain('titres');
  });

  it('la carte qu’il désigne existe bien au catalogue, avec sa clé de libellé', () => {
    // Rien de neuf à traduire : la carte est déclarée depuis #4527.
    expect(chiffreParId('titres')?.cleLibelle).toBe('v2.home.sTracks');
  });

  it('🔴 sans rien d’enregistré, la ligne part du défaut — titres compris', () => {
    for (const rien of [undefined, null, {} as any, 'pas une liste']) {
      const lu = choixAuChargement(rien);
      expect(lu.choix, String(rien)).toContain('titres');
      expect(lu.enregistres, String(rien)).toBeNull();
    }
  });

  it('🔴 sur SES chiffres, la ligne affiche enfin 79 940', () => {
    const v = cartes(choixAuChargement(undefined).choix, JFPAQUET, 'en');
    const titres = v.find((c) => c.id === 'titres');
    expect(titres, 'aucune carte « titres » dans la ligne par défaut').toBeTruthy();
    expect(titres!.texte).toBe('79,940');
    expect(titres!.cleLibelle).toBe('v2.home.sTracks');
  });

  it('les cinq cartes historiques restent, dans leur ordre', () => {
    // On AJOUTE une carte, on n'en retire aucune : personne ne doit perdre un
    // chiffre au passage.
    const reste = CHOIX_DEFAUT.filter((id) => id !== 'titres');
    expect(reste).toEqual(DEFAUT_DU_19_09);
  });

  it('le défaut tient dans le maximum du sélecteur', () => {
    // `basculer` plafonne à six. Un défaut plus long serait intenable : la
    // ligne montrerait ce que le sélecteur refuse de recomposer.
    expect(CHOIX_DEFAUT.length).toBeLessThanOrEqual(6);
  });

  it('le widget « statistiques » sert bien la nouvelle carte quand rien n’est choisi', async () => {
    // La garde du bout : ce n'est pas seulement la constante, c'est ce que le
    // widget de l'accueil rend réellement.
    const stats = vi.spyOn(api, 'getLibraryStats').mockResolvedValue(JFPAQUET.bibliotheque as any);
    vi.spyOn(api, 'getDashboardStats').mockResolvedValue(JFPAQUET.ecoute as any);
    const genres = vi.spyOn(api, 'getGenres').mockResolvedValue([] as any);

    const w = widgetParId('statistiques')!;
    const ligne = await w.chiffres!({
      profileId: 1, chiffresChoisis: choixAuChargement(undefined).choix, langue: 'en',
    } as any);

    expect(ligne.map((c: any) => c.id)).toContain('titres');
    expect(ligne.find((c: any) => c.id === 'titres')!.valeur).toBe('79,940');
    expect(stats).toHaveBeenCalled();
    // Aucune carte de genre dans le défaut : pas d'appel à /library/genres.
    expect(genres).not.toHaveBeenCalled();
  });
});

describe('#1519 — cas 2 : un choix ENREGISTRÉ n’est pas réécrit', () => {
  it('🔴 un profil qui a composé sa ligne garde EXACTEMENT ce qu’il a rangé', () => {
    const sien = ['taille', 'albums'];
    const lu = choixAuChargement(sien);
    expect(lu.choix).toEqual(['taille', 'albums']);
    expect(lu.choix).not.toContain('titres');
    expect(lu.enregistres).toEqual(['taille', 'albums']);
  });

  it('🔴 `choixAuChargement` rend le défaut du 19/09 FIGÉ tel quel, à cinq cartes', () => {
    // C'est le cas de la plupart des testeurs : la ligne est configurable
    // depuis le 19/09, et tout geste sur l'accueil enregistre les deux clés.
    //
    // ⚠️ 24/09 — cette primitive-ci ne migre toujours RIEN, et c'est sa règle.
    // C'est `migrationLigneChiffres` qui décide au-dessus d'elle que cette
    // ligne-là n'a jamais été choisie : voir `migrationLigneFigee1519`.
    const lu = choixAuChargement([...DEFAUT_DU_19_09]);
    expect(lu.choix).toEqual(DEFAUT_DU_19_09);
    expect(lu.choix).toHaveLength(5);
    expect(lu.choix).not.toContain('titres');
  });

  it('🔴 une liste VIDE reste vide : « aucune carte » est un choix', () => {
    const lu = choixAuChargement([]);
    expect(lu.choix).toEqual([]);
    expect(lu.enregistres).toEqual([]);
  });

  it('🔴 charger puis réenregistrer sans geste rend le MÊME choix, à l’identifiant près', () => {
    // La garde qui compte vraiment : si le défaut se glissait dans le choix au
    // chargement, le premier geste de l'utilisateur l'écrirait chez lui pour
    // de bon.
    for (const sien of [DEFAUT_DU_19_09, ['taille'], [], ['albums', 'chiffre-dun-futur-serveur']]) {
      const lu = choixAuChargement([...sien]);
      expect(choixAEnregistrer(lu.choix, lu.enregistres), sien.join(',')).toEqual(sien);
    }
  });

  it('🔴 ce qu’il a rangé n’est pas COPIÉ par référence', () => {
    // Cocher une carte remplace la liste ; un partage de référence ferait
    // mentir `chiffresEnregistres`, seul témoin de ce que le serveur porte.
    const sien = ['albums'];
    const lu = choixAuChargement(sien);
    expect(lu.choix).not.toBe(sien);
    expect(lu.enregistres).not.toBe(sien);
  });

  it('🔴 et à l’écran, une ligne lue par `choixAuChargement` ne gagne aucune carte', async () => {
    vi.spyOn(api, 'getLibraryStats').mockResolvedValue(JFPAQUET.bibliotheque as any);
    vi.spyOn(api, 'getDashboardStats').mockResolvedValue(JFPAQUET.ecoute as any);
    vi.spyOn(api, 'getGenres').mockResolvedValue([] as any);

    const w = widgetParId('statistiques')!;
    const ligne = await w.chiffres!({
      profileId: 1, chiffresChoisis: choixAuChargement([...DEFAUT_DU_19_09]).choix, langue: 'en',
    } as any);

    expect(ligne.map((c: any) => c.id)).toEqual(DEFAUT_DU_19_09);
    expect(ligne.map((c: any) => c.id)).not.toContain('titres');
  });
});

describe('#1519 — la décision est BRANCHÉE au chargement', () => {
  it('🔴 l’accueil lit la ligne par `migrationLigneChiffres`', () => {
    // Sans ce contrôle, la fonction pourrait être juste et n'être appelée par
    // personne : le défaut resterait invisible.
    const src = sansCommentaires(lire('src/components/v2/PageWidgets.svelte'));
    const charger = src.slice(
      src.indexOf('async function charger()'),
      src.indexOf('async function migrerLigneDeChiffres('),
    );
    expect(charger).toContain('migrationLigneChiffres(prefs?.[CLE_CHIFFRES], prefs?.[CLE_CHIFFRES_MIGRE])');
    expect(charger).toContain('chiffres = lu.choix;');
    expect(charger).toContain('chiffresEnregistres = lu.enregistres;');
  });

  it('🔴 ouvrir l’accueil n’écrit QUE sous le verdict de la migration', () => {
    // 🔴 Ce témoin disait « le chargement n'enregistre RIEN » jusqu'au
    // 24/09/2026. Bertrand a arbitré l'inverse ce jour-là : les lignes qui ne
    // sont que le défaut du 19/09 figé se réécrivent une fois. Ce qui reste
    // vrai, et qui est mesuré ici, c'est qu'AUCUNE autre écriture n'a lieu au
    // chargement — en particulier jamais la disposition des widgets, dont un
    // défaut écrit deviendrait un choix que personne n'a fait.
    const src = sansCommentaires(lire('src/components/v2/PageWidgets.svelte'));
    const charger = src.slice(
      src.indexOf('async function charger()'),
      src.indexOf('async function migrerLigneDeChiffres('),
    );
    expect(charger.includes('setProfilePreferences')).toBe(false);
    expect(charger).toContain('if (migrationAFaire) void migrerLigneDeChiffres(pid, [...chiffres]);');
    // Et l'écriture de la migration ne touche que les deux clés de la ligne.
    const migration = src.slice(
      src.indexOf('async function migrerLigneDeChiffres('),
      src.indexOf('async function enregistrer()'),
    );
    expect(migration).toContain('[CLE_CHIFFRES]: ligne,');
    expect(migration).toContain('[CLE_CHIFFRES_MIGRE]: true,');
    expect(migration.includes('[CLE]:'), 'la migration écrit la disposition des widgets').toBe(false);
  });
});

describe('#1519 — aucune chaîne nouvelle à traduire', () => {
  it('la clé de la carte est déjà dans les onze catalogues', () => {
    for (const langue of ['de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'ro', 'sv', 'zh']) {
      const src = lire(`src/lib/locales/${langue}.ts`);
      expect(src.includes('"v2.home.sTracks"'), langue).toBe(true);
    }
  });
});
