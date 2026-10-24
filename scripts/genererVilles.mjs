#!/usr/bin/env node
/**
 * Index des villes de Tune Circle — génère `src/lib/champCercle/villesDonnees.ts`.
 *
 * Source : l'export GeoNames `cities15000` (ou `cities5000`), licence Creative
 * Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/),
 * © GeoNames (https://www.geonames.org/). Le fichier source n'est PAS versionné :
 * le script en garde six colonnes, et c'est ce résultat compact qui l'est.
 *
 *   node scripts/genererVilles.mjs [chemin/vers/cities15000.txt|.zip] [--min-pop N]
 *
 * `--min-pop N` écarte les villes de moins de N habitants, sauf les capitales.
 * L'index versionné : `cities15000` et `--min-pop 20000`.
 *
 * Sans chemin, il télécharge `cities15000.zip` (il faut `unzip`). Le résultat est
 * déterministe : relancé sur le même export, il réécrit le même fichier.
 *
 * Format, une ville par ligne, triées par population décroissante (puis nom) :
 *   nom|nom ASCII (vide s'il est identique)|pays|lat×10|lon×10|population en milliers
 *
 * Le fichier est chargé À LA DEMANDE (import dynamique, morceau séparé du
 * paquet principal) ; le script refuse un résultat de plus de 400 Ko gzip.
 * Aucune donnée ne part vers un service en ligne : la recherche est locale.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const URL_SOURCE = 'https://download.geonames.org/export/dump/cities15000.zip';
const SORTIE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'champCercle', 'villesDonnees.ts');
const LIMITE_GZIP = 400 * 1024;

const args = process.argv.slice(2);
let chemin = null;
let minPop = 0;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--min-pop') minPop = Number(args[++i]);
  else chemin = args[i];
}

async function lireSource() {
  if (chemin && chemin.endsWith('.txt')) return { texte: readFileSync(chemin, 'utf8'), nom: chemin.split('/').pop() };
  let zip = chemin;
  let tmp = null;
  if (!zip) {
    tmp = mkdtempSync(join(tmpdir(), 'geonames-'));
    zip = join(tmp, 'cities15000.zip');
    const r = await fetch(URL_SOURCE);
    if (!r.ok) throw new Error(`${URL_SOURCE} : ${r.status}`);
    writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
  }
  const texte = execFileSync('unzip', ['-p', zip], { maxBuffer: 1 << 30 }).toString('utf8');
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  return { texte, nom: zip.split('/').pop().replace(/\.zip$/, '.txt') };
}

const propre = (s) => s.replace(/[|\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();

const { texte, nom } = await lireSource();
const villes = [];
for (const ligne of texte.split('\n')) {
  if (!ligne) continue;
  const c = ligne.split('\t');
  // geonameid, name, asciiname, alternatenames, latitude, longitude, feature class,
  // feature code, country code, cc2, admin1…admin4, population, …
  const nomVille = propre(c[1] ?? '');
  const ascii = propre(c[2] ?? '');
  const pays = (c[8] ?? '').trim().toUpperCase();
  const lat = Number(c[4]);
  const lon = Number(c[5]);
  const pop = Number(c[14]) || 0;
  if (!nomVille || !/^[A-Z]{2}$/.test(pays) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  // Les capitales restent, quelle que soit leur population (code PPLC).
  if (pop < minPop && c[7] !== 'PPLC') continue;
  villes.push({ nom: nomVille, ascii: ascii === nomVille ? '' : ascii, pays, lat: Math.round(lat * 10), lon: Math.round(lon * 10), pop });
}
villes.sort((a, b) => b.pop - a.pop || a.nom.localeCompare(b.nom, 'en') || a.pays.localeCompare(b.pays));

const corps = villes.map((v) => [v.nom, v.ascii, v.pays, v.lat, v.lon, Math.round(v.pop / 1000)].join('|')).join('\n');
const fichier = `/**
 * Index des villes de Tune Circle — FICHIER GÉNÉRÉ, ne pas modifier à la main.
 *
 * Généré par \`node scripts/genererVilles.mjs\` depuis \`${nom}\` de GeoNames
 * (https://www.geonames.org/), licence Creative Commons Attribution 4.0
 * (https://creativecommons.org/licenses/by/4.0/). Seuls le nom, le nom ASCII,
 * le pays, la position et la population sont gardés.
 *
 * Format : « nom|ascii (vide = identique)|pays|lat×10|lon×10|population en milliers »,
 * une ville par ligne, par population décroissante. ${villes.length} villes${minPop ? `, population ≥ ${minPop} ou capitale` : ''}.
 * Chargé à la demande par \`villes.ts\` (import dynamique).
 */
export const VILLES = ${JSON.stringify(corps)};
`;
const gz = gzipSync(Buffer.from(fichier, 'utf8'), { level: 9 }).length;
if (gz > LIMITE_GZIP) {
  console.error(`${villes.length} villes : ${Math.round(gz / 1024)} Ko gzip > ${LIMITE_GZIP / 1024} Ko. Relever --min-pop.`);
  process.exit(1);
}
writeFileSync(SORTIE, fichier);
console.log(`${villes.length} villes, ${Math.round(Buffer.byteLength(fichier) / 1024)} Ko, ${Math.round(gz / 1024)} Ko gzip → ${SORTIE}`);
