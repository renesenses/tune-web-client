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
 *
 * ## 26/09/2026 — la grille est passée sur `PochetteActions`
 *
 * Quatre cas de ce fichier décrivaient les coins que cet écran dessinait
 * lui-même. Ils sont réécrits sur place, chacun daté et motivé, et AUCUN n'est
 * supprimé : le comportement gardé reste le même (les appels à l'action sur
 * CHAQUE pochette, la vignette comme boîte de référence, pas de bouton dans un
 * bouton), seule l'implémentation qui le tient a changé.
 *
 * ⚠️ CE FICHIER LIT UN TEXTE. C'est son angle mort, écrit noir sur blanc plus
 * bas : il est déjà passé au vert alors que les coins avaient glissé hors de
 * toute boîte positionnée. Il ne peut pas dire qu'un élément est VISIBLE, ni où
 * il est dans l'arbre monté, ni ce qu'un menu contient à l'ouverture. Ces
 * preuves-là sont dans `gestionnairePlaylistsCoinsPartages.test.ts`, qui MONTE
 * l'écran avec trois cartes mixtes, pose les feuilles compilées et clique.
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
    // 🔴 Le verrou A ÉTÉ RETIRÉ le 21/09 : « Quand je vais merger des
    // playlists de Tidal et Qobuz, quand vais-je choisir la cible ? » — il
    // rendait la question sans réponse. Ce témoin garde sa disparition, pour
    // qu'un retour en arrière ne passe pas inaperçu.
    expect(corps).not.toContain('serviceVerrouille');
    expect(sansCommentaires).not.toContain('class:inerte');
  });

  it('la fusion atterrit dans la cible, proposée puis modifiable', () => {
    // « Au même endroit » valait tant que la sélection était confinée à un
    // service. Depuis le 21/09 elle ne l'est plus : la cible est proposée
    // (le service de la première carte) et le sélecteur peut la changer.
    expect(sansCommentaires).toContain('const cibleDeFusion = cibleFusion;');
    expect(sansCommentaires).toContain('target_service: cibleDeFusion');
    expect(sansCommentaires).toContain(
      "let cibleFusion = $derived(cibleChoisie || premierServiceCoche || 'local');",
    );
  });

  it('aucune carte n\'est rendue inerte par la sélection', () => {
    // Le verrou est tombé : plus de cartes estompées, plus d'infobulle « on
    // ne fusionne que des playlists d'un même service ».
    expect(sansCommentaires).not.toContain('class:inerte');
    expect(sansCommentaires).not.toContain('playlistManager.sameServiceOnly');
  });

  it('la grille a remplacé la liste', () => {
    expect(sansCommentaires).toContain('class="pl-grille"');
    expect(sansCommentaires).not.toContain('class="playlist-list"');
  });

  /*
   | 🔴 RÉÉCRIT LE 26/09/2026 — la grille est passée sur `PochetteActions`.
   |
   | Ce cas cherchait les CINQ classes que cet écran dessinait lui-même
   | (`.pl-coin-hg`, `.pl-coin-hd`, `.pl-coin`, `.pl-coin-bd`, `.pl-lire`).
   | Elles n'existent plus : la surcouche commune pose les quatre coins et le
   | centre, aux mêmes places que sur les vingt-trois autres emplacements du
   | client. Chercher les anciennes classes garderait une implémentation
   | retirée, pas le comportement.
   |
   | CE QUI EST GARDÉ, MOT POUR MOT, c'est la demande de Bertrand du
   | 21/09/2026 — « je veux les 5 sur chaque cover de playlist » : les appels à
   | l'action ne doivent pas être RÉSERVÉS AU LOCAL. Ils l'avaient été, et
   | l'écran filtré sur Qobuz devenait inerte. La garde locale existe encore
   | plus bas, à juste titre (partager et supprimer n'ont pas de sens chez un
   | service) ; la surcouche doit donc la PRÉCÉDER.
   |
   | Mesuré avant d'écrire, et toujours vrai : une playlist de SERVICE
   | s'étiquette (POST /tags/{id}/streaming-items → 201), se met en favori
   | (`ServiceFavType` porte « playlists »), se lit (`playStreamingPlaylist`)
   | et se sélectionne (la fusion prend {service, playlist_id}).
   */
  it('🔴 la surcouche habille CHAQUE pochette, service compris', () => {
    const i = sansCommentaires.indexOf('class="pl-grille"');
    const carte = sansCommentaires.slice(i, sansCommentaires.indexOf('{/each}', i));
    expect(carte, 'la grille ne passe plus par la surcouche commune').toContain('<PochetteActions');
    // Les cinq désignations, passées à la surcouche : cœur (local ET service),
    // édition, lecture, étiquettes, et l'OBJET d'où le menu découle.
    for (const prop of [
      'favori={favoriDe(item)}',
      'favoriExterne={favoriServiceDe(item, $favoriteStreamingKeys)}',
      'etiquettes={cibleEtiquetteDe(item)}',
      'onEditer=',
      'onLire={() => lirePlaylist(item)}',
      'objet={objetDe(item)}',
    ]) {
      expect(carte, `${prop} absent de la surcouche`).toContain(prop);
    }
    // 🔴 Et rien de tout cela n'est enfermé dans la garde « locale ».
    const garde = carte.indexOf("item.type === 'local' && item.local?.id");
    expect(garde, 'la garde locale a disparu : le test ne garde plus rien').toBeGreaterThan(-1);
    expect(
      carte.indexOf('<PochetteActions'),
      'la surcouche est de nouveau réservée aux playlists locales',
    ).toBeLessThan(garde);
    // Les anciennes classes sont SUPPRIMÉES, pas laissées en doublon : deux
    // jeux de coins sur la même carte, ce serait la divergence qu'on vient de
    // fermer.
    for (const morte of ['class="pl-coin-hg"', 'class="pl-coin-hd"', 'class="pl-coin"',
                         'class="pl-coin-bd"', 'class="pl-lire"']) {
      expect(sansCommentaires, `${morte} survit à côté de la surcouche`).not.toContain(morte);
    }
  });

  it('chaque appel réutilise ce qui existe, sans redessiner un sélecteur', () => {
    // 26/09/2026 — le cœur ne passe plus par un `HeartButton` posé à la main
    // dans un coin de cet écran : la surcouche le porte, et sépare les deux
    // bascules parce qu'elles diffèrent vraiment — le favori d'une playlist de
    // SERVICE ne vit pas dans `favorites`.
    expect(sansCommentaires).toContain('function favoriDe(item: DisplayPlaylist): RefLocale | null');
    expect(sansCommentaires).toContain('favoriExterneService(cles, {');
    // Les étiquettes passent par le module PARTAGÉ, qui sait déjà distinguer
    // les deux espaces d'identifiants : l'écran ne recompose plus sa cible.
    expect(sansCommentaires).toContain("import { cibleEtiquettePlaylist } from '../../lib/cibleEtiquette';");
    expect(sansCommentaires).toContain('cibleEtiquettePlaylist(item.local)');
    // Le crayon OUVRE la playlist — c'est dans l'écran ouvert qu'on renomme.
    // Aucune route ne renomme une playlist chez un service.
    expect(sansCommentaires).toContain('onEditer={() => selectItem(item)}');
    expect(sansCommentaires).toContain('api.updatePlaylist(');
  });

  it('🔴 le panneau d’étiquettes a quitté l’écran : la surcouche le porte', () => {
    // 26/09/2026 — il était monté ICI, une fois pour toute la grille, avec son
    // état `etiquettesCible`. C'était le bon réflexe tant que l'écran dessinait
    // ses coins. `PochetteActions` le porte désormais, à l'import dynamique.
    // Le garder doublerait le chemin : deux états, deux vérités.
    expect((sansCommentaires.match(/EtiquettesPanneau/g) ?? []).length).toBe(0);
    expect(sansCommentaires).not.toContain('etiquettesCible');
    // Et la cible part bien à la surcouche, sinon le bouton serait absent.
    expect(sansCommentaires).toContain('etiquettes={cibleEtiquetteDe(item)}');
  });

  /*
   | 🔴 RÉÉCRIT LE 26/09/2026 — deux arbitrages de Bertrand.
   |
   | Ce cas gardait que les quatre coins étaient ANCRÉS À LA POCHETTE, et pour
   | une bonne raison : ils avaient été positionnés contre `.pl-carte`, qui
   | contient aussi le nom et le badge, et les coins du bas atterrissaient sous
   | le texte (« bouton de sélection ok mais les autres néant »).
   |
   | Les coins sont désormais posés par `PochetteActions`, qui a sa propre garde
   | et son propre banc. Ce qui reste à garder ICI, c'est la BOÎTE que cet écran
   | fournit à la surcouche, et le nouveau partage :
   |
   |   · la vignette reste la boîte de référence, la carte ne l'est pas ;
   |   · la vignette ne contient QUE la surcouche ;
   |   · la CASE DE SÉLECTION est sortie de la vignette et vit dans `.pl-texte`.
   |
   | ⚠️ Une garde de texte ne peut pas dire qu'un élément est VISIBLE, ni où il
   | est dans l'arbre monté. La preuve sur le DOM — la case hors de la vignette,
   | son `opacity` calculé à 1 sans survol, les coordonnées du bouton de menu —
   | est dans `gestionnairePlaylistsCoinsPartages.test.ts`, qui MONTE l'écran.
   | Ce cas-ci ne garde que la source.
   */
  it('🔴 la vignette porte la surcouche, et la case de sélection en est SORTIE', () => {
    const style = ECRAN.slice(ECRAN.lastIndexOf('<style>'));
    expect(style).toMatch(/\.pl-vignette\{[^}]*position:relative/);
    // La carte ne doit PLUS être une référence de positionnement, sinon les
    // coins retombent dessus au premier remaniement.
    expect(style).not.toMatch(/\.pl-carte\{[^}]*position:relative/);
    // La vignette ne contient que la surcouche, qui reçoit la pochette.
    const i = sansCommentaires.indexOf('class="pl-vignette"');
    const finVignette = sansCommentaires.indexOf('class="pl-texte"', i);
    expect(i, 'plus de vignette').toBeGreaterThan(-1);
    expect(finVignette, 'plus de bloc de texte').toBeGreaterThan(i);
    const boite = sansCommentaires.slice(i, finVignette);
    expect(boite).toContain('<PochetteActions');
    expect(boite).toContain('class="pl-pochette"');
    // 🔴 PIÈGE 3 (#1006) — la pochette n'est plus un `<button>` : la surcouche
    // pose le sien, plein cadre, et un bouton dans un bouton est défait par les
    // navigateurs.
    expect(boite, 'la pochette est redevenue un bouton DANS la surcouche')
      .not.toMatch(/<button[^>]*class="pl-pochette"/);
    expect(boite).toMatch(/<span class="pl-pochette">/);
    // 🔴 ET LA CASE N'EST PLUS DANS LA VIGNETTE.
    expect(boite, 'la case de sélection est retournée dans la pochette').not.toContain('class="pl-case"');
    const texte = sansCommentaires.slice(finVignette);
    expect(texte, 'la case de sélection a disparu de la ligne du nom').toContain('class="pl-case"');
    // Elle précède le nom, sur la même ligne.
    const ligne = texte.indexOf('class="pl-ligne"');
    expect(ligne, 'plus de ligne de nom').toBeGreaterThan(-1);
    expect(texte.indexOf('class="pl-case"')).toBeGreaterThan(ligne);
    expect(texte.indexOf('class="pl-nom"')).toBeGreaterThan(texte.indexOf('class="pl-case"'));
  });

  it('🔴 AUCUNE règle de survol ne cache la case de sélection', () => {
    /*
      26/09/2026 — c'est la RAISON d'être de sa sortie de la pochette. Les coins
      de `PochetteActions` ne se montrent qu'au survol (seul le cœur actif
      reste) : acceptable pour une action, inacceptable pour un geste de
      SÉLECTION, et impossible sur tactile.

      Le `opacity` calculé est vérifié sur le DOM monté ailleurs ; ici on refuse
      la règle qui le remettrait à zéro, parce qu'une telle règle est ce qui
      arriverait au premier « harmonisons avec les coins ».
    */
    const style = ECRAN.slice(ECRAN.lastIndexOf('<style>'));
    const regles = style.match(/[^{}]*\.pl-case[^{}]*\{[^}]*\}/g) ?? [];
    expect(regles.length, 'aucune règle pour .pl-case : la case n’est plus stylée').toBeGreaterThan(0);
    for (const r of regles) {
      const selecteur = r.slice(0, r.indexOf('{'));
      // Pas de révélation au survol d'un ancêtre : `.pl-carte:hover .pl-case`.
      expect(
        /:hover\s+[^,{]*\.pl-case/.test(selecteur),
        `la case est cachée puis révélée au survol : ${selecteur.trim()}`,
      ).toBe(false);
      // Et jamais d'`opacity` sur la case elle-même.
      expect(
        /\bopacity\s*:/.test(r.slice(r.indexOf('{'))),
        `une règle touche l’opacité de la case : ${selecteur.trim()}`,
      ).toBe(false);
    }
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

  /*
   | 🔴 « Bouton merge grisé » (Bertrand, 21/09, capture : HUIT playlists
   | cochées). Le motif n'était pas la sélection mais le NOM vide — le
   | `disabled` du bouton porte `!mergeName.trim()` et rien ne le disait.
   |
   | Deux gardes, parce que le correctif a deux moitiés : proposer un nom, et
   | nommer le motif quand le champ est quand même vide.
   */
  it('🔴 le champ de nom vide est un motif ÉNONCÉ, pas un gris muet', () => {
    // La condition du gris, telle qu'elle est écrite.
    expect(sansCommentaires).toContain("!mergeName.trim()");
    // Et son explication, dans la branche qui suit « moins de deux ».
    const barre = sansCommentaires.slice(sansCommentaires.indexOf('class="merge-bar"'));
    const hint = barre.indexOf("playlistManager.nameRequired");
    const deux = barre.indexOf("playlistManager.selectAtLeastTwo");
    expect(hint, 'aucune indication pour le champ vide').toBeGreaterThan(-1);
    expect(deux, 'indication « au moins deux » disparue').toBeGreaterThan(-1);
  });

  it('un nom est PROPOSÉ dès la deuxième carte cochée, et la saisie le protège', () => {
    expect(sansCommentaires).toContain('function nomDeFusionPropose()');
    expect(sansCommentaires).toContain('mergedNameDefault');
    // Le garde-fou : l'effet ne doit jamais écraser ce qui a été tapé. La
    // sortie précoce est la PREMIÈRE ligne du corps de l'effet — vérifiée
    // ici par son voisinage immédiat, pas par sa seule présence dans le
    // fichier.
    // L'écran porte plusieurs `$effect` : on vise celui de la fusion par sa
    // première ligne, pas par son rang.
    const debut = sansCommentaires.indexOf('if (mergeNameTouched) return;');
    expect(debut, 'la sortie précoce a disparu').toBeGreaterThan(-1);
    expect(sansCommentaires.slice(Math.max(0, debut - 40), debut)).toContain('$effect(() => {');
    expect(sansCommentaires).toContain('oninput={() => (mergeNameTouched = true)}');
  });

  /*
   | 🔴 « pas de bouton pour supprimer une playlist Tidal ! » (Bertrand,
   | 21/09). La carte locale porte une corbeille depuis toujours ; la carte
   | de service n'en avait aucune — et pas par oubli d'interface : côté
   | serveur, `delete_playlist` n'était redéfinie que par Qobuz et AUCUNE
   | route ne l'appelait.
   |
   | La garde qui compte n'est pas la présence du bouton mais sa CONDITION :
   | posé d'après la capacité annoncée par le serveur, jamais d'après le nom
   | du service, sinon il rendrait 501 au clic ailleurs.
   */
  it('🔴 la corbeille d\'une playlist de service suit la capacité ANNONCÉE', () => {
    expect(sansCommentaires).toContain('function serviceSaitSupprimer(');
    expect(sansCommentaires).toContain("serviceCapabilities[service]?.supports_delete === true");
    expect(sansCommentaires).toContain('{#if serviceSaitSupprimer(item.service)}');
    // Et pas une liste de noms écrite à la main.
    expect(sansCommentaires).not.toMatch(/supprimables?\s*=\s*\[/);
  });

  it('la suppression chez un service demande confirmation', () => {
    const corps = sansCommentaires.slice(
      sansCommentaires.indexOf('async function supprimerPlaylistDeService('),
    );
    expect(corps.slice(0, 900)).toContain('dialogs.confirm');
    expect(corps.slice(0, 900)).toContain('danger: true');
    // L'appel ne part qu'APRÈS la confirmation.
    const confirme = corps.indexOf('dialogs.confirm');
    const appel = corps.indexOf('api.deleteServicePlaylist');
    expect(confirme, 'aucune confirmation').toBeGreaterThan(-1);
    expect(appel, 'aucun appel de suppression').toBeGreaterThan(-1);
    expect(appel).toBeGreaterThan(confirme);
  });

  /*
   | 🔴 « Cela merge en local : erreur !! » (Bertrand, 21/09). Huit playlists
   | Qobuz cochées, et la fusion créait une playlist LOCALE — vide.
   |
   | La cause vivait côté serveur (`MergeRequest` ne déclarait pas
   | `target_service`, serde le jetait), mais l'écran a sa part : c'est lui
   | qui nomme la cible, et c'est lui qui doit recharger la liste où la
   | playlist est NÉE. Recharger le local après une fusion chez Qobuz la
   | rendait invisible jusqu'au prochain passage sur l'écran.
   */
  it('🔴 la fusion nomme sa cible, et recharge la liste où la playlist est née', () => {
    expect(sansCommentaires).toContain('target_service: cibleDeFusion,');
    // Le rechargement choisit, il ne suppose pas.
    const apres = sansCommentaires.slice(sansCommentaires.indexOf('mergeResult = result;'));
    expect(apres.slice(0, 800)).toContain('api.getStreamingPlaylists(');
    expect(apres.slice(0, 800)).toContain('api.getPlaylists()');
  });

  /*
   | 🔴 « Où se trouve le bouton pour delete une playlist ? » (Bertrand,
   | 21/09). Nulle part, en réalité : `serviceCapabilities` n'était chargé
   | qu'à l'ouverture de l'onglet Sync, donc sur l'onglet Playlists il valait
   | `{}` et `serviceSaitSupprimer()` rendait TOUJOURS false. La corbeille par
   | carte n'apparaissait sur aucune carte de service.
   |
   | Et sa place : « à côté de merge ?? ». La barre de sélection est le seul
   | endroit qu'on trouve sans chercher.
   */
  it('🔴 les capacités des services sont chargées pour TOUT l\'écran', () => {
    const corps = sansCommentaires.slice(
      sansCommentaires.indexOf('async function loadAll()'),
    );
    // Dans `loadAll`, donc à chaque ouverture de l'écran — et plus seulement
    // dans `loadManagerData`, derrière l'onglet Sync.
    expect(corps.slice(0, 500)).toContain('.getPlaylistManagerServices()');
    expect((sansCommentaires.match(/getPlaylistManagerServices\(\)/g) ?? []).length).toBeGreaterThan(1);
  });

  it('la barre de sélection porte le bouton de suppression', () => {
    const barre = sansCommentaires.slice(sansCommentaires.indexOf('class="merge-bar"'));
    const onglet = barre.indexOf('onclick={supprimerLaSelection}');
    const annule = barre.indexOf('onclick={cancelMerge}');
    expect(onglet, 'pas de suppression dans la barre').toBeGreaterThan(-1);
    expect(annule, 'plus de bouton Annuler').toBeGreaterThan(-1);
    // Posé AVANT Annuler, donc à côté de Fusionner.
    expect(onglet).toBeLessThan(annule);
  });

  it('une seule question pour tout le lot, et elle précède les appels', () => {
    // Borné à la fonction : au-delà, d'autres écrans confirment aussi, et un
    // `indexOf` non borné ferait passer le témoin pour de mauvaises raisons.
    const debutFn = sansCommentaires.indexOf('async function supprimerLaSelection(');
    const corps = sansCommentaires.slice(
      debutFn,
      sansCommentaires.indexOf('\n  }\n', debutFn),
    );
    const question = corps.indexOf('dialogs.confirm');
    const boucle = corps.indexOf('for (const cle of cles)');
    expect(question, 'aucune confirmation').toBeGreaterThan(-1);
    expect(boucle, 'aucune boucle de suppression').toBeGreaterThan(-1);
    expect(question).toBeLessThan(boucle);
    // La question est posée UNE fois : elle est hors de la boucle.
    expect(corps.slice(boucle).indexOf('dialogs.confirm')).toBe(-1);
  });

  /*
   | 🔴 Mesuré sur le .18 le 21/09 : la playlist fusionnée apparaît tout de
   | suite (le serveur oublie sa liste mémorisée), mais la carte annonçait
   | « 0 tracks » quand le détail en comptait 7. Qobuz n'a pas rattrapé
   | l'ajout au moment où l'on relit sa liste utilisateur — et ce zéro-là
   | serait mémorisé deux minutes.
   |
   | Le compte versé fait foi : il vient du serveur, qui l'a compté à l'ajout.
   */
  it('🔴 le compte de la playlist fusionnée ne vient pas de la liste du service', () => {
    const apres = sansCommentaires.slice(sansCommentaires.indexOf('mergeResult = result;'));
    const fenetre = apres.slice(0, 1400);
    expect(fenetre).toContain("const verses = Number((result as any)?.total_tracks ?? 0);");
    expect(fenetre).toContain('track_count: verses');
    // Et seulement pour CELLE-LÀ : les autres cartes gardent le compte du
    // service, qui est juste.
    expect(fenetre).toContain('String(pl.source_id) === idNeuve');
  });

  it('le bouton ne s\'offre pas chez un service qui ne sait pas supprimer', () => {
    expect(sansCommentaires).toContain('let selectionSupprimable = $derived(');
    // TOUS les services touchés doivent savoir supprimer : avec une sélection
    // mixte, n'en vérifier qu'un promettrait ce qu'on ne peut pas tenir.
    expect(sansCommentaires).toContain(
      "Array.from(servicesCoches).every((s) => s === 'local' || serviceSaitSupprimer(s))",
    );
    expect(sansCommentaires).toContain('{#if selectionSupprimable}');
  });

  /*
   | 🔴 « Quand je vais merger des playlists de Tidal et Qobuz, quand vais-je
   | choisir la cible ? » (Bertrand, 21/09). Jamais : le verrou l'empêchait
   | de mélanger, donc la cible était implicite.
   |
   | Ses deux réponses : le sélecteur est TOUJOURS visible, et les titres non
   | retrouvés sont LISTÉS, pas comptés.
   */
  it('🔴 le sélecteur de cible est dans la barre, sans condition', () => {
    const barre = sansCommentaires.slice(sansCommentaires.indexOf('class="merge-bar"'));
    const selecteur = barre.indexOf('class="merge-cible"');
    expect(selecteur, 'aucun sélecteur de cible').toBeGreaterThan(-1);
    // Pas derrière un `{#if}` de mixité : il serait invisible quand il sert
    // le plus — quand on veut justement changer d'endroit.
    expect(barre.slice(0, selecteur)).not.toContain('{#if selectionMixte}');
    // Il AFFICHE la cible effective et ÉCRIT le choix : un `bind:` sur le
    // seul choix montrerait une case vide tant qu'on n'a rien dit.
    expect(sansCommentaires).toContain('value={cibleFusion}');
    expect(sansCommentaires).toContain('(cibleChoisie = e.currentTarget.value)');
  });

  it('les titres non retrouvés sont NOMMÉS', () => {
    expect(sansCommentaires).toContain('mergeResult.unmatched');
    expect(sansCommentaires).toContain('{#each mergeResult.unmatched as t}');
    expect(sansCommentaires).toContain('{t.title}');
  });

  it('le coût d\'une fusion croisée est annoncé AVANT', () => {
    expect(sansCommentaires).toContain('let titresAApparier = $derived.by(');
    expect(sansCommentaires).toContain('playlistManager.crossServiceNotice');
    // Compté sur ce qui n'est PAS déjà chez la cible.
    expect(sansCommentaires).toContain("if (cleService(cle) !== cibleFusion) n += 1;");
  });

  /*
   | 🔴 « Et les 4 covers sur la cover de la playlist !! » (Bertrand, 21/09).
   | La playlist TIDAL tout juste fusionnée n'avait qu'une note de musique :
   | le service fabrique sa pochette plus tard. Et une playlist locale n'en a
   | JAMAIS — le serveur ne rend que `id, name, track_count`.
   |
   | L'écran Playlists (`PlaylistsV2`) compose depuis le 01/09 une mosaïque
   | 2×2 — « divise en 4 pour montrer que c'est un assemblage ». Le
   | gestionnaire l'ignorait.
   */
  it('🔴 une carte sans pochette reçoit la mosaïque, pas la note de musique', () => {
    expect(sansCommentaires).toContain("import MosaiquePochettes from '../v2/MosaiquePochettes.svelte';");
    expect(sansCommentaires).toContain('{:else if mosaiques[cle]}');
    // Même dédoublonnage que l'écran Playlists : pas de copie qui divergerait.
    expect(sansCommentaires).toContain("import { quatreDistinctes } from '../../lib/mosaique';");
    const i = sansCommentaires.indexOf('async function chargerMosaique(');
    expect(i, 'chargerMosaique a disparu').toBeGreaterThan(-1);
    const corps = sansCommentaires.slice(i, i + 900);
    expect(corps).toContain('quatreDistinctes(');
    // Local ET service : la playlist fusionnée chez TIDAL est le cas d'origine.
    expect(corps).toContain('api.getPlaylistTracks(');
    expect(corps).toContain('api.getStreamingPlaylistTracks(');
  });

  it('une pochette fournie par le service est GARDÉE', () => {
    // La mosaïque COMPOSÉE est un repli : ce que le service fournit — ses
    // quatre pochettes, ou à défaut son image unique — passe avant.
    const quatre = sansCommentaires.indexOf('{#if item.covers && item.covers.length > 0}');
    const pochette = sansCommentaires.indexOf('{:else if item.coverPath}');
    const mosaique = sansCommentaires.indexOf('{:else if mosaiques[cle]}');
    expect(quatre, 'les pochettes du service ne sont plus lues').toBeGreaterThan(-1);
    expect(pochette).toBeGreaterThan(quatre);
    expect(mosaique).toBeGreaterThan(pochette);
    // Et on ne demande pas de pistes pour une carte qui a déjà sa pochette.
    expect(sansCommentaires).toContain('if (item.coverPath) continue;');
  });

  /*
   | « Est-il possible d'associer 4 covers distinctes à toutes les playlists
   | Qobuz ? » (Bertrand, 21/09). Qobuz les donne DÉJÀ, en tableau, dans la
   | liste des playlists : le serveur les transmet sous `covers`, et l'écran
   | les pose sans une seule requête de plus.
   */
  it('🔴 les quatre pochettes Qobuz viennent de la LISTE, sans requête', () => {
    expect(sansCommentaires).toContain('covers: pl.covers,');
    expect(sansCommentaires).toContain('<MosaiquePochettes pochettes={item.covers}');
    // Et le chargeur de repli ne s'en mêle pas : une carte qui a ses pochettes
    // a aussi sa `coverPath`, donc l'effet la saute.
    expect(sansCommentaires).toContain('if (item.coverPath) continue;');
  });

  it('chaque mosaïque n\'est demandée qu\'UNE fois', () => {
    // Sans ce registre, l'effet repasserait à chaque changement de la liste et
    // redemanderait les pistes : une boucle réseau.
    expect(sansCommentaires).toContain('const mosaiquesDemandees = new Set<string>();');
    expect(sansCommentaires).toContain('if (mosaiquesDemandees.has(cle)) continue;');
  });

  it('la suppression du lot vise le service de CHAQUE carte', () => {
    const debutFn = sansCommentaires.indexOf('async function supprimerLaSelection(');
    const corps = sansCommentaires.slice(
      debutFn,
      sansCommentaires.indexOf('\n  }\n', debutFn),
    );
    expect(corps).toContain('const service = cleService(cle);');
    // Et surtout pas « le » service de la sélection, qui n'existe plus.
    expect(corps).not.toContain('serviceVerrouille');
  });
});
