<script lang="ts">
  /**
   * Recherche de Nocturne (itération 6) : un panneau latéral droit par-dessus
   * le contenu voilé, comme la file. Champ, puis filtres en pastilles (Tout,
   * Albums, Artistes, Titres) sur la recherche de la BIBLIOTHÈQUE
   * (`api.searchLibrary`, la même que la coquille v2). « Recherche complète »
   * passe la requête à l'écran Recherche de Tune (`pendingSearchQuery`), qui
   * interroge aussi les services de streaming.
   */
  import Search from '@lucide/svelte/icons/search';
  import X from '@lucide/svelte/icons/x';
  import Mic from '@lucide/svelte/icons/mic';
  import { preferences } from '../../lib/stores/preferences';
  import Play from '@lucide/svelte/icons/play';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import type { Album, Artist, Track } from '../../lib/types';
  import { formatTime } from '../../lib/utils';
  import { pendingSearchQuery } from '../../lib/stores/navigation';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import { allerA, ouvrirTune } from './navigationNocturne';
  import { lirePistes } from './lectureNocturne';
  import { filtrerResultats, FILTRES_RECHERCHE, reconnaissanceVocale, type FiltreRecherche } from './rechercheNocturne';

  interface Props { ouvert: boolean; fermer: () => void }
  let { ouvert, fermer }: Props = $props();

  let requete = $state('');
  let filtre = $state<FiltreRecherche>('tout');
  let resultats = $state<{ albums: Album[]; artists: Artist[]; tracks: Track[] } | null>(null);
  let enCours = $state(false);
  let champ = $state<HTMLInputElement | null>(null);

  $effect(() => { if (ouvert) queueMicrotask(() => champ?.focus()); });

  // Recherche après une courte pause de frappe ; la dernière requête gagne.
  $effect(() => {
    const q = requete.trim();
    if (!q) { resultats = null; enCours = false; return; }
    enCours = true;
    const minuteur = setTimeout(() => {
      api.searchLibrary(q, 30)
        .then((r) => { if (requete.trim() === q) resultats = { albums: r?.albums ?? [], artists: r?.artists ?? [], tracks: r?.tracks ?? [] }; })
        .catch(() => { if (requete.trim() === q) resultats = { albums: [], artists: [], tracks: [] }; })
        .finally(() => { if (requete.trim() === q) enCours = false; });
    }, 250);
    return () => clearTimeout(minuteur);
  });

  const vus = $derived(filtrerResultats(resultats, filtre));
  const LIBELLE_FILTRE: Record<FiltreRecherche, string> = {
    tout: 'nocturne.recherche.tout', albums: 'common.albums', artistes: 'common.artists', titres: 'nocturne.recherche.titres',
  };

  /* Itération 7 — dictée, seulement si le navigateur sait la faire. */
  const Dictee = reconnaissanceVocale();
  let ecoute = $state(false);
  let dictee: any = null;
  function dicter() {
    if (!Dictee) return;
    if (ecoute) { dictee?.stop(); return; }
    try {
      dictee = new Dictee();
      dictee.lang = $preferences.language ?? 'fr';
      dictee.interimResults = true;
      dictee.onresult = (e: any) => {
        requete = Array.from(e.results as ArrayLike<any>).map((x: any) => x[0]?.transcript ?? '').join('');
      };
      dictee.onend = () => { ecoute = false; };
      dictee.onerror = () => { ecoute = false; };
      ecoute = true;
      dictee.start();
    } catch { ecoute = false; }
  }
  $effect(() => { if (!ouvert) dictee?.stop(); });

  function aller(e: Parameters<typeof allerA>[0]) { allerA(e); fermer(); }
  function rechercheComplete() {
    pendingSearchQuery.set(requete.trim());
    ouvrirTune('search');
    fermer();
  }
  function clavier(e: KeyboardEvent) {
    if (ouvert && e.key === 'Escape') { e.stopPropagation(); fermer(); }
  }
</script>

<svelte:window onkeydown={clavier} />

