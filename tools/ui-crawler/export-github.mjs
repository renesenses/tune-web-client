#!/usr/bin/env node
/**
 * Republie un rapport deja ecrit sur un suivi d'issues GitHub.
 *
 * `run.mjs --publish <depot>` fait la meme chose a la fin d'une exploration ;
 * cette CLI sert a publier apres coup, ou a relire ce qui serait publie.
 *
 *   node export-github.mjs --dry-run
 *   node export-github.mjs --repo proprietaire/depot --min-severity high
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishIssues } from './src/publish.mjs';
import { createScrubber, discoverDeviceNames } from './src/scrub.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = parse(process.argv.slice(2));

const reportPath = resolve(HERE, argv.report || 'issues/report.json');
if (!existsSync(reportPath)) {
  console.error(`rapport introuvable : ${reportPath} — lancer d'abord \`node run.mjs --serve\``);
  process.exit(2);
}
const { meta, issues } = JSON.parse(readFileSync(reportPath, 'utf8'));

if (!argv.repo && !argv['repo-client'] && !argv['repo-server'] && !argv['dry-run']) {
  console.error('--repo <proprietaire/depot> est requis pour publier (ou --dry-run pour verifier)');
  process.exit(2);
}

// Le serveur du passage n'existe plus : les noms d'appareils sont repris du
// rapport lui-meme, et les regles generiques (IP, chemins, machine) suffisent
// pour le reste.
const scrub = createScrubber({
  deviceNames: [...new Set(
    JSON.stringify(issues).match(/[A-Z][\w-]*(?: [\w-]+){0,3}(?= (?:AirPlay|Cast|DLNA|UPNP))/g) || []
  )],
  extraNames: argv.redact ? String(argv.redact).split(',') : [],
});

await publishIssues({
  repo: argv.repo,
  repoClient: argv['repo-client'],
  repoServer: argv['repo-server'],
  issues,
  meta,
  minSeverity: argv['min-severity'] || 'medium',
  dryRun: !!argv['dry-run'] || !(argv.repo || argv['repo-client'] || argv['repo-server']),
  scrub,
});

function parse(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) continue;
    const key = args[i].slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; } else out[key] = true;
  }
  return out;
}
