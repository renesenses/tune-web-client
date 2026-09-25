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
  import { corpsVersionLocale, corpsVersionService, libellesVersionLocale, libellesVersionService, ordonnerVersionsService, type VersionService } from '../../lib/versionsPiste';
  import { preferences } from '../../lib/stores/preferences';
  import { t } from '../../lib/i18n';
  import { formatTime } from '../../lib/utils';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import { activeView, pendingLibraryAlbum } from '../../lib/stores/navigation';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import ServiceBadge from '../partages/ServiceBadge.svelte';

  /**
   * ## Deux façons de rapprocher, UN seul rendu
   *
   * Par `trackId` — la route par `i64`, le rapprochement du serveur. Ou par
   * `parTitre` — une piste de SERVICE, sans identifiant de bibliothèque :
   * `lib/versionsParTitre` compose la recherche fédérée et ne garde que ce qui
   * se rapproche du titre ET de l'artiste (Bertrand, 23/09/2026, « résultats
   * approximatifs acceptés »). Les deux chargeurs rendent la MÊME forme
   * (`OtherVersionGroup`) : les tuiles, l'ordre (#4368) et le cas vide sont
   * les mêmes ; seul l'en-tête dit, en mode approximatif, comment la liste a
   * été obtenue. La piste d'origine en est exclue par le chargeur.
   */
  import { chargerVersionsParTitre, type CibleParTitre } from '../../lib/versionsParTitre';

  interface Props {
    /** La piste de la BIBLIOTHÈQUE. `null` : voir `parTitre`. */
    trackId?: number | null;
    /** La cible titre + artiste, quand la piste n'a pas d'identifiant. */
    parTitre?: CibleParTitre | null;
    titre?: string;
    onClose: () => void;
  }
  let { trackId = null, parTitre = null, titre = '', onClose }: Props = $props();

  let groupe = $state<api.OtherVersionGroup | null>(null);
  /** Le mode approximatif : l'en-tête le dit. */
  const approximatif = $derived(trackId == null && parTitre != null);
  let chargement = $state(true);
  let erreur = $state(false);

  const locales = $derived(groupe?.versions ?? []);
  /**
   * #4368 — l'ordre du bloc streaming suit le réglage « Ordre des autres
   * versions » (Réglages ▸ Affichage). Le bloc LOCAL, lui, est rendu avant
   * dans les deux modes : c'est un tableau séparé de la route, et « local
   * d'abord » n'a jamais dépendu du barème.
   *
   * `ordonnerVersionsService` PARTITIONNE, elle ne trie pas : elle ne mute pas
   * `groupe.streaming` et, en mode « pertinence », rend le tableau reçu tel
   * quel. Deux tuiles déjà affichées ne peuvent donc pas s'échanger de place
   * quand la liste se complète — voir la règle, dans `versionsPiste.ts`.
   */
  const flux = $derived(ordonnerVersionsService(groupe?.streaming ?? [], $preferences.ordreAutresVersions));
  const vide = $derived(!chargement && !erreur && locales.length === 0 && flux.length === 0);

  $effect(() => {
    const id = trackId;
    const cible = parTitre;
    let vivant = true;
    chargement = true; erreur = false;
    // Le chargeur suit le mode ; ce qui suit ne le connaît pas.
    const charger: Promise<api.OtherVersionGroup> = id != null
      ? api.getTrackVersions(id)
      : cible != null
        ? chargerVersionsParTitre(cible)
        : Promise.reject(new Error('VersionsPistePanneau: ni trackId ni parTitre'));
    charger
      .then((g) => { if (vivant) groupe = g; })
      .catch(() => { if (vivant) { erreur = true; groupe = null; } })
      .finally(() => { if (vivant) chargement = false; });
    return () => { vivant = false; };
  });

  function lireLocale(v: { track_id: number | null }) {
    const zid = $currentZoneId;
    const corps = corpsVersionLocale(v);
    if (zid == null || !corps) return;
    playAndSync(zid, corps as any)
      .then(onClose)
      .catch(() => notifications.error($t('v2.pa.playError' as any)));
  }

  /**
   * Une version de SERVICE : on lit LA CHANSON, pas son album.
   *
   * Bertrand, 07/09/2026 : « Autres versions : le click sur la cover ne doit
   * pas lancer l'album mais la chanson ! ». C'était le cas — la première
   * version envoyait `streaming_album_id` dès qu'un album était connu, et
   * `source_id` (la PISTE chez le service) ne servait que de repli. On
   * demandait une autre version d'un morceau et on obtenait un disque entier,
   * qui ne commençait même pas par lui.
   *
   * L'ordre est donc inversé : la paire `source` + `source_id` d'abord — le
   * chemin de `corpsDeLecture` pour toute piste distante —, et l'album
   * seulement quand le service ne nomme pas la piste. Les métadonnées
   * accompagnent la paire, sans quoi la barre de lecture n'aurait ni titre ni
   * pochette le temps que le service réponde.
   */
  function lireFlux(v: VersionService) {
    const zid = $currentZoneId;
    const corps = corpsVersionService(v);
    if (zid == null || !corps) return;
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
      <!-- Le mode approximatif se DIT : la liste vient d'un rapprochement par
           titre et artiste, pas du barème ISRC/durées du serveur. -->
      {#if approximatif}<p class="src approx">{$t('library.otherVersionsByTitle' as any)}</p>{/if}
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
          <!-- #1235 : l'album, puis l'interprète — ce qui départage deux formations. -->
          {@const lib = libellesVersionLocale(v)}
          <div class="tuile">
            <button class="cv" onclick={() => lireLocale(v)} disabled={v.track_id == null}
              title={$t('common.play' as any)}>
              <AlbumArt coverPath={v.cover_path} albumId={v.album_id} size={48} alt={lib.album} />
            </button>
            <span class="txt">
              <button class="ti" onclick={() => ouvrirAlbum(v.album_id)} disabled={v.album_id == null}
                title={lib.album}>{lib.album}</button>
              <span class="sub">
                {#if lib.interprete}<span class="interprete" title={lib.interprete}>{lib.interprete}</span>{/if}
                {#if v.duration_ms}<span>{formatTime(v.duration_ms)}</span>{/if}
              </span>
            </span>
          </div>
        {/each}
        {#each flux as v, i ((v.service ?? '') + ':' + (v.source_id ?? v.album_id ?? `s${i}`))}
          {@const destination = v.source_id ?? v.album_id}
          <!-- #1115 : l'album ET l'interprète, pour une version comme pour une reprise. -->
          {@const lib = libellesVersionService(v)}
          <div class="tuile" class:inerte={!destination}>
            <button class="cv" onclick={() => lireFlux(v)} disabled={!destination}
              title={$t('common.play' as any)}>
              <AlbumArt coverPath={v.cover_path} size={48} alt={lib.album} />
            </button>
            <span class="txt">
              <span class="ti plat" title={lib.album}>{lib.album}</span>
              <span class="sub">
                {#if lib.interprete}<span class="interprete" title={lib.interprete}>{lib.interprete}</span>{/if}
                <ServiceBadge source={v.service} compact />
              </span>
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
  .approx{font-style:italic}
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
    display:flex; align-items:center; gap:5px; min-width:0}
  .interprete{overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0}
</style>
