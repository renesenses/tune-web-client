<script lang="ts">
  /**
   * Le bas de l'accueil Roon-like (retouche du 27/11/2026) : la mise en page
   * des captures de référence, avec les données de Tune. Une section sans
   * données ne s'affiche pas.
   *
   *   1. Listes de lecture Tune — les playlists « Parce que vous aimez »
   *      que Tune compose (widget `parce-que-vous-aimez`) ;
   *   2. Écoutes récentes — durée d'écoute des quatre dernières semaines
   *      (tableau de bord d'écoute, `trend`) ;
   *   3. Vos stations de radio — deux radios (favorites d'abord) ;
   *   4. Genres pour vous — les genres les plus présents de la bibliothèque,
   *      en noir et blanc, une pochette du genre en fond ;
   *   5. Explorer — bandeau vers l'arbre des genres ;
   *   6. Listes de lecture du service (widget `qobuz-selection`).
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { t, locale } from '../../lib/i18n';
  import { bulleTexte } from '../../lib/infobulleTexte';
  import * as api from '../../lib/api';
  import { currentProfileId } from '../../lib/stores/profile';
  import { albums } from '../../lib/stores/library';
  import { zones, currentZoneId } from '../../lib/stores/zones';
  import { allerA } from '../../lib/stores/salon';
  import { widgetParId, type Element, type Widget } from '../../lib/accueilWidgets';
  import { grilleEcoutes, dureeCourte } from '../../lib/accueilRoonLike';
  import { notifierErreur } from '../../lib/notifierErreur';
  import type { RadioStation } from '../../lib/types';
  import AlbumArt from '../partages/AlbumArt.svelte';
  import IconeSalon from './IconeSalon.svelte';
  import RangeeSalon from './RangeeSalon.svelte';

  const W_TUNE = 'parce-que-vous-aimez';
  const W_SERVICE = 'qobuz-selection';
  let listesTune = $state<Element[]>([]);
  let listesService = $state<Element[]>([]);
  let titreService = $state('');
  let ecoutes = $state<ReturnType<typeof grilleEcoutes> | null>(null);
  let radios = $state<RadioStation[]>([]);
  let genres = $state<{ name: string; image: string | null }[]>([]);

  async function elements(id: string): Promise<{ w: Widget | undefined; els: Element[] }> {
    const w = widgetParId(id);
    if (!w) return { w, els: [] };
    try {
      const els = await w.charger({ profileId: get(currentProfileId), albums: get(albums), zones: get(zones), langue: get(locale) });
      return { w, els: els ?? [] };
    } catch { return { w, els: [] }; }
  }

  onMount(() => {
    elements(W_TUNE).then((r) => { listesTune = r.els; });
    elements(W_SERVICE).then((r) => { listesService = r.els; titreService = r.w ? $t(r.w.cleTitre as any) : ''; });
    const pid = get(currentProfileId);
    api.getDashboard('30d', pid != null ? { profileId: pid } : undefined)
      .then((d) => { ecoutes = grilleEcoutes(d?.trend ?? []); })
      .catch(() => { ecoutes = null; });
    api.getRadios({ limit: 40 })
      .then((l) => { radios = [...(l ?? [])].sort((a, b) => Number(b.favorite) - Number(a.favorite)).slice(0, 2); })
      .catch(() => { radios = []; });
    api.getGenres().then(async (g) => {
      const top = [...(g ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).slice(0, 4);
      genres = top.map((x) => ({ name: x.name, image: null }));
      for (const x of top) {
        try {
          const r = await api.getAlbumsDetailed({ genre: x.name }, 1);
          const c = r.items.find((a) => a.cover_path)?.cover_path;
          if (c) genres = genres.map((y) => (y.name === x.name ? { ...y, image: api.artworkUrl(c, 600) } : y));
        } catch { /* tuile sans image : le dégradé neutre */ }
      }
    }).catch(() => { genres = []; });
  });

  function jouer(e: Element) {
    const z = get(currentZoneId);
    if (z == null || !e.jouer) return;
    Promise.resolve(e.jouer(z)).catch((err) => notifierErreur($t('roonLike.accueil.lectureImpossible' as any), err));
  }
  function jouerRadio(r: RadioStation) {
    const z = get(currentZoneId);
    if (z == null || r.id == null) return;
    api.playRadio(r.id, z).catch((err) => notifierErreur($t('roonLike.accueil.lectureImpossible' as any), err));
  }
  /** L, Ma, Me… : les jours de la semaine, dans la langue de l'interface. */
  const jours = $derived.by(() => {
    const f = new Intl.DateTimeFormat($locale, { weekday: 'narrow' });
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 1 + i))); // 01/01/2024 : un lundi
  });
  const maxJour = $derived(Math.max(1, ...(ecoutes?.semaines ?? []).flatMap((s) => s.jours.map((j) => j ?? 0))));
