<script lang="ts">
  /**
   * « Titres bannis » — `renesenses/tune-server-rust#4806`, tranche web.
   *
   * Bertrand, 23/09/2026 : un titre banni n'est plus jamais joué par une
   * sélection automatique (aléatoire, smart playlists, enchaînement, radio
   * d'artiste), reste visible mais grisé dans son album, et se débannit
   * depuis le menu « … » de la piste ou depuis CET écran, qui liste tout.
   *
   * ## D'où vient la liste
   *
   * `GET /library/tracks/banned` (PR serveur #4818) : titre, interprète,
   * album, date du bannissement, et `resolved` — `false` quand la piste n'est
   * plus dans la bibliothèque (fichier disparu) : le marqueur reste listé et
   * débannissable, avec l'instantané de titre figé au bannissement. On le
   * dit, plutôt que de montrer une ligne qui n'ouvre sur rien.
   *
   * ## Les titres de SERVICE aussi (fil 1946, réponse 6820)
   *
   * Un titre Qobuz, Tidal ou Bandcamp banni figure dans la même liste :
   * `track_id: null`, la paire `source` + `source_id`, et l'instantané figé au
   * bannissement (titre, interprète, album, pochette). Son album s'ouvre chez
   * son service quand l'identifiant d'album a été retenu.
   *
   * ## Pas d'albums masqués à côté
   *
   * L'issue place l'écran « à côté des albums masqués ». Le client web n'a pas
   * cet écran (`/albums/hidden` n'y est pas branché, vérifié sur `main` le
   * 23/09/2026) ; l'entrée vit donc dans les SÉLECTIONS de la barre latérale,
   * l'envers des favoris.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { activeView, pendingLibraryAlbum, vueDeRetour } from '../../lib/stores/navigation';
  import { ficheAlbumService } from '../../lib/stores/streaming';
  import { cleDeBannissement, debannir, surchargesBannissement } from '../../lib/titreBanni';
  import AlbumArt from '../partages/AlbumArt.svelte';

  let items = $state<api.BannedTrack[]>([]);
  let chargement = $state(true);
  let erreur = $state(false);
  let occupe = $state<string | null>(null);

  /** La ligne comme une piste : son `id` local, ou sa paire de service. */
  const commePiste = (b: api.BannedTrack) => ({
    id: b.track_id,
    source: (b.track_id != null ? 'local' : b.source) as any,
    source_id: b.source_id ?? null,
    title: b.title,
  });
  /** La clé de la ligne — celle des surcharges (`l:<id>` ou `s:<service>:<id>`). */
  const cleDe = (b: api.BannedTrack) =>
    cleDeBannissement(commePiste(b)) ?? `?:${b.source ?? ''}:${b.source_id ?? b.track_id ?? ''}`;

  async function charger() {
    chargement = true;
    erreur = false;
    try {
      const res = await api.listBannedTracks();
      items = res.items ?? [];
    } catch {
      erreur = true;
    } finally {
      chargement = false;
    }
  }
  $effect(() => { void charger(); });

  /**
   * Débannir passe par le MODULE, comme le menu de la piste : même route,
   * même toast, et la surcharge locale grise/dégrise aussitôt la ligne dans
   * l'album resté ouvert derrière. Réassigner `items`, jamais le muter.
   */
  async function retirer(b: api.BannedTrack) {
    if (occupe != null) return;
    const cle = cleDe(b);
    occupe = cle;
    const ok = await debannir(commePiste(b));
    if (ok) items = items.filter((x) => cleDe(x) !== cle);
    occupe = null;
  }
  /**
   * Un débannissement fait ailleurs (menu d'une piste) pendant que cet écran
   * est ouvert retire la ligne ici aussi — le magasin le dit.
   */
  $effect(() => {
    const s = $surchargesBannissement;
    if (!items.some((b) => s.get(cleDe(b)) === false)) return;
    items = items.filter((b) => s.get(cleDe(b)) !== false);
  });

  /** L'album s'ouvre-t-il ? Local : son id ; service : son id chez le service. */
  const albumOuvrable = (b: api.BannedTrack) =>
    b.track_id != null ? b.album_id != null : !!(b.source && b.album_source_id);

  function ouvrirAlbum(b: api.BannedTrack) {
    if (b.track_id == null) {
      if (!b.source || !b.album_source_id) return;
      vueDeRetour.set('bannedtracks');
      ficheAlbumService.set({
        service: b.source as any,
        id: b.album_source_id,
        titre: b.album_title ?? '',
        pochette: b.cover_path ?? null,
        artiste: b.artist ?? null,
      });
      activeView.set('streamingalbum');
      return;
    }
    if (b.album_id == null) return;
    pendingLibraryAlbum.set(b.album_id);
    activeView.set('library');
  }
  /** Le nom du service tel qu'il s'affiche : « qobuz » → « Qobuz ». */
  const nomDuService = (s: string | null | undefined) =>
    s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  const quand = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
  };
