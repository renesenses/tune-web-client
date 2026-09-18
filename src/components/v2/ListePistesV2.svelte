<script module lang="ts">
  /**
   * 🔴 LA LARGEUR DE LA COLONNE D'ACTIONS — une seule fois, pour tout l'écran.
   *
   * Elle vivait dans le script d'instance, donc invisible du dehors. L'écran
   * Historique rend, dans le MÊME écran, des lignes de ce tableau et des
   * lignes d'objet (album, playlist) qui ne passent pas par ici : pour que les
   * deux tombent en face, la ligne d'objet doit composer sa grille avec cette
   * largeur-ci — pas avec une copie (#1149).
   *
   * 208 px = SEPT boutons de 28 px + six gouttières de 2 px, la barre pleine
   * de `PisteActions`. Le chiffre a déjà changé une fois (178 → 208 le
   * 16/09/2026, quand le menu « … » a porté la barre à sept) : un témoin le
   * recalcule en comptant les boutons, `largeurActionsSuitLaBarre.test.ts`.
   */
  export const LARGEUR_ACTIONS = '208px';
  /** La même largeur en NOMBRE, pour le calcul du plancher (#853). */
  export const LARGEUR_ACTIONS_PX = 208;
  /**
   * 🔴 La MÊME règle, avec le bouton « Lire à partir d'ici » (#1061).
   *
   * 238 px = HUIT boutons de 28 px + sept gouttières de 2 px. Le bouton est
   * opt-in — seul l'écran sait ce que « la suite » veut dire — donc la colonne
   * l'est aussi : l'élargir partout volerait 30 px à la dernière colonne de
   * données des écrans qui ne le posent pas, exactement le défaut du 16/09
   * (la colonne DR lue « 1▶ »). Le témoin recalcule les DEUX chiffres.
   */
  export const LARGEUR_ACTIONS_DEPUIS = '238px';
  export const LARGEUR_ACTIONS_DEPUIS_PX = 238;
</script>

