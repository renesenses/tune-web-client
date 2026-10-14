<script lang="ts">
  /**
   * Favoris radio → playlist Qobuz (go de Bertrand du 14/10/2026).
   *
   * 1. À l'ouverture, le serveur cherche chaque titre capté dans Qobuz
   *    (`match-preview`) — rien n'est encore créé chez Qobuz.
   * 2. Chaque ligne montre la correspondance trouvée ; l'utilisateur la coche
   *    ou l'écarte. Seules les correspondances SÛRES sont cochées d'emblée ;
   *    une approximation, une ambiguïté (choix entre plusieurs pistes) ou un
   *    doublon se valident à la main ; un introuvable est signalé.
   * 3. « Créer » envoie les titres retenus (`track_ids`) : la playlist reçoit
   *    exactement ce que l'écran a montré.
   *
   * Les règles de choix vivent dans `lib/favorisRadioQobuz.ts`.
   */
  import { onMount } from 'svelte';
  import { bulleTexte } from '../../lib/infobulleTexte';
  import { t, locale } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import {
    candidatsDe,
    choixInitial,
    cleBadge,
    nomParDefaut,
    playlistsModifiables,
    selectionnable,
    titresRetenus,
    type ApercuFavorisRadio,
    type Choix,
    type LigneApercu,
  } from '../../lib/favorisRadioQobuz';

  let { onClose }: { onClose: () => void } = $props();

  const SERVICE = 'qobuz';

  let chargement = $state(true);
  let erreur = $state<string | null>(null);
  let apercu = $state<ApercuFavorisRadio | null>(null);
  let choix = $state<Choix>({});
  let nom = $state('');
  let creation = $state(false);
  let resultat = $state<{ added: number; already: number; existante: boolean; add_error: string | null } | null>(null);
  /** '' : nouvelle playlist ; sinon l'identifiant d'une playlist Qobuz à soi. */
  let cible = $state('');
  let mesPlaylists = $state<{ source_id: string; name: string }[]>([]);

  const lignes = $derived<LigneApercu[]>(apercu?.items ?? []);
  const retenus = $derived(titresRetenus(lignes, choix));

  onMount(() => {
    nom = nomParDefaut($t('v2.fav.qobuzDefaultName' as any), new Date(), $locale);
    api
      .getStreamingPlaylists(SERVICE)
      .then((l) => {
        mesPlaylists = playlistsModifiables(l as any[]);
      })
      .catch(() => {
        mesPlaylists = [];
      });
    api
      .previewRadioFavoritesMatch(SERVICE)
      .then((a) => {
        apercu = a;
        choix = choixInitial(a.items ?? []);
      })
      .catch((e: any) => {
        erreur = e?.message ?? $t('v2.fav.qobuzPreviewFailed' as any);
      })
      .finally(() => {
        chargement = false;
      });
  });

  function basculer(l: LigneApercu, coche: boolean) {
    choix = { ...choix, [l.favorite_id]: coche ? (candidatsDe(l)[0]?.id ?? null) : null };
  }

  function choisir(l: LigneApercu, id: string) {
    choix = { ...choix, [l.favorite_id]: id || null };
  }

  function libellePiste(p: { title: string; artist: string; album?: string | null }): string {
    return p.album ? `${p.title} — ${p.artist} · ${p.album}` : `${p.title} — ${p.artist}`;
  }

  async function creer() {
    const n = nom.trim();
    if ((!cible && !n) || !retenus.length || creation) return;
    creation = true;
    erreur = null;
    try {
      const r = await api.createPlaylistFromRadioSelection(SERVICE, n, retenus, cible || null);
      resultat = {
        added: r.added ?? 0,
        already: r.already_present ?? 0,
        existante: !!cible,
        add_error: r.add_error ?? null,
      };
    } catch (e: any) {
      erreur = e?.message ?? $t('v2.fav.createFailed' as any);
    }
    creation = false;
  }
</script>

