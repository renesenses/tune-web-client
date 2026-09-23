<script lang="ts">
  import { atteintLeSon } from '../../lib/porteeReglage';
  /**
   * Égaliseur — nouveau client (direction Levente).
   *
   * Égaliseur GRAPHIQUE sur les grilles ISO (10 / 15 / 31 bandes), avec
   * réglages tout faits, courbes gauche/droite déliables, et report honnête
   * de ce que le serveur a réellement appliqué.
   *
   * Le CROSSFEED n'est plus ici : il a son écran (Bertrand, 27/08). C'est un
   * réglage de casque, pas une correction de courbe.
   *
   * PÉRIMÈTRE ASSUMÉ : le sous-mode PARAMÉTRIQUE (bandes libres
   * fréquence/gain/Q/type) et l'assistant « Tune Master Profiler » de l'écran
   * actuel ne sont pas repris ici. Ce sont deux outils à part entière ; les
   * esquisser produirait des courbes fausses. L'écran le dit et y renvoie.
   *
   * La règle des canaux vient de `lib/eqGraphicChannels` — on la RÉUTILISE au
   * lieu de la réécrire : elle a ses tests, et deux implémentations d'un
   * découpage gauche/droite finiraient par diverger.
   */
  import * as api from '../../lib/api';
  import { rafraichirGreffonEgaliseur } from '../../lib/stores/egaliseur';
  import { zoneRequise } from '../../lib/zoneRequise';
  import type { EqBand, MergedPlugin } from '../../lib/api';
  import { currentZoneId, currentZone } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import { dialogs } from '../../lib/stores/dialogs';
  import { activeView } from '../../lib/stores/navigation';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { t } from '../../lib/i18n';
  import { NEUTRAL_PARAMETRIC_BAND } from '../../lib/eqReset';
  import ParametricEq from '../partages/ParametricEq.svelte';
  import ProfilerV2 from './ProfilerV2.svelte';
  import CompensationNiveauV2 from './CompensationNiveauV2.svelte';
  import { bandesGraphiques } from '../../lib/eqGraphicChannels';
  import '../../styles/tune-v2.css';

  const level = $derived($preferences.settingsLevel);
  const showExpert = $derived(atLeast(level, 'expert'));

  // Grilles ISO : octave (10), 2/3 d'octave (15), 1/3 d'octave (31) — les
  // repères de REW. La résolution est une clé SERVEUR : web, iPad et mobile
  // partagent la même grille.
  const GRIDS: Record<number, number[]> = {
    10: [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
    15: [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000],
    31: [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
         1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000],
  };
  // Q adapté à la largeur de bande ; 10 bandes garde le 1.0 historique pour ne
  // pas changer le rendu des réglages existants.
  const GRID_Q: Record<number, number> = { 10: 1.0, 15: 2.15, 31: 4.32 };
  const MIN_GAIN = -12, MAX_GAIN = 12;

  /**
   * Éditeur PARAMÉTRIQUE — le dernier manque face au client actuel
   * (Bertrand, 04/09/2026 : « la der »).
   *
   * `ParametricEq.svelte` est REPRIS tel quel : 393 lignes qui dessinent la
   * courbe de réponse réelle, calculée avec les mêmes biquads RBJ que
   * `tune-core/src/audio/eq.rs`. Le réécrire en version v2 imposerait de
   * maintenir deux fois une transposition de filtres — le genre de duplication
   * qui finit par diverger sans que personne ne s'en aperçoive à l'oreille.
   *
   * Il ne s'habille qu'en variables `--tune-*`, que `tune-v2.css` ponte déjà —
   * mêmes raisons que `TransportBar`, `RendererConfig` et `ZoneDeviceEditor`.
   *
   * DEUX MODES, UNE SEULE ROUTE. Graphique et paramétrique produisent tous
   * deux un tableau de bandes pour `POST /zones/{id}/eq` : ce qui change est
   * la façon de les composer, pas ce qu'on envoie. Le mode courant décide donc
   * seulement quelle liste part.
   */
  let sousMode = $state<'graphique' | 'parametrique' | 'assistant'>('graphique');
  /** Incrémenté à chaque courbe enregistrée : `CompensationNiveauV2` se relit. */
  let revisionDsp = $state(0);
  let pBandes = $state<EqBand[]>([]);

  const PRESETS: { key: string; labelKey: string; gains: number[] }[] = [
    { key: 'flat',         labelKey: 'v2.eq.presetFlat',      gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { key: 'bass_boost',   labelKey: 'v2.eq.presetBass',      gains: [8, 6, 4, 2, 0, 0, 0, 0, 0, 0] },
    { key: 'treble_boost', labelKey: 'v2.eq.presetTreble',    gains: [0, 0, 0, 0, 0, 1, 3, 5, 7, 8] },
    { key: 'loudness',     labelKey: 'v2.eq.presetLoudness',  gains: [6, 4, 0, -2, -1, 0, 2, 4, 5, 6] },
    { key: 'rock',         labelKey: 'v2.eq.presetRock',      gains: [5, 3, 0, -2, -1, 2, 4, 5, 5, 4] },
    { key: 'jazz',         labelKey: 'v2.eq.presetJazz',      gains: [3, 2, 0, 2, -1, -1, 0, 2, 4, 5] },
    { key: 'classical',    labelKey: 'v2.eq.presetClassical', gains: [0, 0, 0, 0, 0, 0, -2, -3, -2, -1] },
  ];

  let bandCount = $state(10);
  const BANDS = $derived(GRIDS[bandCount] ?? GRIDS[10]);
  let gains = $state<number[]>(Array(10).fill(0));
  /** Courbe du canal DROIT. `null` = courbes liées, et c'est le défaut : une
   *  seule passe part au serveur, sans champ `channel`. */
  let gainsRight = $state<number[] | null>(null);
  let editing = $state<'left' | 'right'>('left');
  let enabled = $state(true);
  let loading = $state(true);
  let error = $state<string | null>(null);

  /**
   * Égaliseur en greffon FACULTATIF (v0.9.156).
   *
   * Il n'est plus activé d'office : il s'installe depuis le catalogue.
   * `GET /plugins/equalizer` dit s'il est installé, s'il faut le PROPOSER
   * (une configuration existait avant la mise à jour) et si des réglages sont
   * conservés. Un vieux serveur ne rend pas ces champs, ou refuse la route :
   * on garde l'écran d'avant — `undefined` n'est JAMAIS « non installé »,
   * sinon un serveur d'hier montrerait un égaliseur « à installer » qui
   * tourne déjà.
   */
  let greffon = $state<Pick<MergedPlugin, 'installed' | 'install_proposed' | 'existing_configuration'> | null>(null);
  let installation = $state(false);
  let redemarrageRequis = $state(false);
  /** Compteur relu par l'effet de chargement : l'incrémenter recharge l'écran. */
  let rechargement = $state(0);
  const nonInstalle = $derived(greffon?.installed === false);
  const installationProposee = $derived(nonInstalle && greffon?.install_proposed === true);

  const curve = $derived(gainsRight !== null && editing === 'right' ? gainsRight : gains);

  /** Rééchantillonne une courbe d'une grille vers une autre, par plus proche
   *  voisin en fréquence : changer de résolution ne doit jamais remettre la
   *  courbe à plat. */
  function resample(src: number[], from: number[], to: number[]): number[] {
    return to.map((f) => {
      let best = 0, d = Infinity;
      from.forEach((g, i) => { const dd = Math.abs(Math.log2(f / g)); if (dd < d) { d = dd; best = i; } });
      return src[best] ?? 0;
    });
  }

  $effect(() => {
    const zid = $currentZoneId;
    void rechargement; // relu exprès : l'installation du greffon relance le chargement
    loading = true;
    // Le greffon se lit SANS zone : « pas installé » se dit même quand aucune
    // zone n'est choisie, sinon l'écran réclamerait une zone pour un
    // égaliseur qui n'existe pas encore.
    const lectureGreffon = api.getPluginDetail('equalizer')
      .then((p) => { greffon = p ?? null; }, () => { greffon = null; });
    const lectureZone = zid == null ? Promise.resolve() : Promise.allSettled([api.getEqExpertSettings(), api.getEq(zid)])
      .then(([res, eq]) => {
        if (res.status === 'fulfilled') bandCount = res.value.expert_bands ?? 10;
        const grid = GRIDS[bandCount] ?? GRIDS[10];
        if (eq.status === 'fulfilled' && eq.value) {
          enabled = eq.value.enabled ?? true;
          const bands = eq.value.bands ?? [];
          const left = bands.filter((b) => b.channel === undefined || b.channel === 0);
          const right = bands.filter((b) => b.channel === 1);
          gains = grid.map((f) => left.find((b) => Math.abs(b.freq - f) < 0.51)?.gain ?? 0);
          gainsRight = right.length ? grid.map((f) => right.find((b) => Math.abs(b.freq - f) < 0.51)?.gain ?? 0) : null;
        } else {
          gains = Array(grid.length).fill(0);
        }
        error = null;
      })
      .catch(() => { error = $t('v2.eq.errUnavailable' as any); });
    Promise.allSettled([lectureGreffon, lectureZone]).finally(() => { loading = false; });
  });

  /**
   * Installer PUIS activer, dans cet ordre — la même mécanique que
   * `PluginsV2` (`installPlugin` → `enablePlugin`), pas une autre route.
   *
   * `restart_required` est CRU : si le serveur dit qu'il faut redémarrer, on
   * ne promet pas que l'égaliseur marche tout de suite. Le message reste
   * affiché après le rechargement, jusqu'au redémarrage.
   */
  async function installerGreffon() {
    if (installation) return;
    installation = true;
    error = null;
    // Résolues AVANT l'attente : un `$t()` dans un `catch` est invisible au build.
    const msgOk = $t('v2.eq.pluginInstalled' as any);
    const msgKo = $t('v2.eq.pluginInstallError' as any);
    try {
      const inst = await api.installPlugin('equalizer');
      const act = await api.enablePlugin('equalizer');
      if (inst?.restart_required || act?.restart_required) redemarrageRequis = true;
      notifications.success(msgOk);
      rechargement++;
      // Le bouton EQ de Lecture en cours suit le même magasin : sans ce
      // rafraîchissement, il ne reviendrait qu'au prochain chargement de la
      // page — on aurait installé l'égaliseur sans le voir apparaître.
      void rafraichirGreffonEgaliseur();
    } catch {
      error = msgKo;
      notifications.error(msgKo);
    } finally {
      installation = false;
    }
  }

  // Le serveur applique au flux en cours quand il le peut (#1725). Quand il ne
  // le peut pas — zone réseau, mode PURE — et qu'on écoute, on pousse un
  // curseur et on n'entend rien : ce silence se raconte comme « l'égaliseur
  // ne fonctionne pas ». On le dit, UNE fois.
  let nextTrackWarned = false;
  function reportReach(appliedLive: boolean | undefined) {
    const listening = $currentZone?.state === 'playing';
    if (appliedLive === false && listening) {
      if (!nextTrackWarned) { nextTrackWarned = true; notifications.info($t('eq.effectNextTrack' as any)); }
    } else if (appliedLive === true) {
      nextTrackWarned = false;
    }
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  function queueSave() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void save(); }, 300);
  }
  async function save() {
    const zid = zoneRequise();
    if (zid == null) return;
    const bands: EqBand[] = sousMode === 'parametrique'
      ? $state.snapshot(pBandes)
      : bandesGraphiques(BANDS, gains, gainsRight, GRID_Q[bandCount] ?? 1.0);
    try {
      const res: any = await api.setEq(zid, { bands, enabled });
      reportReach(atteintLeSon(res?.applied_live, res?.portee));
      // La courbe a changé : ce que la compensation rend aussi (#4685).
      revisionDsp++;
      error = null;
    } catch (e: any) {
      // Un refus silencieux, c'est un égaliseur qui « ne marche pas » : les
      // curseurs bougent, la courbe tient à l'écran, et le son ne change
      // jamais. On le remonte.
      if (e?.message !== 'premium_required') error = $t('v2.eq.errRefused' as any);
    }
  }

  /**
   * Toucher une bande ALLUME l'égaliseur.
   *
   * Sans cela la courbe partirait avec `enabled: false` : les points bougent à
   * l'écran, la courbe se dessine, et le son ne change jamais. C'est la même
   * garde que dans le client actuel.
   */
  function surChangementParametrique() {
    if (!enabled) enabled = true;
    queueSave();
  }

  /**
   * Passer au paramétrique SÈME la courbe depuis le graphique.
   *
   * Arriver sur un éditeur vide effacerait le réglage en cours au premier
   * enregistrement. On reprend donc les bandes non nulles ; s'il n'y en a
   * aucune, une bande neutre pour avoir un point à saisir.
   */
  function versParametrique() {
    if (!pBandes.length) {
      const depart = bandesGraphiques(BANDS, gains, gainsRight, GRID_Q[bandCount] ?? 1.0)
        .filter((b) => b.gain !== 0);
      pBandes = depart.length ? depart : [{ ...NEUTRAL_PARAMETRIC_BAND }];
    }
    sousMode = 'parametrique';
  }

  function setGain(i: number, v: number) {
    if (gainsRight !== null && editing === 'right') gainsRight = gainsRight.map((g, k) => (k === i ? v : g));
    else gains = gains.map((g, k) => (k === i ? v : g));
    queueSave();
  }
  function applyPreset(p: { gains: number[] }) {
    const next = bandCount === 10 ? [...p.gains] : resample(p.gains, GRIDS[10], BANDS);
    if (gainsRight !== null && editing === 'right') gainsRight = next; else gains = next;
    save();
  }
  /*
   * « Mes préréglages » — enregistrés CÔTÉ SERVEUR, donc partagés entre
   * appareils. Portés de l'ancien écran Égaliseur, seul à les offrir : ici on
   * choisissait parmi sept courbes figées, jamais la sienne.
   */
  let mesPresets = $state<api.EqProPreset[]>([]);

  /**
   * QUEL préréglage est en vigueur — Thierry Clémont, 22/09/2026 : « quelle
   * égalisation est-elle choisie ? aucun moyen de le savoir alors qu'il eût
   * suffi de la surligner ».
   *
   * Rien ne le mémorisait : ni l'écran, ni le serveur, qui ne garde que les
   * bandes. On le RETROUVE donc en comparant la courbe affichée à chaque
   * préréglage — la seule façon honnête, et celle qui survit à un
   * rechargement de page comme à un changement de zone. Dès qu'un curseur
   * bouge, plus rien ne correspond : la marque s'éteint toute seule, ce qui
   * est exactement ce qu'on veut dire.
   */
  function memeGain(a: number | null | undefined, b: number | null | undefined): boolean {
    // Un dixième de dB : les courbes voyagent en JSON et repassent par des
    // arrondis d'affichage ; exiger l'égalité binaire ferait clignoter la
    // marque sans raison.
    return Math.abs((a ?? 0) - (b ?? 0)) < 0.05;
  }

  /** Le préréglage intégré dont la courbe est exactement celle affichée. */
  const presetActif: string | null = $derived.by(() => {
    if (sousMode !== 'graphique') return null;
    // Les sept courbes sont écrites sur la grille à DIX bandes : sur une
    // autre résolution, la comparaison n'aurait pas de sens.
    if (bandCount !== 10) return null;
    if (gainsRight !== null) return null;
    return PRESETS.find((p) => p.gains.every((g, i) => memeGain(g, gains[i])))?.key ?? null;
  });

  /** Le préréglage PERSONNEL dont la courbe est celle affichée. */
  const mienActif: string | null = $derived.by(() => {
    const courant = sousMode === 'parametrique' ? pBandes : null;
    for (const p of mesPresets) {
      const bandes = p.bands ?? [];
      if (!bandes.length) continue;
      if (p.eq_type === 'parametric') {
        if (sousMode !== 'parametrique' || !courant) continue;
        if (bandes.length !== courant.length) continue;
        if (bandes.every((b, i) => b.freq === courant[i].freq && memeGain(b.gain, courant[i].gain))) return p.id;
      } else {
        if (sousMode !== 'graphique' || gainsRight !== null) continue;
        if (bandes.length !== BANDS.length) continue;
        if (bandes.every((b, i) => b.freq === BANDS[i] && memeGain(b.gain, gains[i]))) return p.id;
      }
    }
    return null;
  });
  async function chargerMesPresets() {
    try { mesPresets = await api.listEqPresets(); } catch { mesPresets = []; }
  }
  $effect(() => { void chargerMesPresets(); });

  async function enregistrerPreset() {
    const saisi = await dialogs.prompt($t('eq.presetNamePlaceholder' as any));
    const nom = saisi?.trim();
    if (!nom) return;
    const eq_type = sousMode === 'parametrique' ? 'parametric' : 'graphic';
    const bands: EqBand[] = sousMode === 'parametrique'
      ? $state.snapshot(pBandes)
      : bandesGraphiques(BANDS, gains, null, GRID_Q[bandCount] ?? 1.0);
    try {
      // Même nom = remplacer : supprimer l'ancien, puis recréer.
      const homonyme = mesPresets.find((p) => p.name === nom);
      if (homonyme) { try { await api.deleteEqPreset(homonyme.id); } catch { /* le doublon restera visible */ } }
      const cree = await api.createEqPreset({ name: nom, eq_type, bands });
      mesPresets = [...mesPresets.filter((p) => p.name !== nom), cree];
      notifications.success($t('eq.presetSaved' as any).replace('{name}', nom));
    } catch {
      notifications.error($t('eq.presetSaveFailed' as any));
    }
  }

  function appliquerMonPreset(p: api.EqProPreset) {
    const bandes = p.bands ?? [];
    if (p.eq_type === 'parametric') {
      pBandes = bandes.map((b) => ({ ...b }));
      sousMode = 'parametrique';
    } else {
      const g = bandes.map((b) => b.gain);
      const grille = bandes.map((b) => b.freq);
      // Enregistré sur une autre grille : on rééchantillonne sur la courante.
      gains = g.length === BANDS.length ? g : resample(g, grille, BANDS);
      sousMode = 'graphique';
    }
    if (!enabled) enabled = true;
    void save();
  }

  async function supprimerMonPreset(p: api.EqProPreset) {
    const avant = mesPresets;
    mesPresets = mesPresets.filter((x) => x.id !== p.id);
    try {
      await api.deleteEqPreset(p.id);
    } catch {
      // La suppression n'a pas eu lieu : la liste revient, et on le dit.
      mesPresets = avant;
      notifications.error($t('common.error' as any));
    }
  }

  function reset() {
    gains = Array(BANDS.length).fill(0);
    if (gainsRight !== null) gainsRight = Array(BANDS.length).fill(0);
    save();
  }
  function toggle() { enabled = !enabled; save(); }
  async function setBands(n: number) {
    const from = BANDS, prevRight = gainsRight;
    bandCount = n;
    const to = GRIDS[n];
    gains = resample(gains, from, to);
    if (prevRight) gainsRight = resample(prevRight, from, to);
    try { await api.setEqExpertSettings(n); } catch { /* vieux serveur : la grille reste locale */ }
    save();
  }
  /** Délier : la droite part de la gauche, à l'identique. Rien ne doit changer
   *  à ce qu'on entend — c'est une préparation, pas un réglage. */
  function unlink() { gainsRight = [...gains]; editing = 'left'; save(); }
  /** Relier : la courbe qui SURVIT est celle de gauche. Il faut en choisir
   *  une ; une moyenne inventerait une courbe que personne n'a réglée. */
  function relink() { gainsRight = null; editing = 'left'; save(); }

  function freqLabel(f: number): string { return f >= 1000 ? `${f / 1000}k` : `${f}`; }
