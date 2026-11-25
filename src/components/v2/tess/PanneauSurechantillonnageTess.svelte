<script lang="ts">
  /**
   * TESS rc14 — colonne de droite quand l'étage fixe « Suréchantillonnage »
   * est choisi : la cible, PCM ou DSD (DSD64, DSD128, DSD256).
   *
   * Tout vient de la réponse du serveur (`fixed.upsampling` et
   * `dsd_capabilities`, contrat de tune-server-rust#9518) ; la logique est
   * dans `lib/tessDsd.ts` :
   *   - une cible que la sortie ne prend pas est grisée, avec son motif ;
   *   - une cible acceptée dit son transport (natif ou DoP) ;
   *   - `dsd_mode` non activé sur la zone : on le dit, avec un lien vers le
   *     réglage « DSD » de la zone ;
   *   - sortie réseau : l'étage ne s'y applique pas, rien n'est proposé ;
   *   - serveur sans `dsd_capabilities` : le DSD n'est pas proposé ;
   *   - en DSD, un avertissement sobre : le niveau, environ 6 dB sous le PCM
   *     (référence SACD) ;
   *   - Free : lecture seule, avec le motif (`motifDuVerrou`, comme les greffons).
   * Chaque choix part tout de suite (`onChange`) ; l'écran redessine depuis la
   * réponse, et un refus (402, 409) s'affiche en haut de l'écran TESS.
   */
  import { t } from '../../../lib/i18n';
  import { cleFiltre } from '../../../lib/surechantillonnage';
  import type { ReponseTessZone } from '../../../lib/tess';
  import {
    capacitesDe, surSortieReseau, dsdProposable, modeDsdActive, etatsDesCibles, cleMotifDsd, upsamplingDe, modeDe,
    versPcm, versDsd, cibleParDefaut, FILTRES_SDK, RAPPORTS_PCM, type CibleDsd, type UpsamplingTess,
  } from '../../../lib/tessDsd';

  let {
    reponse,
    verrou = null,
    occupe = false,
    onChange,
    onOuvrirReglagesZone = null,
  }: {
    reponse: ReponseTessZone;
    /** Free (ou droit refusé par le serveur) : lecture seule, avec ce motif. */
    verrou?: string | null;
    occupe?: boolean;
    onChange: (up: UpsamplingTess) => void;
    /** Ouvre le réglage « DSD » de la zone (Réglages › Appareils), ou `null`. */
    onOuvrirReglagesZone?: (() => void) | null;
  } = $props();

  const tr = (k: string) => $t(k as any);

  const reseau = $derived(surSortieReseau(reponse));
  const capacites = $derived(capacitesDe(reponse));
  const dsdPossible = $derived(dsdProposable(reponse));
  const actuel = $derived(upsamplingDe(reponse.chain));
  const etats = $derived(etatsDesCibles(capacites));
  const verrouille = $derived(verrou != null);
  const inerte = $derived(verrouille || occupe);

  /** « DSD » choisi alors qu'aucune cible n'est acceptée : rien n'est envoyé, on montre pourquoi. */
  let dsdVoulu = $state(false);
  const mode = $derived(dsdVoulu && dsdPossible ? 'dsd' : modeDe(reponse.chain));
  const filtre = $derived(typeof actuel.filter === 'string' && actuel.filter ? actuel.filter : 'polyvalent');
  const filtres = $derived(FILTRES_SDK.includes(filtre as any) ? [...FILTRES_SDK] : [filtre, ...FILTRES_SDK]);

  function choisirMode(m: 'off' | 'pcm' | 'dsd') {
    if (inerte) return;
    if (m === 'dsd') {
      dsdVoulu = true;
      if (actuel.mode === 'dsd') return;
      const cible = cibleParDefaut(actuel, etats);
      if (cible) onChange(versDsd(actuel, cible));
      return;
    }
    dsdVoulu = false;
    if (m === actuel.mode) return;
    onChange(m === 'off' ? { mode: 'off' } : versPcm(actuel));
  }

  function choisirCible(rate: CibleDsd) {
    if (inerte || (actuel.mode === 'dsd' && actuel.rate === rate)) return;
    onChange(versDsd(actuel, rate));
  }

  function choisirFiltre(f: string) {
    if (inerte || f === filtre) return;
    if (actuel.mode === 'dsd') onChange(versDsd(actuel, actuel.rate as CibleDsd, f));
    else if (actuel.mode === 'pcm') onChange(versPcm(actuel, { filter: f }));
  }

  function choisirRapport(v: string) {
    if (inerte) return;
    onChange(versPcm(actuel, { max_ratio: v === '' ? null : Number(v) }));
  }

  /** « Natif », « DoP », ou « DoP · natif indisponible » (zone « natif » servie en DoP). */
  function texteTransport(transport: 'native' | 'dop' | null, nativeReason: string | null): string {
    if (transport === 'native') return tr('v2.lbl.native');
    return nativeReason ? `DoP · ${tr('tess.dsd.nativeUnavailable')}` : 'DoP';
  }
