/**
 * Les retours de Fabien sur la v0.9.140 (07/09/2026).
 *
 * Ce fichier tient les quatre qui sont côté client et que j'ai pu prouver en
 * lisant le code ou en mesurant contre le .18.
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

describe('« Label "File d\'attente" du menu absent »', () => {
  const barre = () => sansCommentaires(lire('src/components/v2/Sidebar.svelte'));

  it('l’entrée porte une CLÉ, comme toutes les autres', () => {
    // 🔴 Ma régression. La conversion de la barre en clés lisait
    // `label: (['"])([^'"]+)\1` : l'apostrophe DANS des guillemets doubles a
    // fait échouer l'appariement sur cette seule ligne. Le rendu appelle
    // `$t(it.labelKey)`, et `labelKey` était indéfini — l'entrée s'affichait
    // SANS libellé.
    expect(barre()).toContain("{ view: 'queue', labelKey: 'nav.queue',");
  });

  it('🔴 plus AUCUNE entrée de navigation ne porte de libellé littéral', () => {
    // Ni la garde des mots — « File d'attente » n'a ni accent ni article — ni
    // `check-i18n` ne pouvaient voir ce trou. C'est la FORME qu'on interdit.
    for (const f of ['Sidebar', 'ShellV2']) {
      const src = sansCommentaires(lire(`src/components/v2/${f}.svelte`));
      expect(/\blabel:\s*['"]/.test(src), `${f} porte encore un label littéral`).toBe(false);
    }
  });
});

describe('les onglets du Streaming étaient en dur', () => {
  it('les quatre passent par une clé', () => {
    // « Genres », « Ma collection », « Playlists », « Favoris » : aucun accent,
    // aucun article, donc invisibles pour la garde des mots. Trouvés en
    // cherchant d'autres rescapés du même remplacement raté.
    const src = sansCommentaires(lire('src/components/v2/StreamingV2.svelte'));
    for (const cle of ['common.genres', 'v2.str.myCollection', 'v2.nav.playlists', 'v2.nav.favorites'])
      expect(src, `${cle} manque`).toContain(cle);
  });
});

describe('« les hyperliens de l’album renvoient vers la page d’accueil »', () => {
  it('🔴 TREIZIÈME « écrit mais pas branché »', () => {
    // `NowPlaying` posait `selectedAlbum`, lu par DOUZE composants de l'ancien
    // client et par AUCUN de la v2 : le clic changeait d'écran sans rien
    // ouvrir. Le nouveau contrat suit la forme de `pendingLibraryFolder`.
    const np = sansCommentaires(lire('src/components/NowPlaying.svelte'));
    expect(np).toContain('pendingLibraryAlbum.set(albumId)');
    // L'ancien contrat reste alimenté : l'ancienne coquille en dépend.
    expect(np).toContain('selectedAlbum.set(');
  });

  it('la Bibliothèque v2 le CONSOMME, une seule fois', () => {
    const lib = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));
    expect(lib).toContain('const id = get(pendingLibraryAlbum);');
    // Le laisser dans le magasin rouvrirait la fiche à chaque retour.
    expect(lib).toContain('pendingLibraryAlbum.set(null);');
  });

  it('un album hors du magasin est demandé au SERVEUR', () => {
    // Une piste de service, ou une bibliothèque encore en cours de
    // chargement : abandonner en silence rejouerait le défaut signalé.
    const lib = sansCommentaires(lire('src/components/v2/LibraryV2.svelte'));
    expect(lib).toMatch(/api\.getAlbum\(id\)\.then\(\(a\) => \{ if \(a\) opened = a; \}\)/);
  });
});

describe('« si on reclique ça fait planter l’appli » (podcasts)', () => {
  const pod = () => sansCommentaires(lire('src/components/v2/PodcastsV2.svelte'));

  it('🔴 on n’invente plus d’entrée SANS identifiant', () => {
    // C'était le premier maillon : `{ id: null, … }` rangé localement, puis
    // `existing?.id != null` FAUX au second clic, donc réabonnement, donc deux
    // entrées du même flux — et la liste est clé par `p.id ?? feedOf(p)`.
    // Deux clés identiques arrêtent Svelte sur `each_key_duplicate`.
    expect(pod(), 'une entrée sans id est encore fabriquée')
      .not.toMatch(/\{ id: null, title: title\(p\)/);
    expect(pod()).toMatch(/if \(created\?\.id != null\)/);
  });

  it('la liste est relue au SERVEUR quand la réponse ne dit rien', () => {
    expect(pod().match(/subs = \(await api\.getPodcastSubscriptions\(\)\) \?\? \[\];/g) ?? [])
      .toHaveLength(2);
  });

  it('un flux DÉJÀ listé n’est jamais rangé deux fois', () => {
    expect(pod()).toMatch(/subs\.some\(\(s\) => feedOf\(s\) === feed\) \? subs : \[\.\.\.subs, created\]/);
  });

  it('un double clic rapide ne lance pas deux abonnements', () => {
    // Deux appels partis avant la première réponse produiraient le même
    // doublon par un autre chemin.
    expect(pod()).toContain('if (!feed || basculeEnCours) return;');
    expect(pod()).toContain('basculeEnCours = true;');
    expect(pod()).toMatch(/finally \{\s*basculeEnCours = false;/);
  });

  it('la clé de repli reste le FLUX, et c’est ce qui rendait le doublon fatal', () => {
    expect(pod()).toContain('{#each visibleSubs as p (p.id ?? feedOf(p))}');
  });
});