<div class="fq-fond" role="presentation" onclick={onClose}>
  <form class="fq-modale" onclick={(e) => e.stopPropagation()}
    onsubmit={(e) => { e.preventDefault(); void creer(); }}>
    <h2>{$t('v2.fav.qobuzMakePlaylist' as any)}</h2>

    {#if resultat}
      <p class="fq-sub">
        {resultat.existante
          ? $t('v2.fav.qobuzAdded' as any).replace('{n}', String(resultat.added)).replace('{p}', String(resultat.already))
          : $t('v2.fav.qobuzCreated' as any).replace('{n}', String(resultat.added))}
      </p>
      {#if resultat.add_error}
        <p class="fq-erreur">{$t('v2.fav.qobuzAddFailed' as any)}</p>
      {/if}
      <div class="fq-pied">
        <button type="button" class="fq-btn accent" onclick={onClose}>{$t('common.close' as any)}</button>
      </div>
    {:else if chargement}
      <p class="fq-sub">{$t('v2.fav.qobuzSearching' as any)}</p>
    {:else}
      {#if apercu}
        <p class="fq-sub">
          {$t('v2.fav.qobuzSummary' as any)
            .replace('{ok}', String(apercu.matched))
            .replace('{check}', String(apercu.approximate + apercu.ambiguous))
            .replace('{missing}', String(apercu.not_found + apercu.search_failed))}
        </p>
        <div class="fq-lignes">
          {#each lignes as l (l.favorite_id)}
            {@const candidats = candidatsDe(l)}
            {@const badge = cleBadge(l)}
            <div class="fq-ligne" class:ecartee={!choix[l.favorite_id]}>
              <input type="checkbox" checked={!!choix[l.favorite_id]} disabled={!selectionnable(l)}
                aria-label={$t('v2.fav.qobuzKeep' as any)}
                onchange={(e) => basculer(l, (e.currentTarget as HTMLInputElement).checked)} />
              <div class="fq-texte">
                <span class="fq-capte" use:bulleTexte>{l.title}{l.artist ? ` — ${l.artist}` : ''}</span>
                {#if l.station_name}<span class="fq-station">{l.station_name}</span>{/if}
                {#if candidats.length > 1 && (l.status === 'ambiguous' || l.status === 'approximate')}
                  <select value={choix[l.favorite_id] ?? candidats[0].id}
                    onchange={(e) => choisir(l, (e.currentTarget as HTMLSelectElement).value)}>
                    {#each candidats as p (p.id)}
                      <option value={p.id}>{libellePiste(p)}</option>
                    {/each}
                  </select>
                {:else if candidats.length}
                  <span class="fq-trouve" use:bulleTexte>→ {libellePiste(candidats[0])}</span>
                {/if}
              </div>
              {#if badge}<span class="fq-badge" class:manque={!candidats.length}>{$t(badge as any)}</span>{/if}
            </div>
          {/each}
        </div>
      {/if}

      {#if erreur}<p class="fq-erreur">{erreur}</p>{/if}

      <label class="fq-nom">
        <span>{$t('v2.fav.qobuzTarget' as any)}</span>
        <select bind:value={cible}>
          <option value="">{$t('v2.fav.qobuzNewPlaylist' as any)}</option>
          {#each mesPlaylists as p (p.source_id)}
            <option value={p.source_id}>{p.name}</option>
          {/each}
        </select>
      </label>
      {#if !cible}
        <label class="fq-nom">
          <span>{$t('v2.fav.radioPlaylistName' as any)}</span>
          <input bind:value={nom} onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />
        </label>
      {/if}
      <div class="fq-pied">
        <button type="button" class="fq-btn" onclick={onClose}>{$t('common.cancel' as any)}</button>
        <button type="submit" class="fq-btn accent" disabled={creation || (!cible && !nom.trim()) || !retenus.length}>
          {creation
            ? $t('common.loading' as any)
            : $t((cible ? 'v2.fav.qobuzAddTo' : 'v2.fav.qobuzCreate') as any).replace('{n}', String(retenus.length))}
        </button>
      </div>
    {/if}
  </form>
</div>

<style>
  .fq-fond{position:fixed; inset:0; z-index:900; background:var(--v2-scrim); display:grid; place-items:center; padding:20px}
  .fq-modale{display:flex; flex-direction:column; gap:10px; width:min(640px,100%); max-height:min(80vh,760px); padding:20px;
    background:var(--v2-surface); border:1px solid var(--v2-line2); border-radius:var(--v2-r-card); color:var(--v2-txt)}
  .fq-modale h2{font-size:16px; font-weight:700}
  .fq-sub{color:var(--v2-txt2); font-size:12.5px}
  .fq-erreur{color:var(--v2-danger); font-size:12.5px}
  .fq-lignes{display:flex; flex-direction:column; gap:2px; overflow:auto; min-height:0; flex:1}
  .fq-ligne{display:flex; align-items:flex-start; gap:10px; padding:7px 4px; border-bottom:1px solid var(--v2-line)}
  .fq-ligne.ecartee .fq-texte{opacity:.55}
  .fq-ligne input[type="checkbox"]{margin-top:3px}
  .fq-texte{display:flex; flex-direction:column; gap:2px; min-width:0; flex:1}
  .fq-capte{font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .fq-station{font:10.5px var(--v2-mono); color:var(--v2-txt3)}
  .fq-trouve{font-size:12px; color:var(--v2-txt2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .fq-texte select{background:var(--v2-bg); border:1px solid var(--v2-line2); border-radius:6px; color:var(--v2-txt);
    font:inherit; font-size:12px; padding:3px 6px; max-width:100%}
  .fq-badge{flex:none; font:600 10.5px var(--v2-mono); color:var(--v2-acc1); border:1px solid var(--v2-acc1);
    border-radius:var(--v2-r-pill); padding:2px 7px; white-space:nowrap}
  .fq-badge.manque{color:var(--v2-danger); border-color:var(--v2-danger)}
  .fq-nom{display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--v2-txt2)}
  .fq-nom select{background:var(--v2-bg); border:1px solid var(--v2-line2); border-radius:8px;
    color:var(--v2-txt); font:inherit; font-size:13.5px; padding:8px 10px}
  .fq-nom input{background:var(--v2-bg); border:1px solid var(--v2-line2); border-radius:8px;
    color:var(--v2-txt); font:inherit; font-size:13.5px; padding:9px 11px}
  .fq-pied{display:flex; justify-content:flex-end; gap:8px}
  .fq-btn{display:inline-flex; align-items:center; gap:7px; cursor:pointer;
    border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill); background:transparent;
    color:var(--v2-txt2); font:600 12.5px var(--v2-sans); padding:7px 13px}
  .fq-btn:hover{color:var(--v2-txt); background:var(--v2-hover)}
  .fq-btn.accent{border-color:transparent; background:var(--v2-acc1); color:var(--v2-on-acc)}
  .fq-btn:disabled{opacity:.5; cursor:default}
</style>
