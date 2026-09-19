<script lang="ts">
  /**
   * Les gestes de BIBLIOTHÈQUE d'une fiche album — ceux que seule l'ancienne
   * interface portait, et que la phase 5 (retrait de `?v2=0`) aurait emportés :
   *
   *  - la NOTE en étoiles et son commentaire (`AlbumRating` : `GET …/rating`,
   *    `POST …/rate`) ;
   *  - « Ré-identifier » (`POST …/reidentify`, #2128), avec son verdict rendu
   *    tel quel — « même pressage » et « rien trouvé » sont des réponses ;
   *  - « Signaler » la pochette (`ReportButton`, `POST /library/reports`) ;
   *  - « Vous possédez une meilleure version » (`GET …/better-quality`), que
   *    l'ancienne Bibliothèque proposait en toast au lancement. Ici, la fiche
   *    l'ANNONCE à l'ouverture : la lecture ne passe pas par un seul bouton
   *    dans le nouveau client, la fiche si.
   *
   * Un album LOCAL seulement : toutes ces routes prennent un identifiant de
   * bibliothèque. La fiche ne monte ce bloc que dans ce cas.
   *
   * Mêmes clés de langue que l'ancienne interface : aucune nouvelle chaîne.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import { currentZoneId, playAndSync } from '../../lib/stores/zones';
  import { signalerEchecLecture } from '../../lib/echecLecture';
  import { activeView, pendingLibraryAlbum } from '../../lib/stores/navigation';
  import SignalerV2 from './SignalerV2.svelte';

  interface Props {
    albumId: number;
    avecPochette?: boolean;
    /** Appelé après une ré-identification qui a écrit quelque chose. */
    onRelu?: () => void;
  }
  let { albumId, avecPochette = false, onRelu }: Props = $props();

  /* ---------------------------- Note ---------------------------------- */
  let note = $state(0);
  let commentaire = $state('');
  let commentaireEnregistre = $state('');
  let notation = $state(false);

  /* ---------------------- Meilleure version --------------------------- */
  let meilleure = $state<api.BetterQuality | null>(null);

  $effect(() => {
    const id = albumId;
    note = 0; commentaire = ''; commentaireEnregistre = ''; meilleure = null;
    let vivant = true;
    api.getAlbumRating(id)
      .then((r) => {
        if (!vivant) return;
        note = r?.rating ?? 0;
        commentaire = r?.note ?? '';
        commentaireEnregistre = commentaire;
      })
      .catch(() => { /* pas de note : zéro étoile */ });
    api.albumBetterQuality(id)
      .then((r) => {
        const b = r?.better;
        if (vivant && b?.album_id && b.album_id !== id) meilleure = b;
      })
      .catch(() => { /* proposition silencieuse, comme dans l'ancienne interface */ });
    return () => { vivant = false; };
  });

  async function noter(etoile: number) {
    if (notation) return;
    notation = true;
    const nouvelle = etoile === note ? 0 : etoile;
    try {
      await api.rateAlbum(albumId, nouvelle, commentaire);
      note = nouvelle;
      commentaireEnregistre = commentaire;
      notifications.success(
        nouvelle > 0 ? `${$t('library.rating' as any)} : ${nouvelle}/5` : $t('library.ratingRemoved' as any),
      );
    } catch {
      notifications.error($t('library.ratingError' as any));
    }
    notation = false;
  }

  async function enregistrerCommentaire() {
    // Le commentaire vit sur la ligne de note, qui n'existe pas sans étoile.
    if (note === 0 || commentaire === commentaireEnregistre || notation) return;
    notation = true;
    try {
      await api.rateAlbum(albumId, note, commentaire);
      commentaireEnregistre = commentaire;
      notifications.success($t('library.ratingSaved' as any));
    } catch {
      notifications.error($t('library.ratingError' as any));
    }
    notation = false;
  }

  /* ------------------------- Ré-identifier ---------------------------- */
  let reidentification = $state(false);
  async function reidentifier() {
    if (reidentification) return;
    reidentification = true;
    const tid = notifications.info($t('library.reidentifying' as any), 0);
    try {
      const r = await api.reidentifyAlbum(albumId);
      notifications.dismiss(tid);
      if (r.verdict === 'no_tracks') {
        notifications.error($t('library.reidentifyNoTracks' as any));
      } else if (r.verdict === 'not_found') {
        notifications.error($t('library.reidentifyNotFound' as any).replace('{title}', r.searched_title ?? ''));
      } else if (r.verdict === 'unchanged') {
        notifications.info($t('library.reidentifyUnchanged' as any), 9000);
      } else {
        let msg = $t('library.reidentifySuccess' as any)
          .replace('{title}', r.release_title ?? '')
          .replace('{matched}', String(r.tracks_matched ?? 0))
          .replace('{total}', String(r.tracks_total ?? 0));
        if (r.fields_left_as_is?.length) {
          msg += ` — ${$t('library.reidentifyKept' as any).replace('{fields}', r.fields_left_as_is.join(', '))}`;
        }
        notifications.success(msg, 9000);
        onRelu?.();
      }
    } catch (e: any) {
      notifications.dismiss(tid);
      notifications.error(`${$t('library.reidentifyFailed' as any)} : ${e?.message ?? e}`);
    }
    reidentification = false;
  }

  /* ------------------------ Meilleure version ------------------------- */
  function libelleQualite(b: api.BetterQuality): string {
    const fmt = (b.format ?? '').toUpperCase();
    const sr = b.sample_rate ? `${Math.round(b.sample_rate / 1000)} kHz` : '';
    const bd = b.bit_depth && b.bit_depth > 1 ? ` / ${b.bit_depth} bit` : '';
    return [fmt, sr].filter(Boolean).join(' ') + bd;
  }
  function annonceMeilleure(b: api.BetterQuality): string {
    const base = `${$t('library.betterQualityAvailable' as any)} : ${libelleQualite(b)}`;
    return b.album_title ? `${base} — ${b.album_title}` : base;
  }
  function jouerMeilleure() {
    const zid = $currentZoneId;
    if (zid == null || !meilleure?.album_id) return;
    playAndSync(zid, { album_id: meilleure.album_id }).catch(signalerEchecLecture);
  }
  function ouvrirMeilleure() {
    if (!meilleure?.album_id) return;
    pendingLibraryAlbum.set(meilleure.album_id);
    activeView.set('library');
  }
