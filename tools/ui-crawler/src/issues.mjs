/**
 * Journal d'issues.
 *
 * Une issue par defaut distinct (pas par occurrence) : l'empreinte calculee par
 * `detect.mjs` regroupe les repetitions, sinon un bug present sur 36 albums
 * produirait 36 issues et le rapport serait illisible.
 *
 * Sortie : `issues/ISSUE-XXX-slug.md` lisible tel quel, `issues/index.md` pour
 * la vue d'ensemble, `issues/report.json` pour l'outillage (export GitHub).
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { suggestSources } from './locate.mjs';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_LABEL = {
  critical: 'critique',
  high: 'majeure',
  medium: 'moyenne',
  low: 'mineure',
};

export class IssueLog {
  /**
   * @param {object} opts
   * @param {string} opts.outDir      dossier de sortie
   * @param {string} opts.sourceRoot  racine du client web (pour les pistes de code)
   * @param {boolean} opts.fresh      vider le dossier avant d'ecrire
   */
  constructor({ outDir, sourceRoot, fresh = true }) {
    this.outDir = outDir;
    this.shotDir = join(outDir, 'captures');
    this.sourceRoot = sourceRoot;
    this.issues = new Map(); // fingerprint -> issue
    this.counter = 0;
    if (fresh) rmSync(outDir, { recursive: true, force: true });
    mkdirSync(this.shotDir, { recursive: true });
  }

  get all() {
    return [...this.issues.values()].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id - b.id
    );
  }

  /**
   * Enregistre un constat. Renvoie l'issue creee, ou `null` si c'est une
   * repetition d'un defaut deja connu (le compteur d'occurrences est incremente).
   */
  record(finding, context) {
    const existing = this.issues.get(finding.fingerprint);
    if (existing) {
      existing.occurrences++;
      if (existing.alsoSeenIn.length < 6) {
        const where = `${context.view.hash || context.view.nav} — ${context.trail.at(-1) || 'chargement'}`;
        if (!existing.alsoSeenIn.includes(where)) existing.alsoSeenIn.push(where);
      }
      return null;
    }

    const issue = {
      id: ++this.counter,
      fingerprint: finding.fingerprint,
      severity: finding.severity,
      category: finding.category,
      title: finding.title,
      detail: finding.detail,
      stack: finding.stack || null,
      snippet: finding.snippet || null,
      view: finding.view,
      viewLabel: context.view.nav || context.view.heading || finding.view,
      trail: [...context.trail],
      action: context.action || null,
      call: finding.call || null,
      occurrences: 1,
      alsoSeenIn: [],
      screenshot: context.screenshot || null,
      sources: suggestSources(this.sourceRoot, finding),
      seenAt: new Date().toISOString(),
    };
    this.issues.set(finding.fingerprint, issue);
    return issue;
  }

  /** Nom de fichier reserve a une capture, avant de la prendre. */
  screenshotPath(id, slugSource) {
    return join(this.shotDir, `issue-${String(id).padStart(3, '0')}-${slug(slugSource)}.png`);
  }

  flush(meta) {
    const issues = this.all;
    for (const issue of issues) {
      writeFileSync(
        join(this.outDir, `ISSUE-${String(issue.id).padStart(3, '0')}-${slug(issue.title)}.md`),
        renderIssue(issue, meta)
      );
    }
    writeFileSync(join(this.outDir, 'index.md'), renderIndex(issues, meta));
    writeFileSync(
      join(this.outDir, 'report.json'),
      JSON.stringify({ meta, issues }, null, 2)
    );
    return { count: issues.length, dir: this.outDir };
  }
}