<script lang="ts">
  /**
   * Une liste de pistes — en TABLEAU au mode Essentiel, en lignes ailleurs.
   *
   * Chantier ouvert par Bertrand le 07/09/2026 sur la maquette de Levente.
   *
   * ## Pourquoi un conteneur, et pas une ligne enrichie
   *
   * Un tableau a un EN-TÊTE et des colonnes alignées. L'en-tête et les lignes
   * doivent partager le même `grid-template-columns`, sinon ils divergent — la
   * leçon de la vue Liste de la Bibliothèque, où un gabarit par ligne faisait
   * que les colonnes ne s'alignaient d'aucune ligne à l'autre (Bertrand,
   * 05/09/2026). Un seul gabarit, calculé ici, passé en variable CSS.
   *
   * ## Les deux autres modes ne bougent pas
   *
   * « Pour le moment les deux autres modes restent inchangés » (Bertrand). Au
   * dessus d'Essentiel, ce composant rend exactement ce qu'il rendait avant :
   * des `LignePisteV2`, mêmes props, même apparence. Le tableau n'est pas un
   * remplacement, c'est une seconde forme.
   *
   * ## Les actions restent celles de la v1
   *
   * « 3 actions est limitatif, on garde les actions de la v1 » (Bertrand). La
   * maquette en montre trois ; `PisteActions` en porte six — lire, lire
   * ensuite, file, playlist, étiquettes, favori — avec ses propres règles
   * (certaines réservées aux pistes locales). On le pose tel quel plutôt que
   * de réécrire une barre d'actions qui divergerait de l'autre.
   */
  import type { Snippet } from 'svelte';
  import { t } from '../../lib/i18n';
  import { preferences } from '../../lib/stores/preferences';
  import { currentTrack, currentTrackId, playbackState, etatDeLaLigne }
    from '../../lib/stores/nowPlaying';
  import IndicateurLecture from './IndicateurLecture.svelte';
  import {
    cleInfobulleColonne, colonnesRetenues, gabaritGrille, largeurMinimale, modeEnTableau,
    valeurColonne, type CleColonne,
  } from '../../lib/colonnesPistes';
  import type { Track } from '../../lib/types';
  import DisponibiliteUpnp from './DisponibiliteUpnp.svelte';
  import LignePisteV2 from './LignePisteV2.svelte';
  import PisteActions from './PisteActions.svelte';
  import QualityBadge from '../partages/QualityBadge.svelte';
  import { pisteIndisponible } from '../../lib/albumAParaitre';
  import { ouvrirArtisteDepuis, artisteDePiste } from '../../lib/ouvrirArtisteDepuis';
  import { activeView } from '../../lib/stores/navigation';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import ServiceBadge from '../partages/ServiceBadge.svelte';

  interface Props {
    pistes: Track[];
    /** Ce que fait un clic sur la ligne. Reçoit le rang, comme les boucles
     *  qu'il remplace : plusieurs écrans lisent « à partir d'ici ». */
    onLire: (piste: Track, index: number) => void;
    /**
     * « Lire à partir d'ici » sur CHAQUE ligne — #1061, FabienM, fil 1812,
     * point 9. Le geste existait dans trois écrans sous trois formes (bouton
     * explicite dans l'ancienne interface et le gestionnaire hérité, clic
     * implicite dans `PlaylistDetailV2`) et nulle part dans les Favoris V2.
     *
     * OPT-IN : la barre d'actions reçoit UNE piste, ce composant reçoit la
     * liste, mais seul l'ÉCRAN sait ce que « la suite » veut dire — son ordre
     * d'affichage et sa source par défaut pour une liste mixte. Il reçoit donc
     * le rang, comme `onLire`.
     */
    onLireDepuis?: ((piste: Track, index: number) => void) | null;
    /**
     * D'où vient le numéro affiché.
     *  - `piste` : `track_number` de l'album, replié sur le rang s'il manque ;
     *  - `rang`  : la position dans la liste ;
     *  - `aucune`: pas de numéro, même si la colonne est cochée.
     */
    numerotation?: 'piste' | 'rang' | 'aucune';
    /** Transmis tel quel au rendu en LIGNES (modes Avancé et Expert). */
    avecAlbum?: boolean;
    pochette?: boolean;
    /**
     * 🔴 La vignette en tête de ligne AU MODE TABLEAU — #3823.
     *
     * « Menu historique : régression par rapport à la v0.9.44 : manque
     * vignette du titre en début de ligne » (FabienM, fil 1749, v0.9.145), et
     * le même manque relevé le même jour par Pierre M, indépendamment, au
     * niveau Expert : « On peut avoir le "cover" ? ».
     *
     * L'écran de l'ANCIEN client porte cette vignette depuis toujours et à
     * tous les niveaux — `HistoryView.svelte:142`, un `AlbumArt` de 44 px en
     * tête de chaque ligne. Le portage vers la liste partagée l'a perdue aux
     * niveaux Essentiel et Expert, les deux qui rendent le TABLEAU
     * (`MODES_BRANCHES`) ; seul le rendu en lignes (Avancé) la garde.
     *
     * ⚠️ OPT-IN, et volontairement. Le même tableau sert la Bibliothèque
     * (onglet Titres), les playlists et la Recherche : y ajouter une pochette
     * partout serait un choix de design, pas la réparation d'une régression.
     * Seul l'Historique la demande ici, parce que c'est le seul écran dont
     * l'équivalent actuel la montre. Si le design tranche un jour pour tous,
     * le défaut de cette propriété change, et rien d'autre.
     *
     * ⚠️ La vignette vit DANS la cellule du titre, pas dans une colonne à
     * elle. C'est la règle du composant, écrite trois fois dans ce fichier :
     * l'en-tête et les lignes sont deux grilles séparées qui partagent un seul
     * `grid-template-columns`, et une colonne de plus dans les lignes seules
     * ferait dériver tous les en-têtes vers la droite. C'est exactement ce que
     * fait déjà `IndicateurLecture`, juste à côté.
     */
    pochetteEnTableau?: boolean;
    /**
     * 🔴 LA PROVENANCE DE CHAQUE LIGNE, au mode tableau — #1113.
     *
     * « Menu Recherche: il manque les vignettes des titres trouvés et leur
     * source (Bibliothèque, Qobuz, Bandcamp, Tidal, Youtube) » — FabienM, fil
     * 1829, 17/09/2026, v0.9.152. Sa capture montre la rangée de périmètre
     * « OÙ : Bibliothèque 10 · Qobuz 205 · Bandcamp 53 · Youtube 1 » au-dessus
     * d'UNE liste de titres : quatre provenances dans le même tableau, et pas
     * une ligne qui dise laquelle. `fusionnerParType` estampille pourtant
     * `source` sur chaque piste — la Recherche ne s'en servait que pour
     * fabriquer la clé de sa boucle.
     *
     * ⚠️ OPT-IN, pour la même raison que la vignette juste au-dessus. Ce
     * tableau sert aussi la Bibliothèque, les playlists et l'Historique, où
     * toutes les lignes ont la MÊME provenance : y répéter la pastille serait
     * du bruit. Seule la Recherche mêle les sources.
     *
     * ⚠️ La pastille vit DANS la cellule du titre, pas dans une colonne à
     * elle : la règle du composant, écrite trois fois dans ce fichier.
     *
     * ⚠️ Elle EXCLUT l'incrustation de `AlbumArt`, qui est l'autre moitié de
     * la même information. Deux pastilles pour une source, ce serait du volume
     * et non de la qualité ; et l'incrustation ne convient pas ici de toute
     * façon — `.tvig` fait 36 px en `overflow:hidden`, une pastille
     * « BANDCAMP » y est plus large que son support, et cette incrustation
     * écarte volontairement `local` (renesenses/tune-server-rust#3900), ce qui
     * laisserait muette la ligne de bibliothèque au milieu de trois qui
     * parlent.
     *
     * 🔴 AUCUN repli `?? 'local'` : c'est `source` telle qu'elle est. Une
     * source inconnue ne rend AUCUNE pastille — `ServiceBadge` est une table
     * fixe — plutôt qu'un « LOCAL » menteur sur une piste distante (règle
     * tenue par `badgeUpnp.test.ts`).
     */
    sourceEnTableau?: boolean;
    /**
     * 🔴 Une FABRIQUE, pas un gestionnaire.
     *
     * Seul l'appelant sait si l'album de CETTE piste est chargé : la
     * Bibliothèque n'ouvre la fiche que pour un album présent dans son
     * magasin. Un gestionnaire unique montrerait la loupe sur toutes les
     * lignes, y compris celles qu'elle ne peut pas ouvrir — un bouton qui ne
     * fait rien est pire qu'un bouton absent.
     *
     * Rendre `null` pour une piste, c'est dire « pas de loupe ici ».
     * Sans objet au mode tableau, qui n'a pas de pochette.
     */
    ouvertureAlbum?: ((piste: Track, index: number) => (() => void) | null) | null;
    /**
     * Contenu propre à un écran, rendu APRÈS chaque ligne.
     *
     * La playlist y met son bouton « retirer », l'historique l'instant et le
     * cœur d'un titre radio. Il devient une COLONNE de la grille, pas une
     * enveloppe : enveloppé, la ligne serait plus étroite que l'en-tête et
     * les colonnes ne tomberaient plus en face.
     *
     * Le fragment est compilé chez l'appelant : ses styles le suivent.
     */
    apres?: Snippet<[Track, number]>;
    /**
     * 🔴 La clé de liste, quand `id` ne suffit pas.
     *
     * L'Historique peut afficher DEUX FOIS la même piste — écoutée deux fois.
     * Deux clés identiques et Svelte s'arrête sur `each_key_duplicate` : la
     * liste entière disparaît. C'est le piège déjà documenté dans les Favoris,
     * où toute piste de service porte `id: null`.
     *
     * Par défaut `id`, replié sur le rang. Un écran qui sait mieux le dit.
     */
    clef?: (piste: Track, index: number) => string | number;
    /**
     * Largeur de la colonne du suffixe. Une longueur CSS, jamais `auto`.
     *
     * Voir le commentaire du gabarit : une colonne dimensionnée par son
     * contenu se résout dans CHAQUE grille séparément, donc différemment dans
     * l'en-tête (vide) et dans les lignes.
     */
    largeurApres?: string;
  }
  let {
    pistes, onLire, onLireDepuis = null, numerotation = 'rang',
    avecAlbum = true, pochette = true, pochetteEnTableau = false,
    sourceEnTableau = false,
    ouvertureAlbum = null, apres,
    clef = (p, i) => p.id ?? i, largeurApres = '96px',
  }: Props = $props();

  const mode = $derived($preferences.settingsLevel);
  /**
   * 🔴 Une SEULE source de vérité : `MODES_BRANCHES`, via `modeEnTableau`.
   *
   * Cette ligne testait `mode === 'beginner'` en dur, pendant que l'écran des
   * Réglages, lui, consultait `MODES_BRANCHES` pour griser les modes non
   * branchés. Deux réponses à une seule question : brancher Expert dans la
   * constante n'aurait rien changé ici, et la matrice aurait annoncé cochable
   * un mode que le tableau continuait d'ignorer — le défaut exact que ce
   * client passe son temps à corriger.
   *
   * Ne jamais remettre de nom de mode en dur ici. Une garde le vérifie.
   */
  const enTableau = $derived(modeEnTableau(mode));

  // Le MODE est passé : une colonne réservée à Expert ne doit pas apparaître
  // si un réglage plus ancien la coche pour un mode inférieur.
  const colonnes = $derived(colonnesRetenues($preferences.v2Colonnes?.[mode] ?? [], mode));
  /**
   * 🔴 AUCUN `auto` dans ce gabarit. C'est la règle, et elle a une raison.
   *
   * L'en-tête et les lignes sont des grilles SÉPARÉES qui partagent le même
   * `grid-template-columns`. Une colonne dimensionnée par son contenu — `auto`,
   * `max-content` — se résout donc dans chacune indépendamment : à zéro dans
   * l'en-tête, où la cellule d'actions est vide, et à ~208 px dans les lignes.
   * Les colonnes en `fr` absorbent l'écart, et TOUS les en-têtes dérivent vers
   * la droite. Signalé par Bertrand le 07/09/2026, capture à l'appui : « TIME »
   * deux cents pixels à droite de « 5:24 ».
   *
   * Pire : les actions sont CONDITIONNELLES — playlist et étiquettes ne sont
   * offertes que sur une piste locale. En `auto`, deux lignes voisines
   * n'auraient donc pas la même largeur d'actions, et se désaligneraient entre
   * elles.
   *
   * C'est la leçon de la vue Liste de la Bibliothèque, écrite le 05/09 et que
   * j'ai réintroduite ici. Une garde la tient désormais.
   *
   * 208 px = SEPT boutons de 28 px + six gouttières de 2 px, la barre pleine.
   *
   * 🔴 Elle valait 178 px — six boutons — jusqu'au 16/09/2026. Le menu « … »
   * (a5be266a, 07/09) avait porté la barre à sept sans toucher à ce chiffre :
   * `.act` est en `overflow:visible; justify-content:flex-end`, donc les 30 px
   * en trop débordaient à GAUCHE, sur la dernière colonne de données. Bertrand,
   * capture à l'appui : la colonne DR se lisait « 1▶ » au lieu de « 12 » — le
   * bouton Lire recouvrait le second chiffre. Ce nombre doit suivre la barre :
   * un témoin compte les boutons de `PisteActions` et le recalcule.
   */
  // `LARGEUR_ACTIONS` et `LARGEUR_ACTIONS_PX` sont déclarés dans le
  // `<script module>` en tête de fichier : l'Historique compose sa ligne
  // d'objet avec la MÊME valeur (#1149).
  const largeurApresPx = $derived(parseFloat(largeurApres) || 0);
  // #1061 : la colonne suit la barre, bouton « à partir d'ici » compris.
  const largeurDesActions = $derived(onLireDepuis ? LARGEUR_ACTIONS_DEPUIS : LARGEUR_ACTIONS);
  const largeurDesActionsPx = $derived(onLireDepuis ? LARGEUR_ACTIONS_DEPUIS_PX : LARGEUR_ACTIONS_PX);
  const gabarit = $derived(
    `${gabaritGrille(colonnes)} ${largeurDesActions}${apres ? ` ${largeurApres}` : ''}`,
  );

  /**
   * 🔴 #853 — la largeur minimale de la grille : somme des PLANCHERS.
   *
   * Pierre M (fil 1671) avait coché une dizaine de colonnes de plus que les
   * dix d'Expert. Les colonnes fixes remplissaient sa fenêtre, les `fr` se
   * partageaient ce qui restait, et le titre tombait à ~64 px — « E… ». Les
   * planchers posés dans le catalogue ne valent que si la grille a le droit de
   * DÉBORDER : sinon elle les ignore et comprime quand même.
   */
  const minGrille = $derived(
    largeurMinimale(colonnes, largeurDesActionsPx + (apres ? largeurApresPx : 0)),
  );

  /**
   * L'état de lecture d'une ligne, en mode TABLEAU (#1845).
   *
   * Le mode lignes délègue à `LignePisteV2`, qui le calcule chez lui ; le
   * tableau rend ses cellules lui-même et doit donc le faire ici. Les trois
   * magasins sont lus UNE fois, dans des `$derived` : lus dans la fonction,
   * ils seraient réabonnés à chaque ligne de chaque rendu.
   */
  const npId = $derived($currentTrackId);
  const npPiste = $derived($currentTrack);
  const npEtat = $derived($playbackState);
  const etatDe = (p: Track) => etatDeLaLigne(p, npId, npPiste, npEtat);

  function numero(p: Track, i: number): string | null {
    if (numerotation === 'aucune') return null;
    if (numerotation === 'rang') return String(i + 1);
    return String(p.track_number || i + 1);
  }

  /** La valeur d'une cellule. Le numéro est le seul cas que le modèle ne peut
   *  pas trancher seul : il dépend de l'écran, pas de la piste. */
  function cellule(p: Track, i: number, cle: CleColonne): string | null {
    return cle === 'num' ? numero(p, i) : valeurColonne(p, cle);
  }
