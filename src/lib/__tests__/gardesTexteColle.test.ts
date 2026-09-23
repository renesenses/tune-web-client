import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

/**
 * CONTRE-ÉPREUVE des deux gardes i18n, sur la forme qu'elles ne voyaient pas.
 *
 * ── CE QUI EST ARRIVÉ ───────────────────────────────────────────────────
 *
 * Silviu, testeur roumain, a photographié sa file d'attente en v0.9.161 :
 * « 183 à suivre », « 14h 49min restantes », « À suivre » — du français au
 * milieu d'une interface roumaine. Les correctifs sont partis (#1451, #1452,
 * #1453, #1467). Restait la question qui compte : pourquoi AUCUNE des deux
 * gardes n'avait rien vu pendant des mois ?
 *
 * Parce que toutes deux lisaient le texte visible avec la même forme —
 * `>([^<>{}]+)<` — qui exige un texte BORNÉ par `>` et `<`, sans accolade.
 * Or les trois chaînes fautives touchaient une accolade :
 *
 *     <span>{upNext.length} à suivre</span>
 *     <h2>À suivre{#if !upNext.length}&nbsp;— rien{/if}</h2>
 *
 * Et le quatrième défaut, `error = "File d'attente indisponible."`, était bien
 * LU par `check-francais-v2` — mais jugé avec une liste de mots français où
 * ni « File », ni « attente », ni « indisponible » ne figurent.
 *
 * ── CE QUE CE FICHIER PROUVE ────────────────────────────────────────────
 *
 * On n'affirme pas que les gardes attrapent la forme : on la leur SERT. Deux
 * fixtures jouent le rôle de composants, et les gardes sont lancées dessus
 * pour de vrai (`node scripts/…`), pas simulées.
 *
 *  1. `Fautif.svelte` reproduit les quatre formes du défaut. Les deux gardes
 *     doivent SORTIR EN ERREUR, et nommer chaque chaîne.
 *  2. `Propre.svelte` reproduit ce qui a le droit d'exister — une ligne
 *     entièrement `{$t('clé')}`, une expression sans texte, un commentaire
 *     français, un `aria-label` déjà traduit, une unité (`DR 14`, `128 MB`).
 *     Les deux gardes doivent RESTER VERTES : une garde qui rougit sur du
 *     code légitime est désactivée la semaine suivante.
 *
 * Saboter `noeudsDeTexte` dans `scripts/lib/balisage.mjs` — en lui faisant
 * ignorer les nœuds bordés par une accolade — fait tomber le premier bloc.
 */

const RACINE = resolve(__dirname, '../../..');

const FAUTIF = `<script lang="ts">
  import { t } from '../../lib/i18n';
  let upNext: unknown[] = [];
  let remainingMs = 0;
  let error = '';
  // Forme 4 : la PHRASE assignee dans le script. Aucun accent, aucun mot-outil
  // de la liste — et pourtant du francais plein ecran.
  error = "File d'attente indisponible.";
</script>

<div>
  <!-- Forme 1 : une expression PUIS du texte. Le > est suivi d'un {. -->
  <span>{upNext.length} à suivre</span>
  <!-- Forme 2 : du texte entre une expression et un bloc. -->
  {#if remainingMs}<span>{remainingMs} restantes</span>{/if}
  <!-- Forme 3 : du texte suivi d'un bloc, jamais d'un <. -->
  <h2>À suivre{#if !upNext.length}&nbsp;— rien{/if}</h2>
</div>
`;

const PROPRE = `<script lang="ts">
  import { t } from '../../lib/i18n';
  let upNext: unknown[] = [];
  let dr = 14;
  let taille = 128;
  // Un commentaire en français : c'est de la documentation, pas de l'écran.
  const mode: 'piste' | 'rang' | 'aucune' = 'piste';
</script>

<div>
  <span>{$t('v2.queue.upNext' as any)}</span>
  <span>{$t('v2.queue.upNextCount' as any).replace('{n}', String(upNext.length))}</span>
  <button aria-label={$t('v2.queue.moveDown' as any)}>{$t('v2.queue.upNext' as any)}</button>
  <span class="dr">DR {dr}</span>
  <span class="dt">{taille} MB</span>
  <span>{mode}</span>
</div>
`;

