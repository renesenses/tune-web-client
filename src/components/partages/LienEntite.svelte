<script lang="ts">
  /**
   * LE NOM D'UNE ENTITÉ, CLIQUABLE — web#2770 (lot 0 du chantier rc12).
   *
   * Artiste, album, label, genre, année, playlist, radio, personne créditée :
   * le composant reçoit l'ENTITÉ, `lib/lienEntite` décide de la cible, et le
   * nom devient un lien — ou reste un texte simple, sans soulignement, quand
   * aucune cible n'est connue (« pas de lien mort »). Un nom d'artiste composé
   * (« A & B », « A feat. C ») devient UN lien PAR artiste.
   *
   * ## Pourquoi un `<span role="link">` et pas un `<button>`
   *
   * Ce nom vit presque toujours DANS un geste plus large : le bouton d'une
   * carte d'album, la ligne de la file, le bloc de la barre de lecture qui
   * ouvre Lecture en cours. Un bouton dans un bouton n'est pas du HTML valide
   * et les navigateurs le défont (leçon de `PochetteActions`). Un `span`
   * focalisable, au rôle de lien, est valide partout, se prend au clavier
   * (Entrée, Espace) et ARRÊTE la propagation : cliquer l'artiste n'ouvre pas
   * l'album derrière lui. C'est la règle « clic = navigation, jamais lecture ».
   */
  import { partiesDEntite, type Entite } from '../../lib/lienEntite';
  import { activeView } from '../../lib/stores/navigation';

  let {
    entite,
    texte = null,
    classe = '',
    titre = null,
  }: {
    entite: Entite | null | undefined;
    /** Le texte à afficher quand il diffère du nom (« (1975) » pour l'année). */
    texte?: string | null;
    /** Classes de l'écran, posées sur l'enveloppe. */
    classe?: string;
    /** L'infobulle ; à défaut, le nom. */
    titre?: string | null;
  } = $props();

  // `$activeView` : la vue d'où part le geste, pour que le Retour y ramène.
  const parties = $derived(partiesDEntite(entite, $activeView));
  const uneSeule = $derived(parties.length === 1 && texte != null);

  /**
   * 🔴 Des écouteurs NATIFS, pas `onclick` : Svelte 5 DÉLÈGUE `onclick` à la
   * racine, et un `stopPropagation` qui s'y exécute arrive APRÈS que
   * l'événement a traversé tous les ancêtres — un écouteur natif posé sur la
   * carte (`addEventListener`, une action, un composant tiers) l'aurait déjà
   * reçu, et le clic sur l'artiste aurait AUSSI ouvert l'album. Posé sur le
   * nœud lui-même, l'arrêt vaut pour tout le monde, délégués compris.
   */
  function gesteLien(node: HTMLElement, ouvrir: () => unknown) {
    let courant = ouvrir;
    const activer = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
      void courant();
    };
    const clavier = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') activer(e);
    };
    node.addEventListener('click', activer);
    node.addEventListener('keydown', clavier);
    return {
      update(o: () => unknown) { courant = o; },
      destroy() {
        node.removeEventListener('click', activer);
        node.removeEventListener('keydown', clavier);
      },
    };
  }
</script>

{#if parties.length}
  <span class="lien-entite {classe}" data-lien-entite={entite?.type}>
    {#each parties as p, i (i)}
      {#if p.ouvrir}
        <span
          class="lien"
          role="link"
          tabindex="0"
          title={titre ?? p.texte}
          use:gesteLien={p.ouvrir}
        >{uneSeule ? texte : p.texte}</span>
      {:else}
        <span class="texte" class:separateur={p.separateur}>{uneSeule ? texte : p.texte}</span>
      {/if}
    {/each}
  </span>
{/if}

<style>
  .lien-entite { display: inline; min-width: 0; max-width: 100%; }
  .lien, .texte { color: inherit; font: inherit; }
  .lien { cursor: pointer; text-decoration: none; }
  .lien:hover, .lien:focus-visible {
    text-decoration: underline;
    color: var(--v2-acc1, var(--tune-accent, inherit));
  }
  .lien:focus-visible { outline: 2px solid var(--v2-acc1, var(--tune-accent, currentColor)); outline-offset: 1px; border-radius: 3px; }
</style>
