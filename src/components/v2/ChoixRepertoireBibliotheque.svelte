<script lang="ts">
  /**
   * Le panneau du bouton « Répertoire » de la Bibliothèque —
   * tune-server-rust#7597 (suite, Bertrand 31/10/2026).
   *
   * Aucun sélecteur neuf : c'est `OxygenFolderFacet` (fil d'Ariane + dossiers
   * enfants), le même que la facette Répertoire d'Oxygène et que
   * `SmartFolderPicker`, alimenté par `/library/folder-facet` — dérivé de
   * `tracks.file_path`, la colonne même que la portée filtrera, donc juste
   * quelle que soit la forme Unicode (voir `SmartFolderPicker`).
   *
   * À la différence de `SmartFolderPicker`, naviguer n'est PAS choisir : chaque
   * pas rechargerait toute la Bibliothèque. On navigue, puis « Filtrer sur ce
   * dossier » pose la portée.
   */
  import { t } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import type { FolderChild, FolderCrumb } from '../../lib/api';
  import OxygenFolderFacet from '../partages/OxygenFolderFacet.svelte';
  import { normaliserChemin } from '../../lib/cheminNfc';

  interface Props {
    /** Le dossier de la portée en cours, pour rouvrir là où elle pointe. */
    courant: string | null;
    onChoisir: (dossier: string) => void;
  }
  let { courant, onChoisir }: Props = $props();

  let chemin = $state<string | null>(null);
  let crumbs = $state<FolderCrumb[]>([]);
  let enfants = $state<FolderChild[]>([]);
  let chargement = $state(false);
  let panne = $state(false);

  async function charger(p: string | null) {
    chargement = true;
    panne = false;
    try {
      const f = await api.getFolderFacet(p ? normaliserChemin(p) : p);
      chemin = f.path ?? null;
      crumbs = f.crumbs;
      enfants = f.children;
    } catch {
      panne = true;
      crumbs = [];
      enfants = [];
    } finally {
      chargement = false;
    }
  }

  void charger(courant);
</script>

<div class="choix-repertoire">
  {#if panne}
    <p class="err">{$t('smartCollection.folderUnavailable')}</p>
  {:else}
    <OxygenFolderFacet {crumbs} folders={enfants} selected={chemin} loading={chargement} onDrill={(p) => charger(p)} />
  {/if}
  <button type="button" class="appliquer" disabled={!chemin} onclick={() => chemin && onChoisir(normaliserChemin(chemin))}>
    {$t('v2.lib.folderApply' as any)}
  </button>
</div>

<style>
  .choix-repertoire {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: min(360px, 80vw);
    max-height: 340px;
    overflow: auto;
  }
  .appliquer {
    align-self: flex-end;
    border: 1px solid var(--tune-accent);
    border-radius: 6px;
    background: transparent;
    color: var(--tune-accent);
    font: inherit;
    font-size: 12px;
    padding: 4px 10px;
    cursor: pointer;
  }
  .appliquer:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .err {
    margin: 0;
    padding: 6px;
    font-size: 12px;
    color: var(--tune-text-secondary);
  }
</style>
