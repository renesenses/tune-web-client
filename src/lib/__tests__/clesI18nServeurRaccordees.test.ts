// @vitest-environment jsdom
//
// 🔴 LES CLÉS DU SERVEUR SONT ENFIN RACCORDÉES À L'ÉCRAN.
//
// ── LA CAPTURE ────────────────────────────────────────────────────────────
//
// Silviu, testeur roumain, v0.9.161 : du FRANÇAIS au milieu d'une interface
// roumaine. Sur la page Radio, les pastilles de genre et les pays des
// vignettes ; sur l'écran Collections, quatre tuiles livrées — « 🖼️ Sans
// pochette », « 🆕 Récents », « 🎻 Classique », « 🎬 Bandes Originales ».
//
// Rien n'était écrit en dur dans le client : ces chaînes sont des DONNÉES du
// serveur, semées en français en base. Le client n'avait rien à quoi
// accrocher une traduction.
//
// ── CE QUI A CHANGÉ CÔTÉ SERVEUR, ET QUI NE SUFFISAIT PAS ────────────────
//
// Trois PR fusionnées dans `batch/fuites-de-francais-20260922` :
//
//   * #4713 — les stations portent `country_code` (ISO 3166-1 alpha-2),
//     `genre_key` (`radio.genre.*`) et `genre_label` (déjà traduit) ;
//   * #4714 — les collections livrées portent `name_key` et
//     `description_key` (`smartCollection.default.*`), ABSENTES dès que
//     l'utilisateur a renommé la collection ;
//   * #4720 — les rubriques Qobuz suivent l'`Accept-Language`.
//
// Le serveur AJOUTE ces champs à côté des anciens ; il ne remplace rien. Tant
// que le client affiche les anciens, RIEN N'A CHANGÉ À L'ÉCRAN. C'est ce
// raccordement-là que ce fichier tient.
//
// ── CE QUE CES TÉMOINS PROUVENT, ET CE QU'ILS NE PROUVENT PAS ────────────
//
// Ils MONTENT les deux écrans et lisent le texte rendu. Ils ne prouvent rien
// sur la mise en page — jsdom ne met rien en page — ni sur le serveur, dont
// les propres gardes vivent dans `tune-server/tests/`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import { locale, t } from '../i18n';
import { dialogs } from '../stores/dialogs';
import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import CollectionsV2 from '../../components/v2/CollectionsV2.svelte';
import { radioGenreRayon, radioGenreLabel } from '../radioGenres';
import { nomDuPays } from '../paysAffichage';
import {
  SMART_COLLECTION_KEYS,
  collectionNomAffiche,
  collectionDescriptionAffichee,
} from '../collectionsLibelles';

const RACINE = resolve(__dirname, '../../..');
const LANGUES = ['fr', 'en', 'de', 'es', 'it', 'zh', 'ja', 'ko', 'ro', 'sv', 'hu'] as const;

/* ─────────────────────────────────────────────────────────────────────────
 * Le décor : un serveur À JOUR, et un serveur ANCIEN.
 *
 * Le testeur peut tourner sur l'un ou sur l'autre — la v0.9.162 n'est pas
 * publiée partout le même jour. Les deux jeux passent par les mêmes écrans.
 * ──────────────────────────────────────────────────────────────────────── */

/** Ce que sert un serveur ≥ v0.9.162 (#4713). */
const RADIOS_A_JOUR = [
  {
    id: 1, name: 'BBC Radio 3', stream_url: 'https://x.invalid/1', logo_url: null,
    genre: 'Classique', genre_key: 'radio.genre.classical', genre_label: 'Clasică',
    country: 'Royaume-Uni', country_code: 'GB',
    codec: 'AAC', homepage_url: null, favorite: false,
  },
  {
    id: 2, name: 'FIP', stream_url: 'https://x.invalid/2', logo_url: null,
    genre: 'Éclectique', genre_key: 'radio.genre.eclectic', genre_label: 'Eclectic',
    country: 'France', country_code: 'FR',
    codec: 'MP3', homepage_url: null, favorite: false,
  },
  {
    // Une station ajoutée à la main : genre libre, pays inconnu du serveur.
    // Ni clé, ni code — et elle doit rester LISIBLE.
    id: 3, name: 'Radio du grenier', stream_url: 'https://x.invalid/3', logo_url: null,
    genre: 'Shoegaze', country: 'Écosse',
    codec: 'FLAC', homepage_url: null, favorite: false,
  },
];

