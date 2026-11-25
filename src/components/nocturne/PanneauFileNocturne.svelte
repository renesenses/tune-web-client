<script lang="ts">
  /**
   * File d'attente : un panneau qui glisse depuis la droite, par-dessus le
   * contenu flouté. En cours (liseré turquoise), puis « À suivre ».
   * Lit les magasins partagés `queueTracks` / `queuePosition`, alimentés par
   * `demarrerTransportV2` comme pour la coquille v2.
   */
  import X from '@lucide/svelte/icons/x';
  import Shuffle from '@lucide/svelte/icons/shuffle';
  import GripVertical from '@lucide/svelte/icons/grip-vertical';
  import AudioLines from '@lucide/svelte/icons/audio-lines';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { formatDuration, formatTime, libelleDeSource } from '../../lib/utils';
  import { currentZoneId, zones, syncZone } from '../../lib/stores/zones';
  import { queueTracks, queuePosition, upNextMs, jumpAndSync } from '../../lib/stores/queue';
  import { playbackState, shuffleEnabled } from '../../lib/stores/nowPlaying';
  import { executerVider, type GesteVider } from '../../lib/viderFile';
  import { basculerAleatoire } from '../../lib/aleatoireFile';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import BadgeQualiteNocturne from './BadgeQualiteNocturne.svelte';
  import { rechargerFileNocturne } from './lectureNocturne';

  interface Props { ouvert: boolean; fermer: () => void }
  let { ouvert, fermer }: Props = $props();

  $effect(() => { if (ouvert) void rechargerFileNocturne(); });

  const pos = $derived(Math.max(0, $queuePosition));
  const enCours = $derived($queueTracks[pos] ?? null);
  const suite = $derived($queueTracks.slice(pos + 1).map((p, i) => ({ p, rang: pos + 1 + i })));
  const zone = $derived($zones.find((z) => z.id === $currentZoneId) ?? null);
  const aleatoire = $derived(zone?.shuffle ?? $shuffleEnabled);

  async function sauter(rang: number) {
    const zid = $currentZoneId;
    if (zid == null) return;
    try { await jumpAndSync(zid, rang, api.jumpInQueue, syncZone); } catch (e) { signalerEchecLecture(e); }
  }
  async function retirer(rang: number) {
    const zid = $currentZoneId;
    if (zid == null) return;
    try { await api.removeFromQueue(zid, rang); } catch (e) { signalerEchecLecture(e); }
    void rechargerFileNocturne();
  }
  async function vider(geste: GesteVider) {
    const zid = $currentZoneId;
    if (zid == null || !$queueTracks.length) return;
    try { await executerVider(zid, geste); } catch (e) { signalerEchecLecture(e); }
    void rechargerFileNocturne();
  }

  /* Glisser-déposer : on déplace une piste « à suivre » vers le rang d'une autre. */
  let glisse = $state<number | null>(null);
  let survol = $state<number | null>(null);
  function debutGlisse(e: DragEvent, rang: number) {
    glisse = rang;
    e.dataTransfer?.setData('text/plain', String(rang));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }
  async function deposer(e: DragEvent, rang: number) {
    e.preventDefault();
    const depuis = glisse;
    glisse = null;
    survol = null;
    const zid = $currentZoneId;
    if (zid == null || depuis == null || depuis === rang) return;
    // Optimiste : la liste bouge tout de suite, le serveur fait foi ensuite.
    queueTracks.update((l) => {
      const c = [...l];
      const [p] = c.splice(depuis, 1);
      c.splice(rang, 0, p);
      return c;
    });
    try { await api.moveInQueue(zid, depuis, rang); } catch (err) { signalerEchecLecture(err); }
    void rechargerFileNocturne();
  }

  async function melanger() {
    const z = zone;
    if (z?.id == null) return;
    try {
      const actif = await basculerAleatoire(z.id, !aleatoire);
      zones.update((zs) => zs.map((x) => (x.id === z.id ? { ...x, shuffle: actif } : x)));
      shuffleEnabled.set(actif);
    } catch (e) { signalerEchecLecture(e); }
  }
  function clavier(e: KeyboardEvent) {
    if (ouvert && e.key === 'Escape') fermer();
  }
</script>

<svelte:window onkeydown={clavier} />

