<script lang="ts">
  /**
   * Radio en direct — nouveau client (direction Levente).
   *
   * Entrée du NOYAU : présente à tous les niveaux, comme dans le brouillon v3.
   * Densité par niveau :
   *   Essentiel → favoris en tête, puis toutes les stations. Lecture, favori.
   *   Avancé    → filtres par genre + recherche.
   *   Expert    → codec et pays affichés sur la vignette.
   *
   * Subtilité reprise de l'écran actuel, à ne pas perdre : sur une zone
   * NAVIGATEUR, le serveur ne peut pas sortir le son — il renvoie l'URL du
   * flux et c'est à la page de le lire. Sans ce relais, cliquer sur une
   * station reste silencieux.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { currentZoneId, currentZone } from '../../lib/stores/zones';
  import { isBrowserZone, browserPlay } from '../../lib/stores/browserAudio';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { fold } from '../../lib/utils';
  import type { RadioStation } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import PochetteActions from './PochetteActions.svelte';
  import RadioEditModale from './RadioEditModale.svelte';
  import '../../styles/tune-v2.css';

  const level = $derived($preferences.settingsLevel);
  const showFilters = $derived(atLeast(level, 'intermediate'));
  const showExpert = $derived(atLeast(level, 'expert'));

  let radios = $state<RadioStation[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let q = $state('');
  let genre = $state<string | null>(null);
  let playingId = $state<number | null>(null);

  $effect(() => {
    loading = true; error = null;
    api.getRadios({ limit: 500 })
      .then((r) => { radios = r ?? []; })
      .catch(() => { error = $t('v2.radio.loadFailed' as any); })
      .finally(() => { loading = false; });
  });

  /** Genres réellement présents, comptés — pas une liste figée qui
   *  proposerait des rubriques vides. */
  const genres = $derived.by(() => {
    const m = new Map<string, number>();
    for (const r of radios) {
      const g = r.genre?.trim();
      if (g) m.set(g, (m.get(g) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12);
  });

  function matches(r: RadioStation): boolean {
    if (genre && r.genre?.trim() !== genre) return false;
    if (q) {
      const n = fold(q);
      if (!fold(r.name).includes(n) && !fold(r.genre).includes(n) && !fold(r.country).includes(n)) return false;
    }
    return true;
  }
  const shown = $derived(radios.filter(matches));
  const favorites = $derived(shown.filter((r) => r.favorite));
  const others = $derived(shown.filter((r) => !r.favorite));

  /** Station en cours d'édition — le bouton haut-droit de la pochette. */
  let enEdition = $state<RadioStation | null>(null);

  /**
   * Gabarit de création : la même modale, sans `id`.
   *
   * L'écran renvoyait au client actuel pour ajouter une station, alors que le
   * formulaire — nom, flux, logo, genre, pays, site — existait déjà ici pour
   * la modification. Il ne manquait que le bouton et l'appel.
   */
  function nouvelleStation() {
    enEdition = {
      id: null, name: '', stream_url: '', logo_url: '', genre: '', country: '', homepage_url: '',
    } as unknown as RadioStation;
  }

  async function play(r: RadioStation) {
    const zid = $currentZoneId;
    if (r.id == null || zid == null) return;
    playingId = r.id;
    try {
      const res: any = await api.playRadio(r.id, zid);
      // Zone navigateur : le serveur n'a pas de sortie audio, c'est la page
      // qui doit lire le flux qu'il renvoie.
      if (isBrowserZone($currentZone) && res?.stream_url) browserPlay(res.stream_url);
    } catch {
      error = `Lecture impossible : ${r.name}`;
    }
  }

  // `e` n'est plus nécessaire : `PochetteActions` arrête déjà le geste.
  async function toggleFav(r: RadioStation) {
    if (r.id == null) return;
    try {
      const up = await api.updateRadio(r.id, { favorite: !r.favorite });
      radios = radios.map((x) => (x.id === up.id ? up : x));
    } catch { /* le serveur signale déjà l'échec */ }
  }

  function tech(r: RadioStation): string {
    return [r.codec?.toUpperCase(), r.country].filter(Boolean).join(' · ');
  }
</script>

<section class="v2-radios tune-v2">
  <!-- En-tête partagé (`styles/tune-v2.css`). L'ordre est le même sur tous les
       écrans : titre, RECHERCHE, actions secondaires, action primaire. Ici la
       recherche passait APRÈS le bouton « Nouvelle station ». -->
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.radio.eyebrow' as any)}</div>
      <h1>{$t('v2.radio.title' as any)}</h1>
    </div>
    <div class="v2-actions">
      <div class="v2-rech">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input placeholder={$t('v2.radio.searchPlaceholder' as any)} bind:value={q} />
        {#if q}
          <button class="clr" onclick={() => (q = '')} aria-label="Effacer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        {/if}
      </div>
      <button class="v2-btn primaire" onclick={nouvelleStation}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        {$t('v2.radio.create' as any)}
      </button>
    </div>
  </header>

  {#if showFilters && genres.length}
    <div class="chips">
      <button class="chip" class:active={!genre} onclick={() => (genre = null)}>Tous ({shown.length})</button>
      {#each genres as [g, n] (g)}
        <button class="chip" class:active={genre === g} onclick={() => (genre = genre === g ? null : g)}>{g} <span>{n}</span></button>
      {/each}
    </div>
  {/if}

  <div class="scroll">
    {#if loading}
      <div class="state">{$t('v2.radio.loading' as any)}</div>
    {:else if error}
      <div class="state err">{error}</div>
    {:else if !radios.length}
      <div class="state">{$t('v2.radio.none' as any)}</div>
    {:else if !shown.length}
      <div class="state">{$t('v2.radio.noMatch' as any)}</div>
    {:else}
      {#if favorites.length}
        <section class="sec">
          <h2>{$t('nav.favorites' as any)}</h2>
          <div class="grid">
            {#each favorites as r (r.id)}
              {@render tile(r)}
            {/each}
          </div>
        </section>
      {/if}
      {#if others.length}
        <section class="sec">
          {#if favorites.length}<h2>{$t('v2.radio.allStations' as any)}</h2>{/if}
          <div class="grid">
            {#each others as r (r.id)}
              {@render tile(r)}
            {/each}
          </div>
        </section>
      {/if}
    {/if}
  </div>

  {#if enEdition}
    {@const cible = enEdition}
    <RadioEditModale
      radio={cible}
      onClose={() => (enEdition = null)}
      onSaved={(maj) => {
        // Une station CRÉÉE n'est dans aucune ligne à remplacer : elle rejoint
        // la liste. Sans ce cas, le `map` ne trouverait rien et la nouvelle
        // station n'apparaîtrait qu'au prochain chargement de l'écran.
        radios = cible.id == null
          ? [...radios, maj]
          : radios.map((x) => (x.id === maj.id ? { ...x, ...maj } : x));
        enEdition = null;
      }}
    />
  {/if}
</section>

{#snippet tile(r: RadioStation)}
  <div class="st" class:live={playingId === r.id}>
    <span class="cv">
      <!-- Le MÊME composant que les pochettes d'album : une seule apparence de
           cœur dans toute l'interface. La radio avait le sien — rond, en haut à
           droite, d'une autre couleur — et deux cœurs différents se lisent
           comme deux choses différentes (Bertrand, 02/09/2026).
           Son favori ne vit pas dans `favorites` mais dans sa propre table,
           d'où `favoriExterne` : même apparence, bascule propre. -->
      <PochetteActions
        favoriExterne={r.id != null
          ? { actif: !!r.favorite, basculer: () => toggleFav(r) }
          : null}
        onEditer={r.id != null ? () => (enEdition = r) : null}
        onLire={() => play(r)}
        onOuvrir={() => play(r)}
        nom={r.name}
      >
        <AlbumArt coverPath={r.logo_url ?? null} albumId={null} size={0} alt={r.name} fallbackInitials={r.name?.slice(0,1)} />
      </PochetteActions>
      {#if playingId === r.id}<span class="onair">{$t('v2.lbl.liveNow' as any)}</span>{/if}
    </span>
    <span class="nm">{r.name}</span>
    {#if r.genre}<span class="gn">{r.genre}</span>{/if}
    {#if showExpert && tech(r)}<span class="tk">{tech(r)}</span>{/if}
  </div>
{/snippet}

<style>
  .v2-radios{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}

  .chips{display:flex; gap:7px; flex-wrap:wrap; padding:4px 30px 12px}
  .chip{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:600 11.5px var(--v2-sans); padding:6px 12px; border-radius:var(--v2-r-pill); transition:.15s}
  .chip span{font-family:var(--v2-mono); font-size:9.5px; color:var(--v2-txt3); margin-left:5px}
  .chip:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .chip.active{color:var(--v2-on-acc); border-color:transparent; background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .chip.active span{color:var(--v2-on-acc); opacity:.75}

  .scroll{flex:1; overflow-y:auto; padding:4px 0 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}
  .state{padding:30px; color:var(--v2-txt3)} .state.err{color:var(--v2-danger)}
  .sec{padding:8px 30px 18px}
  .sec h2{font-size:17px; font-weight:700; padding-bottom:14px}
  .grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:20px}

  .st{position:relative; display:flex; flex-direction:column}
  .open{position:absolute; inset:0; z-index:1; border:0; background:transparent; cursor:pointer; border-radius:var(--v2-r-card)}
  .open:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
  .cv{position:relative; display:block; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden;
    box-shadow:var(--v2-sh-card); transition:.18s}
  .st:hover .cv{box-shadow:0 10px 24px var(--v2-glow)}
  .onair{position:absolute; left:8px; bottom:8px; z-index:2; font:700 8.5px var(--v2-mono); letter-spacing:.12em;
    color:var(--v2-on-acc); background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); padding:3px 7px; border-radius:5px}
  .nm{margin-top:9px; font:600 13px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .gn{margin-top:2px; font:11px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .tk{margin-top:2px; font:9.5px var(--v2-mono); color:var(--v2-acc2)}
  .fav{position:absolute; top:8px; right:8px; z-index:2; width:30px; height:30px; border-radius:50%; cursor:pointer;
    border:0; background:rgba(0,0,0,.45); color:#fff; display:grid; place-items:center; opacity:0; transition:.16s}
  .st:hover .fav, .fav.on{opacity:1}
  .fav.on{color:var(--v2-acc1)}
  .fav svg{width:15px; height:15px}
</style>