</script>

{#if meilleure}
  <div class="meilleure" role="status">
    <button class="lien" onclick={ouvrirMeilleure}>
      {annonceMeilleure(meilleure)}
    </button>
    <button class="ghost" onclick={jouerMeilleure}>{$t('library.playBetterQuality' as any)}</button>
  </div>
{/if}

<div class="outils">
  <div class="etoiles" role="group" aria-label={$t('library.rating' as any)}>
    {#each [1, 2, 3, 4, 5] as etoile (etoile)}
      <button class="etoile" class:pleine={etoile <= note} disabled={notation}
        aria-label={`${etoile}/5`} aria-pressed={etoile <= note}
        onclick={() => noter(etoile)}>
        <svg viewBox="0 0 24 24" fill={etoile <= note ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </button>
    {/each}
  </div>
  <input class="commentaire" type="text" bind:value={commentaire}
    placeholder={note === 0 ? $t('library.ratingNoteNeedsStars' as any) : $t('library.ratingNotePlaceholder' as any)}
    disabled={note === 0 || notation}
    onkeydown={(e) => e.key === 'Enter' && enregistrerCommentaire()}
    onblur={enregistrerCommentaire} />
  <button class="ghost" onclick={reidentifier} disabled={reidentification}
    title={$t('library.reidentifyTip' as any)}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
    {reidentification ? $t('library.reidentifying' as any) : $t('library.reidentify' as any)}
  </button>
  {#if avecPochette}
    <SignalerV2 entity="cover" entityId={albumId}
      raisons={['wrong_entity', 'incorrect', 'poor_quality', 'offensive']} />
  {/if}
</div>

<style>
  .outils{display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:14px 0 4px}
  .etoiles{display:flex; gap:2px}
  .etoile{border:0; background:transparent; padding:3px; cursor:pointer; color:var(--v2-txt3); display:grid; place-items:center}
  .etoile.pleine{color:var(--v2-acc-tint)}
  .etoile:hover{color:var(--v2-acc-tint)}
  .etoile:disabled{cursor:default}
  .etoile svg{width:18px; height:18px}
  .commentaire{height:36px; min-width:220px; flex:0 1 320px; padding:0 12px; border-radius:10px;
    border:1px solid var(--v2-line2); background:var(--v2-surface2); color:var(--v2-txt); font:13px var(--v2-sans)}
  .commentaire:disabled{opacity:.6}
  .ghost{display:inline-flex; align-items:center; gap:8px; height:36px; padding:0 14px; border-radius:var(--v2-r-pill);
    font:600 13px var(--v2-sans); cursor:pointer; color:var(--v2-txt2); background:transparent; border:1px solid var(--v2-line2)}
  .ghost:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .ghost:disabled{opacity:.55; cursor:default}
  .ghost svg{width:14px; height:14px}
  .meilleure{display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin:6px 0 4px; padding:10px 14px;
    border-radius:10px; border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .lien{border:0; background:transparent; padding:0; cursor:pointer; color:var(--v2-acc-tint); font:600 13px var(--v2-sans); text-align:left}
  .lien:hover{text-decoration:underline}
</style>
