// renesenses/tune-web-client#2735 — l'index des réglages et l'écran Réglages
// ne peuvent pas diverger.
//
// Dans les deux sens, sur le SOURCE de l'écran (toutes les branches, quel que
// soit le niveau ou l'état du serveur — un rendu n'en montrerait qu'une) :
//   - chaque entrée de l'index a son ancre `data-reglage` DANS la branche de
//     sa section (ou dans le composant monté par cette branche) ;
//   - chaque ancre de l'écran a son entrée, dans la même section.
// Un réglage ajouté à l'écran sans entrée, ou une entrée dont l'ancre a
// disparu, fait rougir ce test.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REGLAGES, niveauDuReglage, lieuDuReglage, masqueAuNiveau } from '../reglagesIndex';
import { V2_SETTINGS } from '../v2Settings';
import { levelRank } from '../uiLevel';
import lFr from '../locales/fr';
import lEn from '../locales/en';

const fr = lFr as unknown as Record<string, string>;
const en = lEn as unknown as Record<string, string>;

const V2 = join(__dirname, '..', '..', 'components', 'v2');
const PARTAGES = join(__dirname, '..', '..', 'components', 'partages');
const SOURCE_ECRAN = readFileSync(join(V2, 'SettingsV2.svelte'), 'utf8');
/** Le GABARIT seul : le `<script>` nomme l'attribut pour le chercher, il n'en pose aucun. */
const ECRAN = SOURCE_ECRAN.slice(SOURCE_ECRAN.lastIndexOf('</script>'));

/** Les branches `{#if s.id === '…'}` / `{:else if s.id === '…'}` du gabarit, par section. */
function branches(source: string): Map<string, string> {
  const debut = source.indexOf('{#each sections as s, i (s.id)}');
  const fin = source.indexOf('{#if !sections.length}');
  const corps = source.slice(debut, fin);
  const marques = [...corps.matchAll(/\{(?:#if|:else if) s\.id === '(\w+)'\}/g)];
  const parSection = new Map<string, string>();
  marques.forEach((m, i) => {
    const bout = corps.slice(m.index!, i + 1 < marques.length ? marques[i + 1].index : corps.length);
    parSection.set(m[1], (parSection.get(m[1]) ?? '') + bout);
  });
  return parSection;
}

const ANCRE = /data-reglage="([^"]+)"/g;
const ancresDe = (texte: string) => [...texte.matchAll(ANCRE)].map((m) => m[1]);

const BRANCHES = branches(ECRAN);

/** Le texte d'un composant de l'écran, cherché dans components/v2 puis partages. */
function source(fichier: string): string {
  for (const dir of [V2, PARTAGES]) {
    if (readdirSync(dir).includes(fichier)) return readFileSync(join(dir, fichier), 'utf8');
  }
  throw new Error(`composant introuvable : ${fichier}`);
}

/** La section dont la branche monte ce composant, directement ou par un composant intermédiaire. */
function sectionQuiMonte(fichier: string, profondeur = 0): string | null {
  const balise = `<${fichier.replace(/\.svelte$/, '')}`;
  for (const [section, texte] of BRANCHES) {
    if (new RegExp(`${balise}[\\s/>]`).test(texte)) return section;
  }
  if (profondeur > 1) return null;
  for (const dir of [V2, PARTAGES]) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.svelte') && x !== 'SettingsV2.svelte')) {
      if (new RegExp(`${balise}[\\s/>]`).test(readFileSync(join(dir, f), 'utf8'))) {
        const s = sectionQuiMonte(f, profondeur + 1);
        if (s) return s;
      }
    }
  }
  return null;
}

