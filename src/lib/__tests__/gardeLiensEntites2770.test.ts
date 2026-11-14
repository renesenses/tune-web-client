// web#2770 — ÉTAPE 3 : la garde contre le retour des noms en texte brut.
//
// Dans les écrans convertis (lots 0, 1, 3, 4 du chantier rc12), un nom
// d'entité (artiste, album, station, année) ne se rend QUE par `LienEntite`.
// Un `{a.artist_name}` posé en NŒUD DE TEXTE du balisage est ce que
// l'inventaire du 10/11 notait ❌ : il redeviendra un lien mort au prochain
// écran recopié. La garde lit le balisage (script, style et commentaires
// retirés), trouve chaque moustache qui nomme l'expression surveillée, et
// refuse celles qui sont des nœuds de texte — une moustache dans un attribut
// (`title={a.artist_name}`) ou dans `<LienEntite entite={{ … }}>` est DANS
// une balise, et passe.
//
// Contre-épreuve : n'importe lequel de ces écrans remis à `origin/main`
// (avant le lot) fait rougir sa ligne.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const lire = (chemin: string) => readFileSync(new URL(`../../${chemin}`, import.meta.url), 'utf8');

/** Le balisage seul. */
function balisage(src: string): string {
  return src
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Le balisage où l'INTÉRIEUR de chaque moustache est blanchi (même longueur) :
 * un `=>` dans `onclick={() => …}` n'est pas un chevron de balise.
 */
function sansExpressions(b: string): string {
  let out = '';
  let prof = 0;
  for (const c of b) {
    if (c === '{') { prof++; out += c; continue; }
    if (c === '}') { prof = Math.max(0, prof - 1); out += c; continue; }
    out += prof > 0 ? ' ' : c;
  }
  return out;
}

/** Les moustaches de TEXTE qui nomment `expr` : « {a.artist_name ?? '' } » hors de toute balise. */
function noeudsDeTexte(src: string, expr: string): string[] {
  const b = balisage(src);
  const squelette = sansExpressions(b);
  const trouves: string[] = [];
  const re = /\{(?![#:/@])([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(b))) {
    if (!m[1].includes(expr)) continue;
    // Le dernier chevron avant la moustache dit où l'on est : `>` = texte.
    const avant = squelette.slice(0, m.index);
    const ouvrant = avant.lastIndexOf('<');
    const fermant = avant.lastIndexOf('>');
    if (fermant > ouvrant) trouves.push(m[0]);
  }
  return trouves;
}

/** Écran → expressions qui n'ont plus le droit d'être un nœud de texte. */
const ECRANS: Record<string, string[]> = {
  'components/partages/TransportBar.svelte': ['displayTrack.artist_name', 'displayTrack.album_title'],
  'components/v2/mini/MiniBarreLecture.svelte': ['piste.artist_name', 'piste.album_title'],
  'components/partages/NowPlaying.svelte': ['displayTrack.artist_name', 'nextTrack.artist_name', 'queueTrack.artist_name', 'm.artist_name'],
  'components/partages/CreditsEnLigne.svelte': ['m.artist_name'],
  'components/v2/LibraryV2.svelte': ['a.artist_name', 'albumYear(a)'],
  'components/v2/SearchV2.svelte': ['a.artist_name', 'pi.artist_name'],
  'components/v2/FavoritesV2.svelte': ['a.artist_name', 'r.name'],
  'components/v2/AjoutsRecentsV2.svelte': ['a.artist_name'],
  'components/v2/CoffretsV2.svelte': ['c.artist_name'],
  'components/v2/EcouterPlusTardV2.svelte': ['e.artiste'],
  'components/v2/DiscographieCommune.svelte': ['al.year'],
  'components/v2/RadiosV2.svelte': ['r.name'],
  'components/v2/RadioAnnuaire.svelte': ['f.name'],
  'components/v2/RadiosTrouvees.svelte': ['e.nom'],
};

describe('web#2770 — aucun nom d’entité en texte brut dans les écrans convertis', () => {
  for (const [chemin, exprs] of Object.entries(ECRANS)) {
    it(chemin, () => {
      const src = lire(chemin);
      expect(src, 'l’écran passe par le composant commun').toContain('<LienEntite ');
      for (const expr of exprs) {
        expect(noeudsDeTexte(src, expr), `${chemin} : « ${expr} » rendu hors de LienEntite`).toEqual([]);
      }
    });
  }

  it('la garde elle-même distingue un nœud de texte d’un attribut', () => {
    const src = `<p title={a.artist_name}>{a.artist_name ?? ''}</p><LienEntite entite={{ nom: a.artist_name }} />{#if a.artist_name}x{/if}`
      + `<Carte onLire={() => lire(a)}\n  nom={a.artist_name}>{a.artist_name}</Carte>`;
    expect(noeudsDeTexte(src, 'a.artist_name')).toEqual([`{a.artist_name ?? ''}`, `{a.artist_name}`]);
  });
});

describe('web#2770 — les gestes corrigés restent branchés', () => {
  it('Lecture en cours : un artiste par le nom se rapproche par ÉGALITÉ EXACTE, plus le premier résultat', () => {
    const src = lire('components/partages/NowPlaying.svelte');
    expect(src).toMatch(/artisteLocalParNom\(dest\.nom\)/);
    expect(src).not.toMatch(/searchLibrary\(dest\.nom\)\)\?\.artists\?\.\[0\]/);
  });
  it('accueil : le sous-titre d’un album est un lien (artisteDuSous), dans la bande ET dans « Vos tops »', () => {
    const src = lire('components/v2/PageWidgets.svelte');
    expect(src.match(/artiste: el\.artisteDuSous/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
  it('Recherche : le meilleur résultat « titre » et les playlists NAVIGUENT, la lecture reste au bouton', () => {
    const src = lire('components/v2/SearchV2.svelte');
    expect(src).toMatch(/onclick=\{\(\) => ouvrirPisteTrouvee\(pi\)\}/);
    expect(src).toMatch(/onclick=\{\(\) => ouvrirPlaylistTrouvee\(pl\)\}/);
    expect(src).toMatch(/class="plg lire" onclick=\{\(\) => lirePlaylist\(pl\)\}/);
  });
  it('radios : « ouvrir » n’est plus la lecture', () => {
    expect(lire('components/v2/RadiosV2.svelte')).not.toMatch(/onOuvrir=\{\(\) => play\(r\)\}/);
    expect(lire('components/v2/RadioAnnuaire.svelte')).not.toMatch(/onOuvrir=\{\(\) => ecouter\(f\)\}/);
    expect(lire('components/v2/RadiosTrouvees.svelte')).not.toMatch(/onOuvrir=\{\(\) => ecouter\(e\)\}/);
    expect(lire('components/v2/RadiosTrouvees.svelte')).toContain('<RadioFicheModale');
    expect(lire('components/v2/FavoritesV2.svelte')).toContain('<RadioFicheModale');
  });
});
