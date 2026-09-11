<script lang="ts">
  import * as api from '../lib/api';
  import { t } from '../lib/i18n';
  import { dateSimple } from '../lib/dates';
  import { notifications } from '../lib/stores/notifications';
  import { preferences } from '../lib/stores/preferences';
  import { rendererProbeErrorKey } from '../lib/rendererProbe';
  import { etatWav24, wav24Disponible } from '../lib/wav24Gate';
  import {
    cleAppareil, parLeNom, construireInstantane, lireInstantane, ranger, oublier,
    ecarts, corpsPatch, type ValeursEcran,
  } from '../lib/reglagesRendererEnregistres';
  import type { Zone, RendererCapabilities } from '../lib/types';

  // Coherent per-renderer output config for a DLNA/OpenHome zone: a discovery
  // check (GetProtocolInfo) plus overrides that respect the server's precedence
  // (forcing WAV wins over native passthrough). Maps to the existing zone flags.
  let { zone }: { zone: Zone } = $props();

  // Optimistic local state, seeded from the zone.
  let nativeFlac = $state(zone.dlna_native_flac ?? false);
  let alacNative = $state(zone.alac_passthrough ?? false);
  let aacNative = $state(zone.aac_passthrough ?? false);
  let cap16 = $state(zone.dlna_cap_16bit ?? false);
  // 'off' | '16' | '24'. 24-bit WAV is offered once a discovery check confirms the
  // renderer advertises audio/L24 or generic audio/wav — capping to 16-bit LPCM on
  // a renderer that only groks L16 plays silence (#1137), so it stays gated + opt-in.
  let forceWav = $state<'off' | '16' | '24'>(
    zone.dlna_wav24 ? '24' : zone.dlna_lpcm ? '16' : 'off'
  );

  // Réduire la profondeur ne réduit PAS la fréquence : un 96 kHz/24 bits devient
  // 96 kHz/16 bits, et reste donc refusé par un renderer qui plafonne à 48 kHz.
  // Les deux réglages vivent dans deux blocs différents de l'écran, sans que rien
  // n'indique que l'un ne suffit pas — Yves y a perdu du temps, il ne sera pas le
  // dernier. On le dit là où la case est cochée, pas dans une infobulle.
  let rateStillUncapped = $derived((cap16 || forceWav !== 'off') && !zone.max_sample_rate);

  // Les deux cases ne se contredisent plus : elles décrivent deux sources
  // différentes. « Forcer le WAV » vise le décodeur ALAC du renderer, donc il
  // ne s'applique QU'AUX sources non-FLAC ; un FLAC avec « FLAC natif » coché
  // part en FLAC (serveur : `wav_override_applies`, forum #1437).
  //
  // Le message précédent disait l'inverse — que le WAV l'emportait et que le
  // FLAC natif était ignoré. C'était exact, ce ne l'est plus : on décrit donc
  // le partage plutôt qu'une précédence.
  let flacAndWavSplitBySource = $derived(nativeFlac && forceWav !== 'off');


  let caps = $state<RendererCapabilities | null>(null);
  let probing = $state(false);
  let probeError = $state<string | null>(null);

  let capChips = $derived(
    caps
      ? [
          { label: 'FLAC', ok: !!caps.flac },
          { label: 'WAV / LPCM 16', ok: !!caps.lpcm16 || !!caps.wav },
          { label: 'LPCM 24', ok: !!caps.lpcm24 },
          { label: 'ALAC', ok: !!caps.alac },
          { label: 'AAC', ok: !!caps.aac },
          { label: 'MP3', ok: !!caps.mp3 },
          { label: 'DSD', ok: !!caps.dsd },
        ]
      : []
  );

  async function check() {
    if (zone.id == null) return;
    probing = true;
    probeError = null;
    caps = null;
    try {
      const r = await api.probeRendererCapabilities(zone.id);
      if (r.probed) caps = r;
      else probeError = $t(rendererProbeErrorKey(r.reason));
    } catch {
      probeError = $t('renderer.probeFailed');
    } finally {
      probing = false;
    }
  }

  /**
   * « Enregistré » — le témoin de l'écriture au clic.
   *
   * Chaque case part en `PATCH /zones/{id}` dès qu'on la coche : c'est la
   * sauvegarde automatique, et elle ne change pas. Seul l'échec parlait
   * (`renderer.saveError`) ; ce témoin dit le succès, et distingue « c'est
   * écrit » de « le clic n'a rien fait ».
   *
   * 🔴 L'incohérence était dans le MÊME onglet Appareils : `ZoneDeviceEditor`,
   * juste à côté, montre un « Enregistré » après sa sauvegarde
   * (`ZoneDeviceEditor.svelte:150`). Deux blocs voisins, deux comportements.
   * On reprend le sien, sa clé i18n comprise — traduite dans les 11 langues.
   *
   * Le bouton « Enregistrer cette configuration », plus bas, ne remplace pas
   * cette écriture : il en garde une COPIE ailleurs. Voir le bloc de la
   * configuration enregistrée.
   */
  let enregistreLe = $state(0);
  let minuterie: ReturnType<typeof setTimeout> | null = null;

  async function save(fn: () => Promise<unknown>) {
    try {
      await fn();
      enregistreLe = Date.now();
      if (minuterie) clearTimeout(minuterie);
      // Il s'efface : un témoin permanent cesse d'être lu, et ne dirait plus
      // rien du clic suivant.
      minuterie = setTimeout(() => { enregistreLe = 0; }, 2200);
    } catch {
      notifications.error($t('renderer.saveError'));
    }
  }

  function setNativeFlac(v: boolean) {
    nativeFlac = v;
    if (zone.id != null) save(() => api.updateZoneDlnaNativeFlac(zone.id!, v));
  }
  function setAlac(v: boolean) {
    alacNative = v;
    if (zone.id != null) save(() => api.updateZoneAlacPassthrough(zone.id!, v));
  }
  function setAac(v: boolean) {
    aacNative = v;
    if (zone.id != null) save(() => api.updateZoneAacPassthrough(zone.id!, v));
  }
  function setCap16(v: boolean) {
    cap16 = v;
    if (zone.id != null) save(() => api.updateZoneDlnaCap16bit(zone.id!, v));
  }
  // 24-bit WAV is unlocked once the discovery check confirms the renderer
  // advertises audio/L24 OR generic audio/wav: the dlna_wav24 server path sends a
  // real WAV file WITHOUT the LPCM PN, so any WAV-capable renderer parses the
  // 24-bit header (a genuine 24-bit DAC like the darTZeel LHC-208 accepts WAV but
  // never announces L24). It stays an explicit per-zone opt-in.
  // If the zone already had it saved (dlna_wav24), keep it selectable even before a
  // fresh probe so the current state isn't silently downgraded.
  //
  // Ce qui change (#303) : une sonde qui n'a pas répondu n'est PLUS un refus.
  // `caps` reste `null` tant que le test de découverte n'a pas abouti — le
  // bouton était donc grisé sur TOUS les renderers à l'ouverture de l'écran, et
  // à jamais sur ceux dont la sonde échoue. Le darTZeel LHC-208 d'Yves Corbat
  // est lent à acquitter ses commandes SOAP : le réglage lui restait
  // inatteignable, sans contournement. Le serveur qualifie lui-même ce cas
  // d'« inconclusive » ; aucun autre réglage de cet écran n'exige de preuve.
  //
  // Le garde-fou reste, mais il repose désormais sur une PREUVE : une sonde qui
  // a répondu et n'annonce ni audio/L24 ni audio/wav décrit un appareil qui ne
  // saura pas le faire. La règle et ses justifications vivent dans
  // `lib/wav24Gate.ts`, où elles se testent.
  let wav24Etat = $derived(etatWav24(caps, forceWav === '24'));
  let wav24Available = $derived(wav24Disponible(caps, forceWav === '24'));

  function setForceWav(mode: 'off' | '16' | '24') {
    if (mode === '24' && !wav24Available) return;
    forceWav = mode;
    // dlna_lpcm (16-bit LPCM) and dlna_wav24 (24-bit) are mutually exclusive —
    // one PATCH sets both so the zone never holds a contradictory pair.
    if (zone.id != null) save(() => api.updateZoneWavMode(zone.id!, mode));
  }

  // Start delay (ms) between SetAVTransportURI and Play — gives a renderer with
  // a cold-start under-run (first seconds hachées) time to buffer. 0 = config
  // default. Common presets; server accepts any value.
  let playDelay = $state(zone.dlna_play_delay_ms ?? 0);
  const DELAY_PRESETS: { ms: number; label: string }[] = [
    { ms: 0, label: 'Off' },
    { ms: 1000, label: '1 s' },
    { ms: 2000, label: '2 s' },
    { ms: 3000, label: '3 s' },
  ];
  function setPlayDelay(ms: number) {
    playDelay = ms;
    if (zone.id != null) save(() => api.updateZoneDlnaPlayDelay(zone.id!, ms));
  }

  /* ------------------------------------------------------------------------
   * La configuration ENREGISTRÉE.
   *
   * Bertrand, deux fois : le 08/09/2026 « je veux un bouton sur l'UI de Tune
   * sauvegarder mes réglages en local ! », puis le 09/09 en désignant cet
   * écran-ci.
   *
   * Ce bloc n'enlève RIEN à l'écriture au clic ci-dessus : elle reste
   * l'application immédiate, celle qui fait jouer l'appareil maintenant. Il
   * ajoute une copie durable, rattachée à l'APPAREIL et rangée dans les
   * préférences synchronisées.
   *
   * ⚠️ Ce bloc n'est PAS le correctif de la perte de configuration entre
   * sessions. Ce défaut-là (#3919) est réglé côté serveur par #3928, qui
   * ré-ancre une zone renommée sur la MAC que sa ligne porte déjà. Ce qui reste
   * ici est la fonction demandée, et les cas que ce filet refuse — la liste et
   * ses raisons vivent dans `lib/reglagesRendererEnregistres`, où elles se
   * testent.
   * --------------------------------------------------------------------- */

  /** Les sept valeurs telles que l'écran les porte — `forceWav` redevient la
   *  paire exclusive que le serveur attend. */
  let valeursEcran = $derived<ValeursEcran>({
    dlna_native_flac: nativeFlac,
    alac_passthrough: alacNative,
    aac_passthrough: aacNative,
    dlna_lpcm: forceWav === '16',
    dlna_wav24: forceWav === '24',
    dlna_cap_16bit: cap16,
    dlna_play_delay_ms: playDelay,
  });

  let cleZone = $derived(cleAppareil(zone));
  let enregistre = $derived(
    lireInstantane($preferences.reglagesRendererEnregistres, cleZone)
  );
  /** Dérivé de l'écran, jamais posé à la main : après une remise en place,
   *  l'écart se recalcule tout seul et le bandeau disparaît. */
  let divergences = $derived(enregistre ? ecarts(enregistre, valeursEcran) : []);
  let remiseEnPlace = $state(false);

  /**
   * Enregistrer : UN patch de la configuration entière, PUIS la copie.
   *
   * Le patch d'abord, et complet : il remet la ligne de zone en accord avec
   * l'écran même si l'une des écritures au clic avait échoué sans qu'on y
   * prenne garde. Et la copie n'est rangée qu'après le succès — enregistrer
   * une configuration que le serveur a refusée serait garder une preuve de ce
   * qui n'existe pas.
   */
  async function enregistrerConfig() {
    if (zone.id == null || !cleZone) return;
    const instantane = construireInstantane(zone, valeursEcran);
    try {
      await api.updateZoneReglages(zone.id, corpsPatch(instantane));
    } catch {
      notifications.error($t('renderer.saveError'));
      return;
    }
    const cle = cleZone;
    preferences.update((p) => ({
      ...p,
      reglagesRendererEnregistres: ranger(p.reglagesRendererEnregistres, cle, instantane),
    }));
    enregistreLe = Date.now();
    if (minuterie) clearTimeout(minuterie);
    minuterie = setTimeout(() => { enregistreLe = 0; }, 2200);
  }

  /**
   * Remettre la configuration enregistrée.
   *
   * L'écran suit l'écriture, il ne la précède pas : les états locaux ne sont
   * repris qu'APRÈS le succès du patch. Un échec laisse donc l'écran sur ce
   * qui est réellement en base, au lieu d'afficher une remise en place qui n'a
   * pas eu lieu.
   *
   * Le garde-fou du WAV 24 bits n'est volontairement pas consulté ici : une
   * configuration enregistrée porte une décision déjà prise sur cet appareil,
   * et la refuser rendrait le réglage inatteignable chez ceux dont la sonde ne
   * répond pas — c'est exactement le défaut #303. L'avertissement
   * « sans preuve » reste affiché, lui.
   */
  async function restaurerConfig() {
    if (!enregistre || zone.id == null) return;
    remiseEnPlace = true;
    try {
      await api.updateZoneReglages(zone.id, corpsPatch(enregistre));
      const r = enregistre.reglages;
      if (r.dlna_native_flac !== undefined) nativeFlac = !!r.dlna_native_flac;
      if (r.alac_passthrough !== undefined) alacNative = !!r.alac_passthrough;
      if (r.aac_passthrough !== undefined) aacNative = !!r.aac_passthrough;
      if (r.dlna_cap_16bit !== undefined) cap16 = !!r.dlna_cap_16bit;
      if (r.dlna_play_delay_ms !== undefined) playDelay = Number(r.dlna_play_delay_ms);
      if (r.dlna_wav24 !== undefined || r.dlna_lpcm !== undefined) {
        forceWav = r.dlna_wav24 ? '24' : r.dlna_lpcm ? '16' : 'off';
      }
      enregistreLe = Date.now();
      if (minuterie) clearTimeout(minuterie);
      minuterie = setTimeout(() => { enregistreLe = 0; }, 2200);
    } catch {
      notifications.error($t('renderer.saveError'));
    } finally {
      remiseEnPlace = false;
    }
  }

  /** Oublier n'écrit rien sur l'appareil : la copie disparaît, la zone reste. */
  function oublierConfig() {
    if (!cleZone) return;
    const cle = cleZone;
    preferences.update((p) => ({
      ...p,
      reglagesRendererEnregistres: oublier(p.reglagesRendererEnregistres, cle),
    }));
  }

  const libelle = (v: boolean | number): string =>
    typeof v === 'boolean' ? (v ? 'on' : 'off') : String(v);
