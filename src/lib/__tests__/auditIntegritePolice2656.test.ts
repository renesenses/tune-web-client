import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// web#2656 — Réglages › Bibliothèque : « Intégrité de la bibliothèque » en
// police plus grosse que le reste de la page. Le paragraphe et le tableau
// n'avaient aucune taille et prenaient les 16 px du document.
const SRC = readFileSync(new URL('../../components/partages/AuditIntegrite.svelte', import.meta.url), 'utf-8');
const STYLE = SRC.slice(SRC.indexOf('<style>'));
/** Plus grande taille de page Réglages (`.lbl span:first-child`). */
const MAX_PX = 13.5;

function fautes(style: string): string[] {
  const f: string[] = [];
  for (const sel of ['section', 'h3', 'p', 'th, td']) {
    const re = new RegExp(`(?:^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
    const corps = style.match(re)?.[1] ?? '';
    const px = corps.match(/font-size:\s*(?:calc\()?([\d.]+)px/)?.[1] ?? corps.match(/font:[^;]*?([\d.]+)px/)?.[1];
    if (!px) f.push(`${sel} sans taille`);
    else if (+px > MAX_PX) f.push(`${sel} à ${px}px`);
  }
  return f;
}

describe('web#2656 — l’audit d’intégrité a la taille de police de la page', () => {
  it('texte, titre et tableau ont une taille explicite, pas plus grande que la page', () => {
    expect(fautes(STYLE)).toEqual([]);
  });

  it('contre-épreuve : le style d’avant échoue', () => {
    const avant = STYLE
      .replace(/section \{[^}]*\}/, 'section { margin-block: 16px; }')
      .replace(/h3 \{[^}]*\}/, 'h3 { font: 600 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans); color: var(--v2-txt); }')
      .replace(/\n  p \{[^}]*\}/, '\n  p { color: var(--v2-txt2); margin-block: 8px; }')
      .replace('th, td { font-size: calc(12px * var(--v2-txt-echelle, 1)); ', 'th, td { ');
    expect(fautes(avant)).toEqual(['section sans taille', 'h3 à 14px', 'p sans taille', 'th, td sans taille']);
  });
});
