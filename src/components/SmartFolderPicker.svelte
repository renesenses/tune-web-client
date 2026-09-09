<script lang="ts">
  /**
   * Choix d'un répertoire pour une règle de collection intelligente.
   *
   * # Pourquoi `folder-facet` et NON `browse`
   *
   * Les deux savent lister des dossiers, et le choix entre eux décide si la
   * règle marchera.
   *
   * `/library/folders` (browse) lit le DISQUE. Il jongle donc avec les formes
   * Unicode NFC/NFD — le dossier « CDThèque » d'Yves, créé côté NAS, se lit
   * sous deux formes différentes selon le chemin emprunté. Un chemin rendu
   * sous une forme et comparé à une base qui stocke l'autre ne correspond à
   * RIEN, sans un mot d'explication. Et sur une bibliothèque démontée (NAS
   * éteint), il échoue tout court : plus moyen d'éditer sa règle.
   *
   * `/library/folder-facet` est dérivé de `tracks.file_path`, la colonne même
   * que le serveur comparera. Le chemin proposé ici correspond donc PAR
   * CONSTRUCTION, quelle que soit la normalisation, et reste consultable
   * bibliothèque démontée.
   *
   * # Ce qu'on affiche, ce qu'on garde
   *
   * L'utilisateur voit des noms courts et un fil d'Ariane — son arborescence,
   * telle qu'il la reconnaît. La règle, elle, garde le chemin ABSOLU, seul
   * comparable à ce que porte la base. Les deux viennent de la même réponse :
   * `name` pour l'écran, `path` pour la règle.
   *
   * # La saisie libre reste ouverte
   *
   * Le sélecteur couvre le cas courant — « ce dossier-ci ». Il ne couvre pas
   * le motif partiel (« tout ce qui contient Live »), ni un chemin qu'on veut
   * écrire à la main. Le champ texte est donc toujours là, lié à la MÊME
   * valeur : naviguer le remplit, taper le remplace.
   */
  import { t } from '../lib/i18n';
  import * as api from '../lib/api';
  import type { FolderChild, FolderCrumb } from '../lib/api';
  import OxygenFolderFacet from './OxygenFolderFacet.svelte';

  interface Props {
    /** Le chemin absolu porté par la règle. */
    value: string;
    onChange: (value: string) => void;
  }
  let { value, onChange }: Props = $props();

  let ouvert = $state(false);
  let chemin = $state<string | null>(null);
  let crumbs = $state<FolderCrumb[]>([]);
  let enfants = $state<FolderChild[]>([]);
  let chargement = $state(false);
  /** Le serveur n'a rien pu rendre — bibliothèque vide, ou route absente sur
   *  un serveur plus ancien. On le DIT au lieu d'afficher un panneau vide. */
  let panne = $state(false);

  async function charger(p: string | null) {
    chargement = true;
    panne = false;
    try {
      const f = await api.getFolderFacet(p);
      chemin = f.path;
      crumbs = f.crumbs;
      enfants = f.children;
      // Naviguer EST choisir : le dossier courant devient la valeur de la
      // règle. Sauf à la racine, où `path` est nul — il n'y a rien à choisir.
      if (f.path) onChange(f.path);
    } catch {
      panne = true;
      crumbs = [];
      enfants = [];
    } finally {
      chargement = false;
    }
  }

  function basculer() {
    ouvert = !ouvert;
    // On ouvre sur le dossier DÉJÀ choisi quand il y en a un : rouvrir une
    // règle existante doit montrer où elle pointe, pas repartir de la racine.
    if (ouvert && !crumbs.length) void charger(value || null);
  }
</script>

<span class="fp">
  <input
    class="value"
    placeholder={$t('smartCollection.folderPlaceholder')}
    {value}
    oninput={(e) => onChange((e.target as HTMLInputElement).value)}
  />
  <button
    type="button"
    class="browse"
    class:on={ouvert}
    onclick={basculer}
    title={$t('smartCollection.folderBrowse')}
    aria-expanded={ouvert}
  >
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"
      ><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg
    >
  </button>

  {#if ouvert}
    <div class="panneau">
      {#if panne}
        <p class="err">{$t('smartCollection.folderUnavailable')}</p>
      {:else}
        <OxygenFolderFacet
          {crumbs}
          folders={enfants}
          selected={chemin}
          loading={chargement}
          onDrill={(p) => charger(p)}
        />
      {/if}
    </div>
  {/if}
</span>

<style>
  .fp {
    position: relative;
    display: flex;
    gap: 4px;
    align-items: center;
    min-width: 0;
  }
  .fp .value {
    min-width: 0;
    flex: 1;
  }
  .browse {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    background: transparent;
    color: var(--text-dim, #9aa);
    cursor: pointer;
  }
  .browse:hover,
  .browse.on {
    color: var(--accent, #4ec9b0);
    border-color: var(--accent, #4ec9b0);
  }
  .panneau {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 40;
    width: min(420px, 80vw);
    max-height: 320px;
    overflow: auto;
    padding: 8px;
    border: 1px solid var(--border, #333);
    border-radius: 8px;
    background: var(--bg-elev, #1b1b1b);
    box-shadow: 0 8px 24px rgb(0 0 0 / 45%);
  }
  .err {
    margin: 0;
    padding: 6px;
    font-size: 12px;
    color: var(--text-dim, #9aa);
  }
</style>
