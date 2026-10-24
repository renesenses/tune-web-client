<script lang="ts">
  /**
   * tune-server-rust#4201 — Réglages › Bibliothèque : l'état de la
   * bibliothèque UPnP synchronisée. Dernière synchronisation, nombre de
   * pistes, erreurs, par source. Voir `lib/etatImportUpnp`.
   */
  import { onMount } from 'svelte';
  import * as api from '../../lib/api';
  import { t, locale } from '../../lib/i18n';
  import { formatNombre } from '../../lib/formats';
  import { dateDeSynchro, etatImportUpnpDe, type EtatImportUpnp } from '../../lib/etatImportUpnp';

  let etat = $state<EtatImportUpnp | null>(null);

  onMount(() => {
    let monte = true;
    api.getLibraryStats()
      .then((st) => { if (monte) etat = etatImportUpnpDe(st); })
      .catch(() => { /* rien à montrer : les autres réglages restent là */ });
    return () => { monte = false; };
  });
</script>

{#if etat}
  <div class="upnp-import" data-etat-import-upnp>
    <strong>{$t('v2.set.upnpImportTitle' as any)}</strong>
    <p class="resume" class:incomplet={etat.complet === false}>
      {etat.complet === false
        ? $t('v2.set.upnpImportIncomplete' as any).replace('{n}', $formatNombre(etat.sources_incompletes ?? 0)).replace('{total}', $formatNombre(etat.sources))
        : $t('v2.set.upnpImportComplete' as any).replace('{total}', $formatNombre(etat.sources))}
    </p>
    <ul>
      {#each etat.par_source as s (s.key)}
        {@const derniere = dateDeSynchro(s.last_success, $locale)}
        <li data-source-upnp={s.key} class:incomplet={!s.complet}>
          <span class="nom">{s.name}</span>
          <span class="detail">
            {derniere
              ? $t('v2.set.upnpImportLastSync' as any).replace('{date}', derniere)
              : $t('v2.set.upnpImportNeverSynced' as any)}
            · {$t('v2.set.upnpImportTracks' as any).replace('{n}', $formatNombre(s.pistes_distinctes ?? 0))}
            · {$t('v2.set.upnpImportErrors' as any).replace('{n}', $formatNombre(s.erreurs ?? 0))}
          </span>
          {#if !s.complet && s.raison}
            <span class="raison" data-raison>{s.raison}</span>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .upnp-import { margin-block: 12px; }
  .resume { margin-block: 6px; color: var(--v2-txt2); }
  .resume.incomplet, li.incomplet .raison { color: var(--v2-danger); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  li { display: flex; flex-direction: column; gap: 2px; }
  .nom { font-weight: 600; color: var(--v2-txt2); }
  .detail, .raison { font-size: 12px; color: var(--v2-txt3); }
</style>
