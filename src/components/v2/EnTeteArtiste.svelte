<script lang="ts">
  /**
   * L'EN-TÊTE D'UNE FICHE ARTISTE — le même pour la bibliothèque et pour un
   * service (#1356).
   *
   * Bertrand, 20/09/2026, deux captures à l'appui : « Je voudrais que la fiche
   * LibraryArtist soit semblable à StreamingArtist. »
   *
   * Les deux fiches montraient DÉJÀ le même contenu — `BioEtTitresPhares` est
   * monté par les deux depuis la page artiste commune
   * (renesenses/tune-server-rust#4330). C'est l'habillage qui divergeait :
   * `ArtisteServiceV2` posait un en-tête pleine largeur à portrait rond,
   * `ArtistesV2` un portrait carré de 84 px qui, rendu en frère direct de son
   * corps dans le `.body{display:flex}` de `LibraryV2`, devenait une COLONNE
   * de gauche et comprimait les titres phares dans la moitié restante.
   *
   * 🔴 POURQUOI UN COMPOSANT, ET PAS UN SECOND BLOC RECOPIÉ.
   *
   * C'est précisément ce que #4330 cherchait à éviter : deux habillages
   * concurrents divergent au premier correctif — on vient d'en payer le prix
   * pendant trois semaines. La forme ne se décide donc qu'ICI.
   *
   * Ce qui reste à l'appelant : ses ACTIONS, passées en extrait (`actions`).
   * Elles n'ont pas le même contenu des deux côtés et ne peuvent pas l'avoir
   * (voir la mesure action par action dans la PR de #1356) ; les passer en
   * propriétés aurait demandé une douzaine de drapeaux, ce qui serait pire que
   * le bloc recopié qu'on supprime. Un extrait est rendu dans la portée de
   * l'APPELANT : chaque fiche garde donc ses propres styles de pastille.
   */
  import type { Snippet } from 'svelte';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import { t, locale } from '../../lib/i18n';
  import { nomPays } from '../../lib/paysMonde';
  import { drapeauPays } from '../../lib/bibliothequePays';
  import EcoutesCommunaute from '../partages/EcoutesCommunaute.svelte';
  import type { PorteEcoutes } from '../../lib/ecoutesCommunaute';
  import type { CompteursCredits } from '../../lib/api';
  import type { ChiffreArtiste } from '../../lib/pageArtisteMaquette';

  interface Props {
    /** Le nom affiché. */
    nom: string;
    /**
     * La ligne sous le nom : d'où vient cette fiche — `QOBUZ` pour un artiste
     * de service, `BIBLIOTHÈQUE` pour un artiste local. Déjà en majuscules à
     * l'écran (`text-transform`), pas dans la traduction.
     */
    provenance?: string | null;
    /** Le portrait, s'il y en a un. */
    imagePath?: string | null;
    /** Le repli quand il n'y a pas de portrait. */
    initiales?: string;
    /**
     * Une ligne de plus sous la provenance — « 11 albums ». Elle n'existe que
     * côté bibliothèque : `/library/artists` le compte, un service non.
     */
    sousTitre?: string | null;
    onRetour: () => void;
    /** Les pastilles d'action de la fiche. */
    actions?: Snippet;
    /**
     * #2298 — l'artiste local tel que `/library/artists/{id}` le rend : son
     * `community_listens` donne « Miles Davis (43 100) ». Rien sans le champ.
     */
    ecoutes?: PorteEcoutes | null;
    /**
     * Lot 2 (web#2639) — les compteurs « interprète / écriture » que sert
     * `credit_counts` (tune-server-rust#7767), sur toute la bibliothèque.
     * `null` devant un serveur antérieur : rien n'est affiché, et rien n'est
     * recalculé ici. Un compteur à zéro n'est pas montré non plus — « Écriture :
     * 0 album » n'apprend rien (choix conservateur, à trancher par Bertrand).
     */
    compteurs?: CompteursCredits | null;
    /**
     * tune-server-rust#8668 — le pays de l'artiste (code ISO, MusicBrainz),
     * tel que `/library/artists/{id}` le rend. Rien s'il est inconnu.
     */
    pays?: string | null;
    /** #8668 — un clic sur le pays : la Bibliothèque, albums filtrés sur ce pays. */
    onPays?: ((code: string) => void) | null;
    /**
     * Maquette de Levente (Figma 616:5810, rc12) — `maquette` : grand portrait,
     * provenance en surtitre, nom en caractères de titre, et les CHIFFRES à
     * droite. `standard` (défaut) : la forme d'avant, inchangée.
     */
    disposition?: 'standard' | 'maquette';
    /**
     * Les chiffres de la colonne de droite (`chiffresEnTete`) — seulement en
     * disposition `maquette`, et seulement ceux qui ont une donnée. Quand ils
     * sont là, le compte d'albums et les compteurs de la ligne d'identité y
     * passent : la même donnée n'est pas lue deux fois.
     */
    chiffres?: ChiffreArtiste[];
  }
  let {
    nom,
    provenance = null,
    imagePath = null,
    initiales = '',
    sousTitre = null,
    onRetour,
    actions,
    ecoutes = null,
    compteurs = null,
    pays = null,
    onPays = null,
    disposition = 'standard',
    chiffres = [],
  }: Props = $props();
  const maquette = $derived(disposition === 'maquette');
  const avecChiffres = $derived(maquette && chiffres.length > 0);
  const codePays = $derived(pays && drapeauPays(pays) ? pays.trim().toUpperCase() : null);

  const ligneCompteur = (cle: string, c: { albums: number; tracks: number }) =>
    $t(cle as any).replace('{albums}', String(c.albums)).replace('{tracks}', String(c.tracks));

  /**
   * web#2191 (fil 2274) — « Pour 'Artistes', "<" toujours accessible en
   * superposition comme pour les boutons 'Recherche' et 'Raccourci' ».
   * Le Retour de l'en-tête part avec lui quand on descend dans une fiche
   * riche. Un second Retour, collant, apparaît dès que l'en-tête est sorti
   * du cadre — et seulement alors, pour ne pas en montrer deux.
   */
  let tete = $state<HTMLElement | null>(null);
  let teteHorsCadre = $state(false);
  $effect(() => {
    const el = tete;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver((entrees) => {
      for (const e of entrees) teteHorsCadre = !e.isIntersecting;
    });
    obs.observe(el);
    return () => obs.disconnect();
  });
