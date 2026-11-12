<script lang="ts">
  /**
   * web#2736 — le bouton qui OUVRE un menu d'en-tête de fiche (« … » d'un
   * album, d'une collection, d'une playlist ; « Trier ▾ » ; « + Nouvelle » ; la
   * flèche du bouton Lecture).
   *
   * Bertrand, 09/11/2026 : « moins de boutons ». Les gestes ne disparaissent
   * pas, ils passent dans un menu — et ce menu est CELUI des pistes
   * (`MenuPisteV2`) : même panneau porté à la racine, même placement
   * (`lib/ancrageMenu`), mêmes règles clavier. On n'en écrit pas un troisième.
   *
   * ## Le déclencheur appartient à l'APPELANT
   *
   * Le bouton est rendu par un fragment (`declencheur`) que l'écran écrit
   * lui-même : il garde ses classes et ses styles (un `.ghost` de la fiche
   * album n'est pas un `.v2-btn` des collections). Ce composant ne fournit que
   * les attributs du motif « menu button » de l'ARIA APG — `aria-haspopup`,
   * `aria-expanded`, le clic et ↓ / ↑ qui ouvrent — à étaler sur le bouton.
   *
   * ## Les entrées sont calculées À L'OUVERTURE
   *
   * `entrees` est une fonction : l'état « déjà dans le sas », une requête en
   * cours, le tri courant sont ceux de l'instant où l'on ouvre. Une liste
   * vide n'ouvre rien.
   */
  import type { Snippet } from 'svelte';
  import MenuPisteV2 from './MenuPisteV2.svelte';
  import type { EntreeMenu } from '../../lib/menuPiste';

  interface AttributsDeclencheur {
    type: 'button';
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    onclick: (ev: MouseEvent) => void;
    onkeydown: (ev: KeyboardEvent) => void;
  }
  interface Props {
    entrees: () => EntreeMenu[];
    declencheur: Snippet<[AttributsDeclencheur]>;
    /** Nom accessible du menu ouvert. */
    etiquette?: string;
    largeur?: number;
  }
  let { entrees, declencheur, etiquette, largeur }: Props = $props();

  let ancre = $state<DOMRect | null>(null);
  let liste = $state.raw<EntreeMenu[]>([]);
  let bouton: HTMLElement | null = null;

  function ouvrir(el: HTMLElement) {
    const l = entrees();
    if (!l.length) return;
    bouton = el;
    liste = l;
    ancre = el.getBoundingClientRect();
  }
  function fermer() { ancre = null; }
  /** Pour l'appelant qui doit refermer le menu (changement d'album…). */
  export function estOuvert(): boolean { return ancre != null; }

  function surClic(ev: MouseEvent) {
    ev.stopPropagation();
    if (ancre) { fermer(); return; }
    ouvrir(ev.currentTarget as HTMLElement);
  }
  function surTouche(ev: KeyboardEvent) {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    ev.preventDefault();
    if (!ancre) ouvrir(ev.currentTarget as HTMLElement);
  }
  const attributs = $derived<AttributsDeclencheur>({
    type: 'button',
    'aria-haspopup': 'menu',
    'aria-expanded': ancre != null,
    onclick: surClic,
    onkeydown: surTouche,
  });
</script>

{@render declencheur(attributs)}
{#if ancre}
  <MenuPisteV2 {ancre} entrees={liste} onClose={fermer} focusInitial retourFocus={bouton} {largeur} {etiquette} />
{/if}