</script>

{#if listesTune.length}
  <RangeeSalon titre={$t('roonLike.accueil.listesTune' as any)} onPlus={() => allerA({ page: 'tune', vue: 'smart-ai' })}>
    {#each listesTune as e (e.id)}
      <button class="liste-tune" onclick={() => jouer(e)} data-liste-tune>
        <span class="pochette-liste">
          <AlbumArt coverPath={e.cover ?? null} albumId={null} size={0} vignette alt="" />
          <span class="incruste" use:bulleTexte>{e.titre}</span>
        </span>
        <span class="nom-liste" use:bulleTexte>{e.titre}</span>
        <span class="par">{$t('roonLike.accueil.parTune' as any)}</span>
      </button>
    {/each}
  </RangeeSalon>
{/if}

{#if ecoutes}
  <section class="section" data-ecoutes-recentes>
    <h2 class="tete-section">{$t('roonLike.accueil.ecoutesRecentes' as any)}</h2>
    <div class="ecoutes">
      <div class="total">
        <IconeSalon nom="historique" taille={56} trait={1.4} />
        <span class="chiffre">{dureeCourte(ecoutes.totalMs)}</span>
        <span class="s-surtitre">{$t('roonLike.accueil.dureeQuatreSemaines' as any)}</span>
      </div>
      <table class="semaines">
        <thead>
          <tr><th class="lib">{$t('roonLike.accueil.quatreSemaines' as any)}</th>{#each jours as j, i (i)}<th>{j}</th>{/each}</tr>
        </thead>
        <tbody>
          {#each ecoutes.semaines as s (s.lundi)}
            <tr>
              <td class="lib"><span class="marque" aria-hidden="true"></span>{dureeCourte(s.totalMs)}</td>
              {#each s.jours as j, i (i)}
                <td>{#if j != null}<span class="point" style:--part={j / maxJour} title={dureeCourte(j)}></span>{/if}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}

{#if radios.length}
  <section class="section" data-radios-accueil>
    <h2 class="tete-section">{$t('roonLike.accueil.vosRadios' as any)}</h2>
    <div class="radios">
      {#each radios as r (r.id ?? r.name)}
        <button class="radio" onclick={() => jouerRadio(r)}>
          <span class="logo">{#if r.logo_url}<img src={r.logo_url} alt="" loading="lazy" />{:else}<IconeSalon nom="radio" taille={28} />{/if}</span>
          <span class="noms">
            <span class="nom-radio">{r.name}</span>
            <span class="lieu">{[r.genre_label ?? r.genre, r.country, r.codec].filter(Boolean).join(', ')}</span>
          </span>
        </button>
      {/each}
      <button class="plus-radios" onclick={() => allerA({ page: 'tune', vue: 'radios' })}>{$t('roonLike.accueil.plusDeRadios' as any)}</button>
    </div>
  </section>
{/if}

{#if genres.length}
  <section class="section" data-genres-accueil>
    <h2 class="tete-section">{$t('roonLike.accueil.genresPourVous' as any)}</h2>
    <div class="genres">
      {#each genres as g (g.name)}
        <button class="genre" onclick={() => allerA({ page: 'genre', nom: g.name })}>
          {#if g.image}<img src={g.image} alt="" loading="lazy" />{/if}
          <span class="nom-genre">{g.name}</span>
        </button>
      {/each}
    </div>
  </section>
{/if}

<button class="explorer" onclick={() => allerA({ page: 'tune', vue: 'genretree' })} data-bandeau-explorer>
  <span class="ex-titre">{$t('roonLike.accueil.explorerTitre' as any)}</span>
  <span class="ex-texte">{$t('roonLike.accueil.explorerTexte' as any)} <IconeSalon nom="suivant" taille={16} trait={2} /></span>
</button>

{#if listesService.length}
  <RangeeSalon titre={titreService} colonnes={3} onPlus={() => allerA({ page: 'tune', vue: 'streaming' })}>
    {#each listesService as e (e.id)}
      <div class="carte-service" data-liste-service>
        <AlbumArt coverPath={e.cover ?? null} albumId={null} size={0} alt="" />
        <span class="voile" aria-hidden="true"></span>
        <span class="pastille">{$t('roonLike.accueil.listeDeLecture' as any)}</span>
        <span class="titre-service" use:bulleTexte>{e.titre}</span>
        {#if e.jouer}
          <button class="lire" onclick={() => jouer(e)} aria-label={$t('roonLike.lire.maintenant' as any)} title={$t('roonLike.lire.maintenant' as any)}>
            <IconeSalon nom="lecture" taille={14} plein trait={1} />
          </button>
        {/if}
      </div>
    {/each}
  </RangeeSalon>
{/if}

<style>
  button { font: inherit; color: inherit; cursor: pointer; }
  .section { margin: 0 0 48px; }
  .tete-section { margin: 0 0 20px; padding-bottom: 10px; border-bottom: 1px solid var(--s-line); font-size: var(--s-t-section); font-weight: 400; }

  /* 1. Listes de lecture Tune */
  .liste-tune { display: flex; flex-direction: column; gap: 4px; padding: 0; border: 0; background: none; text-align: left; min-width: 0; }
  .pochette-liste { position: relative; display: block; aspect-ratio: 1; overflow: hidden; border-radius: var(--s-r-pochette); filter: grayscale(1); }
  .pochette-liste :global(.album-art), .pochette-liste :global(img) { width: 100%; height: 100%; object-fit: cover; }
  .incruste {
    position: absolute; left: 0; right: 0; bottom: 0; padding: 26px 12px 10px;
    font-family: var(--s-police-titre); font-size: var(--s-t-sous-titre); line-height: 1.1; color: var(--s-sur-photo);
    background: var(--s-voile-photo); text-shadow: var(--s-ombre-texte-photo);
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .nom-liste { margin-top: 6px; font-size: var(--s-t-texte); font-weight: var(--s-graisse-moyenne); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .par { font-size: var(--s-t-petit); color: var(--s-txt2); }

  /* 2. Écoutes récentes */
  .ecoutes { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); gap: 40px; align-items: center; }
  .total { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; color: var(--s-txt); }
  .chiffre { font-family: var(--s-police-titre); font-size: var(--s-t-titre-hero); line-height: 1; }
  .semaines { width: 100%; border-collapse: collapse; font-size: var(--s-t-petit); }
  .semaines th { font-weight: 400; color: var(--s-txt2); text-align: center; padding: 0 0 10px; }
  .semaines th.lib, .semaines td.lib { text-align: left; }
  .semaines td { text-align: center; padding: 12px 0; border-top: 1px solid var(--s-line); color: var(--s-txt2); }
  .marque { display: inline-block; width: 12px; height: 12px; margin-right: 8px; vertical-align: -2px; border-radius: 0 50% 50% 0; background: var(--s-acc); }
  .point { display: inline-block; width: calc(4px + 10px * var(--part, 0)); height: calc(4px + 10px * var(--part, 0)); border-radius: 50%; background: var(--s-acc-texte); }

  /* 3. Radios */
  .radios { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)) auto; gap: 24px; align-items: center; }
  .radio { display: flex; align-items: center; gap: 14px; padding: 0; border: 0; background: none; text-align: left; min-width: 0; }
  .logo { width: var(--s-logo-radio); height: var(--s-logo-radio); flex: none; display: grid; place-items: center; background: var(--s-tuile); overflow: hidden; border-radius: var(--s-r-pochette); color: var(--s-txt2); }
  .logo img { width: 100%; height: 100%; object-fit: contain; }
  .noms { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .nom-radio { font-size: var(--s-t-texte); font-weight: var(--s-graisse-moyenne); }
  .lieu { font-size: var(--s-t-petit); color: var(--s-txt2); }
  .plus-radios { border: 0; background: none; color: var(--s-acc-texte); font-size: var(--s-t-texte); padding: 0 12px; }

  /* 4. Genres pour vous */
  .genres { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
  .genre { position: relative; aspect-ratio: 1; padding: 0; border: 0; overflow: hidden; background: var(--s-genre-fond); border-radius: var(--s-r-tuile); }
  .genre img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) contrast(1.05); }
  .nom-genre {
    position: relative; display: grid; place-items: center; height: 100%; padding: 12px;
    font-family: var(--s-police-titre); font-size: var(--s-t-section-genre); color: var(--s-sur-photo); text-shadow: var(--s-ombre-texte-photo);
  }

  /* 5. Explorer */
  .explorer {
    width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; margin: 0 0 48px; padding: 28px 26px;
    border: 0; background: var(--s-acc-fort); color: var(--s-bandeau-txt); text-align: left; border-radius: var(--s-r-bandeau);
  }
  .ex-titre { font-family: var(--s-police-titre); font-size: var(--s-t-titre-hero); line-height: 1.05; }
  .ex-texte { display: inline-flex; align-items: center; gap: 8px; font-size: var(--s-t-corps); color: var(--s-bandeau-doux); }

  /* 6. Listes de lecture du service */
  .carte-service { position: relative; aspect-ratio: 4 / 3; overflow: hidden; border-radius: var(--s-r-tuile); background: var(--s-genre-fond); }
  .carte-service :global(.album-art), .carte-service :global(img) { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: grayscale(.6) brightness(.7); }
  .voile { position: absolute; inset: 0; background: var(--s-voile-photo); }
  .pastille {
    position: absolute; left: 20px; top: 18px; font-size: var(--s-t-mini); letter-spacing: var(--s-interlettre-capitales);
    text-transform: uppercase; color: var(--s-sur-photo); font-weight: var(--s-graisse-moyenne);
  }
  .titre-service {
    position: absolute; left: 20px; right: 20px; bottom: calc(var(--s-rond-petit) + 30px);
    font-family: var(--s-police-titre); font-size: var(--s-t-sous-titre-grand); line-height: 1.1; color: var(--s-sur-photo); text-shadow: var(--s-ombre-texte-photo);
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .lire {
    position: absolute; left: 20px; bottom: 18px; width: var(--s-rond-petit); height: var(--s-rond-petit); border-radius: 50%;
    display: grid; place-items: center; border: 0; background: var(--s-acc); color: var(--s-sur-acc);
  }

  @media (max-width: 1100px) {
    .genres { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ecoutes { grid-template-columns: 1fr; }
  }
  @media (max-width: 760px) {
    .radios { grid-template-columns: 1fr; }
    .plus-radios { justify-self: start; padding: 0; }
    .ex-titre { font-size: var(--s-t-titre); }
    .carte-service { aspect-ratio: 1; }
  }
</style>