</script>

<section class="surech" aria-labelledby="tess-surech-titre" data-tess-surechantillonnage>
  <header class="tete">
    <h2 id="tess-surech-titre">{$t('tess.step.upsampling' as any)}</h2>
    <span class="premium">{$t('tess.premium' as any)}</span>
  </header>

  {#if reseau}
    <p class="note" role="note" data-tess-surech-reseau>{$t('tess.dsd.network' as any)}</p>
  {:else}
    {#if verrou}<p class="note" role="note" data-tess-surech-verrou>{verrou}</p>{/if}

    <div class="modes" role="radiogroup" aria-label={$t('tess.dsd.target' as any)}>
      <label class="mode" class:actif={mode === 'off'}>
        <input type="radio" name="tess-surech-mode" value="off" checked={mode === 'off'} disabled={inerte}
               data-tess-surech-mode="off" onchange={() => choisirMode('off')} />
        <span>{$t('tess.off' as any)}</span>
      </label>
      <label class="mode" class:actif={mode === 'pcm'}>
        <input type="radio" name="tess-surech-mode" value="pcm" checked={mode === 'pcm'} disabled={inerte}
               data-tess-surech-mode="pcm" onchange={() => choisirMode('pcm')} />
        <span>PCM</span>
      </label>
      {#if dsdPossible || mode === 'dsd'}
        <label class="mode" class:actif={mode === 'dsd'}>
          <input type="radio" name="tess-surech-mode" value="dsd" checked={mode === 'dsd'} disabled={inerte || !dsdPossible}
                 data-tess-surech-mode="dsd" onchange={() => choisirMode('dsd')} />
          <span>DSD</span>
        </label>
      {/if}
    </div>

    {#if mode === 'pcm' || mode === 'dsd'}
      <label class="champ">
        <span>{$t('upsampling.filter' as any)}</span>
        <select value={filtre} disabled={inerte || actuel.mode === 'off'} data-tess-surech-filtre
                onchange={(e) => choisirFiltre((e.currentTarget as HTMLSelectElement).value)}>
          {#each filtres as f (f)}<option value={f}>{$t(cleFiltre(f) as any)}</option>{/each}
        </select>
      </label>
    {/if}

    {#if mode === 'pcm'}
      <label class="champ">
        <span>{$t('upsampling.target' as any)}</span>
        <select value={actuel.max_ratio == null ? '' : String(actuel.max_ratio)} disabled={inerte || actuel.mode !== 'pcm'}
                data-tess-surech-rapport onchange={(e) => choisirRapport((e.currentTarget as HTMLSelectElement).value)}>
          <option value="">{$t('upsampling.targetMax' as any)}</option>
          {#each RAPPORTS_PCM as r (r)}<option value={String(r)}>×{r}</option>{/each}
        </select>
      </label>
    {/if}

    {#if mode === 'dsd'}
      {#if !modeDsdActive(capacites)}
        <div class="note" role="note" data-tess-dsd-mode-inactif>
          <span>{$t('tess.dsd.modeNotEnabled' as any)}</span>
          {#if onOuvrirReglagesZone}
            <button type="button" class="lien" data-tess-dsd-reglages-zone onclick={() => onOuvrirReglagesZone?.()}>
              {$t('tess.dsd.openZoneSettings' as any)} →
            </button>
          {/if}
        </div>
      {/if}

      <ul class="cibles" role="radiogroup" aria-label={$t('tess.dsd.rate' as any)}>
        {#each etats as c (c.rate)}
          <li class="cible" class:grise={!c.accepted} data-tess-dsd-cible={c.rate} data-tess-dsd-acceptee={c.accepted ? 'oui' : 'non'}>
            <label>
              <input type="radio" name="tess-dsd-cible" value={c.rate}
                     checked={actuel.mode === 'dsd' && actuel.rate === c.rate}
                     disabled={inerte || !c.accepted}
                     onchange={() => choisirCible(c.rate)} />
              <span class="nom">{c.rate.toUpperCase()}</span>
              <span class="familles">
                <!-- 44,1 kHz : la famille que le serveur vérifie, celle qui grise la cible. -->
                <span class="famille" data-tess-dsd-famille="44k1">
                  <span class="fam">{$t('tess.dsd.family44' as any)}</span>
                  {#if c.accepted}
                    <span class="transport" data-tess-dsd-transport={c.transport}>{texteTransport(c.transport, c.native_reason)}</span>
                  {:else}
                    <span class="motif" data-tess-dsd-motif={c.reason}>{$t(cleMotifDsd(c.reason) as any)}</span>
                  {/if}
                </span>
                <!-- 48 kHz : ce que deviennent les sources 48, 96 ou 192 kHz. -->
                {#if c.family_48k}
                  <span class="famille" data-tess-dsd-famille="48k">
                    <span class="fam">{$t('tess.dsd.family48' as any)}</span>
                    {#if c.family_48k.accepted}
                      <span class="transport" data-tess-dsd-transport={c.family_48k.transport}>{texteTransport(c.family_48k.transport, c.family_48k.native_reason)}</span>
                    {:else}
                      <span class="motif" data-tess-dsd-motif={c.family_48k.reason}>{$t(cleMotifDsd(c.family_48k.reason) as any)}</span>
                    {/if}
                  </span>
                {/if}
              </span>
            </label>
          </li>
        {/each}
      </ul>

      <div class="avert" role="note" data-tess-dsd-avertissement>
        <!-- Q9 (relecture de #9518) : le volume s'applique juste avant le modulateur,
             rampe de 10 ms, réponse ≈ 1 s ; une baisse ne relance rien. -->
        {#if capacites?.volume_placement === 'before_dsd_modulator'}
          <p data-tess-dsd-volume>{$t('tess.dsd.volumeBeforeModulator' as any)}</p>
        {/if}
        <p>{$t('tess.dsd.levelNote' as any)}</p>
      </div>
    {/if}
  {/if}
</section>

<style>
  .surech{border:1px solid var(--v2-line); border-radius:16px; background:var(--v2-surface); padding:22px 26px;
    display:flex; flex-direction:column; gap:14px; min-width:0}
  .tete{display:flex; align-items:center; gap:10px}
  .tete h2{font-size:calc(24px * var(--v2-txt-echelle, 1)); font-weight:700; margin:0}
  .premium{font:700 calc(9.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.06em; padding:1px 6px; border-radius:4px;
    color:var(--v2-on-acc); background:var(--v2-acc1)}
  .note{margin:0; padding:10px 12px; border-radius:10px; border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); color:var(--v2-txt2);
    display:flex; flex-wrap:wrap; align-items:center; gap:8px; line-height:1.5}
  .lien{background:none; border:0; padding:0; color:var(--v2-acc1); font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); cursor:pointer}
  .modes{display:flex; gap:8px; flex-wrap:wrap}
  .mode{display:inline-flex; align-items:center; gap:6px; border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill);
    padding:6px 14px; cursor:pointer; color:var(--v2-txt2)}
  .mode.actif{border-color:var(--v2-acc1); color:var(--v2-txt)}
  .mode input{accent-color:var(--v2-acc1)}
  .champ{display:flex; align-items:center; justify-content:space-between; gap:12px; color:var(--v2-txt2)}
  .champ select{background:var(--v2-surface2); color:var(--v2-txt); border:1px solid var(--v2-line2); border-radius:8px; padding:6px 8px; max-width:60%}
  .cibles{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px}
  .cible label{display:flex; align-items:center; gap:10px; border:1px solid var(--v2-line); border-radius:10px; padding:10px 12px; cursor:pointer}
  .cible.grise label{cursor:default; opacity:.6}
  .cible input{accent-color:var(--v2-acc1)}
  .nom{font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-mono); min-width:64px}
  .familles{display:flex; flex-direction:column; gap:2px; min-width:0}
  .famille{display:flex; flex-wrap:wrap; gap:6px; align-items:baseline}
  .fam{color:var(--v2-txt3); font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); min-width:120px}
  .transport{color:var(--v2-txt2); font-size:calc(12.5px * var(--v2-txt-echelle, 1))}
  .motif{color:var(--v2-txt3); font-size:calc(12px * var(--v2-txt-echelle, 1)); line-height:1.4}
  .avert{color:var(--v2-txt3); font-size:calc(12px * var(--v2-txt-echelle, 1)); line-height:1.5}
  .avert p{margin:0}
</style>
