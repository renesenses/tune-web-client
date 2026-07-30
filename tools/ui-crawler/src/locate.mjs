/**
 * Rattache un constat au code source.
 *
 * Une issue qui dit « erreur en notant un album » fait perdre dix minutes de
 * recherche ; une issue qui pointe `src/lib/api.ts:2355` et le composant qui
 * appelle la fonction se corrige tout de suite. On fait donc, au moment
 * d'ecrire l'issue, une recherche best-effort dans les sources.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

let cache = null;

function loadSources(root) {
  if (cache && cache.root === root) return cache.files;
  const files = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
      const full = join(dir, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full);
      else if (/\.(svelte|ts|js)$/.test(name) && st.size < 2_000_000) {
        try { files.push({ path: full, text: readFileSync(full, 'utf8') }); } catch { /* illisible */ }
      }
    }
  };
  walk(join(root, 'src'));
  cache = { root, files };
  return files;
}

/** Cherche `needle` dans les sources, renvoie `chemin:ligne` (max `limit`). */
export function grepSources(root, needle, limit = 3) {
  if (!needle) return [];
  const files = loadSources(root);
  const hits = [];
  for (const file of files) {
    const idx = file.text.indexOf(needle);
    if (idx === -1) continue;
    const line = file.text.slice(0, idx).split('\n').length;
    hits.push(`${relative(root, file.path)}:${line}`);
    if (hits.length >= limit) break;
  }
  return hits;
}

/**
 * Pistes de correction pour un constat : le point d'appel API, puis les
 * composants qui utilisent la fonction correspondante.
 */
export function suggestSources(root, finding) {
  const pistes = [];

  if (finding.call && finding.call.url) {
    // `/api/v1/library/albums/52/rate` → on cherche le gabarit `/rate` dans api.ts,
    // les identifiants numeriques etant interpoles cote client.
    const path = safePath(finding.call.url);
    const tail = path.split('/').filter((s) => s && !/^\d+$/.test(s)).slice(-2);
    for (const fragment of [`/${tail.join('/')}`, `/${tail[tail.length - 1]}`]) {
      const hits = grepSources(root, fragment + '`', 2).concat(grepSources(root, fragment + "'", 1));
      for (const hit of hits) if (!pistes.includes(hit)) pistes.push(hit);
      if (pistes.length) break;
    }
  }

  // Un toast passe par une cle i18n : retrouver la cle mene au composant.
  const quoted = /« ([^»]{3,60}) »/.exec(finding.title || '');
  if (quoted) {
    for (const hit of grepSources(root, quoted[1], 2)) {
      if (!pistes.includes(hit)) pistes.push(hit);
    }
  }

  if (finding.category === 'i18n-key-visible' && finding.detail) {
    const key = finding.detail.split('.').pop();
    for (const hit of grepSources(root, `${key}:`, 2)) if (!pistes.includes(hit)) pistes.push(hit);
  }

  return pistes.slice(0, 4);
}

function safePath(url) {
  try { return new URL(url, 'http://x').pathname; } catch { return String(url); }
}
