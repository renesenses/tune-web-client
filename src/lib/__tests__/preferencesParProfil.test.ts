// @vitest-environment jsdom
/**
 * Les préférences partent AU NOM d'un profil.
 *
 * Chantier multi-profil, lot B, moitié client. Le serveur range désormais
 * `ui_preferences` sous `ui_preferences:{pid}` et lit le profil dans l'en-tête
 * `X-Profile-Id` (tune-server-rust#3991). Encore faut-il que le client
 * l'envoie.
 *
 * ## Le défaut
 *
 * `stores/preferences.ts` fait trois `fetch` **bruts** — deux lectures et une
 * écriture. Les aides de `api.ts` et `api/_client.ts` posent l'en-tête ; ces
 * trois-là ne les empruntent pas, donc partaient anonymes. Le serveur les
 * rangeait sous le profil par défaut, pour tout le monde : thème, colonnes,
 * facettes et photo d'avatar restaient partagés par tout le foyer, quel que
 * soit le profil sélectionné.
 *
 * ## Pourquoi une garde de SOURCE
 *
 * Le magasin s'exécute à l'import — il lit `localStorage`, applique le thème et
 * s'abonne à lui-même — et le banc tourne en `environment: 'node'`. L'importer
 * pour observer ses `fetch` demanderait de simuler `localStorage`, `document`
 * et le réseau avant même la première ligne, pour finir par vérifier… la
 * présence d'un en-tête. La garde de source dit franchement ce qu'elle
 * regarde.
 *
 * Ce qui est VRAIMENT exécuté ici, c'est `profileHeader` : son comportement
 * est testé pour de bon, en bas de fichier.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { profileHeader } from '../profileHeader';

// 🔴 Depuis la racine, pas depuis `import.meta.url` : ce fichier tourne en
// jsdom (il lui faut un vrai `localStorage`), et là `import.meta.url` est une
// URL `http://`, que `fileURLToPath` refuse. Même idiome que
// `retoursPatatorz_0609.test.ts`.
const SOURCE = resolve(process.cwd(), 'src/lib/stores/preferences.ts');

/** La source sans ce qu'on a écrit pour l'expliquer : un commentaire qui cite
 *  `profileHeader` ne prouve pas qu'on l'appelle. Bloc reconnu en DÉBUT de
 *  ligne seulement — le motif large ouvre un faux commentaire sur le `/*` d'une
 *  chaîne quelconque et mange tout ce qui suit. */
