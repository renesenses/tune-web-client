<script lang="ts">
  /**
   * « Exporter vers… » — web#2218 (go de Bertrand, 19/10/2026, rc7).
   *
   * Remplace le bouton « Sauvegarder » de la page Ambiance, qui ne savait
   * créer qu'une playlist locale. Le menu propose :
   *  - « Playlist locale » : le comportement d'avant, inchangé ;
   *  - chaque service qui sait créer une playlist (`supports_write`) ; ceux qui
   *    ne sont pas connectés restent visibles, grisés, avec la raison.
   *
   * Le chemin vers un service (playlist temporaire → transfert du greffon →
   * suppression de la temporaire) et ses refus sont dans `lib/ambianceExport`.
   */
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import * as api from '../../lib/api';
  import {
    ciblesServices,
    exporterAmbiance,
    type CibleService,
    type ResultatExport,
  } from '../../lib/ambianceExport';
  import { nomService, cleRaison } from '../../lib/convertisseurPlaylists';

  let { ids, nomPropose }: { ids: number[]; nomPropose: string } = $props();

  let ouvert = $state(false);
  let nom = $state('');
  let chargement = $state(false);
  let services = $state<CibleService[]>([]);
  let enCours = $state<string | null>(null);
  let resultat = $state<ResultatExport | null>(null);

  async function ouvrir() {
    if (ouvert) { ouvert = false; return; }
    ouvert = true;
    nom = nomPropose;
    resultat = null;
    chargement = true;
    try {
      services = ciblesServices(await api.getPlaylistManagerServices());
    } catch {
      // Les services indisponibles n'empêchent pas l'export local.
      services = [];
    }
    chargement = false;
  }

  function fermer() {
    ouvert = false;
    resultat = null;
  }

  async function exporter(service: string) {
    const n = nom.trim();
    if (!n || ids.length === 0 || enCours) return;
    enCours = service;
    resultat = null;
    try {
      const r = await exporterAmbiance({ service, nom: n, ids });
      if (r.genre === 'local') {
        notifications.success(
          $t('ambiance.export.localDone').replace('{name}', r.nom).replace('{n}', String(r.total)),
        );
        ouvert = false;
      } else {
        resultat = r;
      }
    } catch (e: any) {
      notifications.error(e?.message || $t('v2.ambiance.saveError'));
    }
    enCours = null;
  }

  function f(cle: string, valeurs: Record<string, string | number>): string {
    let s = $t(cle);
    for (const [k, v] of Object.entries(valeurs)) s = s.replace(`{${k}}`, String(v));
    return s;
  }
</script>

