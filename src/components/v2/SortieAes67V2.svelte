<script lang="ts">
  /**
   * Réglages ▸ Audio ▸ Sortie AES67 (tune-server-rust#7336, étape E3).
   *
   * Écran d'ÉTAT en lecture seule du greffon natif `aes67` (Premium, Linux) :
   * calage PTP, repli sur l'horloge locale (dit en clair, avec sa raison),
   * flux annoncés, transport, statistiques d'émission et SDP annoncé.
   *
   * Relecture toutes les 2 s, UNIQUEMENT tant que le composant est monté
   * (section visible) et que l'onglet du navigateur l'est. 404 = greffon non
   * installé : la section se retire (store `presenceSortieAes67`), sans bruit.
   */
  import * as api from '../../lib/api';
  import { t, locale } from '../../lib/i18n';
  import { estRefusPremium } from '../../lib/premiumRefus';
  import { presenceSortieAes67 } from '../../lib/stores/sortieAes67';
  import {
    normaliserSortieAes67, repliSurHorlogeLocale, microsecondesDe, cadenceKhz,
    cleEtatPort, cleTransport, PERIODE_RAFRAICHISSEMENT_MS, type EtatAes67,
  } from '../../lib/sortieAes67';

  let etat = $state<EtatAes67 | null>(null);
  let panne = $state(false);

  async function relire() {
    try {
      etat = normaliserSortieAes67(await api.getSortieAes67());
      panne = false;
      presenceSortieAes67.set('presente');
    } catch (e) {
      const statut = (e as { status?: number } | null)?.status;
      if (statut === 404) {
        presenceSortieAes67.set('absente');
      } else if (estRefusPremium(e)) {
        etat = normaliserSortieAes67({ premium: false });
      } else {
        panne = true;
      }
    }
  }

  $effect(() => {
    void relire();
    const minuteur = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') void relire();
    }, PERIODE_RAFRAICHISSEMENT_MS);
    return () => clearInterval(minuteur);
  });

  const lg = $derived($locale as string);
  const repli = $derived(etat ? repliSurHorlogeLocale(etat) : false);
  const n = (v: number | null) => (v === null ? '—' : v.toLocaleString(lg));
  const sortieDe = (id: string) => etat?.sorties.find((s) => s.id === id) ?? null;
</script>

