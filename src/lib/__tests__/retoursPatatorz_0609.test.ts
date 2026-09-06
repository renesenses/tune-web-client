/**
 * Les six rapports de Patatorz du 06/09/2026 (TuneOS 0.9.138, interface v1).
 *
 * Ce fichier tient les quatre qui sont CÔTÉ CLIENT et que j'ai pu prouver
 * contre le serveur de Bertrand le même jour. Les deux autres — l'activation
 * du greffon Bandcamp (fil 1682) et l'avatar (fil 1681) — ne se corrigent pas
 * ici, et une garde qui prétendrait le contraire mentirait.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lire = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');
function sansCommentaires(src: string): string {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('fil 1686 — la première lettre ne s’efface pas', () => {
  const src = sansCommentaires(lire('src/components/v2/SearchV2.svelte'));

  it('la reprise se fait à L’INITIALISATION, pas dans un effet', () => {
    // 🔴 Le cœur du défaut. L'effet lisait `q` (dans `!q`) et le RÉÉCRIVAIT
    // depuis le magasin dès qu'il devenait vide : effacer le dernier
    // caractère le faisait revenir aussitôt.
    expect(src).toMatch(/let q = \$state\(get\(currentSearchCriteria\)\?\.q \?\? ''\)/);
    expect(src, "l'effet de reprise ne doit plus exister").not.toMatch(
      /if \(fige\?\.q && !q\) q = fige\.q/,
    );
  });

  it('un seul effet touche encore au critère, et il ÉCRIT', () => {
    const effets = src.match(/\$effect\(\(\) => \{[\s\S]{0,200}?currentSearchCriteria[\s\S]{0,200}?\}\);/g) ?? [];
    expect(effets, 'plus aucun effet ne doit LIRE le critère').toHaveLength(0);
    expect(src).toContain("setSearchCriteria(q.trim() ? { q } : null)");
  });

  it('la croix existe, et elle est nommée', () => {
    // `type="search"` en pose une sous WebKit, aucune sous Firefox — et
    // Patatorz est sous Linux.
    expect(src).toContain('class="vider"');
    expect(src).toContain("onclick={() => (q = '')}");
    expect(src).toContain("aria-label={$t('common.clear' as any)}");
  });

  it("elle n'apparaît que s'il y a quelque chose à effacer", () => {
    const i = src.indexOf('class="vider"');
    expect(src.slice(Math.max(0, i - 200), i)).toContain('{#if q}');
  });
});

describe('fil 1680 — les répertoires ajoutés n’apparaissent pas', () => {
  const src = sansCommentaires(lire('src/lib/api.ts'));

  it('la réponse du serveur est TRADUITE au bord', () => {
    // Mesuré sur le .18 : GET /system/music-dirs → {"dirs":[…]}, et les deux
    // handlers d'écriture rendent `Json(json!({ "dirs": dirs }))`. Le client
    // lisait `music_dirs`, donc toujours `undefined` : la liste ne bougeait
    // pas et il fallait F5.
    expect(src).toMatch(/function listeDossiers\(r: any\): string\[\]/);
    expect(src).toMatch(/r\?\.dirs \?\? r\?\.music_dirs/);
  });

  it.each(['addMusicDir', 'removeMusicDir'])('%s rend la liste normalisée', (fn) => {
    const i = src.indexOf(`export async function ${fn}(`);
    expect(i, `${fn} doit être asynchrone pour normaliser`).toBeGreaterThan(-1);
    expect(src.slice(i, i + 400)).toContain('music_dirs: listeDossiers(r)');
  });

  it("le reste du corps est CONSERVÉ", () => {
    // `purge_refused` et le compte d'orphelines voyagent dans la même
    // réponse : les jeter en normalisant ferait disparaître un refus de purge.
    const i = src.indexOf('export async function removeMusicDir(');
    expect(src.slice(i, i + 400)).toContain('...r,');
  });
});

describe('fil 1683 — la facette Dynamic Range ne filtre rien', () => {
  const api = sansCommentaires(lire('src/lib/api.ts'));
  const oxy = sansCommentaires(lire('src/components/OxygenView.svelte'));

  /** La liste blanche des paramètres réellement envoyés à /library/tracks. */
  function listeBlanche(): string[] {
    // On ancre sur `'folder'`, la première clé de la liste : le retrait des
    // commentaires laisse des lignes vides, et coller à la ligne qui précède
    // rendrait la garde fragile au moindre commentaire ajouté au-dessus.
    const i = api.indexOf("for (const key of [");
    expect(i, 'la liste blanche des paramètres a changé de forme').toBeGreaterThan(-1);
    const bloc = api.slice(i, api.indexOf('] as const)', i));
    expect(bloc).toContain("'folder'");
    return [...bloc.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  }

  it('`dr` en fait partie', () => {
    expect(listeBlanche()).toContain('dr');
  });

  it('🔴 la liste blanche couvre TOUTE la carte de facettes d’Oxygen', () => {
    // La garde qui compte. Une facette présente dans le rail et absente de la
    // liste blanche se coche sans rien filtrer — le défaut exact du Dynamic
    // Range, ajouté au rail à la révision 4 et jamais branché.
    const i = oxy.indexOf('const FACET_PARAM: Record<string, string> = {');
    const carte = oxy.slice(i, oxy.indexOf('};', i));
    const params = [...carte.matchAll(/:\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(params.length).toBeGreaterThan(15);
    const blanche = new Set(listeBlanche());
    const oubliees = params.filter((p) => !blanche.has(p));
    expect(oubliees, `facette(s) affichée(s) mais jamais envoyée(s) : ${oubliees.join(', ')}`)
      .toEqual([]);
  });

  it('`dr` part en NOMBRE, comme le serveur l’attend', () => {
    expect(oxy).toMatch(/NUMERIC_FACETS = new Set\(\[[^\]]*'dr'/);
  });
});
