import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Le bouton EQ de l'écran « En écoute » ne doit JAMAIS dépendre de la piste.
 *
 * Il l'a pourtant fait : rendu à l'intérieur du bloc `{#if !isRadio &&
 * displayTrack.id}` qui garde les crédits et les paroles, il disparaissait sur
 * une radio et sur toute piste absente de la bibliothèque (Bandcamp, ajout par
 * URL, streaming selon les cas). Or l'égaliseur est un réglage de ZONE :
 * `api.getEq(zone.id)` le lit, `api.setEqualizer(zone.id, ...)` l'écrit, et
 * côté serveur `GET/POST /api/v1/zones/{id}/eq` ne connaît aucun identifiant
 * de piste. La condition n'avait donc rien à garder — sinon l'auditeur de
 * radio, celui qui a le plus besoin de corriger son grave.
 *
 * Une simple recherche de texte ne suffirait pas : ce qui compte n'est pas ce
 * que la ligne du bouton contient, mais les blocs `{#if}` qui l'ENVELOPPENT.
 * On reconstruit donc la pile de conditions ouvertes à cet endroit du modèle.
 *
 * Reste en environnement `node` : le test ne lit que du texte.
 */

const SOURCE = readFileSync(
  resolve(process.cwd(), 'src/components/NowPlaying.svelte'),
  'utf-8',
);

/** Lit l'expression d'un bloc à partir de `start`, jusqu'à son `}` fermant. */
function readExpression(source: string, start: number): string {
  let depth = 1;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i).trim();
    }
  }
  return source.slice(start).trim();
}

/**
 * Les conditions des blocs `{#if}` encore ouverts à l'indice `index`.
 * `{#each}` / `{#await}` / `{#key}` / `{#snippet}` sont empilés eux aussi :
 * sans ça, leur `{/each}` dépilerait un `{#if}` et la pile mentirait.
 */
function conditionsAt(source: string, index: number): string[] {
  const template = source.indexOf('</script>');
  const from = template === -1 ? 0 : template;
  const stack: { kind: string; condition: string }[] = [];
  const re = /\{#(if|each|await|key|snippet)\b|\{:else if\b|\{:else\}|\{\/(if|each|await|key|snippet)\}/g;
  re.lastIndex = from;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m.index >= index) break;
    const token = m[0];
    if (token.startsWith('{#')) {
      const kind = m[1];
      stack.push({
        kind,
        condition: kind === 'if' ? readExpression(source, m.index + token.length) : '',
      });
    } else if (token.startsWith('{:else if')) {
      // Être dans cette branche, c'est ne PAS être dans la précédente : la
      // condition précédente reste une garde, niée.
      const top = stack[stack.length - 1];
      if (top) {
        top.condition = `!(${top.condition}) && ${readExpression(source, m.index + token.length)}`;
      }
    } else if (token === '{:else}') {
      const top = stack[stack.length - 1];
      if (top) top.condition = `!(${top.condition})`;
    } else {
      stack.pop();
    }
  }
  return stack.map((b) => b.condition).filter((c) => c.length > 0);
}

/** Indice unique d'un repère dans la source, ou échec explicite. */
function onlyIndexOf(needle: string): number {
  const first = SOURCE.indexOf(needle);
  expect(first, `repère introuvable : ${needle}`).toBeGreaterThan(-1);
  expect(SOURCE.indexOf(needle, first + 1), `repère ambigu : ${needle}`).toBe(-1);
  return first;
}

describe('le bouton EQ de l’écran « En écoute »', () => {
  const EQ_BUTTON = 'class:active={showEq}';

  /**
   * Ce qu'on interdit : l'IDENTIFIANT de la piste et le fait que ce soit une
   * radio. Le garde extérieur `{#if zone && displayTrack}` (l'écran entier est
   * vide quand rien ne joue) reste légitime : il n'exige pas une piste
   * identifiée, seulement une lecture en cours.
   */
  const GARDE_DE_PISTE = /displayTrack\s*\??\.\s*id|\btrack\s*\??\.\s*id\b|isRadio/;

  it('n’est enfermé dans aucune condition portant sur la piste', () => {
    const conditions = conditionsAt(SOURCE, onlyIndexOf(EQ_BUTTON));
    for (const c of conditions) {
      expect(c, `le bouton EQ est de nouveau conditionné par « ${c} »`).not.toMatch(
        GARDE_DE_PISTE,
      );
    }
  });

  it('le panneau EQ non plus', () => {
    const conditions = conditionsAt(SOURCE, onlyIndexOf('<NowPlayingEqPanel'));
    for (const c of conditions) {
      expect(c, `le panneau EQ est de nouveau conditionné par « ${c} »`).not.toMatch(
        GARDE_DE_PISTE,
      );
    }
    // Le bouton ouvre le panneau : il faut bien qu'une condition le garde,
    // sinon l'assertion ci-dessus passerait sur un panneau toujours affiché.
    expect(conditions.join(' ')).toContain('showEq');
  });

  it('le panneau EQ ne reçoit rien qui vienne de la piste', () => {
    const start = SOURCE.indexOf('<NowPlayingEqPanel');
    const tag = SOURCE.slice(start, SOURCE.indexOf('/>', start));
    expect(tag).not.toContain('displayTrack');
    expect(tag).not.toContain('track');
  });

  it('l’égaliseur se lit et s’écrit par la ZONE, jamais par la piste', () => {
    const start = SOURCE.indexOf('async function setEqPreset');
    expect(start).toBeGreaterThan(-1);
    const body = SOURCE.slice(start, SOURCE.indexOf('\n  }', start));
    expect(body).toContain('api.setEqualizer(zone.id');
    expect(body).not.toContain('displayTrack');
    // La lecture aussi : `api.getEq(id)` où `id` vient de `zone?.id`.
    expect(SOURCE).toMatch(/const id = zone\?\.id;[\s\S]{0,400}api\.getEq\(id\)/);
  });

  /**
   * Sans ce dernier test, un analyseur cassé qui renverrait toujours une pile
   * vide laisserait les précédents au vert en n'ayant rien examiné. Les
   * crédits, eux, ont besoin d'un identifiant de piste : leur bouton DOIT
   * rester gardé — c'est la preuve que la pile de conditions est bien lue.
   */
  it('l’analyseur voit encore la garde des crédits', () => {
    const conditions = conditionsAt(SOURCE, onlyIndexOf('class:active={showCredits}'));
    expect(conditions.join(' && ')).toContain('displayTrack.id');
  });
});
