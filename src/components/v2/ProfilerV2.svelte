<script lang="ts">
  /**
   * Tune Master Profiler — l'assistant de réglage, repris dans le v2.
   *
   * Dernier manque face au client actuel (Bertrand, 04/09/2026). Deux étapes :
   * on décrit son écoute, puis on ajuste trois curseurs à l'oreille. Le serveur
   * en déduit la correction.
   *
   * ## Pourquoi un composant NEUF, alors que `ParametricEq` a été repris tel quel
   *
   * Les deux cas ne se ressemblent pas. `ParametricEq` transpose les biquads RBJ
   * de `tune-core/src/audio/eq.rs` : deux implémentations divergeraient sans que
   * personne ne l'entende. Le Profiler, lui, est un QUESTIONNAIRE — il ne calcule
   * rien. Le contrat partagé n'est pas du code, c'est la charge utile
   * `eq_profile` de `PATCH /zones/{id}/dsp`, reproduite ici au champ près.
   *
   * Et le reprendre était impossible sans découper l'écran du client actuel :
   * il y vit EN LIGNE, mêlé à l'égaliseur graphique dans un fichier de
   * 1 981 lignes. Le découper pour en extraire ce bloc aurait touché le v1 pour
   * le seul confort du v2.
   *
   * ## Ce qui est délibérément identique
   *
   * La CLÉ DE STOCKAGE, `tune-master-profiler`. Un utilisateur qui passe d'un
   * client à l'autre retrouve son questionnaire tel qu'il l'a laissé. Une clé
   * propre au v2 lui ferait tout ressaisir sans lui dire pourquoi.
   */
  import * as api from '../../lib/api';
  import { currentZoneId, currentZone } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import { t } from '../../lib/i18n';
  import '../../styles/tune-v2.css';

  type Ecoute = 'headphones' | 'speakers';
  type Piece = 'small' | 'medium' | 'large';
  type Position = 'near_wall' | 'free_standing';

  let ecoute = $state<Ecoute>('speakers');
  let piece = $state<Piece>('medium');
  let position = $state<Position>('free_standing');
  let etape = $state(1);

  let basses = $state(0);
  let voix = $state(0);
  let aigus = $state(0);

  /** La MÊME clé que le client actuel — voir l'en-tête. */
  const CLE = 'tune-master-profiler';

  function enregistrerLocal() {
    try {
      localStorage.setItem(CLE, JSON.stringify({
        listening: ecoute, roomSize: piece, placement: position,
        bassSlider: basses, midSlider: voix, trebleSlider: aigus,
      }));
    } catch { /* stockage plein ou refusé : le réglage vit côté serveur */ }
  }

  function relireLocal() {
    try {
      const brut = localStorage.getItem(CLE);
      if (!brut) return;
      const p = JSON.parse(brut);
      if (p.listening === 'headphones' || p.listening === 'speakers') ecoute = p.listening;
      if (p.roomSize === 'small' || p.roomSize === 'medium' || p.roomSize === 'large') piece = p.roomSize;
      if (p.placement === 'near_wall' || p.placement === 'free_standing') position = p.placement;
      if (typeof p.bassSlider === 'number') basses = p.bassSlider;
      if (typeof p.midSlider === 'number') voix = p.midSlider;
      if (typeof p.trebleSlider === 'number') aigus = p.trebleSlider;
    } catch { /* écrit par une version antérieure : on repart des défauts */ }
  }
  relireLocal();

  /**
   * Dire quand le réglage n'a PAS atteint le son en cours.
   *
   * Même règle que l'égaliseur : sur une zone réseau ou en mode PURE, on bouge
   * un curseur et on n'entend rien. Ce silence se raconte comme « l'assistant
   * ne marche pas ».
   */
  let prevenu = false;
  function signalerPortee(applique: boolean | undefined) {
    if (applique === false && $currentZone?.state === 'playing') {
      if (!prevenu) { prevenu = true; notifications.info($t('eq.effectNextTrack' as any)); }
    } else if (applique === true) {
      prevenu = false;
    }
  }

  let envoi: ReturnType<typeof setTimeout> | null = null;
  /** Les curseurs s'appliquent en continu, mais SANS notification : trois
   *  glissements produiraient trois bandeaux « profil appliqué ». */
  function envoiDiffere() {
    if (envoi) clearTimeout(envoi);
    envoi = setTimeout(() => { envoi = null; void appliquer(true); }, 400);
  }

  let travail = $state(false);

  async function appliquer(silencieux = false) {
    const zid = $currentZoneId;
    if (zid == null) return;
    travail = true;
    try {
      const res: any = await api.setDsp(zid, {
        eq_profile: {
          enabled: true,
          listening: ecoute,
          room_size: piece,
          speaker_placement: position,
          bass_gain_db: basses,
          mid_gain_db: voix,
          treble_gain_db: aigus,
        },
      });
      enregistrerLocal();
      signalerPortee(res?.eq_applied_live);
      if (!silencieux) notifications.success($t('eq.profilerApplied' as any));
    } catch (e: any) {
      // `fetchJSON` montre déjà sa fenêtre dédiée sur un 402 Premium : en
      // ajouter une seconde ferait deux messages pour un seul refus.
      if (e?.message !== 'premium_required') notifications.error($t('v2.eq.errRefused' as any));
    }
    travail = false;
  }

  /** Remettre à zéro DÉSACTIVE le profil côté serveur : sans `enabled: false`,
   *  la correction qu'on vient de retirer continuerait de jouer. */
  async function reinitialiser() {
    basses = 0; voix = 0; aigus = 0;
    const zid = $currentZoneId;
    if (zid == null) return;
    travail = true;
    try {
      const res: any = await api.setDsp(zid, {
        eq_profile: {
          enabled: false,
          listening: ecoute,
          room_size: piece,
          speaker_placement: position,
          bass_gain_db: 0, mid_gain_db: 0, treble_gain_db: 0,
        },
      });
      enregistrerLocal();
      signalerPortee(res?.eq_applied_live);
      notifications.success($t('eq.profilerDisabled' as any));
    } catch (e: any) {
      if (e?.message !== 'premium_required') notifications.error($t('v2.eq.errRefused' as any));
    }
    travail = false;
  }

  const signe = (v: number) => (v > 0 ? '+' : '');
