<script lang="ts">
  /**
   * « Autres versions » d'une piste, dans le nouveau client.
   *
   * Le rapprochement est fait par le SERVEUR (`/library/tracks/{id}/versions`,
   * `routes/versions.rs`) : l'écran n'a qu'à dessiner. Il rend deux familles —
   * les autres pressages de la BIBLIOTHÈQUE, et ce que les services portent
   * (versions et reprises).
   *
   * Mesuré sur le .18 le 07/09/2026, piste 2450 (« La fleur », M) :
   *
   *     versions : [{album_id: 262, album_title: "Le baptême", duration_ms: 179800, …}]
   *     streaming: []
   *
   * ## Une surcouche, pas un dépliement de ligne
   *
   * Le client actuel déplie la ligne. Ici, les actions vivent dans
   * `PisteActions`, qui NE DESSINE PAS la ligne — il s'y pose. Il ne peut donc
   * rien y déplier. La surcouche est la même que celle des étiquettes, et elle
   * a l'avantage de servir les huit listes de la même façon.
   *
   * ## Ce qui n'a pas de destination est INERTE, pas absent
   *
   * Une reprise trouvée chez un service sans identifiant d'album ni de piste
   * ne mène nulle part : on la MONTRE — c'est une information — mais elle ne
   * porte pas de geste. La masquer ferait mentir le compte.
   */
  import { portail } from '../../lib/portail';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { formatTime } from '../../lib/utils';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import { activeView, pendingLibraryAlbum } from '../../lib/stores/navigation';
  import AlbumArt from '../AlbumArt.svelte';
  import ServiceBadge from '../ServiceBadge.svelte';

  interface Props {
    trackId: number;
    titre?: string;
    onClose: () => void;
  }
  let { trackId, titre = '', onClose }: Props = $props();

  let groupe = $state<api.TrackVersions | null>(null);
  let chargement = $state(true);
  let erreur = $state(false);

  const locales = $derived(groupe?.versions ?? []);
  const flux = $derived(groupe?.streaming ?? []);
  const vide = $derived(!chargement && !erreur && locales.length === 0 && flux.length === 0);

  $effect(() => {
    const id = trackId;
    let vivant = true;
    chargement = true; erreur = false;
    api.getTrackVersions(id)
      .then((g) => { if (vivant) groupe = g; })
      .catch(() => { if (vivant) { erreur = true; groupe = null; } })
      .finally(() => { if (vivant) chargement = false; });
    return () => { vivant = false; };
  });

  function lireLocale(v: { track_id: number | null }) {
    const zid = $currentZoneId;
    if (zid == null || v.track_id == null) return;
    playAndSync(zid, { track_id: v.track_id } as any)
      .then(onClose)
      .catch(() => notifications.error($t('v2.pa.playError' as any)));
  }

  /** Une version de SERVICE : on ouvre son album là où il vit. */
  function ouvrirFlux(v: { service: string; album_id: string | null; source_id: string | null }) {
    const zid = $currentZoneId;
    if (zid == null) return;
    const corps = v.album_id
      ? { streaming_album_id: String(v.album_id), source: v.service }
      : v.source_id
        ? { source: v.service, source_id: String(v.source_id) }
        : null;
    if (!corps) return;
    playAndSync(zid, corps as any)
      .then(onClose)
      .catch(() => notifications.error($t('v2.pa.playError' as any)));
  }

  function ouvrirAlbum(albumId: number | null) {
    if (albumId == null) return;
    pendingLibraryAlbum.set(albumId);
    activeView.set('library');
    onClose();
  }

  function auClavier(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
  }
</script>

<svelte:window onkeydown={auClavier} />