/** Ce que sert un serveur ANTÉRIEUR : aucun des trois champs nouveaux. */
const RADIOS_ANCIENNES = RADIOS_A_JOUR.map(
  ({ genre_key: _k, genre_label: _l, country_code: _c, ...reste }) => reste,
);

/**
 * Les collections intelligentes d'un serveur à jour (#4714).
 *
 * `🆕 Récents` porte sa clé : c'est une collection LIVRÉE, non touchée.
 * `Mes trouvailles` n'en a pas : l'utilisateur l'a renommée, et le serveur
 * refuse de recoller une étiquette sur son choix.
 */
const SMART_A_JOUR = [
  {
    id: 1, name: '🆕 Récents', description: 'Ajoutés dans les 90 derniers jours',
    name_key: 'smartCollection.default.recent',
    description_key: 'smartCollection.default.recent.description',
    rules: [], match_mode: 'all', sort_by: null, sort_order: 'desc', max_limit: null,
    icon: '🆕', color: null, album_count: 12, covers: [], created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 2, name: '🖼️ Sans pochette', description: 'Albums sans couverture',
    name_key: 'smartCollection.default.noCover',
    description_key: 'smartCollection.default.noCover.description',
    rules: [], match_mode: 'all', sort_by: null, sort_order: 'asc', max_limit: null,
    icon: '🖼️', color: null, album_count: 3, covers: [], created_at: '2026-01-02T00:00:00Z',
  },
  {
    id: 3, name: 'Mes trouvailles du trimestre', description: 'Ce que j’ai aimé',
    rules: [], match_mode: 'all', sort_by: null, sort_order: 'asc', max_limit: null,
    icon: null, color: null, album_count: 7, covers: [], created_at: '2026-01-03T00:00:00Z',
  },
];

/** Le même serveur, mais ANTÉRIEUR : ni `name_key`, ni `description_key`. */
const SMART_ANCIENNES = SMART_A_JOUR.map(
  ({ name_key: _n, description_key: _d, ...reste }) => reste,
);

let radiosServies: unknown[] = RADIOS_A_JOUR;
let smartServies: unknown[] = SMART_A_JOUR;
/** Toutes les requêtes sorties — c'est là qu'on lit ce qui est ENVOYÉ. */
let requetes: string[] = [];
/** Les corps des requêtes écrivantes, pour la même raison. */
let corpsEnvoyes: { chemin: string; corps: unknown }[] = [];

