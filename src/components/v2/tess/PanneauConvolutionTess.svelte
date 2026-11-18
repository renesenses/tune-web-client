<script lang="ts">
  /**
   * TESS W3 — panneau « Convolution » (maquette A1, colonne de droite).
   *
   * Jeu de filtres, « Browse… », formats acceptés, tableau Fichier / Cadence /
   * Canaux / Statut (« In use — matches the source »), option « Resample the
   * nearest filter », « × Remove plugin ».
   *
   * Un jeu de filtres REFUSÉ (zip piégé : chemins `..`, liens, bombe, trop de
   * fichiers…) se dit en une phrase traduite, à l'endroit du geste, et le jeu
   * en service reste en place : `messageRefusImport` (lib/tess/convolution).
   *
   * Le panneau ne modifie la chaîne que par `PUT /zones/{id}/tess`, à partir
   * de la chaîne publiée, et rend la réponse du serveur à son parent (`onZone`).
   */
  import { t } from '../../../lib/i18n';
  import { isPremium } from '../../../lib/stores/license';
  import { ecrireChaineTess, greffonPremium, lireZoneTess, type RefusTess, type ZoneTess } from '../../../lib/tess/contrat';
  import { avecActivation, avecReglages, maillon, sansGreffon } from '../../../lib/tess/chaineTess';
  import {
    extensionAcceptee, FORMATS_ACCEPTES, importerJeuDeFiltres, libelleCanaux, lireJeuDeFiltres, messageRefusImport,
    type FiltreConvolution, type RapportFiltres,
  } from '../../../lib/tess/convolution';
  import { formaterCadence, motifEtape } from '../../../lib/tess/libelles';

  const ID = 'convolution';

  let { zone, onZone = () => {} }: { zone: ZoneTess; onZone?: (z: ZoneTess) => void } = $props();

  let rapport = $state<RapportFiltres | null>(null);
  let enCours = $state(false);
  let refusImport = $state<{ message: string; detail: string | null } | null>(null);
  let refusChaine = $state<string | null>(null);
  let champ: HTMLInputElement | undefined = $state();

  const m = $derived(maillon(zone.chain, ID));
  const actif = $derived(m?.enabled === true);
  const reglages = $derived(m?.settings ?? {});
  const jeu = $derived(typeof reglages.filter_set === 'string' ? reglages.filter_set : rapport?.filter_set ?? null);
  /** Absent = coché, comme la maquette ; le serveur publie sa valeur dès qu'il l'enregistre. */
  const reechantillonner = $derived(reglages.resample_nearest !== false);
  const verrouPremium = $derived(greffonPremium(zone, ID) && !$isPremium);
  const etape = $derived(zone.signal_path.find((e) => e.code === 'plugin' && e.plugin_id === ID) ?? null);
  const motif = $derived(etape && etape.requested && !etape.effective ? motifEtape(etape, zone, $t) : null);

  let zoneLue = -1;
  $effect(() => {
    const id = zone.zone_id;
    if (id === zoneLue) return;
    zoneLue = id;
    rapport = null;
    void lireJeuDeFiltres(id).then((r) => { if (zone.zone_id === id) rapport = r; });
  });

  function phraseRefusChaine(r: RefusTess): string {
    if (r.code === 'premium_required') return $t('tess.reason.premiumRequired');
    return r.detail?.trim() ? `${$t('tess.refusChaine')} ${r.detail}` : $t('tess.refusChaine');
  }

  async function ecrire(chaine: ZoneTess['chain']) {
    enCours = true;
    refusChaine = null;
    try {
      const r = await ecrireChaineTess(zone.zone_id, chaine);
      if (r.ok) onZone(r.zone);
      else refusChaine = phraseRefusChaine(r.refus);
    } catch {
      refusChaine = $t('tess.refusChaine');
    } finally {
      enCours = false;
    }
  }

  async function choisir(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const fichier = input.files?.[0];
    input.value = '';
    if (!fichier) return;
    refusImport = null;
    if (!extensionAcceptee(fichier.name)) {
      refusImport = { message: $t('tess.convolution.refus.unsupported'), detail: null };
      return;
    }
    enCours = true;
    try {
      const r = await importerJeuDeFiltres(zone.zone_id, fichier);
      if (!r.ok) {
        refusImport = messageRefusImport(r.refus, $t);
        return;
      }
      rapport = r.rapport;
      const relue = await lireZoneTess(zone.zone_id);
      if (relue) onZone(relue);
    } finally {
      enCours = false;
    }
  }

  function statut(f: FiltreConvolution): string {
    if (f.status === 'in_use') {
      return f.matches_source === false ? $t('tess.convolution.inUseResampled') : $t('tess.convolution.inUseMatches');
    }
    if (f.status === 'rejected') return $t('tess.convolution.ignored');
    return '—';
  }
</script>

