/**
 * #1426 — « Le tableau de bord a disparu du menu dans la 0.9.161 » (FabienM,
 * fil 1870 ; Jean Valjean abonde en 6626 ; FabienM précise en 6645 : « pour
 * ceux qui ne l'ajoute pas à leur écran d'accueil […] le menu dédié reste
 * intéressant »).
 *
 * L'entrée a été retirée de la barre latérale par la PR #1415 (commit
 * `121bb1ba`), **volontairement**, sur décision du 20/09. Ce n'est pas ce
 * retrait qu'on défait ici.
 *
 * Ce qui était un défaut, c'est le SOLDE vu du siège du testeur : la même
 * version retire l'entrée ET laisse hors de la disposition par défaut les
 * widgets qui la remplacent (PR #1416, règle « personne ne doit voir son
 * écran changer sans l'avoir demandé »). L'entrée disparaît, et rien
 * n'apparaît.
 *
 * Arbitrage de Bertrand, 22/09/2026 : les deux widgets de remplacement
 * entrent dans la disposition PAR DÉFAUT — `top-artistes` (les artistes les
 * plus écoutés) et `stats-semaine` (les chiffres de la semaine). Les deux
 * autres extraits du tableau de bord ne s'imposent toujours pas.
 *
 * 🔴 Une disposition DÉJÀ ENREGISTRÉE par un profil ne doit pas bouger : seul
 * le défaut change. C'est la seconde garde de ce fichier.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DISPOSITION_DEFAUT, widgetParId, WIDGETS } from '../accueilWidgets';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');

describe('#1426 — le remplacement du tableau de bord est visible sans rien demander', () => {
  it('🔴 la disposition par défaut porte « artistes les plus écoutés » et « votre semaine »', () => {
    expect(DISPOSITION_DEFAUT).toContain('top-artistes');
    expect(DISPOSITION_DEFAUT).toContain('stats-semaine');
  });

  it('les quatre sections historiques restent, et restent EN TÊTE', () => {
    // On ajoute, on ne réordonne pas : un accueil existant garde son haut de
    // page. Les deux nouveaux arrivent en dessous.
    expect(DISPOSITION_DEFAUT.slice(0, 4)).toEqual([
      'reprendre', 'nouveautes-artistes', 'recemment-ajoutes', 'statistiques',
    ]);
  });

  it('tout identifiant du défaut existe dans le registre', () => {
    for (const id of DISPOSITION_DEFAUT) {
      expect(widgetParId(id), `le défaut cite « ${id} », absent du registre`).toBeTruthy();
    }
    // Pas de doublon : la page en ferait deux rangées sous la même clé.
    expect(new Set(DISPOSITION_DEFAUT).size).toBe(DISPOSITION_DEFAUT.length);
  });

  it('les deux autres extraits ne s’imposent toujours PAS', () => {
    // La règle de Bertrand tient pour tout le reste : `top-radios` et le gros
    // widget `tops` s'ajoutent depuis « Modifier ».
    expect(DISPOSITION_DEFAUT).not.toContain('top-radios');
    expect(DISPOSITION_DEFAUT).not.toContain('tops');
    expect(DISPOSITION_DEFAUT).not.toContain('zones-cartes');
  });

  it('🔴 une disposition ENREGISTRÉE l’emporte toujours sur le défaut', () => {
    // Changer le défaut ne doit rien écraser : `charger()` remplace la
    // disposition dès que les préférences du profil en portent une.
    const src = sansCommentaires(lire('src/components/v2/PageWidgets.svelte'));
    expect(src).toContain('const d = prefs?.[CLE];');
    expect(src).toContain('if (Array.isArray(d) && d.length) {');
    expect(src).toContain('dispositionEnregistree = d.filter((id: any) => typeof id === \'string\');');
    expect(src).toContain('disposition = dispositionEnregistree.filter((id) => parId(id));');
    // Et la DISPOSITION n'est JAMAIS réécrite dans les préférences au
    // chargement : `enregistrer()` ne part que d'un geste de l'utilisateur.
    //
    // ⚠️ 24/09/2026 (#1519) — le chargement écrit désormais une chose, et une
    // seule : la ligne de CHIFFRES figée au défaut du 19/09, migrée une fois
    // par `migrerLigneDeChiffres`. La borne s'arrête donc à cette fonction, et
    // un second témoin vérifie qu'elle ne touche pas `CLE`.
    const charger = src.slice(src.indexOf('async function charger()'), src.indexOf('async function migrerLigneDeChiffres('));
    expect(charger.includes('setProfilePreferences'), 'le chargement écrit les préférences').toBe(false);
    const migration = src.slice(src.indexOf('async function migrerLigneDeChiffres('), src.indexOf('async function enregistrer()'));
    expect(migration.includes('[CLE]:'), 'la migration de la ligne réécrit la disposition').toBe(false);
  });
});

describe('#1426 — composer la ligne de chiffres ne concerne que le widget qui l’utilise', () => {
  it('🔴 « Votre semaine » n’offre pas un sélecteur qu’il n’honore pas', () => {
    // `stats-semaine` sert une liste FIGÉE (`CHIFFRES_SEMAINE`) : il ignore
    // `ctx.chiffresChoisis`. Tant qu'il n'était pas dans le défaut, personne
    // ne voyait son sélecteur ; dans le défaut, tout le monde le verrait —
    // deux fois le même panneau, dont un sans effet sur ce qu'il surmonte.
    expect(widgetParId('statistiques')?.chiffresComposables).toBe(true);
    expect(widgetParId('stats-semaine')?.chiffresComposables).toBeFalsy();
    // Un seul widget composable dans tout le registre.
    expect(WIDGETS.filter((w) => w.chiffresComposables).map((w) => w.id)).toEqual(['statistiques']);
    const src = sansCommentaires(lire('src/components/v2/PageWidgets.svelte'));
    expect(src).toContain('{#if edition && w.chiffresComposables}');
  });
});