function renderIssue(issue, meta) {
  const lines = [];
  lines.push('---');
  lines.push(`id: ${issue.id}`);
  lines.push(`titre: ${JSON.stringify(issue.title)}`);
  lines.push(`severite: ${issue.severity}`);
  lines.push(`categorie: ${issue.category}`);
  lines.push(`vue: ${issue.view}`);
  lines.push(`empreinte: ${issue.fingerprint}`);
  lines.push(`occurrences: ${issue.occurrences}`);
  lines.push(`detecte_le: ${issue.seenAt}`);
  lines.push('---');
  lines.push('');
  lines.push(`# [${SEVERITY_LABEL[issue.severity]}] ${issue.title}`);
  lines.push('');
  lines.push(`**Vue** : ${issue.viewLabel} (\`${issue.view}\`)`);
  if (issue.occurrences > 1) {
    lines.push(`**Occurrences** : ${issue.occurrences}`);
    if (issue.alsoSeenIn.length) lines.push(`**Aussi observe** : ${issue.alsoSeenIn.join(' · ')}`);
  }
  lines.push('');

  lines.push('## Reproduction');
  lines.push('');
  lines.push(`1. Ouvrir \`${meta.baseUrl}\``);
  issue.trail.forEach((step, i) => lines.push(`${i + 2}. ${step}`));
  lines.push('');

  lines.push('## Constat');
  lines.push('');
  lines.push('```');
  lines.push(issue.detail || issue.title);
  lines.push('```');
  lines.push('');

  if (issue.call) {
    lines.push('## Requete correlee');
    lines.push('');
    lines.push('```http');
    lines.push(`${issue.call.method} ${issue.call.url}`);
    if (issue.call.requestBody) lines.push(`\n${issue.call.requestBody}`);
    lines.push('');
    lines.push(`→ ${issue.call.failed ? 'echec reseau' : issue.call.status} ${issue.call.contentType || ''} (${issue.call.bodyLength} octets, ${issue.call.durationMs} ms)`);
    if (issue.call.bodyPreview) lines.push(issue.call.bodyPreview);
    lines.push('```');
    lines.push('');
  }

  if (issue.stack) {
    lines.push('## Pile d\'appel');
    lines.push('');
    lines.push('```');
    lines.push(issue.stack);
    lines.push('```');
    lines.push('');
  }

  if (issue.snippet) {
    lines.push('## Element concerne');
    lines.push('');
    lines.push('```html');
    lines.push(issue.snippet);
    lines.push('```');
    lines.push('');
  }

  if (issue.sources.length) {
    lines.push('## Pistes dans le code');
    lines.push('');
    for (const src of issue.sources) lines.push(`- \`${src}\``);
    lines.push('');
  }

  if (issue.screenshot) {
    lines.push('## Capture');
    lines.push('');
    lines.push(`![capture](${issue.screenshot.replace(/^.*\/issues\//, '')})`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`_Detecte par tune-ui-crawler — passage ${meta.runId}, ${meta.actions} actions sur ${meta.views} vues._`);
  lines.push('');
  return lines.join('\n');
}

function renderIndex(issues, meta) {
  const lines = [];
  lines.push('# Rapport d\'exploration autonome de l\'UI Tune');
  lines.push('');
  lines.push(`- Passage : \`${meta.runId}\``);
  lines.push(`- Cible : ${meta.baseUrl}`);
  lines.push(`- Duree : ${Math.round(meta.durationMs / 1000)} s — ${meta.actions} actions sur ${meta.views} vues${meta.interrupted ? ' (exploration interrompue avant la fin du budget)' : ''}`);
  lines.push(`- Defauts distincts : **${issues.length}**`);
  lines.push('');

  const bySeverity = {};
  for (const i of issues) bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;
  lines.push(
    ['critical', 'high', 'medium', 'low']
      .filter((s) => bySeverity[s])
      .map((s) => `**${bySeverity[s]}** ${SEVERITY_LABEL[s]}${bySeverity[s] > 1 ? 's' : ''}`)
      .join(' · ') || 'Aucun defaut detecte.'
  );
  lines.push('');
  lines.push('| # | Severite | Vue | Defaut | Occ. |');
  lines.push('|---|----------|-----|--------|------|');
  for (const i of issues) {
    const file = `ISSUE-${String(i.id).padStart(3, '0')}-${slug(i.title)}.md`;
    lines.push(`| [${i.id}](${file}) | ${SEVERITY_LABEL[i.severity]} | \`${i.view}\` | ${escapePipe(i.title)} | ${i.occurrences} |`);
  }
  lines.push('');

  if (meta.skipped?.length) {
    lines.push('## Non explore');
    lines.push('');
    lines.push('Ces controles ont ete ecartes volontairement (effet hors bac a sable) :');
    lines.push('');
    for (const s of meta.skipped.slice(0, 30)) lines.push(`- ${s}`);
    if (meta.skipped.length > 30) lines.push(`- … et ${meta.skipped.length - 30} autres`);
    lines.push('');
  }

  return lines.join('\n');
}

function escapePipe(text) {
  return String(text).replace(/\|/g, '\\|').slice(0, 140);
}

function slug(text) {
  return String(text)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'issue';
}
