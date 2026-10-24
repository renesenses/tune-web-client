#!/usr/bin/env node
/**
 * Points de terre du globe de Tune Circle — génère `src/lib/champCercle/pointsTerre.ts`.
 *
 * Source : `land-110m.json` du paquet npm `world-atlas` (Mike Bostock, licence
 * ISC), lui-même tiré de Natural Earth (domaine public). Le paquet n'est PAS
 * une dépendance du client : le script lit le fichier, en produit une grille
 * de points, et c'est la grille (≤ 40 Ko) qui est versionnée.
 *
 *   node scripts/genererPointsTerre.mjs [chemin/vers/land-110m.json]
 *
 * Sans argument, il télécharge la version épinglée ci-dessous. Le résultat est
 * déterministe : relancé sur la même source, il réécrit le même fichier.
 *
 * Grille : une rangée tous les 1,6° de latitude, de 56° S à 84° N (l'Antarctique
 * n'apporte qu'une bande blanche sous le globe incliné) ; sur chaque rangée, un
 * pas en longitude de 1,6° / cos(latitude), pour que la densité de points soit
 * la même partout sur la sphère. Une rangée sur deux est décalée d'un demi-pas.
 * Chaque point est gardé s'il tombe dans un polygone de terre (pair-impair sur
 * tous les anneaux : les lacs intérieurs restent vides).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '2.0.2';
const URL_SOURCE = `https://cdn.jsdelivr.net/npm/world-atlas@${VERSION}/land-110m.json`;
const PAS = 1.6;
const LAT_MIN = -56;
const LAT_MAX = 84;
const SORTIE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'champCercle', 'pointsTerre.ts');
const LIMITE_OCTETS = 40 * 1024;

async function lireSource(chemin) {
  if (chemin) return JSON.parse(readFileSync(chemin, 'utf8'));
  const r = await fetch(URL_SOURCE);
  if (!r.ok) throw new Error(`${URL_SOURCE} : ${r.status}`);
  return r.json();
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

function anneaux(topo) {
  const A = arcs(topo);
  const anneau = (indices) => {
    const pts = [];
    for (const i of indices) {
      const a = i < 0 ? A[~i].slice().reverse() : A[i];
      pts.push(...(pts.length ? a.slice(1) : a));
    }
    return pts;
  };
  const tous = [];
  const geos = topo.objects.land.type === 'GeometryCollection' ? topo.objects.land.geometries : [topo.objects.land];
  for (const g of geos) {
    if (g.type === 'Polygon') for (const r of g.arcs) tous.push(anneau(r));
    if (g.type === 'MultiPolygon') for (const p of g.arcs) for (const r of p) tous.push(anneau(r));
  }
  return tous;
}

function dedans(anneauxTerre, lon, lat) {
  let c = false;
  for (const r of anneauxTerre) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i]; const [xj, yj] = r[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
    }
  }
  return c;
}

const topo = await lireSource(process.argv[2]);
const terre = anneaux(topo);
const valeurs = [];
let rangee = 0;
for (let lat = LAT_MIN; lat <= LAT_MAX; lat = +(lat + PAS).toFixed(4), rangee++) {
  const pasLon = PAS / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  const n = Math.floor(360 / pasLon);
  const debut = -180 + (rangee % 2 ? pasLon / 2 : 0);
  for (let k = 0; k < n; k++) {
    const lon = debut + k * pasLon;
    if (dedans(terre, lon, lat)) valeurs.push(Math.round(lat * 10), Math.round(lon * 10));
  }
}

const contenu = `/**
 * Points de terre du globe de Tune Circle — FICHIER GÉNÉRÉ, ne pas modifier à la main.
 *
 * Généré par \`node scripts/genererPointsTerre.mjs\` depuis \`land-110m.json\` de
 * world-atlas@${VERSION} (https://github.com/topojson/world-atlas).
 *
 * world-atlas : Copyright 2013-2019 Michael Bostock. Licence ISC :
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES.
 * Données d'origine : Natural Earth (domaine public).
 *
 * Format : « lat×10,lon×10,lat×10,lon×10,… » en degrés entiers par dixièmes.
 * ${valeurs.length / 2} points, grille de ${PAS}° à densité constante sur la sphère.
 */
export const POINTS_TERRE = '${valeurs.join(',')}';
`;
const octets = Buffer.byteLength(contenu, 'utf8');
if (octets > LIMITE_OCTETS) throw new Error(`pointsTerre.ts : ${octets} octets, plus que ${LIMITE_OCTETS}`);
writeFileSync(SORTIE, contenu);
console.log(`${valeurs.length / 2} points, ${octets} octets → ${SORTIE}`);
