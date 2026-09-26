<script lang="ts">
  /**
   * Le menu « … » d'un OBJET — album, artiste, playlist, playlist intelligente,
   * collection, collection intelligente, label.
   *
   * Bertrand, 26/09/2026 : « Il doit y avoir un menu contextuel pour :
   * artistes, playlists, collections, labels » — puis les albums —, sur le
   * modèle du menu « … » des pistes. Un seul composant pour les VIGNETTES
   * (`PochetteActions` l'appelle depuis son coin bas-gauche, `bouton={false}`)
   * et pour les LIGNES (il y pose alors son propre bouton « … »).
   *
   * ## Le contenu ne vit PAS ici
   *
   * `lib/actionsPochette` décide des entrées, `lib/gestesObjet` les fait. Ce
   * composant ne reçoit que l'OBJET : c'est ce qui donne le même menu au même
   * album dans la Bibliothèque, l'Accueil, la Recherche et les Favoris. Il
   * n'ajoute que les trois gestes qui ouvrent une fenêtre qu'il porte lui-même
   * — étiquettes, crédits, éditeur de règles.
   *
   * ## Le menu est PORTÉ à la racine du document
   *
   * Comme `MenuPisteV2` et pour la même raison : une ligne en
   * `content-visibility: auto`, une pochette en `overflow: hidden`, une grille
   * qui défile rognent un panneau ancré dans la ligne. Le nœud part à la racine
   * (`lib/portail`) et se place aux coordonnées ÉCRAN du bouton
   * (`lib/ancrageMenu`), hauteur bornée et défilement interne (#1575).
   *
   * ## Les sous-menus se lisent AU CLIC
   *
   * « Ajouter à une collection » et « Déplacer vers… » lisent collections et
   * rayons quand on les choisit, jamais au survol d'une vignette : une grille
   * de 800 albums ne doit pas partir en 800 requêtes.
   */
  import { t } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import { styleMenuAncre } from '../../lib/ancrageMenu';
  import { cibleEtiquetteObjet, entreesObjet, objetAUnMenu, pistesDe, type ObjetMenu } from '../../lib/gestesObjet';
  import type { EntreePochette, GestesPochette, SousEntreePochette } from '../../lib/actionsPochette';
  import { notifications } from '../../lib/stores/notifications';

  interface Props {
    objet: ObjetMenu;
    /** Gestes PROPRES à la surface (retirer de la collection ouverte), ou un
     *  autre chemin pour « Ouvrir ». Ils ne changent jamais la liste. */
    gestes?: GestesPochette;
    /** Relire la liste de l'écran après renommer, dupliquer, supprimer… */
    rafraichir?: () => void;
    dansCollectionManuelle?: boolean;
    /** `false` : pas de bouton propre, le parent appelle `basculer()`. */
    bouton?: boolean;
    /** Nom de l'objet, pour les libellés d'accessibilité. */
    nom?: string;
    /** Prévenu à chaque ouverture et fermeture (le coin de `PochetteActions`
     *  reste visible tant que son menu est ouvert). */
    surOuverture?: (ouvert: boolean) => void;
  }
  let {
    objet,
    gestes = {},
    rafraichir,
    dansCollectionManuelle = false,
    bouton = true,
    nom = '',
    surOuverture,
  }: Props = $props();

  type Ancre = { top: number; bottom: number; right: number };
  let ancre = $state<Ancre | null>(null);
  let entrees = $state.raw<EntreePochette[]>([]);
  let sous = $state.raw<{ titre: string; lignes: SousEntreePochette[] } | null>(null);
  let panneauEtiquettes = $state(false);
  let creditsPistes = $state.raw<any[] | null>(null);
  let editeur = $state<'playlist' | 'collection' | null>(null);

  /** Lue à l'ouverture seulement : une liste de 6 000 lignes monte 6 000 menus. */
  let cible = $state.raw<ReturnType<typeof cibleEtiquetteObjet>>(null);

  /** Les gestes que CE composant sait tenir : il porte leurs fenêtres. */
  function gestesDuComposant(): GestesPochette {
    const g: GestesPochette = {};
    if (cible) g.etiqueter = () => (panneauEtiquettes = true);
    if (objet.type === 'album') g.credits = () => void ouvrirCredits();
    if (objet.type === 'playlistIntelligente') g.modifierRegles = () => (editeur = 'playlist');
    if (objet.type === 'collectionIntelligente') g.modifierRegles = () => (editeur = 'collection');
    return g;
  }
  function calculer(traduire: (k: string) => string): EntreePochette[] {
    return entreesObjet(objet, traduire, {
      gestes: { ...gestesDuComposant(), ...gestes },
      rafraichir,
      dansCollectionManuelle,
    });
  }

  /**
   * Le bouton n'existe que s'il y a au moins une entrée : absent, pas grisé.
   * `objetAUnMenu` le dit sans composer le menu — une liste de 6 704 albums
   * (fil 1919) ne doit pas calculer 6 704 menus pour peindre ses lignes.
   */
  const aDesEntrees = $derived(objetAUnMenu(objet, gestes));

  /**
   * Ouvre (ou referme) le menu sous la boîte ÉCRAN donnée. Les entrées sont
   * calculées À L'OUVERTURE : l'état favori, les greffons chargés sont ceux de
   * cet instant-là.
   */
  export function basculer(boite: Ancre): void {
    if (ancre) { fermer(); return; }
    cible = cibleEtiquetteObjet(objet);
    entrees = calculer((k) => $t(k as any));
    sous = null;
    ancre = { top: boite.top, bottom: boite.bottom, right: boite.right };
    surOuverture?.(true);
  }
  export function fermer(): void {
    const etait = ancre != null;
    ancre = null;
    sous = null;
    if (etait) surOuverture?.(false);
  }
  export function estOuvert(): boolean {
    return ancre != null;
  }

  const lignes = $derived(sous ? sous.lignes.length + 1 : entrees.length);
  const style = $derived(ancre ? styleMenuAncre(ancre, lignes, window) : '');

  function surBouton(ev: MouseEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    basculer((ev.currentTarget as HTMLElement).getBoundingClientRect());
  }

  async function choisir(ev: MouseEvent, e: EntreePochette) {
    ev.stopPropagation();
    ev.preventDefault();
    if (e.sous) {
      let lues: SousEntreePochette[] = [];
      try {
        lues = await e.sous();
      } catch {
        lues = [];
      }
      if (!lues.length) {
        fermer();
        notifications.error($t('common.error' as any));
        return;
      }
      sous = { titre: e.libelle, lignes: lues };
      return;
    }
    fermer();
    e.faire();
  }
  function choisirSous(ev: MouseEvent, l: SousEntreePochette) {
    ev.stopPropagation();
    ev.preventDefault();
    if (!l.faire) return;
    fermer();
    l.faire();
  }
  function revenir(ev: MouseEvent) {
    ev.stopPropagation();
    ev.preventDefault();
    sous = null;
  }

  /** Un défilement de la PAGE ferme le menu ; le sien propre, non (#1575). */
  function surRoulette(ev: WheelEvent) {
    const cibleEv = ev.target as Element | null;
    if (cibleEv && typeof cibleEv.closest === 'function' && cibleEv.closest('.menu')) return;
    fermer();
  }
  /**
   * Échap et un redimensionnement referment — écoutés SEULEMENT pendant que le
   * menu est ouvert : un `<svelte:window>` par ligne, ce seraient des milliers
   * d'écouteurs sur une grande bibliothèque.
   */
  $effect(() => {
    if (!ancre) return;
    const clavier = (ev: KeyboardEvent) => { if (ev.key === 'Escape') fermer(); };
    const taille = () => fermer();
    window.addEventListener('keydown', clavier);
    window.addEventListener('resize', taille);
    return () => {
      window.removeEventListener('keydown', clavier);
      window.removeEventListener('resize', taille);
    };
  });

  async function ouvrirCredits() {
    try {
      creditsPistes = await pistesDe(objet);
    } catch {
      creditsPistes = [];
    }
  }
  const cibleCredits = $derived({
    type: 'album' as const,
    albumId: objet.id ?? null,
    service: objet.id == null && objet.service && objet.sourceId
      ? { service: objet.service, albumId: objet.sourceId }
      : null,
    titre: objet.nom ?? null,
    artiste: objet.artisteNom ?? null,
    pistes: (creditsPistes ?? []) as any[],
  });
