// web#3187 (fil 2891, rc12) — l'option « Boutons − et + autour du curseur de
// volume » était sans effet sur la barre de bureau : `TransportBar.svelte`
// masquait `.step-btn` en CSS dans la plage 1200-1800 px avec les VU-mètres
// (#2555), et entre 769 et 1024 px. Une option choisie explicitement (elle est
// désactivée par défaut, web#2292) ne doit pas être escamotée par la mise en
// page.
//
// jsdom n'évalue ni les requêtes de conteneur ni les requêtes de média : on
// lit donc les règles des feuilles de style des composants.
// ⛔ N'établit pas le rendu dans un navigateur réel.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RACINE = resolve(__dirname, '../../components');

function fichiersSvelte(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiersSvelte(chemin) : nom.endsWith('.svelte') ? [chemin] : [];
  });
}

/** Les règles `sélecteur { corps }` des blocs <style>, commentaires retirés. */
function regles(source: string): { selecteur: string; corps: string }[] {
  const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  const net = styles.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...net.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selecteur: m[1].trim(), corps: m[2] }));
}

describe('web#3187 — les boutons − et + choisis ne sont masqués nulle part', () => {
  it('aucune règle CSS ne pose `display: none` sur `.step-btn`', () => {
    const masquages = fichiersSvelte(RACINE).flatMap((f) =>
      regles(readFileSync(f, 'utf8'))
        .filter((r) => /\.step-btn\b/.test(r.selecteur) && /display\s*:\s*none/.test(r.corps))
        .map((r) => `${f.slice(RACINE.length + 1)} : ${r.selecteur}`),
    );
    expect(masquages).toEqual([]);
  });
});
