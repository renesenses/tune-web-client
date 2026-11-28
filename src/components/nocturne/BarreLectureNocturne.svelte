<script lang="ts">
  /**
   * Barre de lecture Nocturne : pochette ; au centre, titre, artiste et
   * qualité, progression fine dorée, transport et « en lecture · zone » ; à
   * droite, la zone et l'étiquette de sortie (chemin du signal), le volume (ou
   * « Volume fixe »), la file et la version de Tune. La répétition est dans le
   * menu « … ».
   */
  import Play from '@lucide/svelte/icons/play';
  import Pause from '@lucide/svelte/icons/pause';
  import SkipBack from '@lucide/svelte/icons/skip-back';
  import SkipForward from '@lucide/svelte/icons/skip-forward';
  import Shuffle from '@lucide/svelte/icons/shuffle';
  import Repeat from '@lucide/svelte/icons/repeat';
  import Repeat1 from '@lucide/svelte/icons/repeat-1';
  // Itération 5 : les icônes de zone de Rémi (`lib/iconesZone`), choix de
  // l'utilisateur d'abord, défaut d'après le type de sortie ensuite.
  import IconeZone from '../partages/IconeZone.svelte';
  import Volume2 from '@lucide/svelte/icons/volume-2';
  import Lock from '@lucide/svelte/icons/lock';
  import ListMusic from '@lucide/svelte/icons/list-music';
  import Maximize2 from '@lucide/svelte/icons/maximize-2';
  import Check from '@lucide/svelte/icons/check';
  import { t } from '../../lib/i18n';
  import { formatTime } from '../../lib/utils';
  import type { RepeatMode } from '../../lib/types';
  import { currentZone, currentZoneId, zones, switchZone } from '../../lib/stores/zones';
  import { currentTrack, playbackState, seekPositionMs, shuffleEnabled, zoneVolume } from '../../lib/stores/nowPlaying';
  import { volumeLocked } from '../../lib/stores/audiophile';
  import { repeatMode } from '../../lib/stores/repeatStore';
  import { upNextCount } from '../../lib/stores/queue';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import BadgeQualiteNocturne from './BadgeQualiteNocturne.svelte';
  import MenuNocturne, { type ActionMenu } from './MenuNocturne.svelte';
  import { allerA, ouvrirTune } from './navigationNocturne';
  import { zonesParRubrique, LIBELLE_RUBRIQUE } from './zonesNocturne';
  import { zoneTypeLabel } from '../../lib/zoneIdentity';
  import ZoneConfigModal from '../partages/ZoneConfigModal.svelte';
  import { supprimerZoneConfirmee } from '../../lib/suppressionDeZone';
  import * as api from '../../lib/api';
  import type { Zone, ZoneGroupResponse } from '../../lib/types';
  import {
    lecturePause, suivant, precedent, basculerAleatoire, reglerRepetition, chercherA, reglerVolume,
    etiquetteSortie, volumeFixe, volumeAutorise, annulerVolumeEnAttente,
  } from './transportNocturne';

  interface Props { fileOuverte: boolean; basculerFile: () => void }
  let { fileOuverte, basculerFile }: Props = $props();

  const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';

  let menuZones = $state(false);

  /* Itération 6 — segment « Zone unique / Multi-zone » : Multi-zone ouvre la
     fenêtre « Lecture groupée » de Tune (ZoneConfigModal, section `groupe`),
     telle quelle, avec les mêmes gestes que la barre de l'interface actuelle. */
  let fenetreGroupe = $state<Zone | null>(null);
  let groupesZones = $state<ZoneGroupResponse[]>([]);
  async function chargerGroupes() {
    try { groupesZones = await api.listGroups(); } catch { groupesZones = []; }
  }
  function ouvrirMultiZone() {
    menuZones = false;
    if (!$currentZone) return;
    fenetreGroupe = $currentZone;
    void chargerGroupes();
  }
  async function apresChangementDeGroupe() {
    await chargerGroupes();
    try { zones.set(await api.getZones()); } catch { /* le WebSocket rattrapera */ }
  }

  const piste = $derived($currentTrack);
  const duree = $derived(piste?.duration_ms ?? 0);
  const position = $derived(Math.min($seekPositionMs, duree || $seekPositionMs));
  const ratio = $derived(duree > 0 ? Math.min(1, position / duree) : 0);
  const joue = $derived($playbackState === 'playing');
  const aleatoire = $derived($currentZone?.shuffle ?? $shuffleEnabled);
  const repetition = $derived<RepeatMode>($currentZone?.repeat ?? $repeatMode);
  const zonesVisibles = $derived($zones.filter((z) => z.id != null && !z.device_forgotten));
  const sortie = $derived(etiquetteSortie($currentZone));
  const fixe = $derived(volumeFixe($currentZone));
  // Itération 14 — PURE « Forcer à 100 % » (volume verrouillé) : pas de
  // curseur, comme pour un volume fixe ; la consigne d'une autre zone en
  // attente ne part pas après un changement de zone.
  const verrouille = $derived($volumeLocked);
  const volumeLibre = $derived(!fixe && !verrouille && volumeAutorise($currentZone));
  $effect(() => { void $currentZone?.id; return () => annulerVolumeEnAttente(); });
  function curseurVolume(e: Event) {
    const champ = e.currentTarget as HTMLInputElement;
    const pose = reglerVolume(Number(champ.value) / 100);
    // Le pouce ne file jamais plus haut que le son : il revient au plafond.
    champ.value = String(Math.round((pose ?? $zoneVolume) * 100));
  }

  const LIBELLE_SORTIE = { tess: 'v2.nav.tess', bitPerfect: 'tess.badge.bit_perfect', transcode: 'signal.transcoded' } as const;

  const actionsBarre = $derived<ActionMenu[]>([
    { cle: 'lecture', libelle: $t('nocturne.lecture.ouvrir'), icone: Maximize2, faire: () => allerA({ nom: 'lecture' }) },
    { cle: 'rep-off', libelle: $t('transport.repeatOff'), icone: Repeat, coche: repetition === 'off', faire: () => reglerRepetition('off') },
    { cle: 'rep-all', libelle: $t('transport.repeatAll'), icone: Repeat, coche: repetition === 'all', faire: () => reglerRepetition('all') },
    { cle: 'rep-one', libelle: $t('transport.repeatOne'), icone: Repeat1, coche: repetition === 'one', faire: () => reglerRepetition('one') },
  ]);

  function chercher(e: MouseEvent) {
    if (!duree) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    chercherA(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duree);
  }
  function chercherClavier(e: KeyboardEvent) {
    if (!duree) return;
    const pas = e.key === 'ArrowRight' ? 5000 : e.key === 'ArrowLeft' ? -5000 : 0;
    if (!pas) return;
    e.preventDefault();
    chercherA(Math.min(duree, position + pas));
  }
  function ouvrirArtiste() {
    const id = piste?.artist_id;
    if (id != null) allerA({ nom: 'artiste', id });
  }
