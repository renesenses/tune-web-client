<script lang="ts">
  /**
   * Les gestes et les fiches d'un artiste de la BIBLIOTHÈQUE que seule
   * l'ancienne interface portait — la phase 5 (retrait de `?v2=0`) les
   * aurait emportés :
   *
   *  - « Enrichir la biographie » / « Ré-enrichir » (`GET
   *    /metadata/artists/{id}/enrich`) — la bio trouvée remonte à la fiche ;
   *  - « Envoyer image » (`ArtistEditModal` : `POST
   *    /library/artists/{id}/image/upload`) ;
   *  - « Signaler » la biographie ou l'image (`ReportButton`) ;
   *  - les MEMBRES, ARTISTES SIMILAIRES et ANECDOTES de l'artiste (`GET
   *    /library/artists/{id}/metadata`) ;
   *  - ses CRÉDITS — instruments joués et nombre de pistes (`GET
   *    /library/artists/{id}/credits`).
   *
   * Mêmes clés de langue que l'ancienne interface : aucune nouvelle chaîne.
   * Rien n'est affiché pour ce qui manque — un bloc vide ne dit rien.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import type { ArtistMetadata, TrackCredit } from '../../lib/types';
  import SignalerV2 from './SignalerV2.svelte';

  interface Props {
    artistId: number;
    mbid?: string | null;
    /** La fiche montre-t-elle une biographie / une image ? (ce qu'on peut signaler) */
    aBio?: boolean;
    aImage?: boolean;
    onBio?: (bio: string) => void;
    onImage?: (chemin: string | null) => void;
    /** Ouvrir un artiste similaire par son nom ; absent ⇒ simple mention. */
    onSimilaire?: ((nom: string) => void) | null;
  }
  let {
    artistId, mbid = null, aBio = false, aImage = false,
    onBio, onImage, onSimilaire = null,
  }: Props = $props();

  let meta = $state<ArtistMetadata | null>(null);
  let credits = $state<TrackCredit[]>([]);

  /** Lit la forme `{data: {...}, enrichment_status}` comme l'ancienne fiche. */
  function aplatir(r: any): ArtistMetadata {
    const raw = { ...((r as any)?.data ?? r ?? {}) };
    if (raw.bio_fr) raw.bio = raw.bio_fr;
    if (!raw.bio && raw.bio_summary) raw.bio = raw.bio_summary;
    if (!raw.enrichment_status && r?.enrichment_status) raw.enrichment_status = r.enrichment_status;
    return raw;
  }

  $effect(() => {
    const id = artistId;
    meta = null;
    credits = [];
    let vivant = true;
    api.getArtistMetadata(id)
      .then((r) => { if (vivant) meta = aplatir(r); })
      .catch(() => { /* pas de fiche enrichie : rien à montrer */ });
    api.getArtistCredits(id)
      .then((c) => { if (vivant) credits = c ?? []; })
      .catch(() => {});
    return () => { vivant = false; };
  });

  const membres = $derived(meta?.members ?? []);
  const similaires = $derived((meta?.similar_artists ?? []).map((s: any) => s?.name ?? s).filter(Boolean) as string[]);
  const anecdotes = $derived(meta?.anecdotes ?? []);
  const instruments = $derived(
    [...new Set(credits.map((c) => c.instrument).filter((x): x is string => !!x))],
  );

  /* ---------------------------- Enrichir ------------------------------ */
  let enrichissement = $state(false);
  async function enrichir() {
    if (enrichissement) return;
    enrichissement = true;
    try {
      const raw = aplatir(await api.enrichArtist(artistId));
      meta = { ...(meta ?? {}), ...raw };
      if (raw.bio) {
        onBio?.(raw.bio);
        notifications.success($t('library.bioEnriched' as any));
      } else if (raw.similar_artists?.length) {
        notifications.success($t('library.similarAndTagsFound' as any));
      } else {
        notifications.info($t('library.noInfoFound' as any));
      }
    } catch {
      notifications.error($t('library.enrichUnavailable' as any));
    }
    enrichissement = false;
  }

  /* ------------------------------ Image ------------------------------- */
  let champFichier = $state<HTMLInputElement | null>(null);
  let envoi = $state(false);
  async function envoyerImage(e: Event) {
    const entree = e.currentTarget as HTMLInputElement;
    const fichier = entree.files?.[0];
    entree.value = '';
    if (!fichier || envoi) return;
    envoi = true;
    try {
      const maj = await api.uploadArtistImage(artistId, fichier);
      onImage?.(maj?.image_path ?? null);
      notifications.success($t('artistEdit.imageUpdated' as any));
    } catch {
      notifications.error($t('artistEdit.uploadError' as any));
    }
    envoi = false;
  }