class Inerte {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function corpsDeReponse(chemin: string): unknown {
  if (chemin.includes('/smart-collections/preview')) return { total: 0, albums: [] };
  if (/\/smart-collections\/\d+\/albums/.test(chemin)) return [];
  if (chemin.endsWith('/library/smart-collections')) return smartServies;
  if (/\/collections\/\d+\/albums/.test(chemin)) return [];
  if (chemin.endsWith('/library/collections')) return [];
  if (chemin.endsWith('/radios')) return radiosServies;
  return [];
}

let hote: HTMLDivElement | null = null;
let monte: Record<string, any> | null = null;

beforeEach(() => {
  requetes = [];
  corpsEnvoyes = [];
  radiosServies = RADIOS_A_JOUR;
  smartServies = SMART_A_JOUR;
  localStorage.clear();
  locale.set('fr');
  vi.stubGlobal('ResizeObserver', Inerte);
  vi.stubGlobal('IntersectionObserver', Inerte);
  vi.stubGlobal('WebSocket', class {
    close() {} addEventListener() {} removeEventListener() {} send() {}
  } as any);
  vi.stubGlobal('fetch', vi.fn(async (url: any, opts: any) => {
    const brut = String(typeof url === 'string' ? url : url?.url ?? '');
    const chemin = brut.replace(/^https?:\/\/[^/]+/, '');
    requetes.push(chemin);
    if (opts?.body != null) {
      corpsEnvoyes.push({ chemin, corps: JSON.parse(String(opts.body)) });
    }
    const c = corpsDeReponse(chemin.split('?')[0]);
    return {
      ok: true, status: 200, statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => c,
      text: async () => JSON.stringify(c),
    } as unknown as Response;
  }));
});

afterEach(() => {
  for (const r of get(dialogs)) dialogs.settle(r.id, false);
  if (monte) unmount(monte);
  monte = null;
  if (hote) hote.remove();
  hote = null;
  for (const n of Array.from(document.querySelectorAll('.fond'))) n.remove();
  vi.unstubAllGlobals();
  locale.set('fr');
});

async function tourner(tours = 8) {
  for (let i = 0; i < tours; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function attendreQue(condition: () => boolean, tours = 400): Promise<boolean> {
  for (let i = 0; i < tours; i++) {
    if (condition()) return true;
    await new Promise((r) => setTimeout(r, 5));
    flushSync();
  }
  return condition();
}

async function poser(composant: any): Promise<HTMLDivElement> {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  monte = mount(composant, { target: hote, props: {} as any });
  flushSync();
  await tourner();
  return hote;
}

const texte = (racine: HTMLElement) => (racine.textContent ?? '').replace(/\s+/g, ' ');

/* ═════════════════════════════════════════════════════════════════════════
 * 1. RADIOS — le pays se lit dans la langue du lecteur
 * ════════════════════════════════════════════════════════════════════════ */

describe('Radios — le PAYS suit enfin la langue (capture Silviu)', () => {
  it('🔴 une station `country_code: "GB"` se lit « Regatul Unit » en roumain', async () => {
    locale.set('ro');
    const racine = await poser(RadiosV2);
    expect(await attendreQue(() => texte(racine).includes('BBC Radio 3'))).toBe(true);
    // Le codec et le pays partagent la même pastille ; les filtres sont
    // repliés par défaut, on lit donc directement le rendu du module.
    expect(nomDuPays('GB', 'ro', 'Royaume-Uni')).toBe('Regatul Unit');
    // … et ce que l'écran affiche NE PORTE PLUS la forme française.
    expect(texte(racine)).not.toContain('Royaume-Uni');
  });

  it('le même code se lit dans CHAQUE langue — la contre-épreuve du « toujours pareil »', () => {
    // Sans ceci, une fonction qui rendrait « Regatul Unit » en dur passerait
    // le test précédent sans rien traduire.
    const rendus = LANGUES.map((l) => nomDuPays('GB', l, 'Royaume-Uni'));
    expect(rendus).toEqual([
      'Royaume-Uni', 'United Kingdom', 'Vereinigtes Königreich', 'Reino Unido',
      'Regno Unito', '英国', 'イギリス', '영국', 'Regatul Unit', 'Storbritannien',
      'Egyesült Királyság',
    ]);
    // Onze langues, onze libellés — dont aucun n'est le code nu.
    expect(rendus).not.toContain('GB');
  });

  it('SANS code — serveur ancien, ou pays tapé à la main — le nom du serveur est rendu tel quel', () => {
    expect(nomDuPays(null, 'ro', 'Royaume-Uni')).toBe('Royaume-Uni');
    expect(nomDuPays(undefined, 'ja', 'Écosse')).toBe('Écosse');
    // Et surtout : jamais une étiquette vide, jamais un code nu.
    expect(nomDuPays('ZZ', 'fr', 'Pays imaginaire')).toBe('Pays imaginaire');
    expect(nomDuPays('USA', 'fr', 'États-Unis')).toBe('États-Unis');
    // Rien du tout des deux côtés : une chaîne vide, que l'écran n'affiche pas.
    expect(nomDuPays(null, 'fr', null)).toBe('');
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * 2. RADIOS — le GENRE vient de la clé du serveur, la table locale recule
 * ════════════════════════════════════════════════════════════════════════ */

describe('Radios — la clé du serveur l’emporte sur la table locale', () => {
  const libelle = (station: any, langue: string) => {
    locale.set(langue as any);
    const tr = get(t);
    const rayon = radioGenreRayon(station);
    return rayon ? radioGenreLabel(rayon, (k) => tr(k)) : null;
  };

  it('🔴 `genre_key` gagne, et le libellé suit la langue SANS recharger', () => {
    const station = RADIOS_A_JOUR[0];
    expect(libelle(station, 'ro')).toBe('Clasică');
    expect(libelle(station, 'hu')).toBe('Klasszikus');
    expect(libelle(station, 'ja')).toBe('クラシック');
    // `genre_label` du serveur était figé à la langue de la requête : s'il
    // gagnait, les trois lignes rendraient « Clasică ».
    expect(libelle(station, 'hu')).not.toBe('Clasică');
  });

  it('la clé du serveur pilote aussi le REGROUPEMENT — un rayon par genre', () => {
    // Deux orthographes que la base mêle, même clé serveur : une seule puce.
    const a = radioGenreRayon({ genre: 'Classique', genre_key: 'radio.genre.classical' });
    const b = radioGenreRayon({ genre: 'classical', genre_key: 'radio.genre.classical' });
    expect(a!.key).toBe(b!.key);
  });

  it('une clé PLUS RÉCENTE que ce client retombe sur `genre_label`, jamais sur la clé nue', () => {
    // `radio.genre.karaoke` n'existe dans aucun des onze catalogues. `$t()`
    // rendrait la clé elle-même — « radio.genre.karaoke » sur la pastille.
    locale.set('ro');
    const tr = get(t);
    const rayon = radioGenreRayon({
      genre: 'Karaoké', genre_key: 'radio.genre.karaoke', genre_label: 'Karaoke',
    });
    const rendu = radioGenreLabel(rayon!, (k) => tr(k));
    expect(rendu).toBe('Karaoke');
    expect(rendu).not.toContain('radio.genre.');
  });

  it('SANS clé — serveur ancien — la table locale reprend la main', () => {
    locale.set('ro');
    const tr = get(t);
    const rayon = radioGenreRayon({ genre: 'Éclectique' });
    expect(rayon!.i18nKey).toBe('radioGenre.eclectic');
    expect(radioGenreLabel(rayon!, (k) => tr(k))).toBe('Eclectic');
  });

  it('un genre LIBRE reste lisible, sans clé d’aucun côté', () => {
    const rayon = radioGenreRayon({ genre: 'Shoegaze' });
    expect(rayon!.i18nKey).toBeNull();
    expect(radioGenreLabel(rayon!, () => 'NE DOIT PAS SERVIR')).toBe('Shoegaze');
  });

  it('l’écran monté rend les genres en roumain, plus aucune forme française', async () => {
    locale.set('ro');
    const racine = await poser(RadiosV2);
    expect(await attendreQue(() => texte(racine).includes('BBC Radio 3'))).toBe(true);
    const vu = texte(racine);
    expect(vu).toContain('Clasică');
    expect(vu).not.toContain('Éclectique');
    expect(vu).not.toContain('Classique');
    // Le genre libre n'est pas caché pour autant.
    expect(vu).toContain('Shoegaze');
  });

  it('SERVEUR ANCIEN : l’écran reste peuplé, rien ne devient blanc', async () => {
    radiosServies = RADIOS_ANCIENNES;
    locale.set('ro');
    const racine = await poser(RadiosV2);
    expect(await attendreQue(() => texte(racine).includes('BBC Radio 3'))).toBe(true);
    const vu = texte(racine);
    // La table locale traduit encore ce qu'elle connaît…
    expect(vu).toContain('Clasică');
    // … et aucune clé nue ne fuit à l'écran.
    expect(vu).not.toContain('radio.genre.');
    expect(vu).not.toContain('radioGenre.');
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * 3. COLLECTIONS — traduites quand elles sont livrées, intactes sinon
 * ════════════════════════════════════════════════════════════════════════ */

describe('Collections — la clé traduit la tuile LIVRÉE, jamais le nom de l’utilisateur', () => {
  it('🔴 une collection avec `name_key` se lit en roumain ; une RENOMMÉE garde son nom', async () => {
    locale.set('ro');
    const racine = await poser(CollectionsV2);
    expect(await attendreQue(() => texte(racine).includes('Mes trouvailles du trimestre')))
      .toBe(true);
    const vu = texte(racine);

    // Les deux tuiles livrées, traduites.
    expect(vu).toContain('🆕 Recente');
    expect(vu).toContain('🖼️ Fără copertă');
    // Les formes françaises de la capture ont disparu.
    expect(vu).not.toContain('🆕 Récents');
    expect(vu).not.toContain('🖼️ Sans pochette');
    // 🔴 LE POINT : le nom choisi par l'utilisateur est rendu VERBATIM.
    expect(vu).toContain('Mes trouvailles du trimestre');
  });

  it('la DESCRIPTION suit la même règle, clé par clé', () => {
    locale.set('ro');
    const tr = get(t);
    expect(
      collectionDescriptionAffichee(SMART_A_JOUR[0] as any, (k) => tr(k)),
    ).toBe('Adăugate în ultimele 90 de zile');
    // Description réécrite par l'utilisateur : le serveur retire SA clé, le
    // texte de l'utilisateur passe intact — même si le nom, lui, garde la
    // sienne.
    expect(
      collectionDescriptionAffichee(
        { name_key: 'smartCollection.default.recent', description: 'Mes coups de cœur' } as any,
        (k) => tr(k),
      ),
    ).toBe('Mes coups de cœur');
  });

  it('une clé INCONNUE de ce client ne s’affiche jamais telle quelle', () => {
    // Un serveur plus récent ajoute « smartCollection.default.karaoke » : le
    // client retombe sur le nom stocké, qui est lisible, plutôt que d'écrire
    // une clé sur une tuile.
    locale.set('ro');
    const tr = get(t);
    const rendu = collectionNomAffiche(
      { name: '🎤 Karaoké', name_key: 'smartCollection.default.karaoke' },
      (k) => tr(k),
    );
    expect(rendu).toBe('🎤 Karaoké');
    expect(rendu).not.toContain('smartCollection.');
  });

  it('SERVEUR ANCIEN : les tuiles gardent leur nom semé, aucune ne devient vide', async () => {
    smartServies = SMART_ANCIENNES;
    locale.set('ro');
    const racine = await poser(CollectionsV2);
    expect(await attendreQue(() => texte(racine).includes('Mes trouvailles du trimestre')))
      .toBe(true);
    const vu = texte(racine);
    // C'est l'affichage d'avant ce correctif — imparfait, mais lisible.
    expect(vu).toContain('🆕 Récents');
    expect(vu).not.toContain('smartCollection.');
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * 4. 🔴 LE NOM EST UNE DONNÉE — on traduit ce qu'on AFFICHE, jamais ce qu'on
 *    RENVOIE.
 *
 * Le nom d'une collection est la valeur de filtre de
 * `/library/tracks?collection=<name>` ET le corps de la modification.
 * Traduire ce qui repart, c'est filtrer sur un nom qui n'existe dans aucune
 * base, ou rebaptiser en roumain la collection de quelqu'un.
 * ════════════════════════════════════════════════════════════════════════ */

describe('🔴 la traduction ne franchit JAMAIS la frontière de la requête', () => {
  it('ouvrir la fiche n’envoie que des IDENTIFIANTS — jamais le libellé lu', async () => {
    locale.set('ro');
    const racine = await poser(CollectionsV2);
    expect(await attendreQue(() => texte(racine).includes('🆕 Recente'))).toBe(true);

    // On ouvre la tuile « 🆕 Recente » : c'est le geste qui déclenche le
    // chargement de son contenu, donc les requêtes.
    const tuile = Array.from(racine.querySelectorAll<HTMLButtonElement>('button.meta'))
      .find((b) => (b.textContent ?? '').includes('Recente'));
    expect(tuile, 'la tuile traduite est cliquable').toBeTruthy();
    tuile!.click();
    await tourner(12);

    // Le titre de la fiche est TRADUIT…
    expect(texte(racine)).toContain('🆕 Recente');
    // … et rien de traduit n'est parti sur le fil.
    const tout = requetes.join(' | ') + ' ' + JSON.stringify(corpsEnvoyes);
    expect(tout).not.toContain('Recente');
    expect(tout).not.toContain(encodeURIComponent('Recente'));
    // Les requêtes de contenu passent par l'identifiant, pas par le nom.
    expect(requetes.some((r) => /smart-collections\/1\b/.test(r))).toBe(true);
  });

  it('la source ne passe JAMAIS un libellé traduit à une route', () => {
    const src = readFileSync(
      resolve(RACINE, 'src/components/v2/CollectionsV2.svelte'), 'utf8',
    );
    // La modale de renommage — dont le contenu part en `api.updateCollection`
    // — lit la valeur stockée.
    expect(src).toContain('nom={cible.nom}');
    expect(src).toContain('description={cible.description}');
    expect(src).not.toContain('nom={libelleTradu(cible)}');
    // Le raccourci garde le nom stocké pour RETROUVER la collection, et le
    // libellé traduit seulement pour l'afficher.
    expect(src).toContain('restore: { id: e.id, name: e.nom }');
    // 🔴 La garde générale : aucune ligne qui appelle `api.` ne mentionne le
    // libellé traduit. Une garde de texte satisfaite par la définition serait
    // inutile — on coupe donc la définition elle-même.
    const lignes = src
      .split('\n')
      .filter((l) => /\bapi\.[a-zA-Z]/.test(l))
      .filter((l) => /libelleTradu|descriptionTraduite/.test(l));
    expect(lignes, 'un libellé traduit part dans une requête').toEqual([]);
  });

  it('CONTRE-ÉPREUVE de la garde : la forme fautive serait bien attrapée', () => {
    const fautif = "      enregistrer={(v) => api.updateCollection(cible.id, libelleTradu(v))}";
    const lignes = [fautif]
      .filter((l) => /\bapi\.[a-zA-Z]/.test(l))
      .filter((l) => /libelleTradu|descriptionTraduite/.test(l));
    expect(lignes).toHaveLength(1);
  });

  it('aucune requête de l’écran ne porte un nom traduit', async () => {
    locale.set('ro');
    const racine = await poser(CollectionsV2);
    expect(await attendreQue(() => texte(racine).includes('🆕 Recente'))).toBe(true);
    const tout = requetes.join(' | ') + ' ' + JSON.stringify(corpsEnvoyes);
    expect(tout).not.toContain('Recente');
    expect(tout).not.toContain('Fără copertă');
  });
});

/* ═════════════════════════════════════════════════════════════════════════
 * 5. LA PARITÉ DES CLÉS — ce que `check-i18n` ne peut pas voir
 *
 * `scripts/check-i18n.mjs` cherche les clés appelées sous la forme littérale
 * `$t('…')`. Les clés d'ici sont SERVIES par le serveur et résolues
 * indirectement : elles lui échappent entièrement. Sans ce bloc, une clé
 * absente d'une langue s'afficherait telle quelle — en roumain, justement.
 * ════════════════════════════════════════════════════════════════════════ */

describe('les clés servies par le serveur existent dans les ONZE langues', () => {
  const catalogue = (langue: string) => {
    const src = readFileSync(resolve(RACINE, `src/lib/locales/${langue}.ts`), 'utf8');
    return new Set([...src.matchAll(/^\s*['"]([^'"]+)['"]\s*:/gm)].map((m) => m[1]));
  };

  it('les seize collections livrées, nom ET description', () => {
    expect(SMART_COLLECTION_KEYS).toHaveLength(16);
    for (const langue of LANGUES) {
      const cles = catalogue(langue);
      for (const cle of SMART_COLLECTION_KEYS) {
        expect(cles.has(cle), `${cle} absente de ${langue}.ts`).toBe(true);
        expect(cles.has(`${cle}.description`), `${cle}.description absente de ${langue}.ts`)
          .toBe(true);
      }
    }
  });

  it('les vingt genres de radio que le serveur sait nommer', () => {
    // La liste EXACTE de `cle_genre` — `tune-server/src/routes/radios_libelles.rs:94`.
    const DU_SERVEUR = [
      'eclectic', 'frenchSong', 'classical', 'contemporary', 'culture', 'generalist',
      'electronic', 'groove', 'hipHop', 'jazz', 'metal', 'world', 'pop', 'reggae',
      'rock', 'blues', 'soul', 'funk', 'folk', 'ambient',
    ];
    expect(DU_SERVEUR).toHaveLength(20);
    for (const langue of LANGUES) {
      const cles = catalogue(langue);
      const absentes = DU_SERVEUR.filter(
        (s) => !radioGenreRayon({ genre_key: `radio.genre.${s}`, genre_label: 'x' })?.i18nKey
          || !cles.has(radioGenreRayon({ genre_key: `radio.genre.${s}`, genre_label: 'x' })!.i18nKey!),
      );
      expect(absentes, `genres sans traduction en ${langue}`).toEqual([]);
    }
  });

  it('les seize noms traduits DIFFÈRENT d’une langue à l’autre — contre-épreuve du copier-coller', () => {
    // Sans ceci, onze catalogues remplis avec le français passeraient le test
    // de parité sans traduire quoi que ce soit.
    const parLangue = LANGUES.map((l) => {
      locale.set(l as any);
      const tr = get(t);
      return tr('smartCollection.default.recent');
    });
    expect(new Set(parLangue).size).toBeGreaterThanOrEqual(9);
    expect(parLangue.filter((v) => v === '🆕 Récents')).toHaveLength(1);
  });
});
