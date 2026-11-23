<script lang="ts">
  /**
   * DÉMO — les pictogrammes, au trait du client (SVG en ligne, 24×24, trait
   * `currentColor` de 1,7, bouts arrondis), comme les onglets de `CircleV2`.
   * Le client n'a PAS de bibliothèque d'icônes (ni lucide, ni autre) : chaque
   * écran dessine les siennes en ligne. Les quatre premières sont COPIÉES des
   * onglets de `CircleV2` ; les autres suivent le même trait.
   */
  type Nom = 'globe' | 'message' | 'playlist' | 'personnes' | 'recherche' | 'plus' | 'envoyer' | 'lecture'
    | 'plus-options' | 'note' | 'ecrire' | 'inviter' | 'grille' | 'liste' | 'lieu' | 'cercle';
  let { nom, taille = 16 }: { nom: Nom; taille?: number } = $props();
</script>

<svg viewBox="0 0 24 24" width={taille} height={taille} aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  {#if nom === 'globe'}<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" stroke-width="1.5"/>
  {:else if nom === 'message'}<path d="M4 5h16v11H9l-5 4z"/>
  {:else if nom === 'playlist'}<path d="M4 6h12M4 11h12M4 16h7M17 18V9l4-1"/><circle cx="15" cy="18" r="2"/>
  {:else if nom === 'personnes'}<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4" stroke-width="1.6"/><path d="M3 19a6 6 0 0 1 12 0M15 15a5 5 0 0 1 6 4" stroke-width="1.6"/>
  {:else if nom === 'recherche'}<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.2-4.2"/>
  {:else if nom === 'plus'}<path d="M12 5v14M5 12h14"/>
  {:else if nom === 'envoyer'}<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>
  {:else if nom === 'lecture'}<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>
  {:else if nom === 'plus-options'}<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>
  {:else if nom === 'note'}<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>
  {:else if nom === 'ecrire'}<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>
  {:else if nom === 'inviter'}<circle cx="10" cy="8" r="3.5"/><path d="M3 20a7 7 0 0 1 14 0M19 8v6M16 11h6"/>
  {:else if nom === 'grille'}<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>
  {:else if nom === 'liste'}<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>
  {:else if nom === 'lieu'}<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>
  {:else if nom === 'cercle'}<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>
  {/if}
</svg>