</script>

<div class="outils">
  <button class="ghost" onclick={enrichir} disabled={enrichissement}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>
    {enrichissement ? $t('artist.enriching' as any) : aBio ? $t('library.reEnrich' as any) : $t('library.enrichBio' as any)}
  </button>
  <button class="ghost" onclick={() => champFichier?.click()} disabled={envoi}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
    {$t('artistEdit.uploadImage' as any)}
  </button>
  <input bind:this={champFichier} class="cache" type="file" accept="image/*" onchange={envoyerImage} />
  {#if aBio}
    <SignalerV2 entity="bio" entityId={artistId} mbid={mbid ?? undefined}
      raisons={['incorrect', 'wrong_entity', 'offensive']} />
  {/if}
  {#if aImage}
    <SignalerV2 entity="artist_image" entityId={artistId} mbid={mbid ?? undefined}
      libelle={$t('artist.reportImage' as any)}
      raisons={['wrong_entity', 'incorrect', 'poor_quality', 'offensive']}
      onSignale={() => onImage?.(null)} />
  {/if}
</div>

{#if membres.length}
  <section class="bloc">
    <h2>{$t('artist.members' as any)}</h2>
    <ul class="puces">
      {#each membres as m, i (m.name + i)}
        <li class="puce">{m.role ? `${m.name} — ${m.role}` : m.name}</li>
      {/each}
    </ul>
  </section>
{/if}

{#if similaires.length}
  <section class="bloc">
    <h2>{$t('artist.similarArtists' as any)}</h2>
    <ul class="puces">
      {#each similaires as nom, i (nom + i)}
        <li>
          {#if onSimilaire}
            <button class="puce lien" onclick={() => onSimilaire?.(nom)}>{nom}</button>
          {:else}
            <span class="puce">{nom}</span>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if anecdotes.length}
  <section class="bloc">
    <h2>{$t('artist.anecdotes' as any)}</h2>
    {#each anecdotes as a, i (i)}<p class="texte">{a}</p>{/each}
  </section>
{/if}

{#if credits.length}
  <section class="bloc">
    <h2>{$t('artist.credits' as any)}</h2>
    {#if instruments.length}
      <ul class="puces">
        {#each instruments as ins (ins)}<li class="puce">{ins}</li>{/each}
      </ul>
    {/if}
    <p class="texte">{`${credits.length} ${$t('common.tracks' as any)}`}</p>
  </section>
{/if}

<style>
  .outils{display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:0 0 22px}
  .ghost{display:inline-flex; align-items:center; gap:8px; height:36px; padding:0 14px; border-radius:var(--v2-r-pill);
    font:600 13px var(--v2-sans); cursor:pointer; color:var(--v2-txt2); background:transparent; border:1px solid var(--v2-line2)}
  .ghost:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .ghost:disabled{opacity:.55; cursor:default}
  .ghost svg{width:14px; height:14px}
  .cache{display:none}
  .bloc{margin:0 0 26px}
  h2{margin:0 0 10px; font:600 13px var(--v2-sans); color:var(--v2-txt2); text-transform:uppercase; letter-spacing:.05em}
  .puces{display:flex; flex-wrap:wrap; gap:8px; list-style:none; margin:0; padding:0}
  .puce{display:inline-block; padding:6px 12px; border-radius:var(--v2-r-pill); border:1px solid var(--v2-line2);
    color:var(--v2-txt2); font:13px var(--v2-sans); background:transparent}
  .puce.lien{cursor:pointer}
  .puce.lien:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
  .texte{margin:0 0 8px; font-size:14px; line-height:1.55; color:var(--v2-txt2); max-width:80ch}
</style>