</script>

<div class="rc">
  <div class="rc-discovery">
    {#if enregistreLe}
      <span class="rc-saved" role="status">{$t('common.saved')}</span>
    {/if}
    <button class="rc-check" onclick={check} disabled={probing}>
      {probing ? $t('renderer.checking') : $t('renderer.check')}
    </button>
    {#if caps}
      <div class="rc-caps" title={$t('renderer.capsIntro')}>
        {#each capChips as c (c.label)}
          <span class="rc-chip" class:ok={c.ok} class:no={!c.ok}>{c.label} {c.ok ? '✓' : '✗'}</span>
        {/each}
      </div>
    {:else if probeError}
      <span class="rc-err">{probeError}</span>
    {/if}
  </div>

  <div class="rc-controls">
    <label class="rc-toggle" title={$t('settings.dlnaNativeFlacHint')}>
      <input type="checkbox" checked={nativeFlac} onchange={(e) => setNativeFlac((e.target as HTMLInputElement).checked)} />
      <span>{$t('settings.dlnaNativeFlac')}</span>
    </label>
    {#if flacAndWavSplitBySource}
      <p class="rc-hint">{$t('renderer.flacAndWavSplitBySource')}</p>
    {/if}
    <label class="rc-toggle" title={$t('settings.alacPassthroughHint')}>
      <input type="checkbox" checked={alacNative} onchange={(e) => setAlac((e.target as HTMLInputElement).checked)} />
      <span>{$t('settings.alacPassthrough')}</span>
    </label>
    <!-- Marco Polo (#1424) : « Je le cherche au même endroit que pour forcer
         l'ALAC mais il ne s'y trouve pas. » Le serveur portait le réglage
         depuis la 0.9.83 ; aucun écran ne l'exposait. Il vit donc ICI, contre
         l'ALAC, parce que c'est là qu'on est allé le chercher. -->
    <label class="rc-toggle" title={$t('settings.aacPassthroughHint')}>
      <input type="checkbox" checked={aacNative} onchange={(e) => setAac((e.target as HTMLInputElement).checked)} />
      <span>{$t('settings.aacPassthrough')}</span>
    </label>
    {#if aacNative && forceWav !== 'off'}
      <p class="rc-hint">{$t('renderer.aacIgnoredWhenWavForced')}</p>
    {/if}

    <div class="rc-wav">
      <span class="rc-wav-label">{$t('renderer.forceWav')}</span>
      <div class="rc-seg" role="group">
        <button class:active={forceWav === 'off'} onclick={() => setForceWav('off')}>{$t('renderer.wavOff')}</button>
        <button class:active={forceWav === '16'} onclick={() => setForceWav('16')}>{$t('renderer.wav16')}</button>
        <button class:active={forceWav === '24'} disabled={!wav24Available} title={$t('renderer.wav24Hint')} onclick={() => setForceWav('24')}>{$t('renderer.wav24')}</button>
      </div>
    </div>
    {#if wav24Etat === 'sans_preuve'}
      <p class="rc-warn">{$t('renderer.wav24Unproven')}</p>
    {:else if wav24Etat === 'refuse'}
      <p class="rc-warn">{$t('renderer.wav24Refused')}</p>
    {/if}

    <label class="rc-toggle" title={$t('settings.dlnaCap16bitHint')}>
      <input type="checkbox" checked={cap16} onchange={(e) => setCap16((e.target as HTMLInputElement).checked)} />
      <span>{$t('settings.dlnaCap16bit')}</span>
    </label>

    {#if rateStillUncapped}
      <p class="rc-warn">{$t('renderer.depthCapNotRate')}</p>
    {/if}

    <div class="rc-wav" title={$t('renderer.startDelayHint')}>
      <span class="rc-wav-label">{$t('renderer.startDelay')}</span>
      <div class="rc-seg" role="group">
        {#each DELAY_PRESETS as d (d.ms)}
          <button class:active={playDelay === d.ms} onclick={() => setPlayDelay(d.ms)}>{d.ms === 0 ? $t('renderer.wavOff') : d.label}</button>
        {/each}
      </div>
    </div>
  </div>

  <!-- La configuration enregistrée. Le texte d'aide dit d'abord que tout est
       déjà appliqué : sans cela, le bouton laisserait croire le contraire, et
       le quitter sans l'avoir pressé donnerait l'impression d'avoir tout
       perdu. -->
  <div class="rc-garde">
    <p class="rc-hint">{$t('renderer.saveConfigHint')}</p>
    <div class="rc-garde-actions">
      <button
        class="rc-check"
        disabled={!cleZone || zone.id == null}
        title={cleZone ? $t('renderer.saveConfigHint') : $t('renderer.saveConfigNoKey')}
        onclick={enregistrerConfig}
      >
        {$t('renderer.saveConfig')}
      </button>
      {#if enregistre}
        <span class="rc-garde-date">
          {$t('renderer.configSavedOn').replace('{date}', $dateSimple(enregistre.enregistre_le))}
        </span>
        <button class="rc-lien" onclick={oublierConfig}>{$t('renderer.forgetConfig')}</button>
      {/if}
    </div>
    {#if !cleZone}
      <p class="rc-warn">{$t('renderer.saveConfigNoKey')}</p>
    {:else if parLeNom(cleZone)}
      <p class="rc-hint">{$t('renderer.configByName')}</p>
    {/if}

    {#if enregistre && divergences.length}
      <div class="rc-ecart">
        <p class="rc-warn">
          {$t('renderer.configDiverged').replace('{date}', $dateSimple(enregistre.enregistre_le))}
        </p>
        <ul class="rc-chg">
          {#each divergences as d (d.cle)}
            <li>
              <code>{d.cle}</code>
              <span class="rc-av">{libelle(d.courant)}</span>
              <span class="rc-fl">→</span>
              <span class="rc-ap">{libelle(d.enregistre)}</span>
            </li>
          {/each}
        </ul>
        <button class="rc-check" disabled={remiseEnPlace} onclick={restaurerConfig}>
          {remiseEnPlace ? $t('renderer.restoringConfig') : $t('renderer.restoreConfig')}
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Même dessin que le « Enregistré » de `ZoneDeviceEditor`, dans le même
     onglet : deux blocs voisins ne doivent pas s'annoncer de deux façons. */
  .rc-saved {
    font-size: 11px;
    font-weight: 600;
    color: var(--tune-success, #22c55e);
    margin-right: 8px;
    white-space: nowrap;
  }

  .rc {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--tune-border);
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.02);
  }
  .rc-discovery {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .rc-check {
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--tune-text);
    background: var(--tune-surface);
    border: 1px solid var(--tune-border);
    border-radius: 8px;
    padding: 7px 14px;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
  }
  .rc-check:hover:not(:disabled) {
    border-color: var(--tune-accent);
  }
  .rc-check:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .rc-caps {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .rc-chip {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: 0.02em;
    padding: 4px 9px;
    border-radius: 999px;
    border: 1px solid var(--tune-border);
  }
  .rc-chip.ok {
    color: var(--tune-success, #5fd0a0);
    border-color: rgba(95, 208, 160, 0.4);
    background: rgba(95, 208, 160, 0.08);
  }
  .rc-chip.no {
    color: var(--tune-text-muted);
    opacity: 0.7;
  }
  .rc-err {
    color: var(--tune-error, #ef4444);
    font-size: 12px;
  }
  .rc-controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .rc-toggle {
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 13px;
    color: var(--tune-text);
    cursor: pointer;
  }
  .rc-warn {
    margin: -2px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--tune-warning, #d29922);
  }
  /* Même gabarit, ton neutre : le partage FLAC/WAV par source n'est pas un
     avertissement mais une explication de ce qui va se passer. */
  .rc-hint {
    margin: -2px 0 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--tune-text-secondary, #9ca3af);
  }
  .rc-wav {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .rc-wav-label {
    font-size: 13px;
    color: var(--tune-text);
  }
  .rc-seg {
    display: inline-flex;
    border: 1px solid var(--tune-border);
    border-radius: 8px;
    overflow: hidden;
  }
  .rc-seg button {
    font: inherit;
    font-size: 12px;
    color: var(--tune-text-secondary);
    background: transparent;
    border: none;
    border-right: 1px solid var(--tune-border);
    padding: 6px 14px;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .rc-seg button:last-child {
    border-right: none;
  }
  .rc-seg button.active {
    background: var(--tune-accent);
    color: #fff;
  }
  .rc-seg button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* La configuration enregistrée : séparée par un filet, parce qu'elle ne
     décrit pas un réglage de plus mais ce qui advient des sept autres. */
  .rc-garde {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--tune-border);
  }
  .rc-garde-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .rc-garde-date {
    font-size: 12px;
    color: var(--tune-text-secondary, #9ca3af);
  }
  .rc-lien {
    font: inherit;
    font-size: 12px;
    color: var(--tune-text-secondary, #9ca3af);
    background: none;
    border: none;
    padding: 0;
    text-decoration: underline;
    cursor: pointer;
  }
  .rc-lien:hover {
    color: var(--tune-text);
  }
  .rc-ecart {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .rc-chg {
    list-style: none;
    margin: 0;
    padding: 0 0 0 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .rc-chg li {
    display: flex;
    gap: 6px;
    align-items: baseline;
    font-size: 12px;
  }
  .rc-chg code {
    font-family: var(--font-mono, ui-monospace, monospace);
    color: var(--tune-text-secondary, #9ca3af);
  }
  .rc-av,
  .rc-fl {
    color: var(--tune-text-secondary, #9ca3af);
  }
  .rc-ap {
    color: var(--tune-success, #5fd0a0);
    font-weight: 600;
  }
</style>