</script>

<div class="prof">
  {#if etape === 1}
    <h2>{$t('v2.prof.envTitle' as any)}</h2>
    <p class="desc">{$t('eq.wizardIntro' as any)}</p>

    <div class="q">
      <h3>{$t('v2.prof.whatDoYouUse' as any)}</h3>
      <div class="opts">
        <button class:on={ecoute === 'headphones'} onclick={() => (ecoute = 'headphones')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5z"/><path d="M3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z"/></svg>
          <span>{$t('v2.prof.headphones' as any)}</span>
        </button>
        <button class:on={ecoute === 'speakers'} onclick={() => (ecoute = 'speakers')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="14" r="4"/><circle cx="12" cy="6" r="1"/></svg>
          <span>{$t('v2.prof.speakers' as any)}</span>
        </button>
      </div>
    </div>

    <!-- Taille de pièce et placement n'ont de sens QUE sur enceintes : un
         casque n'a ni mur ni volume derrière lui. -->
    {#if ecoute === 'speakers'}
      <div class="q">
        <h3>{$t('eq.roomSize' as any)}</h3>
        <div class="opts trois">
          <button class:on={piece === 'small'} onclick={() => (piece = 'small')}>
            <span class="lettre">S</span><span>{$t('v2.prof.roomSmall' as any)}</span><span class="ind">&lt; 15 m²</span>
          </button>
          <button class:on={piece === 'medium'} onclick={() => (piece = 'medium')}>
            <span class="lettre">M</span><span>{$t('v2.prof.roomMedium' as any)}</span><span class="ind">15–30 m²</span>
          </button>
          <button class:on={piece === 'large'} onclick={() => (piece = 'large')}>
            <span class="lettre">L</span><span>{$t('v2.prof.roomLarge' as any)}</span><span class="ind">&gt; 30 m²</span>
          </button>
        </div>
      </div>

      <div class="q">
        <h3>{$t('eq.speakerPlacement' as any)}</h3>
        <div class="opts">
          <button class:on={position === 'near_wall'} onclick={() => (position = 'near_wall')}>
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="6" height="40" rx="1"/><rect x="14" y="12" width="10" height="24" rx="2"/><circle cx="19" cy="28" r="4"/></svg>
            <span>{$t('eq.againstWall' as any)}</span>
          </button>
          <button class:on={position === 'free_standing'} onclick={() => (position = 'free_standing')}>
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="6" height="40" rx="1"/><rect x="22" y="12" width="10" height="24" rx="2"/><circle cx="27" cy="28" r="4"/></svg>
            <span>{$t('eq.awayFromWall' as any)}</span>
          </button>
        </div>
      </div>
    {/if}

    <button class="suite" onclick={() => (etape = 2)}>
      {$t('v2.prof.next' as any)}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    </button>

  {:else}
    <button class="retour" onclick={() => (etape = 1)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      {$t('v2.prof.back' as any)}
    </button>

    <h2>{$t('v2.prof.byEarTitle' as any)}</h2>
    <p class="desc">{$t('eq.slidersByEar' as any)}</p>

    <div class="curseurs">
      <div class="cur">
        <div class="ch"><span class="cn">{$t('v2.prof.bass' as any)}</span><span class="cv">{signe(basses)}{basses} dB</span></div>
        <div class="ci"><span>{$t('v2.prof.bassLow' as any)}</span><span>{$t('eq.openUpSound' as any)}</span></div>
        <input type="range" min="-12" max="12" step="0.5" bind:value={basses} oninput={envoiDiffere} />
      </div>
      <div class="cur">
        <div class="ch"><span class="cn">{$t('v2.prof.mid' as any)}</span><span class="cv">{signe(voix)}{voix} dB</span></div>
        <div class="ci"><span>{$t('v2.prof.midLow' as any)}</span><span>{$t('v2.prof.midHigh' as any)}</span></div>
        <input type="range" min="-12" max="12" step="0.5" bind:value={voix} oninput={envoiDiffere} />
      </div>
      <div class="cur">
        <div class="ch"><span class="cn">{$t('v2.prof.treble' as any)}</span><span class="cv">{signe(aigus)}{aigus} dB</span></div>
        <div class="ci"><span>{$t('v2.prof.trebleLow' as any)}</span><span>{$t('v2.prof.trebleHigh' as any)}</span></div>
        <input type="range" min="-12" max="12" step="0.5" bind:value={aigus} oninput={envoiDiffere} />
      </div>
    </div>

    <div class="actions">
      <button class="appliquer" disabled={travail} onclick={() => appliquer()}>{$t('v2.prof.apply' as any)}</button>
      <button class="raz" disabled={travail} onclick={reinitialiser}>{$t('v2.prof.reset' as any)}</button>
    </div>
  {/if}
</div>

<style>
  .prof{max-width:720px}
  .prof h2{font-size:19px; font-weight:700; margin:2px 0 6px}
  .desc{font-size:13px; line-height:1.6; color:var(--v2-txt3); margin-bottom:22px}
  .q{margin-bottom:24px}
  .q h3{font:600 11px var(--v2-mono); letter-spacing:.05em; text-transform:uppercase;
    color:var(--v2-txt3); margin-bottom:10px}
  .opts{display:grid; grid-template-columns:repeat(2,1fr); gap:10px}
  .opts.trois{grid-template-columns:repeat(3,1fr)}
  .opts button{display:flex; flex-direction:column; align-items:center; gap:7px; padding:16px 12px;
    border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2);
    border-radius:12px; cursor:pointer; font:600 12.5px var(--v2-sans)}
  .opts button:hover{border-color:var(--v2-acc2); color:var(--v2-txt)}
  .opts button.on{border-color:var(--v2-acc1); color:var(--v2-acc1)}
  .opts svg{width:32px; height:32px}
  .lettre{font:700 22px var(--v2-mono)}
  .ind{font:10.5px var(--v2-mono); color:var(--v2-txt3)}
  .suite, .retour, .appliquer, .raz{border:1px solid var(--v2-line2); background:transparent;
    color:var(--v2-txt2); cursor:pointer; border-radius:var(--v2-r-pill);
    font:600 12.5px var(--v2-sans); display:inline-flex; align-items:center; gap:8px}
  .suite{padding:10px 18px}
  .retour{padding:5px 12px; font-size:11.5px; margin-bottom:14px}
  .suite:hover, .retour:hover, .raz:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .suite svg, .retour svg{width:15px; height:15px}
  .curseurs{display:flex; flex-direction:column; gap:20px; margin-bottom:24px}
  .ch{display:flex; justify-content:space-between; align-items:baseline}
  .cn{font-size:13.5px; font-weight:600}
  .cv{font:12px var(--v2-mono); color:var(--v2-acc1)}
  .ci{display:flex; justify-content:space-between; font:11px var(--v2-mono); color:var(--v2-txt3); margin:3px 0 6px}
  .cur input[type=range]{width:100%; accent-color:var(--v2-acc1)}
  .actions{display:flex; gap:10px}
  .appliquer{padding:10px 18px; border-color:var(--v2-acc1); color:var(--v2-acc1)}
  .appliquer:hover{background:var(--v2-hover)}
  .raz{padding:10px 16px}
  .appliquer:disabled, .raz:disabled{opacity:.5; cursor:default}
</style>
