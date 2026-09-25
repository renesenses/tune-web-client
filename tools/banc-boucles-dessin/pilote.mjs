/**
 * Banc de mesure #1256 — pilote.
 *
 * ## Pourquoi il existe
 *
 * #1256 dit que « Lecture en cours » coûte beaucoup plus cher que l'Accueil, et
 * relève un FAIT de code : quatre boucles de dessin y tournent au lieu de deux.
 * Mais que ces quatre boucles soient la dépense n'avait jamais été mesuré — le
 * ticket le dit lui-même : « Aucune cause n'est démontrée ». Les six mesures
 * demandées au testeur ne sont jamais arrivées. Ce banc les remplace pour tout
 * ce qui ne dépend pas de SA machine : l'attribution RELATIVE du coût entre les
 * quatre boucles, et le sort de l'hypothèse « fond flouté ».
 *
 * ## Comment
 *
 * Pour CHAQUE configuration : un Chromium neuf, une page, N secondes de régime
 * permanent (la première seconde est jetée), puis deux relevés indépendants :
 *   - le temps JS passé dans les rappels d'animation, mesuré DANS la page ;
 *   - le temps CPU TOTAL du navigateur, tous processus confondus, mesuré
 *     DEHORS en échantillonnant `ps` aux deux bornes de la même fenêtre.
 * Le second est l'analogue direct de ce que le testeur a lu dans le Moniteur
 * d'activité — il inclut la rastérisation et la composition, que le JS ne voit
 * pas ; le premier dit quelle part en est du JavaScript.
 *
 * Les composants montés sont les composants RÉELS, avec les props RÉELLES de
 * leurs deux sites de montage (voir `Banc.svelte`). Rien n'est réécrit.
 *
 * ## Ce que ce banc ne prouve PAS
 *
 * - Ce n'est ni Safari ni Firefox, et ce n'est pas le MacBook du testeur : les
 *   valeurs ABSOLUES ne sont pas les siennes. Ce qui se transporte, c'est le
 *   rapport entre les configurations — le même code, le même moteur, la même
 *   fenêtre.
 * - Chromium sans écran compose sur le processeur. Un `filter: blur(60px)` y
 *   est donc mesuré au pire de sa forme, pas au mieux : s'il ne coûte rien ici,
 *   il ne coûte rien sur un GPU — l'inverse ne serait pas vrai.
 * - La cadence d'affichage est celle du mode sans écran (~75 Hz), pas les
 *   120 Hz d'un MacBook ProMotion. Tout coût par IMAGE est donc SOUS-estimé
 *   d'environ 1,6× par rapport à la machine du testeur.
 *
 * ## Usage
 *
 *   npx vite build --config tools/banc-boucles-dessin/vite.banc.config.ts
 *   cd tools/banc-boucles-dessin && SECONDES=15 REPETITIONS=5 node pilote.mjs
 *
 * Aucune dépendance npm : http natif, Chromium déjà présent sur la machine
 * (celui de Playwright, ou `CHROME_BIN=`).
 */
import { createServer } from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm, access } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';

