<script lang="ts">
  /**
   * File d'attente de Salon : la file de la zone courante (les magasins que
   * `v2Live` tient à jour), répétition et aléatoire en tête, et en pied la
   * lecture continue de la zone (son réglage d'auto-lecture).
   */
  import { bulleTexte } from '../../lib/infobulleTexte';
  import { t } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import { queueTracks, queuePosition } from '../../lib/stores/queue';
  import { currentZone } from '../../lib/stores/zones';
  import { shuffleEnabled, repeatMode } from '../../lib/stores/nowPlaying';
  import { basculerAleatoire } from '../../lib/aleatoireFile';
  import { notifierErreur } from '../../lib/notifierErreur';
  import { reglerRadioFinDeFile } from '../../lib/radioFinDeFile';
  import { duree } from '../../lib/interfaceSalon';
  import type { RepeatMode } from '../../lib/types';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import IconeSalon from './IconeSalon.svelte';

  const pistes = $derived($queueTracks);
  const zoneId = $derived($currentZone?.id ?? null);
  const autoLecture = $derived($currentZone?.autoplay_enabled === true);

  const SUIVANT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };
  async function repeter() {
    if (zoneId == null) return;
    const m = SUIVANT[$repeatMode as RepeatMode] ?? 'off';
    try { await api.setRepeat(zoneId, m); repeatMode.set(m); }
    catch (e) { notifierErreur($t('library.playbackError' as any), e); }
  }
  async function aleatoire() {
    if (zoneId == null) return;
    try { shuffleEnabled.set(await basculerAleatoire(zoneId, !$shuffleEnabled)); }
    catch (e) { notifierErreur($t('library.playbackError' as any), e); }
  }
  async function sauter(i: number) {
    if (zoneId == null) return;
    try { await api.jumpInQueue(zoneId, i); }
    catch (e) { notifierErreur($t('library.playbackError' as any), e); }
  }
  async function basculerAuto() {
    const z = $currentZone;
    if (!z) return;
    try { await reglerRadioFinDeFile(z, !autoLecture); }
    catch (e) { notifierErreur($t('library.playbackError' as any), e); }
  }
</script>

<div class="page" data-page-salon="file">
  <header class="tete">
    <h1 class="titre">{$t('nav.queue' as any)}</h1>
    <span class="sous">{pistes.length ? $t('salon.file.compte' as any).replace('{n}', String(pistes.length)) : $t('salon.file.vide' as any)}</span>
    <span class="espace"></span>
    <button class="b" class:on={$repeatMode !== 'off'} onclick={repeter} aria-label={$t('salon.file.repeter' as any)} title={$t('salon.file.repeter' as any)}>
      <IconeSalon nom="repeter" taille={19} />{#if $repeatMode === 'one'}<span class="un">1</span>{/if}
    </button>
    <button class="b" class:on={$shuffleEnabled} onclick={aleatoire} aria-label={$t('salon.transport.aleatoire' as any)} title={$t('salon.transport.aleatoire' as any)}>
      <IconeSalon nom="aleatoire" taille={19} />
    </button>
  </header>

  <div class="corps">
    {#if !pistes.length}
      <div class="vide">
        <IconeSalon nom="file" taille={18} />
        <p>{$t('salon.file.videAide' as any)}</p>
      </div>
    {:else}
      <ol class="liste">
        {#each pistes as p, i (`${p.id ?? p.title}-${i}`)}
          <li class:courante={i === $queuePosition} class:passee={i < $queuePosition}>
            <button onclick={() => sauter(i)}>
              <span class="mini"><AlbumArt coverPath={p.cover_path ?? null} albumId={p.album_id ?? null} size={0} vignette alt="" /></span>
              <span class="t">
                <span class="nom" use:bulleTexte>{p.title}</span>
                <span class="art" use:bulleTexte>{[p.artist_name, p.album_title].filter(Boolean).join(' · ')}</span>
              </span>
              <span class="d">{duree(p.duration_ms)}</span>
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  </div>

  <footer class="pied">
    <div>
      <h2 class="titre petit">{$t('salon.file.continue' as any)}</h2>
      <p class="aide">{$t('salon.file.continueAide' as any)}</p>
    </div>
    <label class="interrupteur">
      <input type="checkbox" checked={autoLecture} onchange={basculerAuto} disabled={zoneId == null} />
      <span class="glissiere"></span>
      <span>{autoLecture ? $t('salon.oui' as any) : $t('salon.non' as any)}</span>
    </label>
  </footer>
</div>

<style>
  .page { min-height: 100%; display: flex; flex-direction: column; padding: 0 var(--s-marge-page); }
  button { background: none; border: 0; font: inherit; color: inherit; cursor: pointer; padding: 0; }
  .tete { display: flex; align-items: baseline; gap: 10px; padding: 18px 0 14px; border-bottom: 1px solid var(--s-line); }
  .titre { margin: 0; font-family: var(--s-police-titre); font-weight: var(--s-graisse-titre); font-size: var(--s-t-sous-titre); }
  .titre.petit { font-size: var(--s-t-section); }
  .sous { font-size: var(--s-t-petit); color: var(--s-txt2); }
  .espace { flex: 1; }
  .b { position: relative; color: var(--s-txt2); width: 36px; height: 36px; display: grid; place-items: center; border-radius: 50%; align-self: center; }
  .b:hover { background: var(--s-survol); color: var(--s-txt); }
  .b.on { color: var(--s-acc-texte); }
  .un { position: absolute; right: 4px; bottom: 4px; font-size: var(--s-t-micro); }
  .corps { flex: 1; padding: 20px 0; }
  .vide {
    margin: 40px auto; width: 240px; padding: 22px; text-align: center; display: grid; place-items: center; gap: 8px;
    background: var(--s-tuile); border-radius: var(--s-r-pop); color: var(--s-txt); font-size: var(--s-t-petit);
  }
  .vide p { margin: 0; }
  .liste { list-style: none; margin: 0; padding: 0; }
  .liste li { border-bottom: 1px solid var(--s-line); }
  .liste button { width: 100%; display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 16px; align-items: center; padding: 10px 8px; text-align: left; }
  .liste button:hover { background: var(--s-survol); }
  .mini { width: 44px; height: 44px; }
  .t { display: flex; flex-direction: column; min-width: 0; }
  .nom { font-size: var(--s-t-corps); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .art { font-size: var(--s-t-petit); color: var(--s-txt2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .d { font-size: var(--s-t-petit); color: var(--s-txt2); font-variant-numeric: tabular-nums; }
  .courante .nom { color: var(--s-acc-texte); }
  .passee { opacity: .55; }
  .pied { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 18px 0 22px; border-top: 1px solid var(--s-line); }
  .aide { margin: 4px 0 0; font-size: var(--s-t-mini); color: var(--s-txt2); }
  .interrupteur { display: inline-flex; align-items: center; gap: 8px; font-size: var(--s-t-petit); cursor: pointer; }
  .interrupteur input { position: absolute; opacity: 0; pointer-events: none; }
  .glissiere { width: 26px; height: 14px; border-radius: var(--s-r-pilule); background: var(--s-line); position: relative; transition: background .15s; }
  .glissiere::after { content: ''; position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; border-radius: 50%; background: var(--s-bg); transition: transform .15s; }
  .interrupteur input:checked + .glissiere { background: var(--s-acc); }
  .interrupteur input:checked + .glissiere::after { transform: translateX(12px); }
</style>