<div class="aes" data-sortie-aes67>
  {#if !etat}
    <p class="hint" role="status">{panne ? $t('aes67.unavailable') : $t('aes67.loading')}</p>
  {:else if !etat.premium}
    <p class="hint" data-aes67-premium>
      {$t('aes67.premiumRequired')}
      <a href="https://mozaiklabs.fr/pricing" target="_blank" rel="noopener noreferrer">mozaiklabs.fr/pricing</a>
    </p>
  {:else}
    <p class="hint">{$t('aes67.intro')}</p>
    {#if panne}<p class="hint alerte" role="status">{$t('aes67.stale')}</p>{/if}

    <div class="bloc" data-aes67-horloge>
      <div class="tete">
        <strong>{$t('aes67.clock.title')}</strong>
        {#if etat.ptp}
          <span class="pastille" class:ok={etat.ptp.calee && !repli} class:alerte={!etat.ptp.calee || repli} data-aes67-calage>
            {etat.ptp.calee && !repli ? $t('aes67.ptp.locked') : $t('aes67.ptp.notLocked')}
          </span>
        {/if}
      </div>

      {#if repli}
        <div class="repli" role="alert" data-aes67-repli>
          <strong>{$t('aes67.fallback.title')}</strong>
          <span>
            {etat.ptp?.raisonDuRepli ?? $t('aes67.fallback.noReason')}
          </span>
        </div>
      {/if}

      <dl>
        {#if etat.referenceHorloge}
          <dt>{$t('aes67.clock.reference')}</dt>
          <dd class="mono" data-aes67-reference>{etat.referenceHorloge}</dd>
        {/if}
        {#if etat.ptp}
          <dt>{$t('aes67.ptp.port')}</dt>
          <dd data-aes67-port>{$t(cleEtatPort(etat.ptp.etatPort) as any)}</dd>
          {#if etat.ptp.maitre}
            <dt>{$t('aes67.ptp.master')}</dt><dd class="mono">{etat.ptp.maitre}</dd>
          {/if}
          {#if etat.ptp.domaine !== null}
            <dt>{$t('aes67.ptp.domain')}</dt><dd>{n(etat.ptp.domaine)}</dd>
          {/if}
          {#if etat.ptp.decalageNs !== null}
            <dt>{$t('aes67.ptp.offset')}</dt><dd data-aes67-decalage>{microsecondesDe(etat.ptp.decalageNs, lg)}</dd>
          {/if}
          {#if etat.ptp.delaiMoyenNs !== null}
            <dt>{$t('aes67.ptp.delay')}</dt><dd>{microsecondesDe(etat.ptp.delaiMoyenNs, lg)}</dd>
          {/if}
          {#if etat.ptp.derniereSyncIlYaMs !== null}
            <dt>{$t('aes67.ptp.lastSync')}</dt>
            <dd>{$t('aes67.ptp.lastSyncAgo').replace('{ms}', n(etat.ptp.derniereSyncIlYaMs))}</dd>
          {/if}
          {#if etat.ptp.horodatage}
            <dt>{$t('aes67.ptp.timestamping')}</dt><dd>{etat.ptp.horodatage}</dd>
          {/if}
        {/if}
      </dl>
      {#if etat.ptp?.erreur}<p class="hint alerte">{etat.ptp.erreur}</p>{/if}
    </div>

    <div class="bloc" data-aes67-flux>
      <strong>{$t('aes67.streams.title')}</strong>
      {#if etat.flux.length === 0}
        <p class="hint">{$t('aes67.streams.none')}</p>
      {/if}
      {#each etat.flux as f (f.id)}
        {@const sortie = sortieDe(f.id)}
        <div class="flux" data-aes67-un-flux={f.id}>
          <div class="tete">
            <strong>{f.nom}</strong>
            {#if sortie}
              <span class="pastille" class:ok={sortie.annoncee} data-aes67-sap>
                {sortie.annoncee ? $t('aes67.stream.announced') : $t('aes67.stream.notAnnounced')}
              </span>
              <span class="pastille" data-aes67-transport>{$t(cleTransport(sortie.transport) as any)}</span>
            {/if}
          </div>
          <dl>
            {#if f.adresse}
              <dt>{$t('aes67.stream.address')}</dt>
              <dd class="mono">{f.adresse}{f.port !== null ? `:${f.port}` : ''}</dd>
            {/if}
            <dt>{$t('aes67.stream.format')}</dt>
            <dd data-aes67-format>
              L24{#if f.cadence !== null} · {cadenceKhz(f.cadence, lg)}{/if}{#if f.canaux !== null} · {$t('aes67.stream.channels').replace('{n}', n(f.canaux))}{/if}
            </dd>
          </dl>

          {#if sortie?.emission}
            {@const e = sortie.emission}
            <dl data-aes67-emission>
              <dt>{$t('aes67.tx.packets')}</dt><dd>{n(e.paquets)}</dd>
              <dt>{$t('aes67.tx.frames')}</dt><dd>{n(e.trames)}</dd>
              <dt>{$t('aes67.tx.maxDelay')}</dt><dd>{e.retardMaxUs === null ? '—' : `${n(e.retardMaxUs)} µs`}</dd>
              <dt>{$t('aes67.tx.underruns')}</dt><dd>{n(e.sousAlimentations)}</dd>
              <dt>{$t('aes67.tx.resyncs')}</dt><dd>{n(e.resynchronisations)}</dd>
              <dt>{$t('aes67.tx.sendErrors')}</dt><dd class:alerte={(e.erreursDEnvoi ?? 0) > 0}>{n(e.erreursDEnvoi)}</dd>
            </dl>
          {/if}

          {#if sortie?.sdp}
            <details data-aes67-sdp>
              <summary>
                {$t('aes67.sdp.title')}{#if sortie.versionSdp !== null} · {$t('aes67.sdp.version').replace('{n}', String(sortie.versionSdp))}{/if}
              </summary>
              <pre class="mono">{sortie.sdp}</pre>
            </details>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .aes { display: flex; flex-direction: column; gap: 14px; }
  .bloc, .flux { display: flex; flex-direction: column; gap: 8px; }
  .flux { padding-top: 8px; border-top: 1px solid var(--tune-border, rgba(127, 127, 127, 0.25)); }
  .tete { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .hint { margin: 0; font-size: 12px; color: var(--tune-text-muted); }
  .hint a { color: var(--tune-accent); }
  .alerte { color: var(--tune-warning, #d97706); }
  .pastille {
    font-size: 11px; padding: 2px 8px; border-radius: 999px;
    border: 1px solid var(--tune-border, rgba(127, 127, 127, 0.35)); color: var(--tune-text-muted);
  }
  .pastille.ok { color: var(--tune-success, #16a34a); border-color: currentColor; }
  .pastille.alerte { color: var(--tune-warning, #d97706); border-color: currentColor; }
  .repli {
    display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 6px; font-size: 13px;
    border: 1px solid var(--tune-warning, #d97706); color: var(--tune-warning, #d97706);
  }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 3px 14px; margin: 0; font-size: 13px; }
  dt { color: var(--tune-text-muted); }
  dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  .mono, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  summary { cursor: pointer; font-size: 12px; color: var(--tune-text-muted); }
  pre {
    margin: 6px 0 0; padding: 8px; font-size: 12px; overflow-x: auto; white-space: pre;
    border-radius: 6px; background: rgba(127, 127, 127, 0.12);
  }
</style>
