#!/usr/bin/env node
/**
 * tune-ui-crawler — exploration autonome de l'interface Tune.
 *
 *   node run.mjs --serve                    # demarre un serveur jetable et explore tout
 *   node run.mjs --base-url http://…:8291   # explore une instance deja lancee
 *   node run.mjs --serve --headed           # en regardant faire
 *
 * L'automate n'a aucune connaissance des ecrans : il decouvre le menu, recense
 * les controles, agit, observe, et ouvre une issue documentee par defaut trouve.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { installProbe } from './src/probe.mjs';
import { Crawler } from './src/crawler.mjs';
import { IssueLog } from './src/issues.mjs';
import { DEFAULTS } from './src/config.mjs';
import { publishIssues } from './src/publish.mjs';
import { createScrubber, discoverDeviceNames } from './src/scrub.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_CLIENT = resolve(HERE, '../..');

const argv = parseArgs(process.argv.slice(2));
const opt = {
  ...DEFAULTS,
  baseUrl: argv['base-url'] || DEFAULTS.baseUrl,
  outDir: resolve(HERE, argv.out || DEFAULTS.outDir),
  maxActions: Number(argv['max-actions'] || DEFAULTS.maxActions),
  maxPerState: Number(argv['max-per-state'] || DEFAULTS.maxPerState),
  maxDepth: Number(argv['max-depth'] || DEFAULTS.maxDepth),
  headless: !argv.headed,
  allowDevices: !!argv['allow-devices'],
  log: (msg) => process.stdout.write(msg + '\n'),
};

const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
let serverProcess = null;
let crawler = null;
let issues = null;
let started = Date.now();
let reported = false;

/**
 * Ecrit le rapport de ce qui a ete trouve jusqu'ici.
 *
 * Appele aussi bien a la fin normale que sur interruption : une exploration de
 * dix minutes coupee au bout de neuf ne doit pas perdre ses constats.
 */
function writeReport(interrupted = false) {
  if (reported || !issues) return null;
  reported = true;
  const meta = {
    runId,
    baseUrl: opt.baseUrl,
    durationMs: Date.now() - started,
    actions: crawler ? crawler.actions : 0,
    views: crawler ? crawler.viewsVisited : 0,
    skipped: crawler ? crawler.skipped : [],
    interrupted,
  };
  const result = { ...issues.flush(meta), meta };
  opt.log(`\n■ ${crawler ? crawler.actions : 0} actions sur ${crawler ? crawler.viewsVisited : 0} vues — ${result.count} defauts distincts${interrupted ? ' (exploration interrompue)' : ''}`);
  opt.log(`  rapport : ${join(result.dir, 'index.md')}`);
  return result;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    opt.log(`\n! ${signal} recu — ecriture du rapport partiel`);
    writeReport(true);
    if (serverProcess) serverProcess.kill('SIGTERM');
    process.exit(130);
  });
}

try {
  if (argv.serve) opt.baseUrl = await startDisposableServer(argv);
  await waitForServer(opt.baseUrl);
  await silenceZones(opt.baseUrl);

  started = Date.now();
  issues = new IssueLog({ outDir: opt.outDir, sourceRoot: WEB_CLIENT });

  const browser = await chromium.launch({ headless: opt.headless });
  const context = await browser.newContext({
    viewport: opt.viewport,
    locale: argv.locale || 'fr-FR',
    reducedMotion: 'reduce',
  });
  await context.addInitScript(installProbe);
  const page = await context.newPage();

  crawler = new Crawler(page, issues, opt);
  opt.log(`\n▶ exploration de ${opt.baseUrl} (budget ${opt.maxActions} actions)\n`);
  await crawler.boot();
  await crawler.auditStartup();
  await crawler.run();

  await browser.close();

  const result = writeReport(false);

  // Publication : c'est le seul geste qui sorte de la machine, il ne se
  // declenche que si on l'a demande explicitement.
  if (argv.publish || argv['publish-dry-run']) {
    const repo = typeof argv.publish === 'string' ? argv.publish : null;
    opt.log('');
    await publishIssues({
      repo,
      repoClient: argv['repo-client'],
      repoServer: argv['repo-server'],
      issues: issues.all,
      meta: result.meta,
      minSeverity: argv['min-severity'] || 'medium',
      dryRun: !!argv['publish-dry-run'] || !repo,
      // Les noms d'appareils viennent du serveur lui-meme : c'est la liste
      // exacte de ce qu'il ne faut pas publier.
      scrub: createScrubber({
        deviceNames: await discoverDeviceNames(opt.baseUrl),
        extraNames: argv.redact ? String(argv.redact).split(',') : [],
      }),
      log: opt.log,
    });
  }

  process.exitCode = result.count > 0 ? 1 : 0;
} finally {
  // Meme en cas d'erreur inattendue, ce qui a ete trouve est conserve.
  writeReport(true);
  if (serverProcess) serverProcess.kill('SIGTERM');
}

// ---------------------------------------------------------------------------

/**
 * Lance un serveur Tune isole : port libre, copie de la base, `dist/` local.
 * Rien de ce que fait l'automate ne touche l'installation de l'utilisateur.
 */
async function startDisposableServer(args) {
  const serverRoot = resolve(args['server-root'] || resolve(WEB_CLIENT, '../../tune-server-rust'));
  const binary = join(serverRoot, 'target/release/tune-server');
  if (!existsSync(binary)) throw new Error(`binaire serveur introuvable : ${binary} (cargo build --release)`);

  const dist = join(WEB_CLIENT, 'dist');
  if (!existsSync(dist)) throw new Error(`${dist} absent — lancer \`npm run build\` dans le client web`);

  const sandbox = mkdtempSync(join(tmpdir(), 'tune-crawl-'));
  const db = join(sandbox, 'crawl.db');
  const source = args.db || join(process.env.HOME, 'Library/Application Support/Tune/tune.db');
  if (existsSync(source)) copyFileSync(source, db);
  else opt.log(`! base source absente (${source}) — le serveur partira d'une base vide`);

  const port = Number(args.port || (await freePort()));
  opt.log(`· serveur jetable : port ${port}, base ${db}`);

  serverProcess = spawn(binary, [], {
    cwd: serverRoot,
    env: { ...process.env, TUNE_PORT: String(port), TUNE_DB_PATH: db, TUNE_WEB_DIR: dist },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) opt.log(`! le serveur s'est arrete (code ${code})`);
  });

  return `http://127.0.0.1:${port}`;
}

async function freePort() {
  const net = await import('node:net');
  return new Promise((res, rej) => {
    const srv = net.createServer();
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

async function waitForServer(baseUrl, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/api/v1/library/albums?limit=1`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return;
    } catch { /* pas encore pret */ }
    await sleep(400);
  }
  throw new Error(`aucune reponse de ${baseUrl} apres ${timeoutMs / 1000} s`);
}

/**
 * Met toutes les zones a zero avant de commencer : l'automate va cliquer sur
 * des boutons « lecture », et personne ne veut que la machine se mette a jouer
 * de la musique pendant un passage de dix minutes.
 */
async function silenceZones(baseUrl) {
  try {
    const r = await fetch(`${baseUrl}/api/v1/zones`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return;
    const data = await r.json();
    const zones = Array.isArray(data) ? data : data.items || data.zones || [];
    for (const zone of zones) {
      await fetch(`${baseUrl}/api/v1/zones/${zone.id}/volume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume: 0 }),
      }).catch(() => {});
    }
    if (zones.length) opt.log(`· ${zones.length} zone(s) mises a volume 0`);
  } catch { /* pas de zones : rien a faire */ }
}

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}
