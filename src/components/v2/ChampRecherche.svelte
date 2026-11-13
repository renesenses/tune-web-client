<script lang="ts">
  /**
   * LE champ de recherche DANS un écran — un seul composant pour tous.
   *
   * Bertrand, recette rc12 (13/11/2026) : « Harmonise la localisation de la
   * zone de recherche dans tous les écrans. » Chaque écran redessinait son
   * champ (`.v2-rech` recopié, `.chercher`, `.search`, `.search-box`) : avec
   * ou sans croix, Échap ou pas, une invite par écran.
   *
   * La règle (garde : `src/lib/__tests__/champRechercheEmplacement.test.ts`) :
   * - EMPLACEMENT : dans l'en-tête de l'écran (`header.v2-top > .v2-actions`),
   *   en PREMIER, avant les onglets et les boutons ;
   * - LARGEUR : 260 px ; sous 1000 px il cède sa largeur fixe avant les
   *   boutons ; sous 780 px il prend toute la largeur, sous le titre
   *   (`styles/tune-v2.css`) ;
   * - INVITE : « Rechercher dans <écran>… » (`v2.rech.dans`) ;
   * - une croix quand il y a du texte, Échap efface (un second Échap, champ
   *   vide, laisse l'événement aux écrans qui rendent le focus — #1872).
   *
   * Le comportement (ce qui est cherché, l'anti-rebond) reste à l'écran : ce
   * composant ne fait que porter la valeur.
   */
  import { t } from '../../lib/i18n';

  let {
    valeur = $bindable(''),
    ecran,
    champ = $bindable(null),
    enCours = false,
    raccourci,
    onvider,
    onsaisie,
    onkeydown,
  }: {
    /** Le texte tapé. */
    valeur?: string;
    /** Le nom de l'écran, tel que l'utilisateur le lit (son titre, l'onglet). */
    ecran: string;
    /** Le `<input>`, pour un raccourci de focus déjà en place (« / », ⌘F). */
    champ?: HTMLInputElement | null;
    /** Une recherche part au serveur : un témoin d'attente remplace la croix. */
    enCours?: boolean;
    /** `aria-keyshortcuts`, seulement si l'écran a déjà un raccourci. */
    raccourci?: string;
    /** Appelé APRÈS l'effacement (croix ou Échap). */
    onvider?: () => void;
    /** Chaque frappe, pour un écran qui lance lui-même sa recherche. */
    onsaisie?: (v: string) => void;
    /** Les autres touches (Entrée…), laissées à l'écran. */
    onkeydown?: (e: KeyboardEvent) => void;
  } = $props();

  const invite = $derived(($t('v2.rech.dans' as any) as string).replace('{ecran}', ecran));

  function vider() {
    valeur = '';
    onsaisie?.('');
    onvider?.();
  }

  function clavier(e: KeyboardEvent) {
    if (e.key === 'Escape' && valeur) {
      // `preventDefault` : le gestionnaire de #1872 (focus rendu) attend le
      // second Échap, sur un champ déjà vide.
      e.preventDefault();
      vider();
      return;
    }
    onkeydown?.(e);
  }
</script>

<div class="v2-rech" data-champ-recherche role="search">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
  <input bind:this={champ} bind:value={valeur} type="text" autocomplete="off" spellcheck="false"
    placeholder={invite} aria-label={invite} aria-keyshortcuts={raccourci}
    oninput={() => onsaisie?.(valeur)} onkeydown={clavier} />
  {#if enCours}
    <span class="spin" aria-hidden="true"></span>
  {:else if valeur}
    <button type="button" class="clr" onclick={vider} aria-label={$t('common.clear' as any)} title={$t('common.clear' as any)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  {/if}
</div>

<style>
  .spin{position:absolute; right:13px; width:13px; height:13px; border:2px solid var(--v2-line2);
    border-top-color:var(--v2-acc1); border-radius:50%; animation:sp .7s linear infinite}
  @keyframes sp{to{transform:rotate(360deg)}}
</style>