const DIST = new URL('./dist/', import.meta.url);
const SOURCE = new URL('./', import.meta.url);
const CHROME = process.env.CHROME_BIN
  || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium`;
const SECONDES = Number(process.env.SECONDES || 20);
const REPETITIONS = Number(process.env.REPETITIONS || 3);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

/**
 * La pochette du fond flouté, fabriquée ici plutôt que versionnée : 800 Ko de
 * binaire dans le dépôt pour un banc, non. Un PNG 600x600 non compressible,
 * pour que `blur(60px)` ait de la matière à traiter.
 */
async function poserLaPochette() {
  const cible = new URL('./pochette.png', SOURCE);
  try { await access(cible); return; } catch { /* à fabriquer */ }
  const w = 600, h = 600;
  const lignes = [];
  for (let y = 0; y < h; y++) {
    const l = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) {
      l[1 + x * 3] = (x * 255 / w) | 0;
      l[2 + x * 3] = (y * 255 / h) | 0;
      l[3 + x * 3] = (x ^ y) & 255;
    }
    lignes.push(l);
  }
  const crc32 = (buf) => {
    let c = ~0;
    for (const o of buf) {
      c ^= o;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const bloc = (type, donnees) => {
    const corps = Buffer.concat([Buffer.from(type), donnees]);
    const len = Buffer.alloc(4); len.writeUInt32BE(donnees.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(corps));
    return Buffer.concat([len, corps, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const { deflateSync } = await import('node:zlib');
  await writeFile(cible, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    bloc('IHDR', ihdr),
    bloc('IDAT', deflateSync(Buffer.concat(lignes), { level: 6 })),
    bloc('IEND', Buffer.alloc(0)),
  ]));
}
await poserLaPochette();

let resoudre = null;
let surDebut = null;
const serveur = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/debut') {
    res.writeHead(204).end();
    if (surDebut) surDebut();
    return;
  }
  if (req.method === 'POST' && req.url === '/releve') {
    let corps = '';
    for await (const c of req) corps += c;
    res.writeHead(204).end();
    if (resoudre) resoudre(JSON.parse(corps));
    return;
  }
  const chemin = (req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]).replace(/^\//, '');
  try {
    const buf = await readFile(new URL(chemin, DIST));
    res.writeHead(200, { 'content-type': TYPES[extname(chemin)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const PORT = serveur.address().port;

/**
 * 🔴 Sous Linux, `ps -o time` ne rend que des SECONDES ENTIÈRES (`hh:mm:ss`),
 * là où le `ps` de macOS descend au centième. Sur une fenêtre de 20 s, ça fait
 * un pas de 0,05 CPU s/s — et sur la fenêtre de 8 s du rodage, un pas de 0,125,
 * c'est-à-dire l'ordre de grandeur de ce qu'on cherche à mesurer. Les valeurs
 * tombent alors toutes sur les mêmes multiples et deux configurations
 * différentes rendent le même chiffre : un faux « aucun écart ».
 *
 * On lit donc `/proc/<pid>/stat` : `utime` + `stime` en tics d'horloge
 * (100 Hz), soit un pas de 10 ms — 1/100ᵉ de ce que `ps` donne ici.
 */
const TICS_PAR_SECONDE = Number(
  execSync('getconf CLK_TCK', { encoding: 'utf8' }).trim()) || 100;

function cpuDuNavigateurLinux(marqueur) {
  let total = 0;
  for (const entree of readdirSync('/proc')) {
    if (!/^\d+$/.test(entree)) continue;
    let cmdline;
    try { cmdline = readFileSync(`/proc/${entree}/cmdline`, 'utf8'); } catch { continue; }
    if (!cmdline.includes(marqueur)) continue;
    let stat;
    try { stat = readFileSync(`/proc/${entree}/stat`, 'utf8'); } catch { continue; }
    // Le nom du programme est entre parenthèses et peut contenir des espaces :
    // on repart de la DERNIÈRE parenthèse fermante, jamais d'un split naïf.
    const champs = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    // champs[0] = state (champ 3) ⇒ utime = champ 14 = champs[11], stime = champs[12].
    total += (Number(champs[11]) + Number(champs[12])) / TICS_PAR_SECONDE;
  }
  return total;
}

/** Temps CPU cumulé de TOUS les processus du navigateur, en secondes. */
function cpuDuNavigateur(marqueur) {
  if (process.platform === 'linux') return cpuDuNavigateurLinux(marqueur);
  const sortie = execSync(`ps -Ao pid,time,args`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let total = 0;
  for (const ligne of sortie.split('\n')) {
    if (!ligne.includes(marqueur)) continue;
    const m = /^\s*\d+\s+(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)\s/.exec(ligne);
    if (!m) continue;
    const [, j, h, mn, sec] = m;
    total += (+(j || 0)) * 86400 + (+(h || 0)) * 3600 + (+mn) * 60 + parseFloat(sec);
  }
  return total;
}

/**
 * 🔴 La charge de la machine est relevée à CHAQUE tour, et publiée.
 *
 * Le relevé précédent (#1480) a une ligne entière inexploitable parce qu'il a
 * été pris sur un Mac dont la charge oscillait entre 50 et 130, et que rien
 * dans le tableau ne permettait de le voir après coup. Un chiffre de banc sans
 * la charge au moment où il a été pris n'est pas une mesure, c'est une
 * anecdote. Voir memory feedback_faux_rouge_binaire_tue_sous_saturation.
 */
function chargeMachine() {
  try {
    if (process.platform === 'linux') {
      return +readFileSync('/proc/loadavg', 'utf8').split(' ')[0];
    }
    return +execSync('sysctl -n vm.loadavg', { encoding: 'utf8' }).split(' ')[1];
  } catch { return NaN; }
}

async function mesurer(config) {
  const profil = await mkdtemp(join(tmpdir(), 'banc1256-'));
  const debut = new Promise((r) => { surDebut = r; });
  const attente = new Promise((r) => { resoudre = r; });
  // La requête AVANT le hash : `location.search` ne lit rien de ce qui suit `#`.
  const url = `http://127.0.0.1:${PORT}/?ms=${SECONDES * 1000}#${config}`;
  const p = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    '--window-size=1280,900', '--force-device-scale-factor=2',
    `--user-data-dir=${profil}`, url,
  ], { stdio: 'ignore' });
  // 🔴 Une borne, sinon le banc attend une page morte POUR TOUJOURS.
  // Vécu le 23/09 : sous une charge de 122 sur le Mac, un Chromium met plus
  // d'une minute à ouvrir, et il arrive qu'il n'ouvre pas du tout. Sans borne,
  // le pilote restait bloqué sur son `await`, et la campagne avec lui.
  const borne = (promesse, quoi) => Promise.race([
    promesse,
    new Promise((_, rejette) =>
      setTimeout(() => rejette(new Error(`délai dépassé : ${quoi}`)), (SECONDES + 120) * 1000)),
  ]);
  try {
    await borne(debut, `${config} n'a jamais démarré`);
    const chargeDebut = chargeMachine();
    const cpu0 = cpuDuNavigateur(profil);
    const releve = await borne(attente, `${config} n'a jamais rendu son relevé`);
    const cpu1 = cpuDuNavigateur(profil);
    const cpu = cpu1 - cpu0;
    return { ...releve, cpuProcessusS: +cpu.toFixed(3),
             cpuParSeconde: +(cpu / releve.secondes).toFixed(4),
             charge: +((chargeDebut + chargeMachine()) / 2).toFixed(2) };
  } finally {
    p.kill('SIGKILL');
    await new Promise((r) => p.on('exit', r));
    // 🔴 Le processus parent est mort, ses enfants (GPU, rendu, réseau) écrivent
    // encore dans le profil pendant quelques centaines de ms. Un `rm` immédiat
    // rend ENOTEMPTY et tue le banc au milieu du tableau (vécu le 23/09 sur
    // Shrek). On réessaie, et un profil temporaire qui survit n'est pas une
    // raison d'interrompre une mesure.
    for (let essai = 0; essai < 20; essai++) {
      try { await rm(profil, { recursive: true, force: true }); break; }
      catch { await new Promise((r) => setTimeout(r, 300)); }
    }
  }
}