{#if m}
  <section class="pan" data-tess-panneau="convolution" aria-busy={enCours}>
    <header>
      <div class="titre">
        <h2>{$t('tess.plugin.convolution')}</h2>
        {#if greffonPremium(zone, ID)}<span class="prem">{$t('v2.plug.premium')}</span>{/if}
      </div>
      <label class="on">
        <span>{$t('tess.value.on')}</span>
        <input type="checkbox" checked={actif} disabled={enCours || (verrouPremium && !actif)}
          data-tess="actif" onchange={(e) => ecrire(avecActivation(zone.chain, ID, (e.currentTarget as HTMLInputElement).checked))} />
      </label>
    </header>
    <p class="lead">{$t('tess.convolution.lead')}</p>

    {#if verrouPremium}
      <p class="note" data-tess="premium">{$t('tess.convolution.premiumNote')}</p>
    {/if}
    {#if motif}
      <p class="note" data-tess="motif">{motif}</p>
    {/if}

    <div class="jeu">
      <span class="lbl">{$t('tess.convolution.filterSet')}</span>
      <span class="nomjeu" data-tess="jeu">{jeu ?? $t('tess.convolution.noFilterSet')}</span>
      <button type="button" class="parcourir" disabled={enCours || verrouPremium} onclick={() => champ?.click()}>
        {$t('tess.convolution.browse')}
      </button>
      <input class="fichier" bind:this={champ} type="file" accept={FORMATS_ACCEPTES} data-tess="fichier" onchange={choisir} />
    </div>
    <p class="hint">{$t('tess.convolution.accepted')}</p>

    {#if refusImport}
      <div class="err" role="alert" data-tess="refus-import">
        <b>{$t('tess.convolution.refused')}</b>
        <span>{refusImport.message}</span>
        {#if refusImport.detail}<span class="detail">{refusImport.detail}</span>{/if}
      </div>
    {/if}

    {#if rapport && rapport.filters.length > 0}
      <h3>{$t('tess.convolution.filtersInSet')}</h3>
      <table data-tess="filtres">
        <thead>
          <tr>
            <th>{$t('tess.convolution.colFile')}</th>
            <th>{$t('tess.convolution.colRate')}</th>
            <th>{$t('tess.convolution.colChannels')}</th>
            <th>{$t('tess.convolution.colStatus')}</th>
          </tr>
        </thead>
        <tbody>
          {#each rapport.filters as f (f.file)}
            <tr class:enService={f.status === 'in_use'} data-statut={f.status}>
              <td class="f">{f.file}</td>
              <td>{f.sample_rate_hz === null ? '—' : formaterCadence(f.sample_rate_hz)}</td>
              <td>{f.channels === null ? '—' : libelleCanaux(f.channels, $t)}</td>
              <td class="st" title={f.detail ?? undefined}>{statut(f)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    <h3>{$t('tess.convolution.noMatchTitle')}</h3>
    <label class="opt">
      <span class="txt">
        <span class="nom">{$t('tess.convolution.resampleNearest')}</span>
        <span class="hint">{$t('tess.convolution.resampleHint')}</span>
      </span>
      <input type="checkbox" checked={reechantillonner} disabled={enCours || verrouPremium} data-tess="reechantillonner"
        onchange={(e) => ecrire(avecReglages(zone.chain, ID, { resample_nearest: (e.currentTarget as HTMLInputElement).checked }))} />
    </label>

    {#if refusChaine}
      <p class="err" role="alert" data-tess="refus-chaine">{refusChaine}</p>
    {/if}

    <div class="pied">
      <button type="button" class="retirer" disabled={enCours} data-tess="retirer" onclick={() => ecrire(sansGreffon(zone.chain, ID))}>
        × {$t('tess.removePlugin')}
      </button>
    </div>
  </section>
{/if}

<style>
  .pan{display:flex; flex-direction:column; gap:12px; padding:24px 28px; border:1px solid var(--v2-line);
    border-radius:var(--v2-r-card); background:var(--v2-surface); color:var(--v2-txt); font-family:var(--v2-sans)}
  header{display:flex; align-items:center; justify-content:space-between; gap:16px}
  .titre{display:flex; align-items:center; gap:10px}
  h2{margin:0; font-size:calc(26px * var(--v2-txt-echelle, 1)); font-weight:700}
  h3{margin:14px 0 2px; font:500 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.14em; text-transform:uppercase; color:var(--v2-txt3)}
  .prem{text-transform:uppercase; font:700 calc(10px * var(--v2-txt-echelle, 1)) var(--v2-mono); padding:2px 6px; border-radius:4px; background:var(--v2-acc1); color:var(--v2-on-acc)}
  .on{display:flex; align-items:center; gap:10px; color:var(--v2-txt2)}
  .on input,.opt input{width:20px; height:20px; accent-color:var(--v2-acc1)}
  .lead{margin:0; color:var(--v2-txt2); line-height:1.5; max-width:70ch}
  .note{margin:0; padding:10px 14px; border-radius:10px; border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); color:var(--v2-txt2)}
  .jeu{display:flex; align-items:center; gap:14px; padding:14px 20px; border:1px solid var(--v2-line); border-radius:14px; background:var(--v2-surface2)}
  .lbl{color:var(--v2-txt3)}
  .nomjeu{flex:1; font-weight:600; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .parcourir,.retirer{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt); cursor:pointer;
    font:500 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); padding:10px 18px; border-radius:var(--v2-r-pill)}
  .parcourir:disabled,.retirer:disabled{opacity:.45; cursor:default}
  .fichier{display:none}
  .hint{margin:0; font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3); line-height:1.5}
  .err{display:flex; flex-direction:column; gap:4px; margin:0; padding:11px 14px; border-radius:10px; color:var(--v2-danger); border:1px solid var(--v2-danger-bd); background:var(--v2-danger-soft)}
  .detail{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3)}
  table{width:100%; border-collapse:collapse; border:1px solid var(--v2-line); border-radius:12px; overflow:hidden}
  th,td{text-align:left; padding:10px 18px; border-bottom:1px solid var(--v2-line); font-size:calc(13px * var(--v2-txt-echelle, 1))}
  th{color:var(--v2-txt2); font-weight:500}
  tr.enService{background:var(--v2-surface2)}
  tr.enService .f{font-weight:600}
  tr.enService .st{color:var(--v2-acc1)}
  .opt{display:flex; align-items:center; justify-content:space-between; gap:16px}
  .txt{display:flex; flex-direction:column; gap:3px}
  .nom{font-weight:600}
  .pied{display:flex; justify-content:flex-end}
</style>