const source = () =>
  readFileSync(SOURCE, 'utf8')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('Les préférences disent au nom de qui elles partent', () => {
  it('🔴 les TROIS appels portent l’en-tête de profil', () => {
    const src = source();
    const appels = [...src.matchAll(/fetch\('\/api\/v1\/system\/[^']*'[^)]*\)/g)].map((m) => m[0]);

    expect(appels.length, 'le nombre d’appels a changé — la garde doit suivre').toBe(3);
    for (const appel of appels) {
      expect(
        appel.includes('profileHeader()'),
        `cet appel part sans dire au nom de qui, le serveur le rangera sous le profil par défaut :\n  ${appel}`,
      ).toBe(true);
    }
  });

  it('l’écriture garde son en-tête de contenu', () => {
    // `...profileHeader()` après `Content-Type`, pas à la place : un PATCH sans
    // type de contenu se fait refuser avant d'arriver au routeur.
    const src = source();
    const i = src.indexOf("method: 'PATCH'");
    expect(i).toBeGreaterThan(-1);
    const bloc = src.slice(i, i + 220);
    expect(bloc).toContain("'Content-Type': 'application/json'");
    expect(bloc).toContain('...profileHeader()');
  });

  it('🔴 le magasin ne dépend PAS de la couche api', () => {
    // Il s'exécute à l'import — `applyTheme` tourne à l'évaluation du module
    // pour éviter le flash de thème — et `api.ts` importe des magasins.
    // Y brancher `apiFetch` créerait un cycle, ce qui est la raison même pour
    // laquelle `profileHeader` lit `localStorage` en direct.
    const src = source();
    expect(src).toContain("import { profileHeader } from '../profileHeader'");
    expect(
      /from '\.\.\/api'/.test(src),
      'le magasin importe la couche api : cycle d’import à l’évaluation du module',
    ).toBe(false);
  });
});

describe('La nouvelle interface relit les préférences du serveur', () => {
  const BOOTSTRAP = resolve(process.cwd(), 'src/lib/v2Bootstrap.ts');
  const bootstrap = () =>
    readFileSync(BOOTSTRAP, 'utf8')
      .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('🔴 `bootstrapV2` appelle la synchro', () => {
    // Douzième « écrit mais pas branché » du même genre : la seule ligne qui
    // relit les préférences enregistrées vit dans `App.svelte`, que `?v2` ne
    // monte jamais. Sans cet appel, ranger `ui_preferences` par profil côté
    // serveur ne sert à RIEN dans la nouvelle interface — changer de profil ne
    // ramène rien, chacun garde le blob du dernier passage sur l'appareil.
    //
    // Mesuré dans Chrome le 12/09/2026 : le père ne retrouvait pas son thème
    // après le passage du fils.
    const src = bootstrap();
    // Import DYNAMIQUE : `stores/preferences` a des effets à l'évaluation du
    // module (localStorage, thème), et l'importer en tête les ferait entrer
    // dans le graphe de tout test qui touche `v2Bootstrap`.
    expect(src).toContain("import('./stores/preferences')");
    expect(
      /^import .*stores\/preferences/m.test(src),
      "l'import est redevenu statique : il tire localStorage dans les bancs en node",
    ).toBe(false);
    const i = src.indexOf('export async function bootstrapV2');
    expect(i, 'bootstrapV2 a disparu').toBeGreaterThan(-1);
    expect(
      src.slice(i).includes('syncPreferencesFromServer()'),
      'la synchro n’est plus appelée au démarrage de la nouvelle interface',
    ).toBe(true);
  });

  it('elle est lancée EN PARALLÈLE, sans pouvoir bloquer le reste', () => {
    // `Promise.allSettled` : un serveur muet sur `/system/config` ne doit pas
    // empêcher zones, albums et appareils de se charger. C'est déjà la règle
    // pour `loadLicense`, pour la même raison.
    const src = bootstrap();
    const i = src.indexOf('Promise.allSettled');
    expect(i, 'les chargements ne sont plus en allSettled').toBeGreaterThan(-1);
    const fin = src.indexOf(']', i);
    expect(src.slice(i, fin)).toContain('preferences');
  });
});

/* ───────────────────── Ce qui est réellement exécuté ───────────────────── */

describe('profileHeader — la valeur envoyée', () => {
  const CLE = 'tune-profile-id';

  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('envoie l’identifiant retenu sur cet appareil', () => {
    localStorage.setItem(CLE, '7');
    expect(profileHeader()).toEqual({ 'X-Profile-Id': '7' });
  });

  it('n’envoie RIEN quand aucun profil n’est choisi', () => {
    // Le serveur retombe alors sur son propre ordre de résolution. Envoyer un
    // en-tête vide le ferait analyser une chaîne vide comme un identifiant.
    expect(profileHeader()).toEqual({});
  });

  it('survit à un localStorage indisponible', () => {
    // Navigation privée, iframe cloisonnée : l'accès LÈVE au lieu de rendre
    // null. Sans le `try`, toute écriture de préférence casserait.
    //
    // 🔴 On espionne le PROTOTYPE, on ne remplace pas la globale. `vi.stubGlobal`
    // pose `localStorage` sur `globalThis` et la laisse fuir vers les autres
    // fichiers de la batterie : quatre tests étrangers sont tombés ainsi le
    // 12/09/2026, verts en isolation et rouges en suite. `restoreAllMocks`
    // rend le prototype intact.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('accès refusé');
    });
    expect(() => profileHeader()).not.toThrow();
    expect(profileHeader()).toEqual({});
  });
});
