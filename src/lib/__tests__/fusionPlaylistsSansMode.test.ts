import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * La fusion de playlists, sans mode préalable (Bertrand + maquette Levente,
 * 20/09/2026).
 *
 * Bertrand : « il me semble que la fusion ne marche pas ! » Elle marchait —
 * mais elle était derrière un MODE : un bouton « Fusionner » basculait
 * l'écran, et seulement alors les cases apparaissaient. Personne ne trouvait
 * la porte. On sélectionne désormais d'abord, la barre apparaît ensuite.
 */
const ECRAN = readFileSync(
  resolve(process.cwd(), 'src/components/v2-heritage/PlaylistManagerView.svelte'),
  'utf8',
);
const sansCommentaires = ECRAN
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('#playlists — fusionner sans mode', () => {
  it('🔴 le MODE a disparu : plus de bouton à découvrir avant de cocher', () => {
    expect(sansCommentaires).not.toContain('merge-toggle-btn');
    expect(sansCommentaires).not.toContain('mergeMode');
  });

  it('la barre de fusion s’affiche dès UNE sélection, et dit pourquoi elle attend', () => {
    // Elle apparaît à un, sinon rien ne signale qu'on a coché ; et elle
    // explique qu'il en faut deux, au lieu de griser un bouton en silence.
    expect(sansCommentaires).toContain('{#if mergeSelected.size > 0}');
    expect(sansCommentaires).toContain('{#if mergeSelected.size < 2}');
    expect(sansCommentaires).toContain('playlistManager.selectAtLeastTwo');
  });

  it('🔴 l’identifiant n’est plus AMPUTÉ par un split à deux arguments', () => {
    // `'a:b:c'.split(':', 2)` rend ['a','b'] : le second argument TRONQUE le
    // tableau, il ne rejoint pas le reste. Tout identifiant portant un
    // deux-points partait coupé.
    expect(sansCommentaires).not.toMatch(/split\(':',\s*2\)/);
    expect(sansCommentaires).toContain('function cleService');
    expect(sansCommentaires).toContain('function cleIdentifiant');
  });

  it('la sélection est confinée à UN service, gardée dans la fonction', () => {
    // Un bouton `disabled` arrête la souris, pas un appel : la règle doit
    // vivre dans `toggleMergeSelect`, pas seulement dans le balisage.
    const i = sansCommentaires.indexOf('function toggleMergeSelect');
    expect(i).toBeGreaterThan(-1);
    const corps = sansCommentaires.slice(i, sansCommentaires.indexOf('\n  }', i));
    expect(corps).toContain('serviceVerrouille !== null && serviceVerrouille !== service');
    expect(corps).toContain('return;');
  });

  it('la fusion atterrit dans le service de la sélection', () => {
    // « Au même endroit » : la sélection étant confinée à un service, c'est
    // lui la cible. Un seul état pour les deux règles.
    expect(sansCommentaires).toContain('target_service: serviceVerrouille');
  });

  it('les cartes des autres services deviennent inertes, pas invisibles', () => {
    // Les cacher ferait croire à un filtre ; les estomper dit « pas celles-là ».
    expect(sansCommentaires).toContain('class:inerte');
    expect(sansCommentaires).toContain('playlistManager.sameServiceOnly');
  });

  it('la grille a remplacé la liste', () => {
    expect(sansCommentaires).toContain('class="pl-grille"');
    expect(sansCommentaires).not.toContain('class="playlist-list"');
  });

  it('🔴 les CINQ appels à l’action sont sur CHAQUE pochette, service compris', () => {
    // Bertrand, 21/09/2026 : « je veux les 5 sur chaque cover de playlist ».
    // Ils avaient d'abord été réservés au local, sur sa demande précédente —
    // et l'écran filtré sur Qobuz devenait inerte, ce qu'il a vu tout de suite.
    //
    // Mesuré avant d'écrire : une playlist de SERVICE s'étiquette
    // (POST /tags/{id}/streaming-items → 201), se met en favori
    // (`ServiceFavType` porte « playlists »), se lit
    // (`playStreamingPlaylist`) et se sélectionne (la fusion prend
    // {service, playlist_id}).
    const i = sansCommentaires.indexOf('class="pl-grille"');
    const carte = sansCommentaires.slice(i, sansCommentaires.indexOf('{/each}', i));
    for (const cta of ['class="pl-coin-hg"', 'class="pl-coin-hd"', 'class="pl-coin"',
                       'class="pl-coin-bd"', 'class="pl-lire"']) {
      expect(carte, `${cta} absent`).toContain(cta);
    }
    // 🔴 Et aucun des cinq n'est enfermé dans la garde « locale ».
    //
    // Cette garde EXISTE encore plus bas, à juste titre : partager et
    // supprimer n'ont pas de sens sur une playlist qui vit chez un service.
    // Les cinq appels doivent donc tous la PRÉCÉDER — ils vivent dans la
    // vignette, elle vient après.
    const garde = carte.indexOf("item.type === 'local' && item.local?.id");
    expect(garde, 'la garde locale a disparu : le test ne garde plus rien').toBeGreaterThan(-1);
    for (const cta of ['class="pl-coin-hg"', 'class="pl-coin-hd"', 'class="pl-coin"',
                       'class="pl-coin-bd"', 'class="pl-lire"']) {
      expect(carte.indexOf(cta), `${cta} de nouveau réservé au local`).toBeLessThan(garde);
    }
  });

  it('chaque appel réutilise ce qui existe, sans redessiner un sélecteur', () => {
    // Le cœur et les étiquettes reçoivent une cible CONSTRUITE selon le type
    // de la carte : identifiant de bibliothèque pour une locale, paire
    // source + identifiant pour une playlist de service.
    expect(sansCommentaires).toContain('<HeartButton {...favoriDe(item)}');
    expect(sansCommentaires).toContain('etiquettesCible = cibleEtiquetteDe(item)');
    expect(sansCommentaires).toContain('cible={etiquettesCible}');
    // Le crayon OUVRE la playlist — c'est dans l'écran ouvert qu'on renomme.
    // Aucune route ne renomme une playlist chez un service.
    expect(sansCommentaires).toContain("$tr('playlist.edit')");
    expect(sansCommentaires).toContain('api.updatePlaylist(');
  });

  it('le panneau d’étiquettes est monté UNE fois pour toute la grille', () => {
    // Un panneau par carte en aurait posé autant que de playlists.
    expect((sansCommentaires.match(/EtiquettesPanneau/g) ?? []).length).toBe(1);
  });

  it('🔴 les quatre coins sont ancrés à la POCHETTE, pas à la carte', () => {
    // Bertrand, vu à l'écran : « le bouton de sélection est mal placé, il doit
    // être au coin bas gauche de la pochette ». Ils étaient positionnés contre
    // `.pl-carte`, qui contient AUSSI le nom, le badge et les actions : les
    // coins du bas atterrissaient sous le texte.
    const style = ECRAN.slice(ECRAN.lastIndexOf('<style>'));
    expect(style).toMatch(/\.pl-vignette\{[^}]*position:relative/);
    // La carte ne doit PLUS être une référence de positionnement, sinon les
    // coins retombent dessus au premier remaniement.
    expect(style).not.toMatch(/\.pl-carte\{[^}]*position:relative/);
    // 🔴 ET SURTOUT : les quatre coins sont DANS la vignette.
    //
    // Ce test ne vérifiait que « pas à l'intérieur du bouton de pochette », et
    // il est passé au vert alors que le bloc entier avait glissé APRÈS
    // `.pl-texte` — hors de toute boîte positionnée. Bertrand l'a vu avant
    // moi : « bouton de sélection ok mais les autres néant ». Une garde qui
    // dit où une chose n'est PAS ne dit pas où elle est.
    const i = sansCommentaires.indexOf('class="pl-vignette"');
    const finVignette = sansCommentaires.indexOf('class="pl-texte"', i);
    const boite = sansCommentaires.slice(i, finVignette);
    for (const coin of ['class="pl-coin"', 'class="pl-coin-hg"', 'class="pl-coin-hd"', 'class="pl-coin-bd"']) {
      expect(boite, `${coin} hors de la vignette`).toContain(coin);
    }
    // Et ils restent FRÈRES du bouton de pochette, jamais dedans (#1006).
    const ouvre = boite.indexOf('class="pl-pochette"');
    const ferme = boite.indexOf('</button>', ouvre);
    expect(boite.slice(ouvre, ferme)).not.toContain('pl-coin');
  });

  it('🔴 le bloc <style> a ses accolades ÉQUILIBRÉES', () => {
    // Écrite après m'être fait avoir : en retirant une règle CSS morte, j'ai
    // supprimé la ligne du SÉLECTEUR et laissé ses propriétés orphelines. Les
    // tests passaient — ils ne cherchaient qu'un nom de classe — et la
    // feuille de style était cassée à partir de là.
    const style = ECRAN.slice(ECRAN.lastIndexOf('<style>'), ECRAN.lastIndexOf('</style>'));
    const ouvrantes = (style.match(/\{/g) ?? []).length;
    const fermantes = (style.match(/\}/g) ?? []).length;
    expect(ouvrantes, 'accolades du <style> déséquilibrées').toBe(fermantes);
  });

  it('le coin de sélection est un bouton à deux états, pas une case cachée', () => {
    expect(sansCommentaires).toContain('aria-pressed={cochee}');
  });
});
