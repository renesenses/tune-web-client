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

describe('fil 1637 + Bertrand — un répertoire ouvert dans la Bibliothèque', () => {
  const v2 = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));

  it('la v2 CONSOMME enfin `pendingLibraryFolder`', () => {
    // 🔴 Dixième « écrit mais pas branché » : `BrowseView` posait la portée et
    // le seul consommateur était `LibraryView`, l'écran de l'ANCIEN client.
    // « c'est l'entièreté de la bibliothèque en cours qui s'affiche »
    // (Sevy Tabroc, forum 1637) — même défaut que « Répertoires vue en
    // Bibliothèque : filtre non appliqué » (Bertrand, 06/09).
    expect(v2).toContain('pendingLibraryFolder');
    // 🔴 L'APPEL, pas la définition. Une première version de cette garde
    // vérifiait que la fonction existait : remplacer son appel par `null`
    // laissait la garde verte et la portée morte. Un test qui réplique le
    // code ne le garde pas.
    expect(v2).toMatch(/const dossierPortee = prendreDossierEnAttente\(\);/);
    expect(v2).toMatch(/function prendreDossierEnAttente\(\): string \| null/);
    // Une seule fois : la portée ne doit pas se réappliquer à chaque retour.
    expect(v2).toMatch(/pendingLibraryFolder\.set\(null\); return d;/);
    // Et elle doit vraiment ATTEINDRE la source d'albums.
    expect(v2).toMatch(/porteeActive = \$state\(!!dossierPortee\)/);
  });

  it('elle filtre par IDENTIFIANTS, sans toucher au magasin partagé', () => {
    // L'ancien client refait les albums depuis 5 000 pistes et ÉCRASE
    // `albums` : la portée survivait à l'écran qui l'avait posée.
    expect(v2).toContain('api.getAlbumsDetailed({ folder: dossierPortee }');
    expect(v2).toMatch(/\$albums\.filter\(\(a\) => a\.id != null && idsPortee!\.has\(a\.id\)\)/);
    const i = v2.indexOf('const src = $derived<Album[]>');
    expect(v2.slice(i, i + 400), 'le magasin ne doit jamais être réécrit').not.toMatch(/albums\.set\(/);
  });

  it("elle n'affiche pas TOUT pendant qu'elle charge la portée", () => {
    // Montrer la bibliothèque entière une fraction de seconde, c'est rejouer
    // le défaut qu'on corrige.
    expect(v2).toMatch(/idsPortee == null \? \[\]/);
    expect(v2).toMatch(/\(porteeActive && idsPortee == null\) \|\| \$libraryLoading/);
  });

  it('la portée se VOIT et se RETIRE', () => {
    // Une bibliothèque amputée sans explication est le défaut inverse.
    expect(v2).toContain("$tr('v2.lib.scopedFolder' as any)");
    expect(v2).toContain('onclick={retirerPortee}');
    expect(v2).toMatch(/function retirerPortee\(\)[\s\S]{0,120}idsPortee = null/);
  });
});

describe('fil 1647 — le périmètre de la recherche', () => {
  const api = sansCommentaires(lire('src/lib/api.ts'));

  it('les QUATRE familles reçoivent le tampon de source', () => {
    // Mesuré sur le .18 : `/search?q=miles` ne porte `source` sur AUCUNE
    // famille. Le client n'en tamponnait que deux ; artistes et playlists
    // passaient donc pour locaux.
    const i = api.indexOf('for (const fam of [');
    expect(i, 'le tampon de source a changé de forme').toBeGreaterThan(-1);
    const bloc = api.slice(i, i + 300);
    for (const f of ['tracks', 'albums', 'artists', 'playlists'])
      expect(bloc, `${f} n'est pas tamponné`).toContain(`'${f}'`);
    expect(bloc).toContain("if (x && !x.source) x.source = key;");
  });

  it('un artiste de service ne peut plus passer pour LOCAL', () => {
    // `estLocal` vaut `(x.source ?? 'local') === 'local' && x.id != null`.
    // Sans tampon, un artiste Qobuz `{id: "6760"}` était LOCAL : l'écran lui
    // offrait le cœur, les étiquettes et l'édition de la bibliothèque, et le
    // cœur écrivait `artist_id: "6760"` dans la table des favoris locaux.
    const sv = sansCommentaires(lire('src/components/v2/SearchV2.svelte'));
    expect(sv).toContain("const estLocal = (x: any) => (x?.source ?? 'local') === 'local' && x?.id != null;");
    expect(sv).toContain('favori={estLocal(ar) ? { artistId: ar.id! } : null}');
  });
});
