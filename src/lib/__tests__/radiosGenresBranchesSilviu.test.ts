import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { locale, t } from '../i18n';
import { radioGenreShelf, radioGenreLabel, radioGenreShelves } from '../radioGenres';

/**
 * Garde : les puces de genre de la page RADIO sont TRADUITES, pas recopiées.
 *
 * ── LA CAPTURE ──────────────────────────────────────────────────────────
 *
 * Silviu, testeur roumain, v0.9.161. Toute la page Radio en direct est en
 * roumain, sauf ses puces de filtre :
 *
 *     Éclectique · Classique · Jazz · Rock · Électronique · Hip-Hop ·
 *     Monde · Reggae · Blues · Chanson française · Contemporaine · Culture
 *
 * plus, sur chaque vignette, un genre français et un pays français
 * (Royaume-Uni, États-Unis, Pays-Bas, France, Suisse, Japon, Belgique).
 *
 * ── LA SOURCE ───────────────────────────────────────────────────────────
 *
 * Aucune de ces chaînes n'était écrite dans le client. Le genre est une
 * colonne TEXTE LIBRE du serveur (`radio_stations.genre`), semée en français
 * canonique par la migration v33 puis recopiée verbatim de l'annuaire
 * mozaiklabs. `RadiosV2.svelte` dérivait ses puces des chaînes brutes et
 * affichait la donnée telle quelle.
 *
 * 🔴 `lib/radioGenres.ts` EXISTAIT pour exactement ce défaut — vingt-six
 * orthographes repliées sur quinze clés `radioGenre.*`, traduites dans les
 * onze langues — et n'était BRANCHÉ NULLE PART : un `grep` de ses exports
 * dans `src/components` ne rendait rien, seul son propre test l'importait.
 * « Écrit mais pas branché ». C'est ce que cette garde tient.
 *
 * ── CE QUI RESTE AU SERVEUR ─────────────────────────────────────────────
 *
 * Le PAYS. `GET /api/v1/radios` ne sert aucun code ISO : `country` est un
 * texte libre, semé en toutes lettres et en français. Le replier ici
 * demanderait d'inventer une table que la donnée ne porte pas — c'est au
 * serveur d'ajouter `country_code`. Le dernier test le constate, pour que
 * personne ne « corrige » ça côté client par inadvertance.
 */

const RACINE = resolve(__dirname, '../../..');
const RADIOS = resolve(RACINE, 'src/components/v2/RadiosV2.svelte');

function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const SOURCE = readFileSync(RADIOS, 'utf8');
const CORPS = sansCommentaires(SOURCE);

describe('page Radio — capture Silviu (roumain, v0.9.161)', () => {
  it('branche enfin lib/radioGenres — l’écran l’importe', () => {
    expect(CORPS).toContain("from '../../lib/radioGenres'");
    // `radioGenreShelf` a cédé la place à `radioGenreRayon` le 22/09/2026 :
    // la clé du SERVEUR l'emporte désormais, et la table locale n'est plus
    // que le repli qu'elle appelle en dernier.
    expect(CORPS).toContain('radioGenreRayon');
    expect(CORPS).toContain('radioGenreLabel');
  });

  it('n’écrit plus « Tous » en dur sur la puce de remise à zéro', () => {
    expect(CORPS).not.toContain('>Tous (');
    expect(CORPS).toContain("'v2.radio.allGenres'");
  });

  it('ne dérive plus les puces de la chaîne BRUTE du serveur', () => {
    // L'ancienne forme comptait `r.genre?.trim()` dans une Map et rendait `{g}`
    // tel quel. Les deux disparaissent ensemble.
    expect(CORPS).not.toContain('m.set(g, (m.get(g) ?? 0) + 1)');
    expect(CORPS).not.toContain('<span class="gn">{r.genre}</span>');
  });

  it('filtre sur la CLÉ du rayon, pas sur la chaîne brute', () => {
    // `r.genre?.trim() !== genre` remettait « jazz » et « Jazz » dans deux
    // rayons ; c'est le défaut que radioGenres corrige, et il ne revient pas.
    expect(CORPS).not.toContain("r.genre?.trim() !== genre");
    expect(CORPS).toContain('radioGenreRayon(r)?.key !== genre');
  });
});

