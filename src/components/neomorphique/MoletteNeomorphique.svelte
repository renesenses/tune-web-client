<script lang="ts">
  /**
   * La molette de volume du thème « Néomorphique » : un bouton rotatif en
   * relief, son index à la couleur d'état.
   *
   * Gestes : glisser (haut = plus), molette de la souris, clavier (flèches,
   * Page, Début, Fin). `role="slider"` et ses `aria-*`.
   *
   * L'ENVOI est celui du curseur de `VolumeControl` (`handleVolume`) : bornes
   * de confort et de sécurité du serveur, grille de la sortie, sourdine levée,
   * zone navigateur, envoi limité, refus du verrou relu. Seule la forme change.
   */
  import { t } from '../../lib/i18n';
  import { currentZone } from '../../lib/stores/zones';
  import { zoneVolume } from '../../lib/stores/nowPlaying';
  import { preferences } from '../../lib/stores/preferences';
  import { notifications } from '../../lib/stores/notifications';
  import { isBrowserZone, browserSetVolume } from '../../lib/stores/browserAudio';
  import { volumeLocked, refreshAudiophile, isVolumeLocked } from '../../lib/stores/audiophile';
  import { volumeCommandable, normaliserVolumeSortie } from '../../lib/capacitesVolumeSortie';
  import { bornerCurseur, plafondDuCurseur } from '../../lib/limitesVolume';
  import { leverSourdineSiBesoin } from '../../lib/sourdine';
  import { envoyerVolumeOuReverrouiller } from '../../lib/refusDeVolume';
  import { reglerVolume } from '../../lib/volumeDeGroupe';
  import { creerLimiteurVolume } from '../../lib/limiteurVolume';
  import { formaterDb } from '../../lib/volumeDb';
  import { gainDeLaZone } from '../../lib/courbeDeVolume';
  import { angleMolette, valeurAuClavier, valeurAuGlisser, valeurALaRoulette } from './neomorphique';

  let { petite = false, legende = true }: { petite?: boolean; legende?: boolean } = $props();

  const zone = $derived($currentZone);
  const vol = $derived($zoneVolume);
  const autorise = $derived(!$volumeLocked && volumeCommandable(zone));
  const enDb = $derived($preferences.volumeDisplay === 'dB');
  const affiche = $derived(enDb ? formaterDb(gainDeLaZone(zone, vol)) : `${Math.round(vol * 100)}`);

  const limiterEnvoi = creerLimiteurVolume();
  let contexte = 0;
  $effect(() => {
    const id = zone?.id ?? null;
    if (id == null || !autorise) limiterEnvoi.annuler();
    return () => { contexte += 1; limiterEnvoi.annuler(); };
  });

  /** Pose une valeur 0..1 : les mêmes étapes que le curseur de l'interface actuelle. */
  function poser(brut: number) {
    const z = zone;
    if (!z?.id || !autorise) return;
    const val = normaliserVolumeSortie(z, bornerCurseur(z, brut, vol), plafondDuCurseur(z, vol));
    if (val === null || val === vol) return;
    leverSourdineSiBesoin({ ...z, id: z.id }, val);
    zoneVolume.set(val);
    if (isBrowserZone(z)) browserSetVolume(val, z);
    const zoneId = z.id;
    const c = contexte;
    limiterEnvoi(() => {
      if (zone?.id !== zoneId || !autorise || c !== contexte) return;
      void envoyerVolumeOuReverrouiller(zoneId, val, {
        envoyer: reglerVolume,
        relireVerrou: refreshAudiophile,
        verrouille: isVolumeLocked,
        direVerrou: () => notifications.error($t('audiophile.volumeLockedHint' as any)),
      });
    });
  }

  let el = $state<HTMLElement | null>(null);
  let glisse = $state(false);
  let y0 = 0;
  let v0 = 0;
  function appui(e: PointerEvent) {
    if (!autorise) return;
    glisse = true; y0 = e.clientY; v0 = vol;
    el?.setPointerCapture?.(e.pointerId);
  }
  function deplace(e: PointerEvent) { if (glisse) poser(valeurAuGlisser(v0, y0 - e.clientY)); }
  function relache() { glisse = false; }
  function clavier(e: KeyboardEvent) {
    const v = valeurAuClavier(vol, e.key);
    if (v === null) return;
    e.preventDefault();
    poser(v);
  }
  // La roulette doit pouvoir empêcher le défilement de la page : écouteur non passif.
  $effect(() => {
    const cible = el;
    if (!cible) return;
    const roulette = (e: WheelEvent) => {
      if (!autorise) return;
      e.preventDefault();
      poser(valeurALaRoulette(vol, e.deltaY));
    };
    cible.addEventListener('wheel', roulette, { passive: false });
    return () => cible.removeEventListener('wheel', roulette);
  });
</script>

<div class="molette-zone" class:petite>
  <div class="neo-molette molette" class:glisse class:inerte={!autorise} bind:this={el}
    role="slider" tabindex={autorise ? 0 : -1}
    aria-label={$t('salon.transport.volume' as any)}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(vol * 100)}
    aria-valuetext={enDb ? affiche : `${affiche} %`}
    aria-disabled={!autorise}
    title={$volumeLocked ? $t('audiophile.volumeLockedHint' as any) : $t('salon.transport.volume' as any)}
    onpointerdown={appui} onpointermove={deplace} onpointerup={relache} onpointercancel={relache}
    onkeydown={clavier}>
    <span class="cuvette" aria-hidden="true"></span>
    <span class="index" aria-hidden="true" style:transform={`rotate(${angleMolette(vol)}deg)`}></span>
  </div>
  {#if legende}
    <div class="valeur" aria-hidden="true">
      <span class="chiffre">{affiche}</span>
      <span class="nom">{$t('salon.transport.volume' as any)}</span>
    </div>
  {/if}
</div>

<style>
  .molette-zone { display: flex; align-items: center; gap: var(--neo-ecart); }
  .molette {
    width: var(--neo-molette); height: var(--neo-molette); flex: none;
    border-radius: 50%; position: relative;
    background: var(--neo-sol); box-shadow: var(--neo-relief-3);
    cursor: grab; touch-action: none;
  }
  .petite .molette { width: var(--neo-molette-petite); height: var(--neo-molette-petite); box-shadow: var(--neo-relief-2); }
  .molette.glisse { cursor: grabbing; }
  .molette.inerte { cursor: default; }
  .cuvette { position: absolute; inset: 16%; border-radius: 50%; box-shadow: var(--neo-creux-1); }
  /* L'index : un trait à la couleur d'état, qui tourne autour du centre. */
  .index {
    position: absolute; left: 50%; top: 0; bottom: 0; width: 4px; margin-left: -2px;
    pointer-events: none;
  }
  .index::before {
    content: ''; position: absolute; left: 0; right: 0; top: 9%; height: 17%;
    border-radius: var(--rayon-plein); background: var(--neo-etat);
  }
  .inerte .index::before { background: var(--neo-discret); }
  .valeur { display: flex; flex-direction: column; min-width: 3ch; }
  .chiffre {
    font-family: var(--neo-police-chiffres); font-size: var(--neo-t-valeur);
    font-variant-numeric: tabular-nums; color: var(--neo-encre); line-height: 1;
  }
  .nom {
    font-size: var(--neo-t-touche); color: var(--neo-doux);
    letter-spacing: var(--neo-interlettre); text-transform: uppercase; margin-top: 4px;
  }
</style>