{#if ouvert}
  <div class="noc-rech-voile" onclick={fermer} aria-hidden="true"></div>
  <aside class="noc-rech" aria-label={$t('nav.search')} data-panneau-recherche>
    <header class="noc-rech-tete">
      <label class="noc-rech-champ">
        <Search size={17} />
        <input bind:this={champ} type="search" bind:value={requete} placeholder={$t('nocturne.recherche.placeholder' as any)}
          aria-label={$t('nav.search')} />
        {#if Dictee}
          <button type="button" class="noc-rech-micro" class:actif={ecoute} aria-pressed={ecoute} onclick={dicter}
            aria-label={$t('nocturne.recherche.micro' as any)} title={$t('nocturne.recherche.micro' as any)} data-micro-recherche>
            <Mic size={16} />
          </button>
        {/if}
      </label>
      <button type="button" class="noc-rech-fermer" onclick={fermer} aria-label={$t('common.close')} title={$t('common.close')}><X size={16} /></button>
    </header>
    <div class="noc-rech-filtres" role="group" aria-label={$t('nav.search')}>
      {#each FILTRES_RECHERCHE as f (f)}
        <button type="button" class="noc-rech-filtre" aria-pressed={filtre === f} onclick={() => (filtre = f)}>{$t(LIBELLE_FILTRE[f] as any)}</button>
      {/each}
    </div>

    <div class="noc-rech-corps">
      {#if !requete.trim()}
        <div class="noc-rech-vide">
          <Search size={34} />
          <p class="noc-rech-vide-titre">{$t('nocturne.recherche.videTitre' as any)}</p>
          <p class="noc-rech-vide-aide">{$t('nocturne.recherche.videAide' as any)}</p>
        </div>
      {:else if enCours && !resultats}
        <p class="noc-rech-etat">{$t('common.loading')}</p>
      {:else if vus.albums.length + vus.artists.length + vus.tracks.length === 0}
        <p class="noc-rech-etat">{$t('common.noResult')}</p>
      {:else}
        {#if vus.artists.length}
          <h3>{$t('common.artists')}</h3>
          <ul>
            {#each vus.artists as a (a.id)}
              <li><button type="button" class="noc-rech-ligne" onclick={() => a.id != null && aller({ nom: 'artiste', id: a.id })}>
                <span class="noc-rech-vignette rond"><AlbumArt coverPath={a.image_path ?? null} size={0} recadrer alt="" fallbackInitials={(a.name ?? '').slice(0, 1).toUpperCase()} /></span>
                <span class="noc-rech-textes"><span class="noc-rech-titre" title={a.name}>{a.name}</span><span class="noc-rech-type">{$t('common.artist')}</span></span>
              </button></li>
            {/each}
          </ul>
        {/if}
        {#if vus.albums.length}
          <h3>{$t('common.albums')}</h3>
          <ul>
            {#each vus.albums as al (al.id)}
              <li><button type="button" class="noc-rech-ligne" onclick={() => al.id != null && aller({ nom: 'album', id: al.id })}>
                <span class="noc-rech-vignette"><AlbumArt coverPath={al.cover_path ?? null} albumId={al.id ?? null} size={0} alt="" /></span>
                <span class="noc-rech-textes"><span class="noc-rech-titre" title={al.title}>{al.title}</span><span class="noc-rech-sous" title={al.artist_name ?? ''}>{al.artist_name ?? ''}</span></span>
              </button></li>
            {/each}
          </ul>
        {/if}
        {#if vus.tracks.length}
          <h3>{$t('common.tracks')}</h3>
          <ul>
            {#each vus.tracks as p, i (p.id ?? i)}
              <li><button type="button" class="noc-rech-ligne" onclick={() => lirePistes(vus.tracks.map((x) => x.id).filter((x): x is number => x != null), i)}
                aria-label={$t('v2.queue.playTrack').replace('{t}', p.title)}>
                <span class="noc-rech-vignette"><AlbumArt coverPath={p.cover_path ?? null} albumId={p.album_id ?? null} size={0} alt="" /><span class="noc-rech-lire"><Play size={12} fill="currentColor" /></span></span>
                <span class="noc-rech-textes"><span class="noc-rech-titre" title={p.title}>{p.title}</span><span class="noc-rech-sous" title={p.artist_name ?? ''}>{p.artist_name ?? ''}</span></span>
                <span class="noc-rech-duree">{formatTime(p.duration_ms)}</span>
              </button></li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>

    {#if requete.trim()}
      <button type="button" class="noc-rech-complete" onclick={rechercheComplete}>{$t('nocturne.recherche.complete' as any)}</button>
    {/if}
  </aside>
{/if}

<style>
  .noc-rech-voile {
    position: fixed;
    inset: 0;
    z-index: 55;
    background: var(--noc-voile);
    backdrop-filter: blur(var(--noc-flou-voile));
    -webkit-backdrop-filter: blur(var(--noc-flou-voile));
  }
  .noc-rech {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 56;
    width: min(var(--noc-largeur-recherche), 100vw);
    display: flex;
    flex-direction: column;
    background: var(--noc-fond-file);
    border-left: 1px solid var(--noc-ligne);
    box-shadow: var(--noc-panneau-ombre);
  }
  .noc-rech-tete { display: flex; align-items: center; gap: 10px; padding: 18px var(--noc-marge-page) 12px; }
  .noc-rech-champ {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    height: var(--noc-cible-tactile);
    padding: 0 14px;
    border: 1px solid var(--noc-ligne);
    border-radius: var(--noc-rayon-pilule);
    background: var(--noc-surface);
    color: var(--noc-texte-2);
  }
  .noc-rech-champ:focus-within { border-color: var(--noc-focus); }
  .noc-rech-champ input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--noc-texte);
    font: inherit;
    font-size: var(--noc-taille-texte);
    outline: none;
  }
  .noc-rech-micro {
    flex: none;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    margin-right: -8px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--noc-texte-2);
    cursor: pointer;
  }
  .noc-rech-micro:hover { color: var(--noc-texte); }
  .noc-rech-micro.actif { background: var(--noc-ambre); color: var(--noc-sur-ambre); }
  .noc-rech-fermer {
    flex: none;
    width: var(--noc-bouton-fermer-file);
    height: var(--noc-bouton-fermer-file);
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: var(--noc-surface-2);
    color: var(--noc-texte);
    cursor: pointer;
  }
  .noc-rech-filtres { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 var(--noc-marge-page) 12px; border-bottom: 1px solid var(--noc-ligne); }
  .noc-rech-filtre {
    padding: 6px 14px;
    border: 1px solid var(--noc-ligne);
    border-radius: var(--noc-rayon-pilule);
    background: transparent;
    color: var(--noc-texte-2);
    font: inherit;
    font-size: var(--noc-taille-petit);
    font-weight: var(--noc-graisse-moyenne);
    cursor: pointer;
  }
  .noc-rech-filtre[aria-pressed='true'] { background: var(--noc-ambre); border-color: transparent; color: var(--noc-sur-ambre); }
  .noc-rech-corps { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 12px 16px; }
  .noc-rech-corps h3 {
    margin: 14px 12px 6px;
    font-size: var(--noc-taille-surtitre);
    font-weight: var(--noc-graisse-forte);
    letter-spacing: var(--noc-interlettre-surtitre);
    text-transform: uppercase;
    color: var(--noc-texte-3);
  }
  .noc-rech-corps ul { list-style: none; margin: 0; padding: 0; }
  .noc-rech-ligne {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    border: 0;
    border-radius: var(--noc-rayon);
    background: none;
    color: var(--noc-texte);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .noc-rech-ligne:hover { background: var(--noc-surface-2); }
  .noc-rech-vignette { position: relative; flex: none; width: var(--noc-pochette-file); height: var(--noc-pochette-file); border-radius: var(--noc-rayon); overflow: hidden; background: var(--noc-pochette-fond); }
  .noc-rech-vignette.rond { border-radius: 50%; }
  .noc-rech-vignette :global(img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .noc-rech-lire { position: absolute; inset: 0; display: grid; place-items: center; background: var(--noc-voile); opacity: 0; transition: opacity var(--noc-duree); }
  .noc-rech-ligne:hover .noc-rech-lire { opacity: 1; }
  .noc-rech-textes { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .noc-rech-titre, .noc-rech-sous { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .noc-rech-titre { font-size: var(--noc-taille-texte); font-weight: var(--noc-graisse-forte); }
  .noc-rech-sous, .noc-rech-type { font-size: var(--noc-taille-petit); color: var(--noc-texte-2); }
  .noc-rech-duree { flex: none; font-size: var(--noc-taille-mini); color: var(--noc-texte-3); font-variant-numeric: tabular-nums; }
  .noc-rech-vide { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 18vh; padding: 0 24px; text-align: center; color: var(--noc-texte-3); }
  .noc-rech-vide-titre { margin: 6px 0 0; color: var(--noc-texte); font-size: var(--noc-taille-texte); font-weight: var(--noc-graisse-forte); }
  .noc-rech-vide-aide { margin: 0; font-size: var(--noc-taille-petit); }
  .noc-rech-etat { margin: 24px 12px; color: var(--noc-texte-3); font-size: var(--noc-taille-petit); }
  .noc-rech-complete {
    flex: none;
    margin: 0 var(--noc-marge-page) 16px;
    height: var(--noc-hauteur-bouton);
    border: 1px solid var(--noc-ambre);
    border-radius: var(--noc-rayon);
    background: transparent;
    color: var(--noc-ambre);
    font: inherit;
    font-size: var(--noc-taille-texte);
    font-weight: var(--noc-graisse-moyenne);
    cursor: pointer;
  }
  .noc-rech-complete:hover { background: var(--noc-ambre-doux); }
</style>
