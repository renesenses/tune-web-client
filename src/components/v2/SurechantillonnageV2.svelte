<script lang="ts">
  /**
   * Suréchantillonnage — les réglages du greffon PREMIUM
   * (renesenses/tune-server-rust#7614), par zone.
   *
   * Réglages du § 7 de l'étude : activé (défaut : non), filtre (parmi ceux
   * que le test de la machine admet), cadence cible (×2, ×4, ×8, ×16 ou
   * maximum du DAC), et « remesurer la machine ». La famille de la source
   * est toujours suivie (44,1 → 352,8 ; 48 → 384) et le dither reste le TPDF
   * de la sortie : l'écran le dit, il ne le règle pas.
   *
   * Le serveur décide de tout ce qui touche au son ; un changement ne
   * s'applique qu'à la piste suivante, jamais pendant une piste.
   */
  import { t, locale } from '../../lib/i18n';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { currentZoneId } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import {
    type CatalogueSurechantillonnage, type EtatSurechantillonnage, type ReglageSurechantillonnage,
    getCatalogueSurechantillonnage, getSurechantillonnageZone, setSurechantillonnageZone,
    lancerLeTestDeLaMachine, reglageParDefaut, filtresProposes, filtreNonAdmis, reserveMaxDb,
    libelleReserve, cleFiltre, cleContrainte, resumeMachine, RAPPORTS,
  } from '../../lib/surechantillonnage';
  import '../../styles/tune-v2.css';

  let catalogue = $state<CatalogueSurechantillonnage | null>(null);
  let etat = $state<EtatSurechantillonnage | null>(null);
  let reglage = $state<ReglageSurechantillonnage>(reglageParDefaut());
  let erreur = $state<string | null>(null);
  let occupe = $state(false);
  let mesure = $state(false);

  const admis = $derived(etat?.admitted_filters ?? null);
  const proposes = $derived(catalogue ? filtresProposes(catalogue.filters, admis, reglage.filter) : []);
  const contrainte = $derived(cleContrainte(etat?.constraint ?? null));
  const machine = $derived(resumeMachine(catalogue?.machine_test ?? null));
  const aJour = $derived(etat != null && JSON.stringify(reglage) === JSON.stringify(etat.settings));

  function chargerLeCatalogue() {
    getCatalogueSurechantillonnage().then((c) => { catalogue = c; }).catch(() => { catalogue = null; });
  }
  $effect(() => { chargerLeCatalogue(); });

  $effect(() => {
    const zid = $currentZoneId;
    if (zid == null) { etat = null; return; }
    getSurechantillonnageZone(zid)
      .then((e) => { if ($currentZoneId !== zid) return; etat = e; reglage = { ...e.settings }; erreur = null; })
      .catch((e) => { erreur = e?.message ?? String(e); });
  });

  async function enregistrer() {
    const zid = zoneRequise();
    if (zid == null) return;
    occupe = true;
    try {
      etat = await setSurechantillonnageZone(zid, reglage);
      reglage = { ...etat.settings };
      erreur = null;
      chargerLeCatalogue();
      notifications.info($t('upsampling.nextTrack' as any));
    } catch (e: any) {
      erreur = e?.message ?? String(e);
    } finally { occupe = false; }
  }

  async function remesurer() {
    mesure = true;
    try {
      await lancerLeTestDeLaMachine();
      chargerLeCatalogue();
      const zid = $currentZoneId;
      if (zid != null) etat = await getSurechantillonnageZone(zid);
      erreur = null;
    } catch (e: any) {
      erreur = e?.message ?? String(e);
    } finally { mesure = false; }
  }

  function choisirRapport(v: string) {
    reglage = { ...reglage, max_ratio: v === '' ? null : (Number(v) as ReglageSurechantillonnage['max_ratio']) };
  }
</script>

