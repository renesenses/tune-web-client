#!/usr/bin/env node
/**
 * Frontières des pays du globe — génère `src/lib/champCercle/frontieresTerre.ts`.
 *
 * Source : `countries-110m.json` du paquet npm `world-atlas` (Mike Bostock,
 * licence ISC), lui-même tiré de Natural Earth (domaine public) ; la même
 * version que `genererPointsTerre.mjs`. Le paquet n'est PAS une dépendance du
 * client : le script lit le fichier, en extrait les frontières, et ce sont
 * les polylignes (≤ 96 Ko, les deux listes ensemble) qui sont versionnées.
 *
 *   node scripts/genererFrontieresTerre.mjs [chemin/vers/countries-110m.json]
 *
 * Sans argument, il télécharge la version épinglée ci-dessous. Le résultat est
 * déterministe : relancé sur la même source, il réécrit le même fichier.
 *
 * Deux listes sortent, chacune en polylignes : `FRONTIERES_TERRE`, les arcs
 * TopoJSON partagés par deux pays (frontières terrestres), et `COTES_TERRE`
 * (web#2697), les arcs employés par un seul pays (les côtes). Les points de
 * terre s'estompent au zoom : sans côtes tracées, les pays n'ont plus de
 * contour côté mer.
 * Chaque point est quantifié au dixième de degré ; les points répétés après
 * quantification sont retirés, et une polyligne est coupée là où elle
 * traverserait l'antiméridien (un saut de plus de 180° en longitude).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '2.0.2';
const URL_SOURCE = `https://cdn.jsdelivr.net/npm/world-atlas@${VERSION}/countries-110m.json`;
const SORTIE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'champCercle', 'frontieresTerre.ts');
// Mesuré : frontières ~25 Ko + côtes ~47 Ko (+ en-tête) ≈ 71 Ko au pas du
// dixième de degré. 96 Ko laissent de la marge sans laisser grossir le client
// sans qu'on s'en aperçoive (web#2697 : l'ancienne limite, 60 Ko, ne tenait
// que les frontières). Une source plus fine (50m) ne tiendrait pas : le dire.
const LIMITE_OCTETS = 96 * 1024;

async function lireSource(chemin) {
  if (chemin) return readFileSync(chemin, 'utf8');
  const r = await fetch(URL_SOURCE);
  if (!r.ok) throw new Error(`${URL_SOURCE} : ${r.status}`);
  return r.text();
}

/** Décode les arcs TopoJSON (quantifiés, en deltas) en [lon, lat]. */
function arcs(topo) {
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;
  return topo.arcs.map((arc) => {
    let x = 0; let y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
  });
}

/** Les indices d'arcs (positifs) qu'emploie une géométrie, chacun une fois. */
function arcsDe(g) {
  const vus = new Set();
  const parcourir = (a) => { for (const v of a) Array.isArray(v) ? parcourir(v) : vus.add(v < 0 ? ~v : v); };
  if (g.arcs) parcourir(g.arcs);
  return vus;
}

const brut = await lireSource(process.argv[2]);
const topo = JSON.parse(brut);
const A = arcs(topo);
// Combien de pays emploient chaque arc : deux = une frontière entre eux.
const usages = new Map();
for (const g of topo.objects.countries.geometries) for (const i of arcsDe(g)) usages.set(i, (usages.get(i) ?? 0) + 1);

/** Les polylignes quantifiées des arcs dont `garde(nombre de pays)` est vrai. */
function polylignesDe(garde) {
  const polylignes = [];
  const indices = [...usages.keys()].filter((i) => garde(usages.get(i))).sort((a, b) => a - b);
  for (const i of indices) {
    let courante = [];
    const clore = () => { if (courante.length >= 4) polylignes.push(courante); courante = []; };
    for (const [lon, lat] of A[i]) {
      const la = Math.round(lat * 10); const lo = Math.round(lon * 10);
      const n = courante.length;
      if (n && courante[n - 2] === la && courante[n - 1] === lo) continue;
      if (n && Math.abs(courante[n - 1] - lo) > 1800) clore();
      courante.push(la, lo);
    }
    clore();
  }
  return polylignes;
}
const nombrePoints = (l) => l.reduce((s, p) => s + p.length / 2, 0);
const frontieres = polylignesDe((n) => n >= 2);
const cotes = polylignesDe((n) => n === 1);
const polylignes = frontieres;
const points = nombrePoints(frontieres);
const sha = createHash('sha256').update(brut).digest('hex');
const contenu = `/**
 * Frontières des pays du globe — FICHIER GÉNÉRÉ, ne pas modifier à la main.
 *
 * Généré par \`node scripts/genererFrontieresTerre.mjs\` depuis \`countries-110m.json\` de
 * world-atlas@${VERSION} (https://github.com/topojson/world-atlas).
 * Source : ${URL_SOURCE}
 * Source SHA256 : ${sha}
 *
 * world-atlas : Copyright 2013-2019 Michael Bostock. Licence ISC :
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES.
 * Données d'origine : Natural Earth (domaine public).
 *
 * Format : polylignes séparées par « ; », chacune « lat×10,lon×10,lat×10,lon×10,… ».
 * FRONTIERES_TERRE : frontières terrestres (arcs partagés par deux pays) :
 * ${frontieres.length} polylignes, ${points} points.
 * COTES_TERRE (web#2697) : côtes (arcs d'un seul pays) :
 * ${cotes.length} polylignes, ${nombrePoints(cotes)} points.
 */
export const FRONTIERES_TERRE = '${frontieres.map((p) => p.join(',')).join(';')}';
export const COTES_TERRE = '${cotes.map((p) => p.join(',')).join(';')}';
`;
const octets = Buffer.byteLength(contenu, 'utf8');
if (octets > LIMITE_OCTETS) throw new Error(`frontieresTerre.ts : ${octets} octets, plus que ${LIMITE_OCTETS}`);
writeFileSync(SORTIE, contenu);
console.log(`${frontieres.length} frontières (${points} points), ${cotes.length} côtes (${nombrePoints(cotes)} points), ${octets} octets → ${SORTIE}`);
