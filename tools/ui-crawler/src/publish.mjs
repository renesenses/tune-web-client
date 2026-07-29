/**
 * Ouverture des issues sur GitHub.
 *
 * Deux appelants : `run.mjs --publish <depot>` (l'automate publie lui-meme a la
 * fin d'un passage) et `export-github.mjs` (republier un rapport deja ecrit).
 * Un seul chemin de code, donc un seul endroit ou verifier l'anonymisation et
 * la protection contre les doublons.
 *
 * Doublons : chaque issue porte son empreinte en pied de corps. Un passage
 * suivant retrouve les siennes et commente au lieu d'en creer une deuxieme.
 * Une issue fermee reste reconnue — l'automate ne rouvre pas ce qu'un humain a
 * decide de clore, il signale simplement que le defaut est encore la.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { scrubDeep } from './scrub.mjs';

const run = promisify(execFile);
const RANK = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Defauts dont la cause est dans la reponse du serveur : code d'etat inattendu,
 * ou contrat rompu (un 2xx sans corps la ou le client attend du JSON). Les
 * ouvrir sur le depot du client web ferait perdre un aller-retour a chaque fois.
 */
const SERVER_SIDE = new Set([
  'http-4xx', 'http-5xx', 'network-failure', 'false-error-empty-body',
]);

/** Depot destinataire d'un constat, quand les deux sont renseignes. */
export function routeIssue(issue, { client, server }) {
  if (!server) return client;
  if (!client) return server;
  return SERVER_SIDE.has(issue.category) ? server : client;
}

/**
 * @param {object} opts
 * @param {string} opts.repo         « proprietaire/depot »
 * @param {object[]} opts.issues     issues du rapport
 * @param {object} opts.meta         entete du passage
 * @param {string} opts.minSeverity  plancher de publication
 * @param {boolean} opts.dryRun      afficher sans rien creer
 * @param {Function} opts.scrub      anonymiseur applique a tout texte publie
 * @param {Function} opts.log
 */
export async function publishIssues({
  repo, repoClient, repoServer, issues, meta,
  minSeverity = 'medium', dryRun = false, scrub = (s) => s, log = console.log,
}) {
  const targets = { client: repoClient || repo, server: repoServer || null };
  const floor = RANK[minSeverity] ?? RANK.medium;
  const selected = issues
    .filter((i) => RANK[i.severity] <= floor)
    .map((i) => scrubDeep(i, scrub));
  const safeMeta = scrubDeep(meta, scrub);

  log(`${selected.length} issue(s) de severite >= ${minSeverity} sur ${issues.length}`);
  if (!selected.length) return { created: [], updated: [], skipped: [] };

  if (dryRun) {
    for (const issue of selected) {
      log(`\n──────────────────────────────────────── → ${routeIssue(issue, targets) || '<depot non precise>'}`);
      log(`TITRE : ${title(issue)}`);
      log(body(issue, safeMeta, targets));
    }
    log(`\n(simulation — aucune issue creee)`);
    return { created: [], updated: [], skipped: selected.map(title) };
  }

  if (!targets.client && !targets.server) {
    throw new Error('depot manquant : --publish <proprietaire/depot>');
  }

  // Une liste d'issues existantes par depot : c'est elle qui evite de rouvrir
  // dix fois le meme defaut au fil des passages.
  const known = new Map();
  for (const target of new Set(Object.values(targets).filter(Boolean))) {
    known.set(target, await fetchExisting(target));
  }

  const created = [], updated = [];
  for (const issue of selected) {
    const target = routeIssue(issue, targets);
    const existing = known.get(target).get(issue.fingerprint);
    if (existing) {
      await run('gh', ['issue', 'comment', String(existing), '--repo', target, '--body',
        `Toujours present au passage \`${safeMeta.runId}\` de l'automate (${issue.occurrences} occurrence(s)).`]);
      updated.push(`${target}#${existing}`);
      log(`↻ ${target}#${existing} — ${title(issue)}`);
      continue;
    }
    const { stdout } = await run('gh', [
      'issue', 'create', '--repo', target,
      '--title', title(issue),
      '--body', body(issue, safeMeta, targets),
    ]);
    const url = stdout.trim();
    created.push(url);
    log(`+ ${url} — ${title(issue)}`);
  }

  return { created, updated, skipped: [] };
}

function title(issue) {
  return `[UI] ${issue.title}`.slice(0, 250);
}

function body(issue, meta, targets = {}) {
  const parts = [];
  parts.push(`**Severite** : ${issue.severity} · **Vue** : \`${issue.view}\` · **Occurrences** : ${issue.occurrences}`);
  parts.push('');
  parts.push('### Reproduction');
  parts.push('1. Ouvrir l\'application');
  issue.trail.forEach((step, i) => parts.push(`${i + 2}. ${step}`));
  parts.push('');
  parts.push('### Constat');
  parts.push('```');
  parts.push(issue.detail || issue.title);
  parts.push('```');

  if (issue.call) {
    parts.push('### Requete correlee');
    parts.push('```http');
    parts.push(`${issue.call.method} ${issue.call.url}`);
    if (issue.call.requestBody) parts.push(issue.call.requestBody);
    parts.push(`→ ${issue.call.failed ? 'echec reseau' : issue.call.status} (${issue.call.bodyLength} octets)`);
    if (issue.call.bodyPreview) parts.push(issue.call.bodyPreview);
    parts.push('```');
  }

  if (issue.stack) {
    parts.push('### Pile d\'appel');
    parts.push('```');
    parts.push(issue.stack);
    parts.push('```');
  }

  if (issue.sources?.length) {
    // Les pistes sont toujours cherchees dans le client web. Sur une issue
    // ouverte cote serveur, le preciser evite de chercher `api.ts` dans le
    // depot Rust.
    const where = targets.client && routeIssue(issue, targets) !== targets.client
      ? ` (depot \`${targets.client}\`)`
      : '';
    parts.push(`### Pistes dans le code${where}`);
    for (const src of issue.sources) parts.push(`- \`${src}\``);
  }

  parts.push('');
  parts.push('<sub>Ouverte automatiquement par tune-ui-crawler. Les noms d\'appareils, adresses ' +
    'locales et chemins personnels sont remplaces par des marqueurs ; le rapport complet reste ' +
    'sur la machine qui a lance l\'exploration.</sub>');
  parts.push(`<sub>tune-ui-crawler:${issue.fingerprint} — passage ${meta.runId}</sub>`);
  return parts.join('\n');
}

/** Empreintes deja publiees, lues dans le pied de corps des issues du depot. */
async function fetchExisting(repo, log) {
  const map = new Map();
  try {
    const { stdout } = await run('gh', ['issue', 'list', '--repo', repo, '--state', 'all',
      '--limit', '500', '--json', 'number,body']);
    for (const issue of JSON.parse(stdout)) {
      const match = /tune-ui-crawler:([0-9a-f]{8})/.exec(issue.body || '');
      if (match) map.set(match[1], issue.number);
    }
  } catch (e) {
    // Publier sans cette liste creerait des doublons a chaque passage : mieux
    // vaut s'arreter et laisser corriger l'acces.
    throw new Error(`impossible de lister les issues de ${repo} (${e.message.split('\n')[0]}) — ` +
      'publication interrompue pour ne pas creer de doublons');
  }
  return map;
}
