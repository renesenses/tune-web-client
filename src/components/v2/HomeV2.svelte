<script lang="ts">
  /**
   * Accueil du nouveau client (direction Levente).
   *
   * REFONTE (Bertrand, 28/08 — « laid, et je pèse mes mots »). Les defauts
   * constates sur capture, et ce qui y repond :
   *
   *  - la page s'ouvrait sur quatre carres gris portant une lettre geante :
   *    la premiere chose vue etait une pochette MANQUANTE. Un HERO ancre
   *    desormais la page sur un album qui a une pochette, et le repli n'est
   *    plus une lettre sur aplat mais une vignette dessinee, teintee d'apres
   *    le titre — deux albums differents n'ont jamais la meme.
   *  - les rangees debordaient a droite, coupees en plein milieu, sans rien
   *    indiquer qu'on pouvait defiler : fondu de bord + fleches.
   *  - un tiers de la page restait vide : deux rangees de plus, tirees des
   *    donnees DEJA chargees (aucun appel supplementaire).
   *  - les statistiques trainaient en bas, orphelines : remontees en tete.
   */
  import * as api from '../../lib/api';
  import type { ArtistReleaseGroup } from '../../lib/api';
  import { albums } from '../../lib/stores/library';
  import { currentZoneId } from '../../lib/stores/zones';
  import { activeView } from '../../lib/stores/navigation';
  import { pendingStreamingArtist } from '../../lib/stores/streaming';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { formatNumber, getQualityTier } from '../../lib/utils';
  import type { Album } from '../../lib/types';
  import AlbumArt from '../AlbumArt.svelte';
  import '../../styles/tune-v2.css';

  const showMore = $derived(atLeast($preferences.settingsLevel, 'intermediate'));

  let cont = $state<any[]>([]);
  let recent = $state<Album[]>([]);
  let groups = $state<ArtistReleaseGroup[]>([]);
  let stats = $state<{ tracks: number; albums: number; artists: number } | null>(null);

  $effect(() => {
    api.getContinueListening(12).then((r) => (cont = r ?? [])).catch(() => {});
    api.getRecentAlbums(24).then((r) => (recent = r ?? [])).catch(() => {});
    api.getArtistReleases(12).then((r) => (groups = r ?? [])).catch(() => {});
    api.getLibraryStats().then((r) => (stats = r)).catch(() => {});
  });

  const hour = new Date().getHours();
  const hello = hour < 6 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  /** Le HERO privilegie un album qui a une POCHETTE : ouvrir sur un carre
   *  gris donne l'impression d'une bibliotheque cassee. On garde l'ordre de
   *  pertinence (reprise > recent) et on descend jusqu'au premier illustre. */
  const hero = $derived.by(() => {
    const pool = [...cont, ...recent, ...$albums];
    return pool.find((a: any) => a?.cover_path) ?? pool[0] ?? null;
  });

  /** Ajouts recents : tire des albums DEJA en memoire, sans appel reseau.
   *  N'apparait que si `added_at` est reellement renseigne — un classement
   *  qui ne classe rien vaut moins que pas de rangee du tout. */
  const added = $derived(
    $albums.some((a) => (a.added_at ?? 0) > 0)
      ? [...$albums].sort((a, b) => (b.added_at ?? 0) - (a.added_at ?? 0)).slice(0, 18)
      : []
  );

  /** Une poignee d'albums au hasard, illustres de preference. Le tirage est
   *  STABLE tant que la bibliotheque ne change pas : une rangee qui se
   *  reordonne a chaque rendu est illisible. */
  const surprise = $derived.by(() => {
    const withArt = $albums.filter((a) => a.cover_path);
    const pool = withArt.length >= 8 ? withArt : $albums;
    if (!pool.length) return [];
    const out: Album[] = [];
    const step = Math.max(1, Math.floor(pool.length / 18));
    for (let i = 0; i < pool.length && out.length < 18; i += step) out.push(pool[i]);
    return out;
  });

  /** Teinte deterministe tiree du titre : deux albums sans pochette n'ont
   *  jamais la meme vignette, et la meme revient a chaque affichage. */
  function hue(s: string): number {
    let h = 0;
    for (let i = 0; i < (s ?? '').length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }

  function playAlbum(id: number | null | undefined) {
    const zid = $currentZoneId;
    if (zid == null || id == null) return;
    api.play(zid, { album_id: id }).catch(() => {});
  }
  function openArtist(name: string) {
    pendingStreamingArtist.set({ id: null, source_id: null, name } as any);
    activeView.set('streaming');
  }
  function qLabel(a: any): string {
    const tier = getQualityTier(a);
    if (tier === 'dsd') return 'DSD';
    const r = a?.sample_rate ? `${Math.round(a.sample_rate / 100) / 10} kHz` : '';
    const d = a?.bit_depth ? `${a.bit_depth}-bit` : '';
    return [a?.format?.toUpperCase(), r, d].filter(Boolean).join(' · ');
  }

  /** Defilement d'une rangee, d'environ une page. */
  function scrollRow(e: MouseEvent, dir: -1 | 1) {
    const row = (e.currentTarget as HTMLElement).closest('.rowwrap')?.querySelector('.row') as HTMLElement | null;
    if (row) row.scrollBy({ left: dir * Math.max(320, row.clientWidth * 0.8), behavior: 'smooth' });
  }
</script>

<section class="v2-home tune-v2">
  <header class="top">
    <div class="ttl">
      <div class="hello">{hello}</div>
      <h1>Votre musique</h1>
    </div>
    {#if showMore && stats}
      <!-- Les statistiques etaient orphelines en bas de page ; elles disent
           l'ampleur de la collection, leur place est en tete. -->
      <div class="stats">
        <span><b>{formatNumber(stats.tracks)}</b> titres</span>
        <span><b>{formatNumber(stats.albums)}</b> albums</span>
        <span><b>{formatNumber(stats.artists)}</b> artistes</span>
      </div>
    {/if}
  </header>

  <div class="scroll">
    {#if hero}
      {@const h = hero as any}
      <section class="hero">
        <span class="hart">
          {#if h.cover_path}
            <AlbumArt coverPath={h.cover_path} albumId={h.album_id ?? h.id ?? null} size={420} alt={h.title ?? ''} source={h.source} />
          {:else}
            {@render blank(h.title ?? '', 84)}
          {/if}
        </span>
        <div class="hmeta">
          <div class="hkicker">{cont.length ? 'Reprendre l’écoute' : 'La dernière fois'}</div>
          <h2>{h.title ?? h.album_title ?? ''}</h2>
          <div class="hart2">{h.artist_name ?? ''}</div>
          {#if qLabel(h)}<div class="hq">{qLabel(h)}</div>{/if}
          <button class="play" onclick={() => playAlbum(h.album_id ?? h.id)}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8V4z"/></svg>
            Lire
          </button>
        </div>
      </section>
    {/if}

    {#if cont.length}{@render band('Reprendre l’écoute', cont)}{/if}
    {#if recent.length}{@render band('Récemment joué', recent)}{/if}
    {#if added.length}{@render band('Ajoutés récemment', added)}{/if}
    {#if surprise.length}{@render band('Au hasard dans votre bibliothèque', surprise)}{/if}

    {#if showMore && groups.length}
      <section class="rowsec">
        <h2>Nouveautés de vos artistes</h2>
        {#each groups as g (g.artist_name)}
          <div class="artist-line">
            <button class="artist-name" onclick={() => openArtist(g.artist_name)}>{g.artist_name}</button>
            <div class="rowwrap">
              <div class="row">
                {#each g.releases as r (r.source_id)}
                  <div class="tile small">
                    <span class="cv">
                      {#if r.cover_path}
                        <AlbumArt coverPath={r.cover_path} albumId={null} size={200} alt={r.title} source={r.service as any} />
                      {:else}{@render blank(r.title ?? '', 30)}{/if}
                    </span>
                    <span class="tt">{r.title}</span>
                    {#if r.year}<span class="ta">{r.year}</span>{/if}
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/each}
      </section>
    {/if}

    {#if !hero && !recent.length}
      <div class="empty">
        <p>Votre bibliothèque est vide.</p>
        <button class="lnk" onclick={() => activeView.set('settings')}>Déclarer un dossier de musique</button>
      </div>
    {/if}
  </div>
</section>

<!-- Vignette de repli : teinte deduite du titre + note. Remplace la lettre
     geante sur aplat gris, qui donnait a la page un air de bibliotheque
     cassee des la premiere rangee. -->
{#snippet blank(title: string, glyph: number)}
  <span class="blank" style="--hh:{hue(title)}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" style="width:{glyph}px;height:{glyph}px">
      <path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>
    </svg>
  </span>
{/snippet}

{#snippet band(titre: string, items: any[])}
  <section class="rowsec">
    <div class="rhead">
      <h2>{titre}</h2>
      <div class="arrows">
        <button onclick={(e) => scrollRow(e, -1)} aria-label="Précédent">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 6l-6 6 6 6"/></svg>
        </button>
        <button onclick={(e) => scrollRow(e, 1)} aria-label="Suivant">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 6l6 6-6 6"/></svg>
        </button>
      </div>
    </div>
    <div class="rowwrap">
      <div class="row">
        {#each items as it, i ((it.album_id ?? it.id ?? i) + '@' + i)}
          <button class="tile" onclick={() => playAlbum(it.album_id ?? it.id)}>
            <span class="cv">
              {#if it.cover_path}
                <AlbumArt coverPath={it.cover_path} albumId={it.album_id ?? it.id ?? null} size={280} alt={it.title ?? ''} source={it.source} />
              {:else}{@render blank(it.title ?? it.album_title ?? '', 34)}{/if}
              <span class="pbtn">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8V4z"/></svg>
              </span>
            </span>
            <span class="tt">{it.title ?? it.album_title ?? ''}</span>
            <span class="ta">{it.artist_name ?? ''}</span>
          </button>
        {/each}
      </div>
    </div>
  </section>
{/snippet}

<style>
  .v2-home{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .top{display:flex; align-items:flex-end; justify-content:space-between; gap:24px; padding:22px 30px 8px; padding-right:96px}
  .hello{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .stats{display:flex; gap:20px; padding-bottom:6px}
  .stats span{font:11.5px var(--v2-mono); color:var(--v2-txt3)}
  .stats b{font:700 13px var(--v2-sans); color:var(--v2-txt2); margin-right:5px}

  .scroll{flex:1; overflow-y:auto; padding:10px 0 40px}
  .scroll::-webkit-scrollbar{width:9px}.scroll::-webkit-scrollbar-thumb{background:var(--v2-line2); border-radius:6px}

  /* HERO : le point d'ancrage de la page. */
  .hero{display:flex; align-items:center; gap:28px; margin:4px 30px 26px; padding:22px 26px;
    border-radius:18px; border:1px solid var(--v2-line);
    background:linear-gradient(120deg, var(--v2-surface2), var(--v2-bg) 70%)}
  .hart{width:168px; height:168px; flex:0 0 auto; border-radius:10px; overflow:hidden; box-shadow:var(--v2-sh-lg)}
  .hmeta{min-width:0; display:flex; flex-direction:column; gap:7px}
  .hkicker{font:600 10.5px var(--v2-mono); letter-spacing:.14em; text-transform:uppercase; color:var(--v2-acc1)}
  .hmeta h2{font-size:34px; font-weight:800; line-height:1.1; letter-spacing:-.015em;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .hart2{font-size:16px; color:var(--v2-txt2)}
  .hq{font:11px var(--v2-mono); color:var(--v2-acc2)}
  .play{display:inline-flex; align-items:center; gap:9px; align-self:flex-start; margin-top:10px;
    height:44px; padding:0 22px; border:0; border-radius:var(--v2-r-pill); cursor:pointer;
    font:700 14px var(--v2-sans); color:var(--v2-on-acc);
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); box-shadow:0 6px 18px var(--v2-glow-strong)}
  .play svg{width:16px; height:16px}

  .rowsec{padding:6px 0 18px}
  .rhead{display:flex; align-items:center; justify-content:space-between; gap:16px; padding:0 30px 12px}
  .rowsec h2{font-size:18px; font-weight:700}
  .arrows{display:flex; gap:5px}
  .arrows button{width:30px; height:30px; border-radius:9px; cursor:pointer; display:grid; place-items:center;
    border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2)}
  .arrows button:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .arrows svg{width:15px; height:15px}

  /* Fondu de bord : dit qu'il reste du contenu a droite, la ou la rangee
     etait auparavant tranchee net au milieu d'une pochette. */
  .rowwrap{position:relative}
  .rowwrap::after{content:""; position:absolute; top:0; bottom:0; right:0; width:64px; pointer-events:none;
    background:linear-gradient(90deg, transparent, var(--v2-bg))}
  .row{display:flex; gap:18px; overflow-x:auto; padding:2px 30px 10px; scrollbar-width:none; scroll-behavior:smooth}
  .row::-webkit-scrollbar{display:none}

  .tile{flex:0 0 158px; width:158px; border:0; background:transparent; color:inherit; cursor:pointer;
    text-align:left; padding:0; display:flex; flex-direction:column}
  .tile.small{flex-basis:128px; width:128px}
  .cv{position:relative; display:block; aspect-ratio:1; border-radius:var(--v2-r-card); overflow:hidden;
    box-shadow:var(--v2-sh-card); transition:.18s}
  .tile:hover .cv{box-shadow:0 10px 24px var(--v2-glow)}
  .pbtn{position:absolute; right:8px; bottom:8px; width:36px; height:36px; border-radius:50%;
    display:grid; place-items:center; color:var(--v2-on-acc);
    background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); box-shadow:0 4px 12px rgba(0,0,0,.45);
    opacity:0; transform:translateY(6px); transition:.16s}
  .tile:hover .pbtn{opacity:1; transform:none}
  .pbtn svg{width:15px; height:15px; margin-left:2px}
  .tt{margin-top:9px; font:600 13px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ta{margin-top:2px; font:11px var(--v2-sans); color:var(--v2-txt2); white-space:nowrap; overflow:hidden;
    text-overflow:ellipsis; min-height:14px}

  .blank{display:grid; place-items:center; width:100%; height:100%;
    color:hsl(var(--hh) 42% 78% / .65);
    background:linear-gradient(145deg, hsl(var(--hh) 34% 26%), hsl(var(--hh) 30% 15%))}

  .artist-line{padding:2px 0 12px}
  .artist-name{border:0; background:transparent; color:var(--v2-txt); font:700 15px var(--v2-sans); cursor:pointer;
    padding:0 30px 8px}
  .artist-name:hover{color:var(--v2-acc-tint)}

  .empty{display:flex; flex-direction:column; align-items:flex-start; gap:14px; padding:50px 30px; color:var(--v2-txt2)}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:9px 17px; font:600 12.5px var(--v2-sans)}
  .lnk:hover{border-color:var(--v2-acc2); color:var(--v2-acc-tint)}
</style>
