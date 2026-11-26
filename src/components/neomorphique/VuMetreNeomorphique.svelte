<script lang="ts">
  /**
   * Deux VU-mètres à segments, dans un creux, branchés sur les VRAIES
   * mesures du serveur (`playback.audio_levels` → magasin `audioLevels`, la
   * zone choisie). Hors lecture, ou sans trame fraîche, ils s'éteignent :
   * aucune aiguille inventée.
   *
   * Segment allumé : RMS du canal ; le segment de crête reste allumé seul ;
   * zone haute (au-dessus de −6 dBFS) à la couleur d'état ; surcharge
   * mesurée par le serveur : le segment du haut à la couleur d'erreur.
   * Aucune transition : rien ne bouge en douceur, donc rien à couper pour
   * `prefers-reduced-motion`.
   */
  import { t } from '../../lib/i18n';
  import { audioLevels, FRAICHEUR_TRAME_MS } from '../../lib/stores/audioLevels';
  import { playbackState } from '../../lib/stores/nowPlaying';
  import { SEGMENTS_VU, segmentsAllumes, segmentHaut } from './neomorphique';

  const enLecture = $derived($playbackState === 'playing');
  // Une trame trop ancienne (zone muette, serveur sans mesure) n'allume rien.
  let derniere = $state(0);
  let maintenant = $state(Date.now());
  $effect(() => audioLevels.subscribe(() => { derniere = Date.now(); maintenant = derniere; }));
  $effect(() => {
    const id = setInterval(() => { maintenant = Date.now(); }, FRAICHEUR_TRAME_MS);
    return () => clearInterval(id);
  });
  const frais = $derived(enLecture && maintenant - derniere <= FRAICHEUR_TRAME_MS * 2);

  const canaux = $derived([
    { cle: 'L', rms: $audioLevels.rms_left_db, crete: $audioLevels.peak_left_db, over: $audioLevels.over_left },
    { cle: 'R', rms: $audioLevels.rms_right_db, crete: $audioLevels.peak_right_db, over: $audioLevels.over_right },
  ].map((c) => ({
    ...c,
    allumes: frais ? segmentsAllumes(c.rms) : 0,
    crete: frais ? segmentsAllumes(c.crete) : 0,
    over: frais && c.over,
  })));
  const indices = Array.from({ length: SEGMENTS_VU }, (_, i) => i);
</script>

<div class="neo-creux vu" role="img" aria-label={$t('tv.stereoVuMeters' as any)}>
  {#each canaux as c (c.cle)}
    <div class="canal">
      {#each indices as i (i)}
        <i class:on={i < c.allumes || i === c.crete - 1}
          class:haut={segmentHaut(i)}
          class:over={c.over && i === SEGMENTS_VU - 1}></i>
      {/each}
      <span class="lettre" aria-hidden="true">{c.cle}</span>
    </div>
  {/each}
</div>

<style>
  .vu {
    display: flex; gap: 10px; justify-content: center; align-items: flex-end;
    min-height: var(--neo-vu-haut-totale); padding: 10px 14px; flex: none;
  }
  .canal { display: flex; flex-direction: column-reverse; gap: 3px; align-items: center; }
  i { display: block; width: var(--neo-vu-largeur); height: var(--neo-vu-segment); border-radius: var(--neo-r-segment); background: var(--neo-vu-eteint); }
  i.on { background: var(--neo-vu); }
  i.on.haut { background: var(--neo-vu-haut); }
  i.over { background: var(--neo-vu-surcharge); }
  .lettre { order: -1; font-size: var(--neo-t-touche); color: var(--neo-doux); font-family: var(--neo-police-chiffres); margin-top: 2px; }
</style>