<div class="noc-file-voile" class:ouvert onclick={fermer} aria-hidden="true"></div>
<aside class="noc-file" class:ouvert aria-label={$t('nav.queue')} aria-hidden={!ouvert} inert={!ouvert}>
  <header class="noc-file-entete">
    <div>
      <h2>{$t('nav.queue')}</h2>
      <p>
        {$t('v2.queue.upNextCount').replace('{n}', String(suite.length))}
        {#if $upNextMs} · {$t('v2.queue.remaining').replace('{d}', formatDuration($upNextMs))}{/if}
      </p>
    </div>
    <button type="button" class="noc-file-bouton" onclick={() => vider('tout')} disabled={!$queueTracks.length}>
      {$t('v2.queue.clear')}
    </button>
    <button type="button" class="noc-file-bouton" onclick={() => vider('suite')} disabled={!suite.length}>
      {$t('nocturne.file.viderSuite')}
    </button>
    <button type="button" class="noc-file-fermer" onclick={fermer} aria-label={$t('common.close')}><X size={18} /></button>
  </header>

  <div class="noc-file-corps">
    {#if !$queueTracks.length}
      <p class="noc-file-vide">{$currentZoneId == null ? $t('v2.queue.noZone') : $t('v2.queue.empty')}</p>
    {/if}

    {#if enCours}
      <h3>{$t('nav.nowplaying')}</h3>
      <div class="noc-file-ligne en-cours">
        <span class="noc-file-pochette"><AlbumArt coverPath={enCours.cover_path} albumId={enCours.album_id ?? null} size={0} vignette alt={enCours.title} /></span>
        <span class="noc-file-textes">
          <span class="noc-file-titre" title={enCours.title}>{enCours.title}</span>
          <span class="noc-file-artiste"><span class="noc-file-nom" title={enCours.artist_name ?? ''}>{enCours.artist_name ?? ''}</span>
            {#if enCours.source && enCours.source !== 'local'}<span class="noc-file-source">{libelleDeSource(enCours.source)}</span>
            {:else}<BadgeQualiteNocturne format={enCours.format} sample_rate={enCours.sample_rate} bit_depth={enCours.bit_depth} source={enCours.source ?? null} />{/if}
          </span>
        </span>
        {#if $playbackState === 'playing'}<span class="noc-file-onde"><AudioLines size={15} /></span>{/if}
        <span class="noc-file-duree">{formatTime(enCours.duration_ms)}</span>
      </div>
    {/if}

    {#if suite.length}
      <div class="noc-file-section">
        <h3>{$t('v2.queue.upNext')}</h3>
        <button type="button" class="noc-file-melange" class:actif={aleatoire} aria-pressed={aleatoire}
          onclick={melanger} aria-label={$t('transport.shuffle')}><Shuffle size={14} /></button>
      </div>
      <ol class="noc-file-liste">
        {#each suite as { p, rang } (`${rang}-${p.id ?? p.title}`)}
          <li class="noc-file-ligne" class:glisse={glisse === rang} class:survol={survol === rang && glisse !== rang}
            ondragover={(e) => { if (glisse != null) { e.preventDefault(); survol = rang; } }}
            ondragleave={() => { if (survol === rang) survol = null; }}
            ondrop={(e) => deposer(e, rang)}>
            <span class="noc-file-poignee" draggable="true" role="button" tabindex="-1"
              aria-label={$t('nocturne.file.deplacer')} title={$t('nocturne.file.deplacer')}
              ondragstart={(e) => debutGlisse(e, rang)} ondragend={() => { glisse = null; survol = null; }}>
              <GripVertical size={14} />
            </span>
            <button type="button" class="noc-file-sauter" onclick={() => sauter(rang)}
              aria-label={$t('v2.queue.playTrack').replace('{t}', p.title)}>
              <span class="noc-file-pochette"><AlbumArt coverPath={p.cover_path} albumId={p.album_id ?? null} size={0} vignette alt={p.title} /></span>
              <span class="noc-file-textes">
                <span class="noc-file-titre" title={p.title}>{p.title}</span>
                <span class="noc-file-artiste"><span class="noc-file-nom" title={p.artist_name ?? ''}>{p.artist_name ?? ''}</span>
                  {#if p.source && p.source !== 'local'}<span class="noc-file-source">{libelleDeSource(p.source)}</span>
                  {:else}<BadgeQualiteNocturne format={p.format} sample_rate={p.sample_rate} bit_depth={p.bit_depth} source={p.source ?? null} />{/if}
                </span>
              </span>
            </button>
            <span class="noc-file-duree">{formatTime(p.duration_ms)}</span>
            <button type="button" class="noc-file-retirer" onclick={() => retirer(rang)} aria-label={$t('v2.queue.remove')}><X size={14} /></button>
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</aside>

<style>
  .noc-file-voile {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: var(--noc-voile);
    backdrop-filter: blur(var(--noc-flou-voile));
    -webkit-backdrop-filter: blur(var(--noc-flou-voile));
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--noc-duree);
  }
  .noc-file-voile.ouvert { opacity: 1; pointer-events: auto; }
  .noc-file {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 41;
    width: min(var(--noc-largeur-file), 100vw);
    display: flex;
    flex-direction: column;
    background: var(--noc-fond-file);
    border-left: 1px solid var(--noc-ligne);
    box-shadow: var(--noc-panneau-ombre);
    transform: translateX(105%);
    transition: transform calc(var(--noc-duree) * 1.4) ease;
  }
  .noc-file.ouvert { transform: none; }
  .noc-file-entete {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 22px 20px 18px;
    border-bottom: 1px solid var(--noc-ligne);
  }
  .noc-file-entete > div { flex: 1; min-width: 0; }
  .noc-file-entete h2 {
    margin: 0;
    font-size: var(--noc-taille-titre-file);
    font-weight: var(--noc-graisse-titre);
    color: var(--noc-texte);
  }
  .noc-file-entete p { margin: 6px 0 0; font-size: var(--noc-taille-mini); line-height: 1.6; color: var(--noc-texte-2); }
  .noc-file-bouton {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 14px;
    border-radius: var(--noc-rayon);
    border: 1px solid var(--noc-ligne);
    background: var(--noc-surface);
    color: var(--noc-texte);
    font: inherit;
    font-size: var(--noc-taille-mini);
    font-weight: var(--noc-graisse-moyenne);
    cursor: pointer;
  }
  .noc-file-bouton:hover { background: var(--noc-surface-3); }
  .noc-file-bouton { max-width: 92px; min-height: 40px; padding: 0 10px; line-height: 1.25; text-align: center; white-space: normal; }
  .noc-file-poignee {
    flex: 0 0 auto;
    margin-left: -22px;
    display: inline-flex;
    color: var(--noc-texte-4);
    cursor: grab;
  }
  .noc-file-poignee:hover { color: var(--noc-texte-2); }
  .noc-file-ligne.glisse { opacity: 0.45; }
  .noc-file-ligne.survol { box-shadow: inset 0 2px 0 var(--noc-ambre); }
  .noc-file-bouton:disabled { opacity: 0.45; cursor: default; }
  .noc-file-fermer,
  .noc-file-melange,
  .noc-file-retirer {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--noc-texte-2);
    cursor: pointer;
  }
  .noc-file-fermer { align-self: center; border: 1px solid var(--noc-ligne); }
  .noc-file-melange { border-radius: var(--noc-rayon-petit); border: 1px solid var(--noc-ligne); }
  .noc-file-fermer:hover,
  .noc-file-melange:hover,
  .noc-file-retirer:hover { color: var(--noc-texte); background: var(--noc-surface); }
  .noc-file-melange.actif { color: var(--noc-turquoise); border-color: var(--noc-turquoise); }
  .noc-file-retirer { opacity: 0; }
  .noc-file-ligne:hover .noc-file-retirer,
  .noc-file-retirer:focus-visible { opacity: 1; }
  .noc-file-corps { flex: 1; overflow-y: auto; padding: 4px 0 20px; }
  .noc-file-vide { padding: 20px; color: var(--noc-texte-2); font-size: var(--noc-taille-texte); }
  h3 {
    margin: 0;
    padding: 18px 20px 12px;
    font-size: var(--noc-taille-badge);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: var(--noc-graisse-forte);
    color: var(--noc-texte-3);
  }
  .noc-file-section { display: flex; align-items: center; justify-content: space-between; padding-right: 16px; }
  .noc-file-liste { list-style: none; margin: 0; padding: 0; }
  .noc-file-ligne {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: var(--noc-hauteur-ligne-file);
    padding: 0 16px 0 30px;
  }
  .noc-file-ligne:hover { background: var(--noc-surface); }
  .noc-file-ligne.en-cours {
    background: var(--noc-en-cours);
    box-shadow: inset 3px 0 0 var(--noc-ambre);
    min-height: 62px;
  }
  .noc-file-sauter {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .noc-file-ligne.en-cours > .noc-file-pochette { margin-right: 4px; }
  .noc-file-pochette {
    flex: 0 0 var(--noc-pochette-file);
    width: var(--noc-pochette-file);
    height: var(--noc-pochette-file);
    border-radius: var(--noc-rayon-petit);
    overflow: hidden;
    background: var(--noc-pochette-fond);
  }
  .noc-file-pochette :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .noc-file-textes { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .noc-file-titre {
    color: var(--noc-texte);
    font-size: var(--noc-taille-texte);
    font-weight: var(--noc-graisse-forte);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .noc-file-ligne.en-cours .noc-file-titre { color: var(--noc-ambre); }
  .noc-file-artiste {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-mini);
    white-space: nowrap;
    min-width: 0;
  }
  .noc-file-nom { overflow: hidden; text-overflow: ellipsis; }
  .noc-file-source {
    flex: 0 0 auto;
    padding: 1px 5px;
    border-radius: var(--noc-rayon-petit);
    background: var(--noc-source-fond);
    color: var(--noc-source-texte);
    font-size: var(--noc-taille-micro);
    font-weight: var(--noc-graisse-titre);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .noc-file-onde { color: var(--noc-ambre); display: inline-flex; }
  .noc-file-duree { color: var(--noc-texte-2); font-size: var(--noc-taille-mini); font-variant-numeric: tabular-nums; }
</style>