const CONFIGS = [
  ['aucune',                  'plancher : page nue, aucune boucle'],
  ['aucune,fond',             'le fond flouté SEUL (blur(60px) plein cadre)'],
  ['tb-crete',                'crête-mètre « lamps » 56x22 de la barre de transport'],
  ['tb-spectre',              'spectre mini 24 px, 16 barres, de la barre de transport'],
  ['barre-seule',             'ACCUEIL : la barre de transport seule, 2 boucles, sans fond'],
  ['np-crete',                'crête-mètre « dat » pleine largeur 26 px de Lecture en cours'],
  ['np-spectre',              'spectre 80 px pleine largeur, 32 barres + axe, de Lecture en cours'],
  ['np-onde',                 'la même toile en forme d\'onde (variante du mode)'],
  ['les-quatre,fond',         'LECTURE EN COURS : les 4 boucles + le fond flouté'],
  ['les-quatre,fond,arret',   'idem, lecture ARRÊTÉE'],
  ['les-quatre,fond,cadence30', 'CONTRE-ÉPREUVE #1480 : une minuterie PAR boucle, 30 Hz (hors chaîne rAF)'],
  ['les-quatre,fond,horloge', 'HORLOGE A : un seul rAF pour les 4, appelés à chaque image'],
  ['les-quatre,fond,horloge-saut', 'HORLOGE B : un seul rAF toujours armé, dessinateurs à 30 Hz'],
  ['les-quatre,fond,horloge30', 'HORLOGE C : un seul rAF armé à 30 Hz seulement (minuterie UNIQUE)'],
  ['les-quatre,fond,horloge25', 'HORLOGE D : C, mais la minuterie vise 25 ms pour tenir 30 dessins/s'],
  ['les-quatre,fond,horloge-net', 'HORLOGE E : horloge unique SEUL cadenceur — 30 Hz et 120 dessins/s'],
  ['les-quatre,fond,horloge-net20', 'ARBITRAGE : horloge unique, 20 dessins/s au lieu de 30'],
  ['les-quatre,fond,horloge-net15', 'ARBITRAGE : horloge unique, 15 dessins/s au lieu de 30'],
  ['les-quatre,fond,horloge30-brut', 'TÉMOIN de C : une minuterie UNIQUE, mais hors de la chaîne rAF'],
];


