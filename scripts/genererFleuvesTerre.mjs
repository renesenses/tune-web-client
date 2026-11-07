#!/usr/bin/env node
/**
 * Grands fleuves du globe (web#2697) — génère `src/lib/champCercle/fleuvesTerre.ts`.
 *
 * Source : `ne_110m_rivers_lake_centerlines.geojson` de Natural Earth (domaine
 * public), épinglée sur le même commit que `genererPaysTerre.mjs`. Rien n'est
 * lu à l'exécution : seules les polylignes (≤ 16 Ko) sont versionnées.
 *
 *   node scripts/genererFleuvesTerre.mjs [chemin/vers/rivers.geojson]
 *
 * Même quantification que les frontières : le dixième de degré, points répétés
 * retirés, polyligne coupée à l'antiméridien (saut de plus de 180° de
 * longitude). Déterministe : même source, même fichier. À l'échelle 110m, la
 * source ne compte que les plus grands fleuves du monde (13 lignes).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/117488dc884bad03366ff727eca013e434615127/geojson/ne_110m_rivers_lake_centerlines.geojson';
const SORTIE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'champCercle', 'fleuvesTerre.ts');
const LIMITE_OCTETS = 16 * 1024;

let brut;
if (process.argv[2]) brut = readFileSync(process.argv[2], 'utf8');
else {
  const r = await fetch(SOURCE);
  if (!r.ok) throw new Error(`${SOURCE} : ${r.status}`);
  brut = await r.text();
}

const polylignes = [];
for (const f of JSON.parse(brut).features) {
  const g = f.geometry;
  const lignes = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  for (const ligne of lignes) {
    let courante = [];
    const clore = () => { if (courante.length >= 4) polylignes.push(courante); courante = []; };
    for (const [lon, lat] of ligne) {
      const la = Math.round(lat * 10); const lo = Math.round(lon * 10);
      const n = courante.length;
      if (n && courante[n - 2] === la && courante[n - 1] === lo) continue;
      if (n && Math.abs(courante[n - 1] - lo) > 1800) clore();
      courante.push(la, lo);
    }
    clore();
  }
}

const points = polylignes.reduce((s, p) => s + p.length / 2, 0);
const contenu = `/**
 * Grands fleuves du globe — FICHIER GÉNÉRÉ, ne pas modifier à la main.
 *
 * Généré par \`node scripts/genererFleuvesTerre.mjs\` depuis
 * ne_110m_rivers_lake_centerlines.geojson de Natural Earth (domaine public).
 * Source : ${SOURCE}
 * Source SHA256 : ${createHash('sha256').update(brut).digest('hex')}
 *
 * Format : polylignes séparées par « ; », chacune « lat×10,lon×10,lat×10,lon×10,… ».
 * ${polylignes.length} polylignes, ${points} points.
 */
export const FLEUVES_TERRE = '${polylignes.map((p) => p.join(',')).join(';')}';
`;
const octets = Buffer.byteLength(contenu, 'utf8');
if (octets > LIMITE_OCTETS) throw new Error(`fleuvesTerre.ts : ${octets} octets, plus que ${LIMITE_OCTETS}`);
writeFileSync(SORTIE, contenu);
console.log(`${polylignes.length} polylignes, ${points} points, ${octets} octets → ${SORTIE}`);