</script>

<footer class="noc-barre">
  <button type="button" class="noc-barre-pochette" onclick={() => allerA({ nom: 'lecture' })} aria-label={$t('nocturne.lecture.ouvrir')} title={$t('nocturne.lecture.ouvrir')} disabled={!piste}>
    {#if piste}<AlbumArt coverPath={piste.cover_path} albumId={piste.album_id ?? null} size={0} vignette alt={piste.title} source={piste.source ?? null} />{/if}
  </button>

  <div class="noc-barre-milieu">
    <div class="noc-barre-titres">
      {#if piste}
        <span class="noc-barre-ligne">
          <span class="noc-barre-titre" title={piste.title}>{piste.title}</span>
          <BadgeQualiteNocturne format={piste.format} sample_rate={piste.sample_rate} bit_depth={piste.bit_depth} source={piste.source ?? null} complet />
        </span>
        <button type="button" class="noc-barre-artiste" title={piste.artist_name ?? ''} onclick={ouvrirArtiste}>{piste.artist_name ?? ''}</button>
      {/if}
    </div>
    <div class="noc-barre-temps">
      <span>{formatTime(position)}</span>
      <div class="noc-barre-progression" role="slider" tabindex="0" aria-label={$t('v2.album.fiche.duration')}
        aria-valuemin={0} aria-valuemax={Math.round(duree / 1000)} aria-valuenow={Math.round(position / 1000)}
        onclick={chercher} onkeydown={chercherClavier}>
        <div class="noc-barre-rempli" style:width={`${ratio * 100}%`}></div>
      </div>
      <span>{duree ? `-${formatTime(duree - position)}` : ''}</span>
    </div>
    <div class="noc-barre-transport">
      <button type="button" class="noc-t" class:actif={aleatoire} aria-pressed={aleatoire} onclick={basculerAleatoire}
        aria-label={aleatoire ? $t('transport.shuffleOn') : $t('transport.shuffleOff')}><Shuffle size={15} /></button>
      <button type="button" class="noc-t" onclick={precedent} aria-label={$t('transport.previous')}><SkipBack size={16} /></button>
      <button type="button" class="noc-t-principal" onclick={lecturePause} aria-label={joue ? $t('common.pause') : $t('common.play')}>
        {#if joue}<Pause size={16} fill="currentColor" />{:else}<Play size={16} fill="currentColor" />{/if}
      </button>
      <button type="button" class="noc-t" onclick={suivant} aria-label={$t('transport.next')}><SkipForward size={16} /></button>
      <MenuNocturne actions={actionsBarre} versLeHaut aligne="gauche" />
    </div>
    {#if $currentZone}
      <div class="noc-barre-legende">
        <span>{$t('nav.nowplaying')} · {$currentZone.name}</span>
        {#if sortie}<span class="noc-sortie" data-sortie={sortie}>{$t(LIBELLE_SORTIE[sortie])}</span>{/if}
      </div>
    {/if}
  </div>

  <div class="noc-barre-droite">
    <div class="noc-zone-ancre">
      <button type="button" class="noc-zone" onclick={() => (menuZones = !menuZones)} aria-expanded={menuZones}>
        <span class="noc-zone-icone"><IconeZone zone={$currentZone} taille={20} /></span>
        <span class="noc-zone-nom noc-zone-nom-barre" title={$currentZone?.name ?? ''}>{$currentZone?.name ?? '—'}</span>
        <span class="noc-zone-pastille" class:joue></span>
      </button>
      {#if sortie}<span class="noc-sortie noc-sortie-zone" data-sortie={sortie}>{$t(LIBELLE_SORTIE[sortie])}</span>{/if}
      {#if menuZones}
        <div class="noc-zone-menu" role="menu">
          <div class="noc-zone-segment" role="group" aria-label={$t('nocturne.zones.mode' as any)}>
            <button type="button" aria-pressed="true">{$t('nocturne.zones.unique' as any)}</button>
            <button type="button" aria-pressed="false" data-multi-zone onclick={ouvrirMultiZone}>{$t('nocturne.zones.multi' as any)}</button>
          </div>
          <!-- Itération 5 : rangées par rubrique (sorties locales, lecteurs
               réseau, autres), le type de sortie sous chaque nom. -->
          {#each zonesParRubrique(zonesVisibles) as g (g.rubrique)}
            <p class="noc-zone-rubrique" role="presentation">{$t(LIBELLE_RUBRIQUE[g.rubrique] as any)}</p>
            {#each g.zones as z (z.id)}
              <button type="button" role="menuitemradio" aria-checked={z.id === $currentZoneId}
                onclick={() => { menuZones = false; if (z.id != null) void switchZone(z.id); }}>
                <span class="noc-zone-icone"><IconeZone zone={z} taille={18} /></span>
                <span class="noc-zone-textes">
                  <span class="noc-zone-nom" title={z.name}>{z.name}</span>
                  <span class="noc-zone-type">{zoneTypeLabel(z.output_type ?? null)}</span>
                </span>
                <span class="noc-zone-pastille" class:joue={z.state === 'playing'}></span>
                {#if z.id === $currentZoneId}<Check size={14} />{/if}
              </button>
            {/each}
          {/each}
          <button type="button" class="noc-zone-gerer" role="menuitem" onclick={() => { menuZones = false; ouvrirTune('zonemanager'); }}>
            {$t('nocturne.zones.gerer' as any)}
          </button>
        </div>
      {/if}
    </div>
    {#if fixe}
      <span class="noc-volume-fixe"><Lock size={14} /> {$t('v2.lbl.fixedVolume')}</span>
    {:else if verrouille}
      <span class="noc-volume-fixe" title={$t('audiophile.volumeLockedHint' as any)}><Lock size={14} /> {Math.round($zoneVolume * 100)}</span>
    {:else if volumeLibre}
      <label class="noc-volume">
        <Volume2 size={16} />
        <input type="range" min="0" max="100" step="1" value={Math.round($zoneVolume * 100)}
          oninput={curseurVolume}
          aria-label={$t('reglages.fiche.volume')} style:--noc-volume-ratio={`${Math.round($zoneVolume * 100)}%`} />
      </label>
    {/if}
    <button type="button" class="noc-t noc-file-bascule" class:actif={fileOuverte} aria-pressed={fileOuverte} onclick={basculerFile} aria-label={$t('nav.queue')}>
      <ListMusic size={19} />
      {#if $upNextCount > 0}<span class="noc-file-compte">{$upNextCount > 99 ? '99+' : $upNextCount}</span>{/if}
    </button>
    {#if VERSION}<span class="noc-version">v{VERSION}</span>{/if}
  </div>
</footer>

{#if fenetreGroupe}
  <ZoneConfigModal
    zone={fenetreGroupe}
    allZones={$zones}
    groups={groupesZones}
    section="groupe"
    onClose={() => (fenetreGroupe = null)}
    onDelete={async (id) => { await supprimerZoneConfirmee(id); fenetreGroupe = null; }}
    onGroupChanged={apresChangementDeGroupe}
    onRenamed={() => {}}
  />
{/if}

<style>
  .noc-barre {
    position: relative;
    height: var(--noc-hauteur-barre);
    display: grid;
    grid-template-columns: var(--noc-pochette-barre) minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 28px;
    padding: 0 20px 0 15px;
    background: var(--noc-fond-barre);
    border-top: 1px solid var(--noc-ligne);
  }
  .noc-barre-pochette {
    width: var(--noc-pochette-barre);
    height: var(--noc-pochette-barre);
    padding: 0;
    border: 0;
    border-radius: var(--noc-rayon-petit);
    overflow: hidden;
    background: var(--noc-pochette-fond);
    cursor: pointer;
  }
  .noc-barre-pochette :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .noc-barre-milieu {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding-top: 2px;
  }
  .noc-barre-titres { min-height: 38px; display: flex; flex-direction: column; gap: 4px; }
  .noc-barre-ligne { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .noc-barre-titre {
    color: var(--noc-texte);
    font-size: var(--noc-taille-barre-titre);
    font-weight: var(--noc-graisse-forte);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .noc-barre-artiste {
    align-self: flex-start;
    max-width: 100%;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: var(--noc-taille-mini);
    color: var(--noc-texte-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .noc-barre-artiste:hover { color: var(--noc-ambre); }
  .noc-barre-temps {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 4px 0 0;
    font-size: var(--noc-taille-badge);
    color: var(--noc-texte-4);
    font-variant-numeric: tabular-nums;
  }
  .noc-barre-temps > span { width: 22px; }
  .noc-barre-temps > span:last-child { width: 30px; text-align: right; }
  .noc-barre-progression {
    position: relative;
    flex: 1;
    height: 12px;
    cursor: pointer;
  }
  .noc-barre-progression::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 5px;
    height: 2px;
    border-radius: 1px;
    background: var(--noc-piste-progression);
  }
  .noc-barre-rempli {
    position: absolute;
    left: 0;
    top: 5px;
    height: 2px;
    border-radius: 1px;
    background: var(--noc-ambre);
  }
  .noc-barre-progression:hover::before,
  .noc-barre-progression:hover .noc-barre-rempli { top: 4px; height: 4px; }
  .noc-barre-progression:focus-visible { outline: 2px solid var(--noc-focus); outline-offset: 2px; border-radius: 4px; }
  .noc-barre-transport {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-top: 6px;
  }
  .noc-t {
    position: relative;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--noc-texte-2);
    cursor: pointer;
  }
  .noc-t:hover { color: var(--noc-texte); }
  .noc-t.actif { color: var(--noc-turquoise); }
  .noc-t-principal {
    width: 37px;
    height: 37px;
    display: grid;
    place-items: center;
    padding-left: 2px;
    border: 0;
    border-radius: 50%;
    background: var(--noc-bouton-lecture);
    color: var(--noc-sur-bouton-lecture);
    cursor: pointer;
    transition: background var(--noc-duree);
  }
  .noc-t-principal:hover { background: var(--noc-texte); }
  .noc-barre-legende {
    display: flex;
    justify-content: center;
    margin-top: 6px;
  }
  .noc-barre-legende span {
    font-size: var(--noc-taille-micro);
    font-weight: var(--noc-graisse-forte);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--noc-ambre);
    opacity: 0.85;
  }
  .noc-barre-droite {
    display: flex;
    align-items: center;
    gap: 18px;
    padding-left: 22px;
    border-left: 1px solid var(--noc-ligne);
    height: 44px;
  }
  .noc-zone-ancre { position: relative; min-width: 0; }
  .noc-zone {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    max-width: 220px;
    height: 32px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--noc-texte-2);
    font: inherit;
    font-size: var(--noc-taille-petit);
    cursor: pointer;
  }
  .noc-zone .noc-zone-nom { color: var(--noc-texte); font-weight: var(--noc-graisse-forte); }
  .noc-zone:hover .noc-zone-nom { color: var(--noc-ambre); }
  .noc-zone-nom { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .noc-zone-pastille {
    flex: 0 0 6px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--noc-texte-4);
  }
  .noc-zone-pastille.joue { background: var(--noc-turquoise); }
  .noc-zone-segment {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    margin: 2px 2px 6px;
    padding: 2px;
    border-radius: var(--noc-rayon);
    background: var(--noc-surface);
  }
  .noc-zone-menu .noc-zone-segment button {
    justify-content: center;
    padding: 6px 8px;
    border-radius: var(--noc-rayon-petit);
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-surtitre);
    font-weight: var(--noc-graisse-forte);
    letter-spacing: var(--noc-interlettre-surtitre);
    text-transform: uppercase;
  }
  .noc-zone-menu .noc-zone-segment button[aria-pressed='true'] { background: var(--noc-ambre); color: var(--noc-sur-ambre); }
  .noc-zone-rubrique {
    margin: 8px 10px 4px;
    font-size: var(--noc-taille-surtitre);
    font-weight: var(--noc-graisse-forte);
    letter-spacing: var(--noc-interlettre-surtitre);
    text-transform: uppercase;
    color: var(--noc-texte-3);
  }
  .noc-zone-rubrique:first-child { margin-top: 2px; }
  .noc-zone-textes { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .noc-zone-type { color: var(--noc-texte-3); font-size: var(--noc-taille-mini); }
  .noc-zone-menu button[aria-checked='true'] .noc-zone-nom,
  .noc-zone-menu button[aria-checked='true'] :global(svg.lucide-check) { color: var(--noc-ambre); }
  .noc-zone-menu .noc-zone-gerer {
    justify-content: center;
    margin-top: 6px;
    border-top: 1px solid var(--noc-ligne);
    border-radius: 0;
    color: var(--noc-ambre);
    font-size: var(--noc-taille-petit);
  }
  .noc-zone-icone { display: inline-flex; flex: none; color: var(--noc-texte-2); }
  .noc-zone:hover .noc-zone-icone,
  .noc-zone-menu button[aria-checked='true'] .noc-zone-icone { color: var(--noc-ambre); }
  .noc-zone-menu {
    position: absolute;
    right: 0;
    bottom: 44px;
    z-index: 30;
    min-width: 300px;
    max-height: 60vh;
    overflow-y: auto;
    padding: 6px;
    border-radius: var(--noc-rayon-grand);
    border: 1px solid var(--noc-ligne);
    background: var(--noc-surface-2);
    box-shadow: var(--noc-carte-ombre);
  }
  .noc-zone-menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 10px;
    border: 0;
    border-radius: var(--noc-rayon);
    background: none;
    color: var(--noc-texte);
    font: inherit;
    font-size: var(--noc-taille-texte);
    text-align: left;
    cursor: pointer;
  }
  .noc-zone-menu button:hover { background: var(--noc-surface-3); }
  .noc-zone-menu button[aria-checked='true'] { color: var(--noc-turquoise); }
  .noc-zone-menu .noc-zone-nom { flex: 1; }
  .noc-volume { display: inline-flex; align-items: center; gap: 8px; color: var(--noc-texte-2); }
  .noc-volume input {
    width: 90px;
    height: 2px;
    appearance: none;
    -webkit-appearance: none;
    border-radius: 1px;
    background: linear-gradient(to right, var(--noc-texte-2) var(--noc-volume-ratio), var(--noc-piste-progression) var(--noc-volume-ratio));
    cursor: pointer;
  }
  .noc-volume input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--noc-texte);
  }
  .noc-volume input::-moz-range-thumb {
    width: 11px;
    height: 11px;
    border: 0;
    border-radius: 50%;
    background: var(--noc-texte);
  }
  .noc-file-compte {
    position: absolute;
    top: -1px;
    right: -3px;
    min-width: 15px;
    height: 15px;
    padding: 0 4px;
    border-radius: var(--noc-rayon-pilule);
    background: var(--noc-ambre);
    color: var(--noc-sur-ambre);
    font-size: var(--noc-taille-badge-mini);
    font-weight: var(--noc-graisse-titre);
    line-height: 15px;
    text-align: center;
  }
  .noc-barre-legende { gap: 8px; align-items: center; }
  .noc-sortie {
    padding: 1px 6px;
    border-radius: var(--noc-rayon-petit);
    border: 1px solid var(--noc-ligne);
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-micro);
    font-weight: var(--noc-graisse-forte);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .noc-sortie[data-sortie='bitPerfect'] { color: var(--noc-turquoise); border-color: var(--noc-turquoise-doux); }
  .noc-sortie[data-sortie='tess'] { color: var(--noc-ambre); border-color: var(--noc-ambre-doux); }
  .noc-zone-ancre { display: flex; align-items: center; gap: 8px; }
  .noc-sortie-zone { background: var(--noc-surface); }
  .noc-volume-fixe {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--noc-texte-2);
    font-size: var(--noc-taille-mini);
    white-space: nowrap;
  }
  .noc-version {
    color: var(--noc-texte-4);
    font-size: var(--noc-taille-micro);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  @media (max-width: 900px) {
    .noc-barre { grid-template-columns: var(--noc-pochette-barre) minmax(0, 1fr) auto; column-gap: 14px; }
    .noc-barre-temps, .noc-barre-legende, .noc-volume { display: none; }
    /* Itération 6 : le sélecteur de zone reste au téléphone, réduit à son
       icône (cible de 44 px) ; le nom et l'étiquette de sortie se lisent
       dans son menu. */
    .noc-zone-nom-barre, .noc-sortie-zone, .noc-zone > .noc-zone-pastille { display: none; }
    .noc-zone { min-width: var(--noc-cible-tactile); min-height: var(--noc-cible-tactile); justify-content: center; padding: 0; }
    .noc-zone-menu { max-width: calc(100vw - 2 * var(--noc-marge-page)); }
    .noc-barre-droite { border-left: 0; padding-left: 0; }
  }
  /* Itération 10 — téléphone : la résolution (« 24-bit / 96kHz ») passait sur
     deux lignes et coupait le titre ; le badge de qualité suffit. */
  @media (max-width: 600px) {
    .noc-barre :global(.noc-qualite-reso) { display: none; }
  }
  /* Itération 12 — au doigt sur téléphone, les commandes passent à 44 px :
     l'aléatoire (aussi dans la file d'attente) laisse sa place pour que le
     transport tienne sans chevaucher la pochette. */
  /* Itération 13 — téléphone : la version laisse sa place au titre, et le
     transport part de la gauche de sa colonne (centré, il débordait sur la
     pochette à 390 px). */
  @media (max-width: 600px) {
    .noc-version { display: none; }
    .noc-barre-transport { justify-content: flex-start; }
  }
  @media (max-width: 600px) and (pointer: coarse) {
    .noc-barre-transport { gap: 0; }
    .noc-barre-transport > .noc-t:first-child { display: none; }
  }
  /* Téléphone : le menu de zone se pose pleine largeur au-dessus de la barre
     (ancré sur le bouton, il débordait à gauche de l'écran). */
  @media (max-width: 600px) {
    .noc-zone-menu {
      position: fixed;
      left: var(--noc-marge-page);
      right: var(--noc-marge-page);
      bottom: calc(var(--noc-hauteur-barre) + var(--noc-ecart-bandeau));
      min-width: 0;
      max-width: none;
    }
  }
</style>