<div class="fond tune-v2" role="presentation" use:portail
  onclick={(e) => { e.stopPropagation(); onClose(); }}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="panneau" role="dialog" aria-modal="true" aria-label={$t('library.otherVersions' as any)}
    onclick={(e) => e.stopPropagation()}>
    <header>
      <h2>{$t('library.otherVersions' as any)}</h2>
      {#if titre}<p class="src">{titre}</p>{/if}
      <button class="x" onclick={onClose} aria-label={$t('v2.common.close' as any)}>×</button>
    </header>

    {#if chargement}
      <p class="etat">{$t('v2.common.loading' as any)}</p>
    {:else if erreur}
      <p class="etat">{$t('common.error' as any)}</p>
    {:else if vide}
      <p class="etat">{$t('library.noOtherVersions' as any)}</p>
    {:else}
      <div class="tuiles">
        {#each locales as v, i (v.track_id ?? `l${i}`)}
          <div class="tuile">
            <button class="cv" onclick={() => lireLocale(v)} disabled={v.track_id == null}
              title={$t('common.play' as any)}>
              <AlbumArt coverPath={v.cover_path} albumId={v.album_id} size={48} alt={v.album_title ?? ''} />
            </button>
            <span class="txt">
              <button class="ti" onclick={() => ouvrirAlbum(v.album_id)} disabled={v.album_id == null}
                title={v.album_title ?? ''}>{v.album_title ?? ''}</button>
              <span class="sub">{v.duration_ms ? formatTime(v.duration_ms) : ''}</span>
            </span>
          </div>
        {/each}
        {#each flux as v, i ((v.service ?? '') + ':' + (v.source_id ?? v.album_id ?? `s${i}`))}
          {@const destination = v.album_id ?? v.source_id}
          <div class="tuile" class:inerte={!destination}>
            <button class="cv" onclick={() => ouvrirFlux(v)} disabled={!destination}
              title={v.album_title ?? v.title}>
              <AlbumArt coverPath={v.cover_path} size={48} alt={v.album_title ?? v.title} />
            </button>
            <span class="txt">
              <span class="ti plat" title={v.album_title ?? v.title}
                >{v.kind === 'reprise' ? (v.artist_name ?? v.title) : (v.album_title ?? v.title)}</span>
              <span class="sub"><ServiceBadge source={v.service} compact /></span>
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .fond{position:fixed; inset:0; z-index:900; display:grid; place-items:center;
    background:rgba(0,0,0,.5); padding:20px}
  .panneau{position:relative; width:min(560px, 100%); max-height:min(70vh, 620px); overflow:auto;
    background:var(--v2-surface, var(--tune-surface, #1b1b1f));
    border:1px solid var(--v2-line2, var(--tune-border, #333));
    border-radius:var(--v2-r-card, 12px); padding:18px 20px 20px;
    box-shadow:var(--v2-sh-pop, 0 12px 40px rgba(0,0,0,.5))}
  header{position:relative; padding-right:32px; margin-bottom:14px}
  h2{font:700 16px var(--v2-sans, inherit); color:var(--v2-txt, var(--tune-text, inherit))}
  .src{margin-top:3px; font:12.5px var(--v2-sans, inherit); color:var(--v2-txt3, var(--tune-text-secondary, inherit))}
  .x{position:absolute; top:-4px; right:-6px; width:28px; height:28px; border:0; background:transparent;
    color:var(--v2-txt3, inherit); font-size:20px; line-height:1; cursor:pointer; border-radius:6px}
  .x:hover{background:var(--v2-hover, rgba(255,255,255,.06)); color:var(--v2-txt, inherit)}
  .etat{font:13px var(--v2-sans, inherit); color:var(--v2-txt3, inherit); padding:10px 0}
  .tuiles{display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px}
  .tuile{display:flex; align-items:center; gap:10px; min-width:0;
    border:1px solid var(--v2-line, transparent); border-radius:10px; padding:6px}
  .tuile.inerte{opacity:.6}
  .cv{width:48px; height:48px; flex:0 0 auto; padding:0; border:0; background:transparent;
    border-radius:6px; overflow:hidden; cursor:pointer}
  .cv:disabled{cursor:default}
  .txt{display:flex; flex-direction:column; gap:2px; min-width:0}
  .ti{border:0; background:transparent; padding:0; text-align:left; cursor:pointer;
    font:600 13px var(--v2-sans, inherit); color:var(--v2-txt, var(--tune-text, inherit));
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .ti:hover:not(:disabled):not(.plat){color:var(--v2-acc1, var(--tune-accent, currentColor))}
  .ti:disabled,.ti.plat{cursor:default}
  .sub{font:11.5px var(--v2-sans, inherit); color:var(--v2-txt3, inherit);
    display:flex; align-items:center; gap:5px}
</style>