<section class="v2-up tune-v2" data-testid="surechantillonnage">
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('upsampling.eyebrow' as any)}</div>
      <h1>{$t('upsampling.title' as any)}</h1>
    </div>
  </header>

  <div class="scroll">
    <p class="lead">{$t('upsampling.lead' as any)}</p>

    {#if erreur}<div class="err">{erreur}</div>{/if}

    {#if $currentZoneId == null}
      <div class="state">{$t('upsampling.noZone' as any)}</div>
    {:else}
      <div class="warn" data-bit-perfect>{$t('upsampling.bitPerfect' as any)}</div>
      {#if contrainte && etat?.settings.enabled}
        <div class="warn" data-contrainte={etat?.constraint}>{$t(contrainte as any)}</div>
      {/if}

      <div class="card">
        <div class="row">
          <div class="lbl"><span>{$t('upsampling.enabled' as any)}</span><span class="hint">{$t('upsampling.enabledHint' as any)}</span></div>
          <label class="sw">
            <input type="checkbox" checked={reglage.enabled} aria-label={$t('upsampling.enabled' as any)}
              onchange={(e) => { reglage = { ...reglage, enabled: (e.currentTarget as HTMLInputElement).checked }; }} />
            <span class="slider"></span>
          </label>
        </div>

        <div class="row">
          <div class="lbl"><span>{$t('upsampling.filter' as any)}</span><span class="hint">{$t('upsampling.filterHint' as any)}</span></div>
          <select class="sel" aria-label={$t('upsampling.filter' as any)} value={reglage.filter}
            onchange={(e) => { reglage = { ...reglage, filter: (e.currentTarget as HTMLSelectElement).value }; }}>
            {#each proposes as f (f.id)}
              <option value={f.id}>{$t(cleFiltre(f.id) as any)} ({libelleReserve(reserveMaxDb(f), $locale)})</option>
            {/each}
          </select>
        </div>
        {#if filtreNonAdmis(admis, reglage.filter)}
          <div class="warn" data-non-admis>{$t('upsampling.filterNotAdmitted' as any)}</div>
        {/if}

        <div class="row">
          <div class="lbl"><span>{$t('upsampling.target' as any)}</span><span class="hint">{$t('upsampling.targetHint' as any)}</span></div>
          <select class="sel" aria-label={$t('upsampling.target' as any)} value={reglage.max_ratio == null ? '' : String(reglage.max_ratio)}
            onchange={(e) => choisirRapport((e.currentTarget as HTMLSelectElement).value)}>
            <option value="">{$t('upsampling.targetMax' as any)}</option>
            {#each RAPPORTS as r (r)}<option value={String(r)}>×{r}</option>{/each}
          </select>
        </div>

        <div class="row">
          <div class="lbl"><span>{$t('upsampling.dither' as any)}</span><span class="hint">{$t('upsampling.ditherHint' as any)}</span></div>
          <span class="val">{$t('upsampling.ditherValue' as any)}</span>
        </div>

        <div class="row">
          <div class="lbl">
            <span>{$t('upsampling.machine' as any)}</span>
            <span class="hint" data-machine>
              {#if machine}
                {$t('upsampling.machineResult' as any).replace('{admitted}', String(machine.admis)).replace('{total}', String(machine.total))}
              {:else}
                {$t('upsampling.machineNone' as any)}
              {/if}
            </span>
          </div>
          <button class="lnk" disabled={mesure} onclick={remesurer}>{mesure ? '…' : $t('upsampling.remeasure' as any)}</button>
        </div>

        <div class="actions">
          <button class="go" disabled={occupe || aJour} onclick={enregistrer}>{occupe ? '…' : $t('upsampling.save' as any)}</button>
          <span class="hint">{$t('upsampling.nextTrack' as any)}</span>
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  .v2-up{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px; max-width:920px}
  .lead{font-size:14px; line-height:1.6; color:var(--v2-txt2); padding:6px 0 18px; max-width:62ch}
  .state{padding:24px 0; color:var(--v2-txt3)}
  .err,.warn{padding:11px 14px; border-radius:10px; font-size:12.5px; line-height:1.5; margin-bottom:16px}
  .err{color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .warn{color:var(--v2-txt2); border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .card{border:1px solid var(--v2-line); border-radius:14px; background:var(--v2-surface2); padding:6px 20px 18px; margin-bottom:16px}
  .row{display:flex; align-items:center; justify-content:space-between; gap:24px; padding:16px 0;
    border-bottom:1px solid var(--v2-line)}
  .lbl{display:flex; flex-direction:column; gap:4px; min-width:0}
  .lbl span:first-child{font-size:14px; font-weight:600}
  .hint{font-size:11.5px; line-height:1.45; color:var(--v2-txt3); max-width:62ch}
  .val{font:12px var(--v2-mono); color:var(--v2-txt2)}
  .sel{background:var(--v2-surface); color:var(--v2-txt); border:1px solid var(--v2-line2); border-radius:8px; padding:6px 8px}
  .actions{display:flex; gap:10px; align-items:center; padding-top:14px}
  .go{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); color:var(--v2-on-acc, #fff); border:0;
    border-radius:9px; padding:8px 14px; font-weight:600; cursor:pointer}
  .go:disabled{opacity:.45; cursor:default}
  .lnk{background:none; border:0; color:var(--v2-txt2); cursor:pointer; text-decoration:underline}
  .sw{position:relative; flex:0 0 auto; width:46px; height:26px; cursor:pointer}
  .sw input{position:absolute; opacity:0; width:0; height:0}
  .slider{position:absolute; inset:0; border-radius:999px; background:var(--v2-line2); transition:.18s}
  .slider::before{content:""; position:absolute; left:3px; top:3px; width:20px; height:20px; border-radius:50%;
    background:var(--v2-knob); transition:.18s}
  .sw input:checked + .slider{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw input:checked + .slider::before{transform:translateX(20px)}
  @media (max-width: 640px){ .scroll{padding:6px 16px 40px} .row{flex-wrap:wrap} }
</style>