</script>

{#if bouton && aDesEntrees}
  <button
    class="mo-bouton"
    class:ouvert={!!ancre}
    aria-haspopup="menu"
    aria-expanded={!!ancre}
    aria-label={nom ? `${$t('v2.cover.more' as any)} — ${nom}` : $t('v2.cover.more' as any)}
    title={$t('v2.cover.more' as any)}
    onclick={surBouton}
  >
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
  </button>
{/if}

<!-- Le fond ferme au clic ET consomme l'événement : la vignette ou la ligne
     qu'il recouvre s'ouvre au clic, refermer le menu ne doit pas l'ouvrir. -->
{#if ancre}
  <div class="fond tune-v2" role="presentation" use:portail
    onclick={(e) => { e.stopPropagation(); e.preventDefault(); fermer(); }}
    onwheel={surRoulette}>
    <div class="menu" role="menu" style={style} data-type={objet.type}>
      {#if sous}
        <button role="menuitem" class="mo-retour" onclick={revenir}>‹ {sous.titre}</button>
        {#each sous.lignes as l (l.cle)}
          {#if l.faire}
            <button role="menuitem" title={l.libelle} style={`padding-left:${10 + 12 * (l.profondeur ?? 0)}px`}
              onclick={(ev) => choisirSous(ev, l)}>{l.libelle}</button>
          {:else}
            <div class="mo-intertitre" style={`padding-left:${10 + 12 * (l.profondeur ?? 0)}px`}>{l.libelle}</div>
          {/if}
        {/each}
      {:else}
        {#each entrees as e, i (i)}
          <button role="menuitem" class:danger={e.danger} class:mo-sous={!!e.sous} title={e.libelle}
            data-cle={e.cle} onclick={(ev) => choisir(ev, e)}>{e.libelle}</button>
        {/each}
      {/if}
    </div>
  </div>
{/if}

{#if panneauEtiquettes && cible}
  {#await import('./EtiquettesPanneau.svelte') then m}
    <m.default cible={cible} nom={nom || objet.nom || ''} onClose={() => (panneauEtiquettes = false)} />
  {/await}
{/if}

{#if creditsPistes && objet.type === 'album'}
  {#await import('../partages/CreditsTiroir.svelte') then m}
    <m.default cible={cibleCredits} onClose={() => (creditsPistes = null)} />
  {/await}
{/if}

{#if editeur === 'playlist' && objet.id != null}
  {#await import('./PlaylistSmartEditeurV2.svelte') then m}
    <m.default id={objet.id} onClose={() => (editeur = null)} onSaved={() => { editeur = null; rafraichir?.(); }} />
  {/await}
{:else if editeur === 'collection' && objet.id != null}
  {#await import('./CollectionSmartEditeurV2.svelte') then m}
    <m.default id={objet.id} onClose={() => (editeur = null)} onSaved={() => { editeur = null; rafraichir?.(); }} />
  {/await}
{/if}

<style>
  .mo-bouton {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--v2-txt2, currentColor);
    cursor: pointer;
    padding: 0;
  }
  .mo-bouton svg { width: 16px; height: 16px; }
  .mo-bouton:hover,
  .mo-bouton.ouvert { background: var(--v2-hover); color: var(--v2-txt); }
  .mo-bouton:focus-visible { outline: 2px solid var(--v2-acc1, #f97316); outline-offset: 1px; }

  /*
    🔴 `position: fixed` est INDISPENSABLE : `styleMenuAncre` ne rend que
    `left`, `top`/`bottom` et `max-height`, lus contre la FENÊTRE.
  */
  .fond { position: fixed; inset: 0; z-index: 900; }
  .menu {
    position: fixed;
    /* = LARGEUR_MENU de lib/ancrageMenu. */
    width: 208px;
    z-index: 901;
    overflow-y: auto;
    padding: 5px;
    border-radius: 10px;
    background: var(--v2-surface);
    border: 1px solid var(--v2-line2);
    box-shadow: var(--v2-sh-menu);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .menu button,
  .mo-intertitre {
    border: 0;
    background: transparent;
    color: var(--v2-txt);
    font: 500 12.5px var(--v2-sans);
    padding: 7px 10px;
    border-radius: 7px;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .menu button { cursor: pointer; }
  .menu button:hover { background: var(--v2-hover); }
  .menu button.danger { color: var(--v2-danger); }
  .menu button.mo-sous::after { content: ' ›'; }
  .menu .mo-retour { font-weight: 600; }
  .mo-intertitre { font-weight: 600; opacity: 0.7; cursor: default; }
</style>