describe('#2735 — index des réglages ↔ ancres de l’écran', () => {
  it('les identifiants sont uniques et chaque section connue', () => {
    const ids = REGLAGES.map((r) => r.id);
    expect(new Set(ids).size, 'identifiant en double').toBe(ids.length);
    for (const r of REGLAGES) expect(() => lieuDuReglage(r), r.id).not.toThrow();
  });

  it('chaque entrée a son ancre dans la branche de SA section', () => {
    const manquantes: string[] = [];
    for (const r of REGLAGES) {
      if (r.composant) {
        if (!ancresDe(source(r.composant)).includes(r.id)) manquantes.push(`${r.id} (absente de ${r.composant})`);
        const monte = sectionQuiMonte(r.composant);
        if (monte !== r.section) manquantes.push(`${r.id} : ${r.composant} est monté dans « ${monte} », pas « ${r.section} »`);
        continue;
      }
      const branche = BRANCHES.get(r.section);
      if (!branche) { manquantes.push(`${r.id} : aucune branche pour la section « ${r.section} »`); continue; }
      if (!ancresDe(branche).includes(r.id)) manquantes.push(`${r.id} (section ${r.section})`);
    }
    expect(manquantes, 'entrées de l’index sans ancre à l’écran').toEqual([]);
  });

  it('chaque ancre de l’écran a son entrée, dans la même section', () => {
    const parId = new Map(REGLAGES.map((r) => [r.id, r]));
    const orphelines: string[] = [];
    for (const [section, texte] of BRANCHES) {
      for (const id of ancresDe(texte)) {
        const r = parId.get(id);
        if (!r) orphelines.push(`${id} (section ${section}) : pas d’entrée dans l’index`);
        else if (!r.composant && r.section !== section) orphelines.push(`${id} : à l’écran dans « ${section} », dans l’index sous « ${r.section} »`);
      }
    }
    for (const r of REGLAGES.filter((x) => x.composant)) {
      for (const id of ancresDe(source(r.composant!))) {
        if (!parId.has(id)) orphelines.push(`${id} (${r.composant}) : pas d’entrée dans l’index`);
      }
    }
    // Une ancre hors de toute branche ne serait jamais atteinte par la recherche.
    const horsBranches = ancresDe(ECRAN).filter((id) => ![...BRANCHES.values()].some((t) => ancresDe(t).includes(id)));
    expect(horsBranches, 'ancres hors des cartes').toEqual([]);
    expect(orphelines).toEqual([]);
  });

  it('chaque section de la carte a au moins un réglage (le menu avatar la trouve encore)', () => {
    const couvertes = new Set(REGLAGES.map((r) => r.section));
    const vides = V2_SETTINGS.flatMap((t) => t.sections).filter((s) => !couvertes.has(s.id)).map((s) => s.id);
    expect(vides).toEqual([]);
  });

  it('les clés i18n de l’index existent en français et en anglais', () => {
    const absentes: string[] = [];
    for (const r of REGLAGES) {
      for (const k of [r.labelKey, r.descKey, r.termesKey]) {
        if (k && (!(k in fr) || !(k in en))) absentes.push(`${r.id} → ${k}`);
      }
    }
    expect(absentes).toEqual([]);
  });

  it('un niveau propre n’a de sens que s’il est PLUS exigeant que la section', () => {
    const inutiles = REGLAGES.filter((r) => {
      if (!r.min) return false;
      const { tab, section } = lieuDuReglage(r);
      return levelRank(r.min) <= Math.max(levelRank(tab.min), levelRank(section.min));
    }).map((r) => r.id);
    expect(inutiles).toEqual([]);
  });

  it('le niveau effectif cumule onglet, section et réglage', () => {
    const r = (id: string) => REGLAGES.find((x) => x.id === id)!;
    expect(niveauDuReglage(r('langue'))).toBe('beginner');
    expect(niveauDuReglage(r('ligne-technique-album'))).toBe('expert'); // section débutant, réglage expert
    expect(niveauDuReglage(r('extensions'))).toBe('expert');            // onglet expert
    expect(niveauDuReglage(r('spotify-recepteur'))).toBe('intermediate'); // onglet Accès
    expect(masqueAuNiveau(r('commande-vocale'), 'beginner')).toBe(true);
    expect(masqueAuNiveau(r('commande-vocale'), 'expert')).toBe(false);
  });

  it('les ancres posées avant #2735 gardent leur nom (des tests et des écrans les lisent)', () => {
    for (const id of ['lienLectureVersSource', 'disposition-file', 'dossiers-analyses', 'dossiers-exclus-enrichissement', 'ordre-barre', 'version-jouee']) {
      expect(REGLAGES.some((r) => r.id === id), id).toBe(true);
    }
  });

  it(`l’index compte un réglage par ancre (${REGLAGES.length} aujourd’hui)`, () => {
    expect(REGLAGES.length).toBeGreaterThanOrEqual(150);
  });
});
