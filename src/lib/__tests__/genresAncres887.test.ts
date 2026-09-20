/**
 * #887, volet 2 — Jean Valjean, fil 1721 : aucun en-tête figé au défilement
 * dans le volet Genres de la nouvelle interface. La première moitié (l'écran
 * Bandcamp de l'ancienne coquille) est livrée par 2fb1ce0b ; celle-ci ancre
 * la rangée des SOUS-genres de `StreamingV2`.
 *
 * ⚠️ `verdictAncrage` (la garde partagée) ne retrouve pas l'élément dans ce
 * gabarit — ses gestionnaires `onclick={() => …}` à accolades imbriquées
 * désynchronisent son lecteur de balises. On lit donc les règles par leur
 * SÉLECTEUR EXACT, et l'on vérifie à la main que `.chips.sous` est enfant
 * direct de `.scroll`, le conteneur de défilement.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lireStyles } from './ancrageDefilement';

const source = readFileSync(resolve(process.cwd(), 'src/components/v2/StreamingV2.svelte'), 'utf-8');
const regles = lireStyles(source);
const exacte = (sel: string) => Object.assign({}, ...regles.filter((r) => r.selecteur === sel).map((r) => r.declarations));

describe('#887 — les sous-genres du Streaming restent à l’écran', () => {
  it('🔴 `.chips.sous` est épinglé, avec un offset et un fond opaque', () => {
    const d = exacte('.chips.sous');
    expect(d.position).toBe('sticky');
    expect(d.top).toBeDefined();
    expect(d.background ?? d['background-color']).toBeTruthy();
  });
  it('🔴 la rangée est enfant direct du conteneur qui défile — rien ne bloque l’ancrage', () => {
    expect(exacte('.scroll')['overflow-y']).toBe('auto');
    const gabarit = source.replace(/<!--[\s\S]*?-->/g, '');
    // 🔴 On repère `.scroll` par son OUVERTURE DE BALISE, sans le `>` final :
    // le jour où la div reçoit un attribut de plus (`bind:this`, une action),
    // un `indexOf('<div class="scroll">')` rend **-1**, la tranche part de zéro,
    // et le cas compte les `<div>` de TOUT le fichier — un rouge qui n'accuse
    // rien de ce qu'il garde. Mesuré le 20/09/2026 : « expected 34 to be 33 ».
    const debut = gabarit.indexOf('<div class="scroll"');
    expect(debut, 'le conteneur `.scroll` est introuvable dans le gabarit').toBeGreaterThan(-1);
    for (const m of gabarit.matchAll(/<div class="chips sous">/g)) {
      // Entre l'ouverture de `.scroll` et cette rangée : uniquement des blocs
      // Svelte (`{#if}`, `{:else}`) et des éléments déjà REFERMÉS — donc
      // aucune `<div` ouverte non refermée.
      const avant = gabarit.slice(debut + 1, m.index);
      const ouvertes = (avant.match(/<div\b/g) ?? []).length;
      const fermees = (avant.match(/<\/div>/g) ?? []).length;
      expect(ouvertes, 'une <div> ouverte entre .scroll et .chips.sous').toBe(fermees);
    }
  });
  it('le nuage de TOUS les genres, lui, n’est pas épinglé — il ferait plusieurs rangées', () => {
    expect(exacte('.chips').position).not.toBe('sticky');
  });
});