describe('les genres semés en français se lisent en roumain', () => {
  /** Les douze puces exactement telles que Silviu les a lues. */
  const PUCES_DE_LA_CAPTURE = [
    'Éclectique', 'Classique', 'Jazz', 'Rock', 'Électronique', 'Hip-Hop',
    'Monde', 'Reggae', 'Blues', 'Chanson française', 'Contemporaine', 'Culture',
  ];

  it('rend les douze puces de la capture dans la langue du lecteur', () => {
    locale.set('ro');
    const tr = get(t);

    const rendus = PUCES_DE_LA_CAPTURE.map((brut) => {
      const rayon = radioGenreShelf(brut);
      expect(rayon, `« ${brut} » n’a pas de rayon`).not.toBeNull();
      expect(rayon!.i18nKey, `« ${brut} » hors vocabulaire`).toBeTruthy();
      return radioGenreLabel(rayon!, (k) => tr(k));
    });

    expect(rendus).toEqual([
      'Eclectic', 'Clasică', 'Jazz', 'Rock', 'Electronică', 'Hip-Hop',
      'Muzica lumii', 'Reggae', 'Blues', 'Chanson franceză', 'Contemporană', 'Cultură',
    ]);

    // Et surtout : plus aucune des formes françaises de la capture.
    for (const francais of ['Éclectique', 'Électronique', 'Monde', 'Chanson française',
      'Contemporaine', 'Culture', 'Classique']) {
      expect(rendus, `« ${francais} » ressort encore`).not.toContain(francais);
    }
    locale.set('fr');
  });

  it('réunit les orthographes du serveur en UN rayon par genre', () => {
    // Le semis v33 écrit « Classique », le bouton « + Ajouter à Tune » de
    // l'annuaire écrit « classical » : c'est une seule puce.
    const rayons = radioGenreShelves([
      { genre: 'Classique' }, { genre: 'classical' }, { genre: 'CLASSIC' },
      { genre: 'Éclectique' }, { genre: 'eclectic' },
    ]);
    expect(rayons).toHaveLength(2);
  });

  it('n’invente rien pour un genre hors vocabulaire', () => {
    const rayon = radioGenreShelf('Shoegaze');
    expect(rayon?.i18nKey).toBeNull();
    expect(radioGenreLabel(rayon!, () => 'NE DOIT PAS SERVIR')).toBe('Shoegaze');
  });
});

describe('le PAYS est servi en CODE, et rendu dans la langue du lecteur', () => {
  /**
   * 🔴 CE BLOC DISAIT L'INVERSE JUSQU'AU 22/09/2026.
   *
   * Il constatait que `GET /api/v1/radios` ne servait aucun code ISO et
   * interdisait au client de fabriquer la table que la donnée ne portait
   * pas — « c'est au serveur d'ajouter `country_code` ». Le serveur l'a fait
   * (tune-server-rust #4713, `tune-server/src/routes/radios_libelles.rs:136`)
   * et ce raccordement est la PR qui le branche.
   *
   * L'interdiction, elle, TIENT TOUJOURS : le client ne tient aucune table de
   * pays. Il lit un code et délègue à `Intl.DisplayNames`.
   */
  it('le type RadioStation porte enfin le code ISO du serveur', () => {
    const types = readFileSync(resolve(RACINE, 'src/lib/types.ts'), 'utf8');
    const bloc = types.slice(types.indexOf('export interface RadioStation'));
    const corps = bloc.slice(0, bloc.indexOf('\n}'));
    expect(corps).toContain('country?: string | null;');
    expect(corps).toContain('country_code?: string | null;');
    expect(corps).toContain('genre_key?: string | null;');
    expect(corps).toContain('genre_label?: string | null;');
  });

  it('le client ne fabrique toujours PAS de table de pays', () => {
    // La garde d'origine, intacte : ce qui était interdit le reste. Le
    // module d'affichage ne contient aucun nom de pays — il lit un code.
    expect(CORPS).not.toContain('radioPays');
    const pays = readFileSync(resolve(RACINE, 'src/lib/paysAffichage.ts'), 'utf8');
    const code = pays.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain('Intl.DisplayNames');
    for (const nom of ['Royaume-Uni', 'Regatul Unit', 'États-Unis', 'Japon']) {
      expect(code, `« ${nom} » écrit en dur : c'est une table déguisée`).not.toContain(nom);
    }
  });

  it('l’écran rend le pays par le module, et garde `country` en repli', () => {
    expect(CORPS).toContain('nomDuPays(r.country_code');
    expect(CORPS).toContain('r.country');
  });
});
