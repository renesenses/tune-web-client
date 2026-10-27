<script lang="ts">
  /**
   * La fiche d'une station : logo, description, genres, pays, site web, flux
   * disponibles et choix du flux préféré.
   *
   * Ouverte depuis « En cours de lecture » (nom de la station, rapport de
   * Rémi, RC7, #2398) ET, depuis #2443, par le bouton « Voir » (œil) des
   * stations de l'annuaire, dans « Mes radios » comme dans l'annuaire : la
   * MÊME fiche partout. Une station saisie à la main garde son « Modifier ».
   *
   * Trois entrées, une seule fiche :
   *  - `station` : une station de « Mes radios » ;
   *  - `annuaire` : une fiche de l'annuaire — relue dans « Mes radios » si
   *    elle y est déjà, pour en connaître le flux et le choisir ;
   *  - `np` : la station qui joue, cherchée d'abord dans « Mes radios » (par
   *    flux, puis par nom), puis dans l'annuaire.
   *
   * Le flux préféré ne se choisit que pour une station de « Mes radios » LIÉE
   * à sa fiche (`estDeLAnnuaire`) : c'est elle que le serveur fait lire
   * (tune-server-rust#7177). Ailleurs, la liste se lit sans choix.
   */
  import * as api from '../../lib/api';
  import type { FicheAnnuaireRadio } from '../../lib/api/annuaireRadios';
  import type { RadioStation } from '../../lib/types';
  import { t, locale } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import { ficheDeAnnuaire, ficheDeLecture, ficheDeStation, libelleFlux, type FicheStation } from '../../lib/ficheStation';
  import { radioGenreLabel, radioGenreRayon } from '../../lib/radioGenres';
  import { nomDuPays } from '../../lib/paysAffichage';
  import { notifications } from '../../lib/stores/notifications';
  import AlbumArt from './AlbumArt.svelte';
  import BadgeMetadataPlus from './BadgeMetadataPlus.svelte';

  let { np = null, station = null, annuaire = null, onClose, onChange }: {
    np?: { source_id?: string | null; album_title?: string | null } | null;
    station?: RadioStation | null;
    annuaire?: FicheAnnuaireRadio | null;
    onClose: () => void;
    /** La station a changé de flux : l'écran remplace la sienne. */
    onChange?: (st: RadioStation) => void;
  } = $props();

  let fiche = $state<FicheStation | null>(null);
  let etat = $state<'charge' | 'ok' | 'inconnue'>('charge');
  let enCours = $state<string | null>(null);

  const titre = $derived(fiche?.nom ?? station?.name ?? annuaire?.name ?? np?.album_title ?? '');

  $effect(() => {
    let vivant = true;
    // Lus ICI, de façon synchrone : l'effet en dépend, et TypeScript garde le
    // rétrécissement dans les fermetures.
    const station0 = station, annuaire0 = annuaire, np0 = np;
    const poser = (f: FicheStation | null) => {
      if (!vivant) return;
      fiche = f;
      etat = f ? 'ok' : 'inconnue';
    };
    (async () => {
      try {
        if (station0) return poser(ficheDeStation(station0));
        if (annuaire0) {
          if (annuaire0.my_radio_id != null) {
            const miennes = (await api.getRadios({ limit: 500 })) ?? [];
            const r = miennes.find((x) => x.id === annuaire0.my_radio_id);
            if (r) {
              const f = ficheDeStation(r);
              // La fiche de l’annuaire en sait parfois plus (serveur sans `streams` dans `annuaire`).
              const a = ficheDeAnnuaire(annuaire0);
              return poser({ ...a, ...f, flux: f.flux?.length ? f.flux : a.flux,
                categories: f.categories?.length ? f.categories : a.categories,
                description: f.description ?? a.description, metadataPlus: f.metadataPlus || a.metadataPlus });
            }
          }
          return poser(ficheDeAnnuaire(annuaire0));
        }
        return poser(await ficheDeLecture(np0));
      } catch { /* la fiche reste « inconnue » */ }
      poser(null);
    })();
    return () => { vivant = false; };
  });

  /** Genre et catégories, traduits, sans doublon. */
  const genres = $derived.by(() => {
    if (!fiche) return [] as string[];
    const vus = new Set<string>();
    const sortie: string[] = [];
    for (const g of [fiche.genre, ...(fiche.categories ?? [])]) {
      const rayon = g ? radioGenreRayon({ genre: g }) : null;
      if (!rayon || vus.has(rayon.key)) continue;
      vus.add(rayon.key);
      sortie.push(radioGenreLabel(rayon, (k) => $t(k as any)));
    }
    return sortie;
  });
  const pays = $derived(fiche ? nomDuPays(fiche.paysCode, $locale, fiche.pays) : '');
  const choix = $derived(fiche?.radioId != null && (fiche.flux?.length ?? 0) > 1);

  async function choisir(url: string) {
    const id = fiche?.radioId;
    if (id == null || !fiche || url === fiche.fluxActuel || enCours) return;
    enCours = url;
    try {
      const st = await api.choisirFluxPrefere(id, url);
      const neuve = ficheDeStation(st);
      fiche = { ...fiche, ...neuve, flux: neuve.flux?.length ? neuve.flux : fiche.flux };
      onChange?.(st);
      notifications.success($t('v2.radio.fiche.saved' as any).replace('{name}', st.name));
    } catch {
      notifications.error($t('v2.radio.fiche.saveFailed' as any));
    } finally {
      enCours = null;
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <div class="panneau" role="dialog" aria-modal="true" aria-label={titre}
    onclick={(e) => e.stopPropagation()}>
    <button class="fermer" aria-label={$t('common.close' as any)} onclick={onClose}>×</button>
    {#if etat === 'charge'}
      <p class="vide">{$t('v2.radio.loading' as any)}</p>
    {:else if fiche}
      <div class="tete">
        <span class="logo"><AlbumArt coverPath={fiche.logo} albumId={null} size={0} alt={fiche.nom} fallbackInitials={fiche.nom.slice(0, 1)} /></span>
        <div class="titres">
          <h2>{fiche.nom}</h2>
          {#if fiche.metadataPlus}<BadgeMetadataPlus />{/if}
          {#if pays}<p class="meta">{pays}</p>{/if}
        </div>
      </div>
      {#if genres.length}
        <ul class="genres" aria-label={$t('v2.radio.fiche.genres' as any)}>
          {#each genres as g (g)}<li>{g}</li>{/each}
        </ul>
      {/if}
      {#if fiche.description}<p class="desc">{fiche.description}</p>{/if}
      {#if fiche.site}
        <a class="site" href={fiche.site} target="_blank" rel="noopener noreferrer">{$t('v2.radio.fiche.site' as any)}</a>
      {/if}
      {#if !fiche.description && !fiche.site}<p class="vide">{$t('v2.radio.fiche.nothing' as any)}</p>{/if}

      {#if fiche.flux?.length}
        <section class="flux">
          <h3>{$t('v2.radio.fiche.streams' as any)}</h3>
          {#if choix}<p class="aide">{$t('v2.radio.fiche.choose' as any)}</p>{/if}
          <ul role={choix ? 'radiogroup' : undefined} aria-label={$t('v2.radio.fiche.streams' as any)}>
            {#each fiche.flux as f (f.url)}
              {@const actuel = f.url === fiche.fluxActuel}
              <li class:actuel>
                {#if choix}
                  <label>
                    <input type="radio" name="flux-prefere" value={f.url} checked={actuel}
                      disabled={!!enCours} onchange={() => choisir(f.url)} />
                    <span class="lib">{libelleFlux(f) || f.url}</span>
                    {#if f.primary}<span class="prin">{$t('v2.radio.fiche.primary' as any)}</span>{/if}
                  </label>
                {:else}
                  <span class="lib">{libelleFlux(f) || f.url}</span>
                  {#if f.primary}<span class="prin">{$t('v2.radio.fiche.primary' as any)}</span>{/if}
                {/if}
                <span class="url" title={f.url}>{f.url}</span>
              </li>
            {/each}
          </ul>
          {#if fiche.radioId == null && (fiche.flux?.length ?? 0) > 1}
            <p class="aide">{$t('v2.radio.fiche.addToChoose' as any)}</p>
          {/if}
        </section>
      {/if}
    {:else}
      <h2>{titre}</h2>
      <p class="vide">{$t('v2.radio.fiche.unknown' as any)}</p>
    {/if}
  </div>
</div>

<style>
  .fond{position:fixed; inset:0; z-index:900; display:grid; place-items:center; background:rgba(0,0,0,.55); padding:20px}
  .panneau{position:relative; width:min(480px,100%); max-height:86vh; overflow-y:auto;
    background:var(--v2-surface); color:var(--v2-txt); border:1px solid var(--v2-line2);
    border-radius:var(--v2-r-card); padding:20px 22px 22px; font-family:var(--v2-sans)}
  .fermer{position:absolute; top:12px; right:12px; width:28px; height:28px; border:0; border-radius:8px;
    background:transparent; color:var(--v2-txt3); font-size:20px; line-height:1; cursor:pointer}
  .fermer:hover{background:var(--v2-surface2); color:var(--v2-txt)}
  .tete{display:flex; gap:14px; align-items:center; margin-bottom:12px; padding-right:24px}
  .logo{display:block; width:72px; height:72px; flex:none; border-radius:10px; overflow:hidden}
  .titres{display:flex; flex-direction:column; align-items:flex-start; gap:4px; min-width:0}
  h2{font-size:18px; font-weight:700}
  h3{font:700 13px var(--v2-sans); margin:16px 0 6px}
  .meta{font:12px var(--v2-sans); color:var(--v2-txt2)}
  .genres{display:flex; flex-wrap:wrap; gap:6px; list-style:none; padding:0; margin:0 0 8px}
  .genres li{padding:2px 9px; border-radius:var(--v2-r-pill); background:var(--v2-surface2); font:600 11px var(--v2-sans); color:var(--v2-txt2)}
  .desc{font:13.5px/1.5 var(--v2-sans); color:var(--v2-txt); margin:8px 0}
  .site{display:inline-block; margin-top:6px; color:var(--v2-acc2); font:600 13px var(--v2-sans)}
  .vide{color:var(--v2-txt3); font:13px var(--v2-sans); margin-top:8px}
  .aide{font:12px var(--v2-sans); color:var(--v2-txt3); margin:0 0 6px}
  .flux ul{list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px}
  .flux li{display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; padding:7px 10px;
    border:1px solid var(--v2-line2); border-radius:10px}
  .flux li.actuel{border-color:var(--v2-acc1)}
  .flux label{display:flex; align-items:center; gap:8px; cursor:pointer}
  .lib{font:600 12.5px var(--v2-sans)}
  .prin{font:600 10px var(--v2-mono); color:var(--v2-acc2)}
  .url{flex-basis:100%; font:10.5px var(--v2-mono); color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
</style>