</script>

<section class="v2-bannis tune-v2">
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('ban.eyebrow' as any)}</div>
      <h1>{$t('ban.title' as any)}</h1>
    </div>
    {#if items.length}
      <div class="v2-actions">
        <div class="meta"><span>{$t('ban.count' as any).replace('{n}', String(items.length))}</span></div>
      </div>
    {/if}
  </header>
  <div class="scroll">
    <p class="intro">{$t('ban.intro' as any)}</p>
    {#if chargement}
      <div class="state">{$t('common.loading' as any)}</div>
    {:else if erreur}
      <div class="state err">
        {$t('ban.loadError' as any)}
        <button class="v2-btn" onclick={charger}>{$t('ban.retry' as any)}</button>
      </div>
    {:else if !items.length}
      <div class="state vide">{$t('ban.empty' as any)}</div>
    {:else}
      <ul class="list">
        {#each items as b (cleDe(b))}
          <li class="ligne" class:orphelin={!b.resolved} data-service={b.track_id == null ? b.source : undefined}>
            <span class="cv">
              {#if b.track_id == null}
                <AlbumArt coverPath={b.cover_path ?? null} source={b.source ?? null} size={0} alt={b.title}
                  fallbackInitials={b.title?.slice(0, 1)} />
              {:else}
                <AlbumArt albumId={b.album_id} size={0} alt={b.title}
                  fallbackInitials={b.title?.slice(0, 1)} />
              {/if}
            </span>
            <span class="ti">
              <span class="tt" title={b.title}>{b.title}</span>
              <em>
                {b.artist ?? ''}
                {#if b.album_title}
                  {#if b.artist} · {/if}
                  {#if albumOuvrable(b)}
                    <button class="lien" onclick={() => ouvrirAlbum(b)}>{b.album_title}</button>
                  {:else}{b.album_title}{/if}
                {/if}
                {#if b.track_id == null && b.source}
                  <span class="svc">{nomDuService(b.source)}</span>
                {/if}
              </em>
              {#if !b.resolved}<span class="orph">{$t('ban.orphan' as any)}</span>{/if}
            </span>
            <span class="quand">{quand(b.banned_at)}</span>
            <button class="v2-btn" data-debannir onclick={() => void retirer(b)}
              disabled={occupe === cleDe(b)}>{$t('ban.unban' as any)}</button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<style>
  .v2-bannis{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .meta{display:flex; gap:16px; margin-left:auto; font:11.5px var(--v2-mono); color:var(--v2-txt3)}
  .scroll{flex:1; overflow-y:auto; padding:4px 0 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .intro{margin:0; padding:6px 30px 12px; font-size:12.5px; color:var(--v2-txt3); max-width:720px}
  .state{padding:30px; color:var(--v2-txt3); display:flex; gap:12px; align-items:center; flex-wrap:wrap}
  .state.err{color:var(--v2-danger)}
  .list{list-style:none; margin:0; padding:6px 30px 20px; display:flex; flex-direction:column; gap:1px}
  .ligne{display:grid; grid-template-columns:44px minmax(0,1fr) auto auto; align-items:center; gap:14px;
    padding:6px 10px; border-radius:9px; color:var(--v2-txt2)}
  .ligne:hover{background:var(--v2-hover); color:var(--v2-txt)}
  /* Le marqueur d'une piste disparue : la ligne reste, un cran plus éteinte. */
  .ligne.orphelin .tt{color:var(--v2-txt3)}
  .cv{width:44px; height:44px; border-radius:6px; overflow:hidden}
  .cv :global(img){width:100%; height:100%; object-fit:cover; display:block}
  .ti{min-width:0; display:flex; flex-direction:column; gap:2px}
  .tt{min-width:0; font-size:13.5px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .ti em{font:11px var(--v2-sans); font-style:normal; color:var(--v2-txt3);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .lien{background:none; border:0; padding:0; font:inherit; color:inherit; cursor:pointer}
  .lien:hover{text-decoration:underline; color:var(--v2-txt)}
  .svc{font:600 10px var(--v2-sans); color:var(--v2-txt3, inherit); margin-left:6px; text-transform:none}
  .orph{font:600 10px var(--v2-sans); color:var(--v2-acc2); border:1px solid var(--v2-line2);
    border-radius:var(--v2-r-pill); padding:1px 6px; width:max-content}
  .quand{font:11px var(--v2-mono); color:var(--v2-txt3); white-space:nowrap}
</style>
