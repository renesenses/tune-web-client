#!/usr/bin/env node
/**
 * Toute classe qui HABILLE une pochette en mode remplissage doit exister dans
 * le bloc `<style>` de son composant.
 *
 * `AlbumArt` en `size={0}` adopte la boîte de son parent — c'est le bon mode
 * partout dans le client v2. Mais un parent sans règle CSS n'impose AUCUNE
 * boîte : l'image prend alors toute la largeur disponible.
 *
 * Vécu le 03/09/2026 sur les favoris Radio. Le balisage avait été écrit sans
 * ses styles : `.rows`, `.lrow`, `.lcv`, `.lt`, `.la`, `.lst` n'existaient
 * nulle part. Quatre favoris, et une seule pochette occupant tout le volet.
 *
 * ## Ce que cette garde vérifie, et ce qu'elle ne vérifie PAS
 *
 * Elle vérifie la PRÉSENCE du sélecteur, pas ses propriétés. Un premier essai
 * cherchait « une largeur, un ratio ou une base flex » et rendait douze faux
 * positifs : la règle qui les cherchait ne pouvait apparier aucune déclaration
 * CSS. Une garde qui se trompe douze fois sur douze ne sert à rien.
 *
 * La présence, elle, est sans ambiguïté — et c'est exactement ce qui manquait.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function fichiers(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...fichiers(p));
    else if (n.endsWith('.svelte')) out.push(p);
  }
  return out;
}

const manquantes = [];

for (const f of fichiers('src/components')) {
  const src = readFileSync(f, 'utf8');
  const i = src.indexOf('<style>');
  const style = i === -1 ? '' : src.slice(i);

  // L'élément qui enveloppe DIRECTEMENT une pochette en remplissage.
  const re = /<(\w+)[^>]*\bclass="([^"{]+)"[^>]*>\s*<AlbumArt[^>]*size=\{0\}/g;
  let m;
  while ((m = re.exec(src))) {
    const ligne = src.slice(0, m.index).split('\n').length;
    for (const c of m[2].split(/\s+/).filter(Boolean)) {
      // `:global(...)` et les classes venant d'une feuille partagée sont hors
      // de portée : on ne juge que ce que le composant déclare lui-même.
      if (style.includes(`.${c}`)) continue;
      manquantes.push(`${f}:${ligne}  .${c} habille une pochette et n'existe pas dans <style>`);
    }
  }
}

if (manquantes.length) {
  console.error(`${manquantes.length} classe(s) de pochette sans style :\n`);
  for (const l of manquantes) console.error('  ' + l);
  console.error(
    "\nUne pochette en `size={0}` prend la boite de son parent. Sans regle, elle",
  );
  console.error('prend toute la largeur du volet. Donnez-lui une taille ou un ratio.');
  process.exit(1);
}

console.log('classes de pochette : toutes stylees.');