</script>

<section class="v2-eq tune-v2">
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.eq.eyebrow' as any)}</div>
      <h1>{$t('v2.eq.title' as any)}</h1>
    </div>
    {#if !nonInstalle}
      <div class="v2-actions">
        <label class="sw">
          <input type="checkbox" checked={enabled} onchange={toggle} />
          <span class="slider"></span>
        </label>
        <span class="onoff">{enabled ? $t('v2.eq.on' as any) : $t('v2.eq.off' as any)}</span>
        <button class="v2-btn" onclick={reset}>{$t('v2.eq.reset' as any)}</button>
      </div>
    {/if}
  </header>

  {#if error}<div class="err">{error}</div>{/if}
  {#if redemarrageRequis}<div class="restart plugin-restart">{$t('v2.eq.pluginRestart' as any)}</div>{/if}

  <div class="scroll">
    {#if loading}
      <div class="state">{$t('v2.tool.loading' as any)}</div>
    {:else if nonInstalle}
      <!-- Greffon absent : pas de curseurs qui bougent pour rien. Une phrase,
           UN bouton — et, si une configuration existait avant la mise à jour,
           la vérité : les réglages sont là, il suffit de réinstaller. -->
      <div class="plugin">
        {#if installationProposee}
          <div class="plugin-banner">{$t('v2.eq.pluginProposed' as any)}</div>
        {/if}
        <p class="plugin-text">{$t('v2.eq.pluginNotInstalled' as any)}</p>
        <button class="v2-btn plugin-install" disabled={installation} onclick={installerGreffon}>
          {installation ? $t('v2.eq.pluginInstalling' as any) : $t('v2.eq.pluginInstall' as any)}
        </button>
      </div>
    {:else if $currentZoneId == null}
      <div class="state">{$t('v2.eq.noZone' as any)}</div>
    {:else}
      <div class="presets">
        {#each PRESETS as p (p.key)}
          {@const actif = presetActif === p.key}
          <button class:actif aria-pressed={actif} onclick={() => applyPreset(p)}>{$t(p.labelKey as any)}</button>
        {/each}
      </div>
      <div class="presets mes">
        <span class="mesl">{$t('eq.myPresets' as any)}</span>
        {#each mesPresets as p (p.id)}
          {@const actif = mienActif === p.id}
          <span class="mien">
            <button class:actif aria-pressed={actif} onclick={() => appliquerMonPreset(p)}>{p.name}</button>
            <button class="x" onclick={() => supprimerMonPreset(p)}
              title={$t('eq.deletePreset' as any)} aria-label={$t('eq.deletePreset' as any)}>×</button>
          </span>
        {/each}
        <button onclick={enregistrerPreset}>+ {$t('eq.savePreset' as any)}</button>
      </div>

      {#if showExpert}
        <!--
          Graphique ou paramétrique. Niveau Expert seulement : le paramétrique
          demande de savoir ce qu'est un Q, et le proposer plus tôt encombrerait
          l'écran de quelqu'un qui cherchait juste « plus de graves ».
        -->
        <div class="modes">
          <button class:on={sousMode === 'graphique'} onclick={() => (sousMode = 'graphique')}>
            {$t('v2.eq.modeGraphic' as any)}
          </button>
          <button class:on={sousMode === 'parametrique'} onclick={versParametrique}>
            {$t('v2.eq.modeParametric' as any)}
          </button>
          <!--
            L'ASSISTANT n'ecrit pas de bandes : il envoie un profil
            (`eq_profile`) sur une AUTRE route, `PATCH /zones/{id}/dsp`, et le
            serveur en deduit la correction. C'est pourquoi il remplace tout le
            volet plutot que de s'y ajouter — melanger les deux enverrait deux
            corrections concurrentes a la meme zone.
          -->
          <button class:on={sousMode === 'assistant'} onclick={() => (sousMode = 'assistant')}>
            {$t('v2.eq.modeAssistant' as any)}
          </button>
        </div>
      {/if}

      {#if sousMode === 'assistant'}
        <ProfilerV2 />
      {:else if sousMode === 'parametrique'}
        <ParametricEq bind:bands={pBandes} {enabled} onchange={surChangementParametrique} />
      {:else}

      {#if showExpert}
        <div class="ctrls">
          <span class="cl">{$t('v2.eq.resolution' as any)}</span>
          <div class="seg">
            {#each [10, 15, 31] as n (n)}
              <button class:on={bandCount === n} onclick={() => setBands(n)}>{$t('v2.eq.bands' as any).replace('{count}', String(n))}</button>
            {/each}
          </div>
          <span class="cl sep">{$t('v2.eq.channels' as any)}</span>
          {#if gainsRight === null}
            <button class="lnk" onclick={unlink}>{$t('v2.eq.unlink' as any)}</button>
            <span class="note">{$t('v2.eq.unlinkNote' as any)}</span>
          {:else}
            <div class="seg">
              <button class:on={editing === 'left'} onclick={() => (editing = 'left')}>{$t('v2.eq.left' as any)}</button>
              <button class:on={editing === 'right'} onclick={() => (editing = 'right')}>{$t('v2.eq.right' as any)}</button>
            </div>
            <button class="lnk" onclick={relink}>{$t('v2.eq.relink' as any)}</button>
            <span class="note">{$t('v2.eq.relinkNoteA' as any)} <b>{$t('v2.eq.relinkNoteLeft' as any)}</b> {$t('v2.eq.relinkNoteB' as any)}</span>
          {/if}
        </div>
      {/if}

      <div class="board" class:off={!enabled}>
        {#each BANDS as f, i (f)}
          <div class="band">
            <span class="g">{curve[i] > 0 ? '+' : ''}{(curve[i] ?? 0).toFixed(1)}</span>
            <!-- Verticalite par CSS (`writing-mode`) : l'attribut `orient` est un
                 heritage Firefox, absent des types et sans effet ailleurs. -->
            <input class="v" type="range" min={MIN_GAIN} max={MAX_GAIN} step="0.5"
              value={curve[i] ?? 0} disabled={!enabled}
              oninput={(e) => setGain(i, Number((e.currentTarget as HTMLInputElement).value))}
              aria-label={`${freqLabel(f)} Hz`} />
            <span class="f">{freqLabel(f)}</span>
          </div>
        {/each}
      </div>


      {/if}
      <!-- tune-server-rust#4685 — hors du choix de mode : la compensation vaut
           pour la courbe, quelle que soit la façon de la composer. -->
      <CompensationNiveauV2 revision={revisionDsp} />
    {/if}
  </div>
</section>

<style>
  .v2-eq{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .onoff{font:11px var(--v2-mono); color:var(--v2-txt3); margin-right:auto}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:8px 15px; font:600 12px var(--v2-sans)}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .lnk.sm{padding:5px 12px; font-size:11.5px; margin-left:8px}
  .modes{display:flex; gap:7px; margin:2px 0 18px}
  .modes button{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2);
    cursor:pointer; border-radius:999px; padding:6px 15px; font:600 12px var(--v2-sans)}
  .modes button:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .modes button.on{border-color:var(--v2-acc1); color:var(--v2-acc1)}

  .sw{position:relative; flex:0 0 auto; width:46px; height:26px; cursor:pointer; margin-bottom:3px}
  .sw input{position:absolute; opacity:0; width:0; height:0}
  .slider{position:absolute; inset:0; border-radius:999px; background:var(--v2-line2); transition:.18s}
  .slider::before{content:""; position:absolute; left:3px; top:3px; width:20px; height:20px; border-radius:50%;
    background:var(--v2-knob); transition:.18s}
  .sw input:checked + .slider{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw input:checked + .slider::before{transform:translateX(20px)}

  .err{margin:0 30px 10px; padding:10px 14px; border-radius:10px; font-size:12.5px;
    color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:26px 0; color:var(--v2-txt3)}
  .restart{margin:0 30px 10px; padding:9px 14px; border-radius:10px; font-size:12.5px;
    border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); color:var(--v2-acc-tint)}

  .plugin{display:flex; flex-direction:column; align-items:flex-start; gap:14px; max-width:64ch; padding:26px 0}
  .plugin-banner{padding:12px 16px; border-radius:11px; font-size:12.5px; line-height:1.55;
    border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); color:var(--v2-acc-tint)}
  .plugin-text{font-size:13.5px; line-height:1.55; color:var(--v2-txt2)}
  .plugin-install:disabled{opacity:.55; cursor:progress}

  .presets{display:flex; gap:7px; flex-wrap:wrap; padding:2px 0 16px}
  .presets.mes{align-items:center; margin-top:-8px}
  .mesl{font:10px var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .mien{display:inline-flex}
  .mien .x{padding:0 7px}
  .presets button{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:600 12px var(--v2-sans); padding:8px 15px; border-radius:var(--v2-r-pill); transition:.15s}
  .presets button:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  /* Le préréglage EN VIGUEUR. Bordure ET fond teinté : la seule bordure se
     confond avec le survol, et un écran se lit d'un coup d'œil, sans
     promener la souris. */
  .presets button.actif{color:var(--v2-acc1); border-color:var(--v2-acc1);
    background:color-mix(in srgb, var(--v2-acc1) 14%, transparent)}

  .ctrls{display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:0 0 18px}
  .cl{font:10px var(--v2-mono); letter-spacing:.12em; text-transform:uppercase; color:var(--v2-txt3)}
  .cl.sep{margin-left:12px}
  .seg{display:flex; gap:2px; padding:3px; border-radius:11px; background:var(--v2-surface2); border:1px solid var(--v2-line)}
  .seg button{border:0; background:transparent; color:var(--v2-txt2); font:600 11.5px var(--v2-sans);
    padding:6px 12px; border-radius:8px; cursor:pointer}
  .seg button.on{color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .note{font-size:11px; color:var(--v2-txt3)}
  .note b{color:var(--v2-txt2)}

  .board{display:flex; align-items:flex-end; gap:4px; padding:18px 16px 10px; border-radius:14px;
    border:1px solid var(--v2-line); background:var(--v2-surface2); overflow-x:auto}
  .board.off{opacity:.4}
  .board::-webkit-scrollbar{height:8px}.board::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .band{display:flex; flex-direction:column; align-items:center; gap:8px; flex:1 1 0; min-width:34px}
  .band .g{font:10px var(--v2-mono); color:var(--v2-acc2); min-height:13px}
  .band .f{font:9.5px var(--v2-mono); color:var(--v2-txt3); white-space:nowrap}
  .band .v{writing-mode:vertical-lr; direction:rtl; width:22px; height:190px; accent-color:var(--v2-acc1); cursor:pointer}

  .more{margin-top:20px; padding:13px 16px; border-radius:11px; font-size:12.5px; line-height:1.55;
    color:var(--v2-txt3); border:1px dashed var(--v2-line2)}
  .more b{color:var(--v2-txt2)}
</style>