</script>

<div class="retour-flottant" class:visible={teteHorsCadre} aria-hidden={!teteHorsCadre}>
  <button class="retour" onclick={onRetour} aria-label={$t('common.back' as any)}
    tabindex={teteHorsCadre ? 0 : -1}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
  </button>
</div>
<header class="tete" class:maquette class:avec-chiffres={avecChiffres} bind:this={tete}>
  <button class="retour" onclick={onRetour} aria-label={$t('common.back' as any)}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
  </button>
  <div class="portrait">
    <AlbumArt coverPath={imagePath} albumId={null} size={0} recadrer alt={nom} fallbackInitials={initiales} />
  </div>
  <div class="ident">
    <!-- Maquette : les écoutes de la communauté passent dans les chiffres
         (vérification sur le .18 du 15/11 : « Pink Floyd (308) »). -->
    <h1>{nom}{#if !maquette}<EcoutesCommunaute objet={ecoutes} />{/if}</h1>
    {#if provenance}<span class="prov">{provenance}</span>{/if}
    {#if sousTitre}<span class="cpt">{sousTitre}</span>{/if}
    {#if codePays}
      <!-- #8668 — le pays de l'artiste, lien vers les albums de ce pays. -->
      <button type="button" class="pays" data-pays-artiste={codePays} disabled={!onPays}
        title={$t('v2.art.countryLink' as any).replace('{pays}', nomPays(codePays, $locale))}
        onclick={() => onPays?.(codePays!)}>
        <span class="drapeau" aria-hidden="true">{drapeauPays(codePays)}</span>{nomPays(codePays, $locale)}
      </button>
    {/if}
    {#if compteurs && (compteurs.performing?.tracks || compteurs.writing?.tracks)}
      <span class="cpt credits" data-compteurs>
        {#if compteurs.performing?.tracks}<span data-compteur="performing">{ligneCompteur('v2.disco.performingCount', compteurs.performing)}</span>{/if}
        {#if compteurs.writing?.tracks}<span data-compteur="writing">{ligneCompteur('v2.disco.writingCount', compteurs.writing)}</span>{/if}
      </span>
    {/if}
    {#if actions}
      <div class="gestes">{@render actions()}</div>
    {/if}
  </div>
  {#if avecChiffres}
    <!-- Maquette de Levente : les chiffres de l'artiste, à droite. -->
    <ul class="chiffres" data-chiffres-artiste>
      {#each chiffres as c (c.cle)}
        <li data-chiffre={c.cle}>
          <svg class="ic" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            {#if c.icone === 'albums'}<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>
            {:else if c.icone === 'ecoutes'}<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/>
            {:else if c.icone === 'interprete'}<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>
            {:else}<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>{/if}
          </svg>
          <span class="valeur">{c.valeur.toLocaleString($locale)}</span>
          <span class="libelle">{c.libelle}</span>
          {#if c.albums}<span class="detail" data-chiffre-albums>{c.albums.toLocaleString($locale)} {$t('v2.art.albums' as any)}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}
</header>

<style>
  /* La forme exacte de `.tete` d'`ArtisteServiceV2`, déplacée ici. */
  .tete{display:flex; align-items:center; gap:18px; padding:18px 0 22px}
  .retour{width:34px; height:34px; border-radius:9px; border:1px solid var(--v2-line2);
    background:transparent; color:var(--v2-txt2); cursor:pointer; display:grid; place-items:center; flex:none}
  .retour:hover{color:var(--v2-txt); border-color:var(--v2-txt3)}
  .retour svg{width:17px; height:17px}
  /* web#2191 — collant au haut du conteneur qui défile (`.v2-fas`), sans
     hauteur propre : il ne pousse rien, il se superpose. */
  .retour-flottant{position:sticky; top:10px; height:0; z-index:6; pointer-events:none;
    opacity:0; transition:opacity .15s ease}
  .retour-flottant.visible{opacity:1}
  .retour-flottant.visible .retour{pointer-events:auto}
  .retour-flottant .retour{background:var(--v2-bg); box-shadow:0 2px 10px rgba(0,0,0,.25)}
  /*
    PORTRAIT ROND — arbitrage de Bertrand du 20/09/2026 (#1356), qui ne porte
    que sur l'EN-TÊTE DE FICHE.

    🔴 Il ne rouvre pas la décision du 03/09 sur la VIGNETTE DE GRILLE, qui
    reste carrée : ses trois mesures tiennent toujours là-bas — un cercle
    jetterait 21 % d'une image de service déjà carrée, et les quatre icônes de
    `PochetteActions` tomberaient dans le vide autour du disque. L'en-tête,
    lui, n'est enveloppé d'aucun `PochetteActions`, et c'est la forme qu'il
    portait déjà côté service.

    La forme se décide à DEUX endroits — ce rayon-ci, et le drapeau `round`
    d'`AlbumArt`, qui arrondit l'image elle-même. On garde le premier : le
    cadre est rond, l'image le remplit et déborde de ses coins.
  */
  .portrait{width:92px; height:92px; border-radius:50%; overflow:hidden; flex:none; background:var(--v2-line2)}
  .portrait :global(img){width:100%; height:100%; object-fit:cover; display:block}
  .ident h1{margin:0; font:600 calc(26px * var(--v2-txt-echelle, 1))/1.15 var(--v2-sans)}
  /* 🔴 `.prov`, PAS `.svc` : `.svc` nommait les sections par service que la
     discographie commune a supprimées, et un garde de #4330 vérifie qu'il
     n'en reste aucune dans la fiche. Réemployer ce nom pour la provenance
     aurait fait rougir ce garde — et surtout brouillé ce qu'il mesure. */
  .prov{display:block; font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3);
    text-transform:uppercase; letter-spacing:.06em}
  .cpt{display:block; font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3); margin-top:3px}
  .credits{display:flex; flex-wrap:wrap; gap:4px 14px}
  .pays{display:inline-flex; align-items:center; gap:6px; margin-top:6px; padding:2px 10px; border:1px solid var(--v2-line2);
    border-radius:999px; background:none; color:var(--v2-txt2); font:inherit; font-size:calc(12px * var(--v2-txt-echelle, 1)); cursor:pointer}
  .pays:hover:not(:disabled){background:var(--v2-hover); color:var(--v2-txt)}
  .pays:disabled{cursor:default}
  .pays:focus-visible{outline:2px solid var(--v2-focus); outline-offset:2px}
  .drapeau{font-size:calc(14px * var(--v2-txt-echelle, 1)); line-height:1}
  .gestes{display:flex; flex-wrap:wrap; gap:8px; margin-top:10px}

  /* ── Maquette de Levente (Figma 616:5810, rc12) ──────────────────────────
     Le portrait reste ROND (arbitrage du 20/09, #1356) : la maquette le
     dessine carré à coins arrondis, ce point est laissé à Bertrand. */
  .tete.maquette{align-items:flex-start; gap:28px; padding:22px 0 26px; flex-wrap:wrap}
  /* Recette du 15/11 : les chiffres venaient sous la grappe fixe du haut à
     droite (recherche, signet, avatar). La réserve commune `--v2-grappe-w`
     (comme la fiche album, #3064) leur laisse la place. */
  @media (min-width: 641px){
    .tete.maquette{padding-right:var(--v2-grappe-w, 172px)}
  }
  .tete.maquette .portrait{width:160px; height:160px}
  .tete.maquette .ident{display:flex; flex-direction:column; align-items:flex-start; flex:1 1 320px; min-width:0}
  .tete.maquette .ident h1{font:500 calc(46px * var(--v2-txt-echelle, 1))/1.08 var(--font-display, Georgia, serif);
    color:var(--v2-txt); overflow-wrap:break-word; word-break:normal; hyphens:manual}
  .tete.maquette .prov{order:-1; margin:4px 0 6px; font:600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans);
    letter-spacing:.1em; color:var(--v2-acc1)}
  .tete.maquette .gestes{margin-top:16px; align-items:center}
  .tete.avec-chiffres .ident .cpt{display:none}
  .chiffres{list-style:none; margin:0; padding:6px 0 6px 28px; border-left:1px solid var(--v2-line2);
    display:flex; gap:8px 26px; flex:none; align-self:center}
  .chiffres li{display:flex; flex-direction:column; align-items:center; text-align:center; min-width:76px; gap:3px}
  .chiffres .ic{color:var(--v2-acc1); margin-bottom:6px}
  .chiffres .valeur{font:600 calc(16px * var(--v2-txt-echelle, 1)) var(--v2-sans); color:var(--v2-txt)}
  .chiffres .detail{font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3)}
  .chiffres .libelle{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3); max-width:110px}
  /* Fil 3087 : `flex-wrap` vaut pour toute largeur (voir `.tete.maquette`) —
     l'identité garde au moins 320 px, les chiffres passent dessous sinon.
     L'habillage « chiffres en dessous » (filet du haut, sans filet gauche)
     doit suivre ce passage à la ligne réel. Ligne seule requise : réserve
     172 + portrait 160 + 2 gaps 56 + identité 320 + chiffres ~510 + coquille
     (barre latérale 330 + marges ~90) ~ 1640 px de fenêtre ; on retient 1640
     px (barre latérale ouverte, 4 chiffres) : en dessous, la ligne unique
     n'est plus garantie ; à 1280 et 1440 px les chiffres sont dessous, avec
     le bon habillage. Barre fermée ou moins de chiffres : empilés sans
     nécessité, jamais mal habillés. */
  @media (max-width: 1640px){
    .chiffres{order:3; flex-basis:100%; border-left:0; border-top:1px solid var(--v2-line2); padding:14px 0 0;
      justify-content:flex-start}
  }
  @media (max-width: 640px){
    /* Les icônes fixes du haut de la coquille (recherche, signet, avatar)
       recouvraient le surtitre (vérification sur le .18 du 15/11). */
    .tete.maquette{gap:16px; padding-top:64px}
    .tete.maquette .portrait{width:96px; height:96px}
    .tete.maquette .ident h1{font-size:calc(30px * var(--v2-txt-echelle, 1))}
    .chiffres{gap:8px 14px}
    .chiffres li{min-width:64px}
  }
</style>
