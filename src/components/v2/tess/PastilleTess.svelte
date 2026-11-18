<script lang="ts">
  /**
   * TESS W5 — la pastille « TESS » de la barre de lecture (maquette A1, en
   * bas à droite ; icône T-onde, option C de A5). Un clic ouvre le chemin du
   * signal (A4).
   *
   * 🔴 INVISIBLE tant que le serveur n'annonce pas TESS : `lireZoneTess` rend
   * `null` sur 404/405 (contrat § 7) et la pastille ne rend RIEN — ni bouton,
   * ni place réservée.
   */
  import { t } from '../../../lib/i18n';
  import { lireZoneTess, type ZoneTess } from '../../../lib/tess/contrat';
  import { ouvrirEcranTess } from '../../../lib/tess/navigationTess';
  import CheminDuSignalTess from './CheminDuSignalTess.svelte';

  let { zoneId, appareil = null, revision = null }: {
    zoneId: number | null | undefined;
    appareil?: string | null;
    /** Change à chaque morceau : le chemin du signal se relit. */
    revision?: unknown;
  } = $props();

  let zone = $state<ZoneTess | null>(null);
  let ouvert = $state(false);
  let demande = 0;

  async function relire(id: number | null | undefined) {
    const n = ++demande;
    if (id == null) { zone = null; return; }
    const z = await lireZoneTess(id);
    if (n === demande) zone = z;
  }

  $effect(() => {
    void revision;
    void relire(zoneId);
  });

  function basculer(e: MouseEvent) {
    e.stopPropagation();
    ouvert = !ouvert;
    if (ouvert) void relire(zoneId);
  }

  function ouvrirTess() {
    ouvert = false;
    $ouvrirEcranTess?.();
  }
</script>

<svelte:window onkeydown={(e) => { if (ouvert && e.key === 'Escape') ouvert = false; }} />

{#if zone}
  <div class="pastille-tess">
    <button type="button" class="pastille" data-tess="pastille"
      aria-haspopup="dialog" aria-expanded={ouvert} aria-label={$t('tess.signalPath.title')} title={$t('tess.signalPath.title')}
      onclick={basculer}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <path d="M3 7c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
        <path d="M12 8v13" />
      </svg>
      <span>{$t('tess.name')}</span>
    </button>
    {#if ouvert}
      <div class="voile" role="presentation" onclick={() => (ouvert = false)}></div>
      <div class="pop" role="dialog" aria-label={$t('tess.signalPath.title')}>
        <CheminDuSignalTess {zone} {appareil} onOuvrir={$ouvrirEcranTess ? ouvrirTess : null} />
      </div>
    {/if}
  </div>
{/if}

<style>
  .pastille-tess{position:relative; display:inline-flex}
  .pastille{display:inline-flex; align-items:center; gap:8px; padding:7px 14px; border-radius:var(--v2-r-pill);
    border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt); cursor:pointer;
    font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
  .pastille svg{color:var(--v2-acc1)}
  .pastille:hover{border-color:var(--v2-acc2)}
  .voile{position:fixed; inset:0; z-index:40}
  .pop{position:absolute; right:0; bottom:calc(100% + 10px); z-index:41; width:min(520px, calc(100vw - 32px));
    box-shadow:var(--v2-sh-lg)}
</style>