let dossier: string;
let portee: string;

function lancer(script: string, env: NodeJS.ProcessEnv) {
  return spawnSync('node', [join('scripts', script)], {
    cwd: RACINE,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

beforeAll(() => {
  dossier = mkdtempSync(join(tmpdir(), 'garde-i18n-'));
  mkdirSync(join(dossier, 'fautif'), { recursive: true });
  mkdirSync(join(dossier, 'propre'), { recursive: true });
  writeFileSync(join(dossier, 'fautif', 'Fautif.svelte'), FAUTIF, 'utf8');
  writeFileSync(join(dossier, 'propre', 'Propre.svelte'), PROPRE, 'utf8');
  // Les gardes résolvent leurs chemins depuis la racine du dépôt.
  portee = relative(RACINE, dossier);
});

afterAll(() => {
  rmSync(dossier, { recursive: true, force: true });
});

describe('gardes i18n — le texte collé à une accolade (capture Silviu, v0.9.161)', () => {
  it('check-i18n ROUGIT sur le texte collé à une accolade', () => {
    const r = lancer('check-i18n.mjs', { I18N_RACINE: join(portee, 'fautif') });
    expect(r.status).toBe(1);
    // Les chaînes sont NOMMÉES, pas seulement comptées.
    expect(r.stderr).toContain('à suivre');
    expect(r.stderr).toContain('À suivre');

    // ⚠️ LIMITE ASSUMÉE, écrite ici pour qu'elle ne surprenne personne.
    //
    // `check-i18n` balaie TOUT `src`, et ne juge que sur des marqueurs
    // français : un accent, ou l'un d'une quarantaine de mots-outils. C'est
    // ce qui lui permet d'être repo-wide sans rougir sur l'anglais.
    //
    // « restantes » n'a ni accent ni mot-outil : cette garde-ci ne peut pas
    // la voir, et l'élargir à tout texte la ferait rougir des centaines de
    // fois hors de `components/v2`. C'est `check-francais-v2` qui l'attrape,
    // sur sa portée étroite et avec sa règle plus dure — test suivant.
    expect(r.stderr).not.toContain('restantes');
  });

  it('check-francais-v2 ROUGIT sur le balisage ET sur la phrase du script', () => {
    const r = lancer('check-francais-v2.mjs', { FRANCAIS_V2_PORTEE: join(portee, 'fautif') });
    expect(r.status).toBe(1);
    // Les deux bordures sont exigées séparément, et c'est délibéré : le texte
    // qui SUIT une accolade et celui qui la PRÉCÈDE sont deux chemins
    // différents du marcheur. Une contre-épreuve qui n'en teste qu'un survit
    // à un sabotage de l'autre — vérifié le 23/09/2026.
    expect(r.stderr).toContain('à suivre'); // après l'expression
    expect(r.stderr).toContain('restantes'); // après l'expression
    expect(r.stderr).toContain('À suivre'); // AVANT le bloc {#if}
    // Le quatrième défaut : la phrase assignée, sans accent ni mot-outil.
    expect(r.stderr).toContain("File d'attente indisponible.");
  });

  it('les deux gardes RESTENT VERTES sur du code légitime', () => {
    // Une garde qui rougit sur `{$t('clé')}`, sur un commentaire français ou
    // sur « 128 MB » ne survit pas à sa première semaine.
    const i18n = lancer('check-i18n.mjs', { I18N_RACINE: join(portee, 'propre') });
    expect(i18n.stderr).toBe('');
    expect(i18n.status).toBe(0);

    const fr2 = lancer('check-francais-v2.mjs', { FRANCAIS_V2_PORTEE: join(portee, 'propre') });
    expect(fr2.stderr).toBe('');
    expect(fr2.status).toBe(0);
  });

  // Sur tout `src` les deux gardes lisent ~700 composants et onze catalogues
  // de traduction : compter ~7 s, au-dela du delai par defaut de vitest.
  it("l'arbre du client reste propre : les deux gardes passent sur src/", () => {
    expect(lancer('check-i18n.mjs', {}).status).toBe(0);
    expect(lancer('check-francais-v2.mjs', {}).status).toBe(0);
  }, 60_000);
});