<div class="export">
  <button class="export-btn" onclick={ouvrir} aria-expanded={ouvert} disabled={ids.length === 0}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
    {$t('ambiance.export.button')}
  </button>

  {#if ouvert}
    <div class="export-menu" role="menu">
      <label class="export-label">
        <span>{$t('ambiance.export.name')}</span>
        <input class="export-name" bind:value={nom} disabled={!!enCours} />
      </label>

      <button
        class="export-option"
        role="menuitem"
        data-service="local"
        onclick={() => exporter('local')}
        disabled={!!enCours || !nom.trim()}
      >
        {$t('ambiance.export.local')}
      </button>

      {#if chargement}
        <p class="export-note">{$t('ambiance.export.loadingServices')}</p>
      {:else if services.length === 0}
        <p class="export-note">{$t('ambiance.export.noService')}</p>
      {:else}
        {#each services as s (s.service)}
          <button
            class="export-option"
            role="menuitem"
            data-service={s.service}
            onclick={() => exporter(s.service)}
            disabled={!s.connecte || !!enCours || !nom.trim()}
          >
            {nomService(s.service)}
            {#if !s.connecte}<span class="export-off">{$t('ambiance.export.notConnected')}</span>{/if}
          </button>
        {/each}
      {/if}

      {#if enCours}
        <p class="export-note">{$t('ambiance.export.running')}</p>
      {/if}

      {#if resultat}
        <div class="export-result" data-genre={resultat.genre}>
          {#if resultat.genre === 'service'}
            <p class="export-ok">{f('ambiance.export.serviceDone', { name: resultat.nom, service: nomService(resultat.service) })}</p>
            <p>{f('ambiance.export.matched', { found: resultat.retrouves, total: resultat.total })}</p>
          {:else if resultat.genre === 'aucun'}
            <p class="export-ko">{f('ambiance.export.noneFound', { service: nomService(resultat.service) })}</p>
          {:else if resultat.genre === 'premium'}
            <p class="export-ko">{$t('ambiance.export.premium')}</p>
            {#if resultat.url}
              <a href={resultat.url} target="_blank" rel="noopener noreferrer">{$t('ambiance.export.premiumLink')}</a>
            {/if}
          {:else if resultat.genre === 'greffon_absent'}
            <p class="export-ko">{$t('ambiance.export.pluginMissing')}</p>
          {:else if resultat.genre === 'non_connecte'}
            <p class="export-ko">{f('ambiance.export.notConnectedError', { service: nomService(resultat.service) })}</p>
          {:else if resultat.genre === 'echec'}
            <p class="export-ko">{f('ambiance.export.failed', { service: nomService(resultat.service), error: resultat.message })}</p>
          {/if}

          {#if (resultat.genre === 'service' || resultat.genre === 'aucun') && resultat.nonRetrouves.length > 0}
            <p class="export-sub">{f('ambiance.export.notFoundTitle', { service: nomService(resultat.service), n: resultat.nonRetrouves.length })}</p>
            <ul class="export-missing">
              {#each resultat.nonRetrouves as m}
                <li>
                  <span class="m-title">{m.titre}</span>{#if m.artiste}<span class="m-artist"> — {m.artiste}</span>{/if}
                  <span class="m-why">({$t(cleRaison(m.raison))})</span>
                </li>
              {/each}
            </ul>
          {/if}

          {#if 'temporaireRestante' in resultat && resultat.temporaireRestante}
            <p class="export-note">{f('ambiance.export.tempKept', { name: resultat.temporaireRestante })}</p>
          {/if}
        </div>
      {/if}

      <button class="export-close" onclick={fermer}>{$t('ambiance.export.close')}</button>
    </div>
  {/if}
</div>

<style>
  .export { position: relative; }

  .export-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    background: none;
    color: var(--tune-text-secondary);
    font-family: var(--font-label);
    font-size: 12px;
    cursor: pointer;
  }
  .export-btn:hover { border-color: var(--tune-accent); color: var(--tune-text); }
  .export-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .export-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 20;
    width: 340px;
    max-width: calc(100vw - 32px);
    max-height: 70vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--tune-text);
  }

  .export-label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--tune-text-muted); }
  .export-name {
    padding: 6px 10px;
    background: var(--tune-bg);
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
  }

  .export-option {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: none;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    color: var(--tune-text);
    font-family: var(--font-body);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  .export-option:hover:not(:disabled) { border-color: var(--tune-accent); }
  .export-option:disabled { opacity: 0.55; cursor: not-allowed; }
  .export-off { font-size: 11px; color: var(--tune-text-muted); }

  .export-note { margin: 0; font-size: 12px; color: var(--tune-text-muted); }

  .export-result { display: flex; flex-direction: column; gap: 4px; padding-top: 6px; border-top: 1px solid var(--tune-border); }
  .export-result p { margin: 0; }
  .export-ok { font-weight: 600; }
  .export-ko { color: var(--tune-warning); }
  .export-sub { font-size: 12px; color: var(--tune-text-secondary); }
  .export-missing { margin: 0; padding-left: 18px; font-size: 12px; }
  .m-artist, .m-why { color: var(--tune-text-muted); }

  .export-close {
    align-self: flex-end;
    background: none;
    border: 0;
    color: var(--tune-text-muted);
    font-family: var(--font-body);
    font-size: 12px;
    cursor: pointer;
  }
</style>