/**
 * 🔴 Les tours sont ENTRELACÉS, pas groupés par configuration.
 *
 * Le Mac de Bertrand est partagé : des charges de 60 à 130 y ont été relevées
 * pendant ce banc. Mesurer trois fois la même configuration d'affilée fait
 * tomber une bourrasque de charge sur UNE configuration et sur elle seule — et
 * c'est elle qu'on déclare coupable. En tournant configuration par
 * configuration à chaque tour, toute charge qui dure plus qu'une mesure se
 * répartit sur toutes, et la médiane l'absorbe.
 * Voir memory feedback_faux_rouge_binaire_tue_sous_saturation.
 */
/** `CONFIGS=a|b` rejoue une mesure manquante sans refaire tout le tableau. */
const FILTRE = process.env.CONFIGS ? process.env.CONFIGS.split('|') : null;
const RETENUES = FILTRE ? CONFIGS.filter(([c]) => FILTRE.includes(c)) : CONFIGS;
const tours = new Map(RETENUES.map(([c]) => [c, []]));
for (let tour = 0; tour < REPETITIONS; tour++) {
  for (const [config] of RETENUES) {
    tours.get(config).push(await mesurer(config));
    process.stderr.write(`tour ${tour + 1} : ${config}\n`);
  }
}

const resultats = [];
for (const [config, libelle] of RETENUES) {
  const t = tours.get(config);
  const med = (f) => {
    const v = t.map(f).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  const r = {
    config, libelle,
    rappelsParSeconde: med((x) => x.rappelsParSeconde),
    ticsParSeconde: med((x) => x.ticsParSeconde ?? x.rappelsParSeconde),
    dessinsParSeconde: med((x) => x.dessinsParSeconde ?? 0),
    msJsParSeconde: med((x) => x.msJsParSeconde),
    cpuParSeconde: med((x) => x.cpuParSeconde),
    tours: t.map((x) => x.cpuParSeconde),
    charges: t.map((x) => x.charge),
    ecartRelatif: (() => {
      const v = t.map((x) => x.cpuParSeconde);
      return +((Math.max(...v) - Math.min(...v)) / med((x) => x.cpuParSeconde)).toFixed(3);
    })(),
  };
  resultats.push(r);
  console.log(JSON.stringify(r));
}

const plancher = resultats[0];
console.log('\n=== BANC #1256 — Chromium headless, dpr=2, %d s par tour, médiane de %d tours ===', SECONDES, REPETITIONS);
console.log('config                | rAF/s | tics/s | dessins/s | ms JS /s | CPU s/s | net du plancher | libellé');
for (const r of resultats) {
  console.log('%s | %s | %s | %s | %s | %s | %s | %s',
    r.config.padEnd(21),
    String(r.rappelsParSeconde).padStart(5),
    String(r.ticsParSeconde).padStart(6),
    String(r.dessinsParSeconde).padStart(9),
    String(r.msJsParSeconde).padStart(8),
    String(r.cpuParSeconde).padStart(7),
    String(+(r.cpuParSeconde - plancher.cpuParSeconde).toFixed(4)).padStart(15),
    r.libelle);
}
console.log('\n--- dispersion entre tours (CPU s/s) et charge de la machine à chaque tour ---');
for (const r of resultats) {
  console.log('%s | tours %s | écart %s %% | charges %s',
    r.config.padEnd(21),
    r.tours.join(' / '),
    String(Math.round(r.ecartRelatif * 100)).padStart(3),
    r.charges.join(' / '));
}
serveur.close();
process.exit(0);
