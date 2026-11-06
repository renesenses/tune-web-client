#!/usr/bin/env node
/**
 * Frontières des pays du globe — génère `src/lib/champCercle/frontieresTerre.ts`.
 *
 * Source : `countries-110m.json` du paquet npm `world-atlas` (Mike Bostock,
 * licence ISC), lui-même tiré de Natural Earth (domaine public) ; la même
 * version que `genererPointsTerre.mjs`. Le paquet n'est PAS une dépendance du
 * client : le script lit le fichier, en extrait les frontières, et ce sont
 * les polylignes (≤ 60 Ko) qui sont versionnées.
 *
 *   node scripts/genererFrontieresTerre.mjs [chemin/vers/countries-110m.json]
 *
 * Sans argument, il télécharge la version épinglée ci-dessous. Le résultat est
 * déterministe : relancé sur la même source, il réécrit le même fichier.
 *
 * Seules les frontières TERRESTRES sont gardées : un arc TopoJSON partagé par
 * deux pays. Les côtes, elles, sont déjà dessinées par les points de terre.
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
const LIMITE_OCTETS = 60 * 1024;

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

const polylignes = [];
const indices = [...usages.keys()].filter((i) => usages.get(i) >= 2).sort((a, b) => a - b);
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

const points = polylignes.reduce((s, p) => s + p.length / 2, 0);
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
 * Frontières terrestres seulement (arcs partagés par deux pays) :
 * ${polylignes.length} polylignes, ${points} points.
 */
export const FRONTIERES_TERRE = '${polylignes.map((p) => p.join(',')).join(';')}';
`;
const octets = Buffer.byteLength(contenu, 'utf8');
if (octets > LIMITE_OCTETS) throw new Error(`frontieresTerre.ts : ${octets} octets, plus que ${LIMITE_OCTETS}`);
writeFileSync(SORTIE, contenu);
console.log(`${polylignes.length} polylignes, ${points} points, ${octets} octets → ${SORTIE}`);