</script>

{#if !enTableau}
  <!-- Les modes HORS tableau — Avancé seul depuis le 09/09/2026, Expert étant
       passé au tableau. Ce rendu est inchangé à la virgule près : le suffixe
       garde la même enveloppe en grille que les écrans avaient chez eux. Une
       garde vérifie qu'Avancé l'emprunte toujours. -->
  {#each pistes as p, i (clef(p, i))}
    {@const ouvrir = ouvertureAlbum?.(p, i) ?? null}
    {#if apres}
      <div class="avecSuffixe">
        <LignePisteV2
          piste={p}
          numero={numerotation === 'aucune' ? null : Number(numero(p, i))}
          onLire={() => onLire(p, i)}
          onLireDepuis={onLireDepuis ? () => onLireDepuis(p, i) : null}
          {avecAlbum}
          {pochette}
          onOuvrirAlbum={ouvrir}
        />
        <!--
          🔴 Le suffixe est enveloppé, et ce n'est pas cosmétique.

          `.avecSuffixe` est une grille à DEUX colonnes. Un extrait qui rend
          plusieurs éléments racine — l'Historique en rend deux, l'heure et le
          cœur radio — en posait donc TROIS dans deux colonnes : le troisième
          passait à une seconde ligne IMPLICITE, sous la piste.

          Le cœur radio est en `opacity:0` hors survol : la ligne supplémentaire
          était invisible, et coûtait pourtant 28 px de hauteur plus les 8 px de
          gouttière. Bertrand, 09/09/2026 : « Historique : diminue l'espace
          entre les pistes ». Ce n'était pas un réglage d'espacement, c'était
          une ligne de grille en trop, à chaque piste.

          Une enveloppe, et le nombre de colonnes cesse de dépendre de ce que
          l'appelant a écrit dans son extrait.
        -->
        <span class="suffixe">{@render apres(p, i)}</span>
      </div>
    {:else}
      <LignePisteV2
        piste={p}
        numero={numerotation === 'aucune' ? null : Number(numero(p, i))}
        onLire={() => onLire(p, i)}
        onLireDepuis={onLireDepuis ? () => onLireDepuis(p, i) : null}
        {avecAlbum}
        {pochette}
        onOuvrirAlbum={ouvrir}
      />
    {/if}
  {/each}
{:else}
  <!-- 🔴 #853 — `--tmin` est la largeur en deçà de laquelle le tableau DÉFILE
       au lieu de comprimer. Sans elle, les planchers des colonnes de texte
       seraient simplement ignorés par la grille, qui redescendrait sous eux. -->
  <div class="tbl" style="--tcols:{gabarit}; --tmin:{minGrille}px" role="table">
    <div class="thead" role="row">
      {#each colonnes as c (c.cle)}
        <span class="th" class:d={c.align === 'droite'} class:c={c.align === 'centre'}
          role="columnheader">{$t(c.cleI18n as any)}</span>
      {/each}
      <!-- La colonne d'actions n'a pas d'en-tête : son contenu se lit seul, et
           un libellé y serait répété sur chaque ligne pour rien. -->
      <span class="th" role="columnheader" aria-label={$t('v2.tcol.actions' as any)}></span>
      {#if apres}<span class="th" role="columnheader"></span>{/if}
    </div>

    {#each pistes as p, i (clef(p, i))}
      {@const etat = etatDe(p)}
      <!-- Point 10 (17/09/2026) — une piste que le service dit indisponible
           est grisée et ne se lance pas : le lancer rendrait « no url ». -->
      {@const indispo = pisteIndisponible(p)}
      <div class="trow" class:np={etat != null} class:indispo aria-current={etat ? 'true' : undefined}
        role="row">
        {#each colonnes as c (c.cle)}
          {#if c.cle === 'quality'}
            <span class="td" role="cell">
              <QualityBadge format={p.format} sampleRate={p.sample_rate}
                bitDepth={p.bit_depth} source={p.source} />
            </span>
          {:else if c.verrouillee}
            <!-- Le TITRE porte le clic de lecture : c'est la cible la plus
                 large et la plus évidente de la ligne. -->
            <button class="td titre" onclick={() => { if (!indispo) onLire(p, i); }}
              disabled={indispo} title={indispo ? $t('v2.str.coming' as any) : p.title}>
              <!-- L'indicateur est DANS la cellule du titre : une colonne de plus
                   décalerait l'en-tête, et la règle de ce composant est qu'un
                   seul gabarit vaut pour l'en-tête et pour les lignes.
                   La vignette (#3823) suit la MÊME règle, pour la même raison. -->
              <!-- 🔴 #1113 — la pastille de la LIGNE remplace l'incrustation de
                   la vignette, elle ne s'y ajoute pas : une source par ligne
                   suffit, et l'incrustation de 36 px tronque son texte. -->
              {#if pochetteEnTableau}
                <span class="tvig">
                  <AlbumArt coverPath={p.cover_path} albumId={p.album_id} size={36}
                    alt={p.title ?? ''} source={sourceEnTableau ? null : p.source} />
                </span>
              {/if}
              <IndicateurLecture {etat} />
              <span class="ttxt">{cellule(p, i, c.cle) ?? ''}</span>
              <!-- D'OÙ VIENT CETTE LIGNE — #1113. Telle quelle : une source
                   absente ne rend aucune pastille, jamais un « LOCAL » faux. -->
              {#if sourceEnTableau}<ServiceBadge source={p.source} compact />{/if}
              {#if p.source === 'upnp'}<DisponibiliteUpnp sourceId={p.source_id} />{/if}
              {#if indispo}<span class="indispo-etiq">{$t('v2.str.coming' as any)}</span>{/if}
            </button>
          {:else}
            {@const v = cellule(p, i, c.cle)}
            <!--
              #1193 — la colonne ARTISTE renvoie à la fiche de l'artiste.
              Posée ICI, dans le tableau PARTAGÉ : la playlist que FabienM
              montre, mais aussi les Favoris, la fiche d'album et la
              Bibliothèque, qui affichent la même colonne. `artisteDePiste`
              distingue un identifiant de bibliothèque d'un identifiant de
              service — les confondre ouvrirait un artiste au hasard.
            -->
            {@const artiste = c.cle === 'artist' ? artisteDePiste(p) : null}
            <!-- Une cellule sans valeur reste VIDE : « — » affirmerait une
                 absence qu'on n'a pas mesurée. -->
            <!-- #3924 — l'infobulle dit la PROVENANCE quand la colonne en a
                 une (le Dynamic Range, et lui seul). Partout ailleurs elle
                 reste la valeur brute, comme avant. -->
            {@const ib = cleInfobulleColonne(p, c.cle)}
            {#if artiste && v}
              <span class="td" role="cell">
                <button class="lien-artiste" title={v}
                  onclick={(e) => { e.stopPropagation(); void ouvrirArtisteDepuis(artiste, $activeView); }}>{v}</button>
              </span>
            {:else}
              <span class="td" class:d={c.align === 'droite'} class:c={c.align === 'centre'}
                role="cell" title={ib ? $t(ib as any) : (v ?? '')}>{v ?? ''}</span>
            {/if}
          {/if}
        {/each}
        <span class="td act" role="cell"><PisteActions piste={p}
          onLireDepuis={onLireDepuis ? () => onLireDepuis(p, i) : null} /></span>
        {#if apres}<span class="td act" role="cell">{@render apres(p, i)}</span>{/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  /* 🔴 UN seul gabarit, posé sur le conteneur et hérité par l'en-tête comme
     par les lignes. Deux gabarits calculés séparément divergent — c'est le
     défaut d'alignement relevé sur la vue Liste le 05/09/2026. */
  /* 🔴 #853 — le tableau DÉFILE au lieu de comprimer. `.tbl` n'avait aucun
     `overflow-x` : la grille ne pouvait pas déborder, donc elle écrasait. */
  .tbl{display:flex; flex-direction:column; min-width:0; overflow-x:auto}
  .tbl::-webkit-scrollbar{height:9px}
  .tbl::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .thead, .trow{display:grid; grid-template-columns:var(--tcols); align-items:center;
    gap:14px; padding:0 10px; min-width:var(--tmin, 0)}
  .thead{position:sticky; top:0; z-index:2; background:var(--v2-bg);
    border-bottom:1px solid var(--v2-line2); padding-bottom:9px; margin-bottom:4px}
  .th{font:600 11px var(--v2-sans); letter-spacing:.04em; color:var(--v2-txt3);
    text-transform:uppercase; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}

  .trow{border-radius:9px; color:var(--v2-txt2); min-height:46px}
  .trow:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .trow.np{color:var(--v2-acc1)}
  /* Point 10 — la piste que le service ne sert pas encore. */
  /* #1193 — le lien garde EXACTEMENT l'allure de la cellule : c'est une
     colonne de tableau, pas un bouton. */
  .lien-artiste{background:none; border:none; padding:0; font:inherit; color:inherit;
    text-align:left; cursor:pointer; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .lien-artiste:hover{text-decoration:underline; color:var(--v2-txt)}

  .trow.indispo{opacity:0.5}
  .trow.indispo .titre{cursor:default}
  .indispo-etiq{margin-left:8px; font:600 10px var(--v2-sans); color:var(--v2-acc2);
    border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill); padding:1px 6px; white-space:nowrap}

  .td{font-size:13px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  /* Les colonnes de chiffres s'alignent à droite, en chiffres tabulaires :
     sans quoi la durée saute d'un pixel d'une ligne à l'autre. */
  .th.d, .td.d{text-align:right; font-variant-numeric:tabular-nums}
  .th.c, .td.c{text-align:center}

  .titre{display:flex; align-items:center; gap:7px;
    padding:0; border:0; background:transparent; cursor:pointer; text-align:left;
    font:600 13.5px var(--v2-sans); color:var(--v2-txt); min-width:0}
  /* 36 px : la ligne du tableau fait 46 px de haut (`.trow`), contre 56 px
     dans l'ancien écran qui portait une vignette de 44. La vignette ne doit
     pas décider de la hauteur de la ligne, sinon le tableau change de densité
     sur le seul écran qui l'active. `flex:0 0 auto` : elle ne se comprime
     jamais — c'est le TEXTE qui s'élide, comme l'indicateur juste à côté. */
  .tvig{flex:0 0 auto; width:36px; height:36px; border-radius:4px;
    overflow:hidden; display:block; line-height:0}
  /* C'est le TEXTE qui s'élide, jamais l'indicateur : un repère tronqué ne
     repère plus rien. */
  .ttxt{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .trow.np .titre{color:var(--v2-acc1)}
  .titre:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:2px; border-radius:4px}

  /* Les actions sont calées à DROITE : une piste sans playlist ni étiquettes
     en montre quatre au lieu de six, et l'alignement se ferait sinon sur la
     gauche — les cœurs ne seraient plus l'un sous l'autre. */
  .act{overflow:visible; display:flex; align-items:center; justify-content:flex-end}

  /* Le suffixe en mode LIGNES : la même grille que les écrans avaient chez
     eux (`1fr auto`), pour que rien ne bouge à leurs yeux. */
  .avecSuffixe{display:grid; grid-template-columns:minmax(0,1fr) auto;
    align-items:center; gap:8px}
  /* L'enveloppe du suffixe : quel que soit le nombre d'éléments que l'extrait
     rend, ils tiennent sur UNE ligne et dans UNE colonne. */
  .suffixe{display:flex; align-items:center; gap:8px; justify-content:flex-end}

  /* Sous 720 px les colonnes ne tiennent plus : l'en-tête se retire et les
     lignes redeviennent lisibles en pile plutôt que d'être rognées. */
  @media (max-width: 720px){
    .thead{display:none}
    .trow{grid-template-columns:minmax(0,1fr) auto}
    .trow .td:not(.act):not(.titre){display:none}
  }
</style>
