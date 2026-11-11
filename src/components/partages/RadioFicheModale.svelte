<script lang="ts">
  /**
   * La fiche d'une station : le logo en grand avec son bouton Lecture au
   * centre, le nom, le pays, les genres, le badge Metadata+, le titre en cours,
   * le favori, les flux classés par qualité (choisir un flux le lance) et le
   * site web.
   *
   * Ouverte par un appui sur une station — « Mes radios », « Dernières
   * écoutées », l'annuaire, la recherche — au lieu de lancer la lecture tout de
   * suite, et depuis « En cours de lecture » (nom de la station, rapport de
   * Rémi, RC7, #2398) : la MÊME fiche partout. Une station saisie à la main
   * garde son « Modifier » sur la vignette.
   *
   * Quatre entrées, une seule fiche :
   *  - `station` : une station de « Mes radios » ;
   *  - `annuaire` : une fiche de l'annuaire — relue dans « Mes radios » si
   *    elle y est déjà, pour en connaître le flux ;
   *  - `reference` : une ligne de la recherche (identifiants local et/ou
   *    d'annuaire), résolue en l'une des deux précédentes ;
   *  - `np` : la station qui joue, cherchée d'abord dans « Mes radios » (par
   *    flux, puis par nom), puis dans l'annuaire.
   *
   * Lire un flux :
   *  - station de « Mes radios » liée à sa fiche : le flux choisi devient son
   *    flux préféré (tune-server-rust#7177), puis la station est lancée ;
   *  - station de « Mes radios » non liée mais connue de l'annuaire : lecture
   *    de ce flux par la route de l'annuaire, sans rien changer
   *    (tune-server-rust#7587) ;
   *  - fiche hors « Mes radios » : même route, rien n'est ajouté.
   */
  import { tick } from 'svelte';
  import * as api from '../../lib/api';
  import type { FicheAnnuaireRadio } from '../../lib/api/annuaireRadios';
  import type { RadioStation } from '../../lib/types';
  import { t, locale } from '../../lib/i18n';
  import { portail } from '../../lib/portail';
  import {
    estHls, ficheDeAnnuaire, ficheDeLecture, ficheDeStation, joueCetteStation, libelleFlux,
    ordonnerFluxParQualite, titreEnCoursRadio, type FicheStation,
  } from '../../lib/ficheStation';
  import { radioGenreLabel, radioGenreRayon } from '../../lib/radioGenres';
  import { nomDuPays } from '../../lib/paysAffichage';
  import { notifications } from '../../lib/stores/notifications';
  import { notifierErreur } from '../../lib/notifierErreur';
  import { currentZone } from '../../lib/stores/zones';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { ecouterFicheAnnuaire } from '../../lib/ecouteFicheAnnuaire';
  import { memoriserLecture } from '../../lib/mesRadios';
  import AlbumArt from './AlbumArt.svelte';
  import BadgeMetadataPlus from './BadgeMetadataPlus.svelte';

  let { np = null, station = null, annuaire = null, reference = null, onClose, onChange, onLue }: {
    np?: { source_id?: string | null; album_title?: string | null } | null;
    station?: RadioStation | null;
    annuaire?: FicheAnnuaireRadio | null;
    /** Une ligne de la recherche : ce qu'il faut pour retrouver la station. */
    reference?: { nom: string; idLocal: number | null; idAnnuaire: string | null } | null;
    onClose: () => void;
    /** La station a changé (flux préféré, favori, ajout) : l'écran remplace la sienne. */
    onChange?: (st: RadioStation) => void;
    /** Un flux vient d'être lancé depuis la fiche. */
    onLue?: (qui: { idMienne: number | null; annuaireId: string | null }) => void;
  } = $props();

  let fiche = $state<FicheStation | null>(null);
  let etat = $state<'charge' | 'ok' | 'inconnue'>('charge');
  /** Le flux en cours de lancement (`''` : le flux par défaut). */
  let enCours = $state<string | null>(null);
  let panneau = $state<HTMLElement | undefined>(undefined);

  const titre = $derived(fiche?.nom ?? station?.name ?? annuaire?.name ?? reference?.nom ?? np?.album_title ?? '');

  /** La station de « Mes radios » complétée par sa fiche d'annuaire. */
  function fusionnee(r: RadioStation, a: FicheAnnuaireRadio): FicheStation {
    const f = ficheDeStation(r);
    // La fiche de l’annuaire en sait parfois plus (serveur sans `streams` dans `annuaire`).
    const d = ficheDeAnnuaire(a);
    return { ...d, ...f, flux: f.flux?.length ? f.flux : d.flux,
      categories: f.categories?.length ? f.categories : d.categories,
      description: f.description ?? d.description, metadataPlus: f.metadataPlus || d.metadataPlus,
      annuaireId: f.annuaireId ?? d.annuaireId };
  }

  async function depuisAnnuaire(a: FicheAnnuaireRadio): Promise<FicheStation> {
    if (a.my_radio_id != null) {
      const miennes = (await api.getRadios({ limit: 500 })) ?? [];
      const r = miennes.find((x) => x.id === a.my_radio_id);
      if (r) return fusionnee(r, a);
    }
    return ficheDeAnnuaire(a);
  }

  $effect(() => {
    let vivant = true;
    // Lus ICI, de façon synchrone : l'effet en dépend, et TypeScript garde le
    // rétrécissement dans les fermetures.
    const station0 = station, annuaire0 = annuaire, np0 = np, ref0 = reference;
    const poser = (f: FicheStation | null) => {
      if (!vivant) return;
      fiche = f;
      etat = f ? 'ok' : 'inconnue';
    };
    (async () => {
      try {
        if (station0) return poser(ficheDeStation(station0));
        if (annuaire0) return poser(await depuisAnnuaire(annuaire0));
        if (ref0) {
          if (ref0.idLocal != null) {
            const miennes = (await api.getRadios({ limit: 500 })) ?? [];
            const r = miennes.find((x) => x.id === ref0.idLocal);
            if (r) return poser(ficheDeStation(r));
          }
          if (ref0.idAnnuaire) {
            const rep = await api.getAnnuaireRadios({ q: ref0.nom, limit: 40 });
            const a = rep.items.find((x) => x.external_id === ref0.idAnnuaire);
            if (a) return poser(await depuisAnnuaire(a));
          }
          return poser(null);
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
  // web#2552 : du meilleur flux au moins bon (sans perte, puis débit).
  const fluxRanges = $derived(ordonnerFluxParQualite(fiche?.flux ?? []));
  /** Le flux que Tune lit par défaut : celui de la station, sinon le principal. */
  const fluxParDefaut = $derived.by(() => {
    const flux = fiche?.flux ?? [];
    if (fiche?.fluxActuel && flux.some((f) => f.url === fiche!.fluxActuel)) return fiche.fluxActuel;
    return flux.find((f) => f.primary)?.url ?? null;
  });

  /** On peut lancer cette station : elle est dans « Mes radios » ou dans l'annuaire. */
  const jouable = $derived(!!fiche && (fiche.idMienne != null || !!fiche.annuaireId));
  const lecture = $derived($currentZone?.current_track);
  const enDirect = $derived(joueCetteStation(fiche, lecture));
  const titreCourant = $derived(enDirect ? titreEnCoursRadio(lecture) : null);

  /** Lance la station (`url` : un flux précis de la fiche). */
  async function lire(url?: string) {
    const f = fiche;
    if (!f || !jouable || enCours !== null) return;
    const zid = zoneRequise();
    if (zid == null) return;
    enCours = url ?? '';
    try {
      let idMienne = f.idMienne ?? null;
      const autreFlux = !!url && url !== f.fluxActuel;
      if (autreFlux && f.radioId != null) {
        // Liée à sa fiche : le flux choisi devient le flux préféré (#7177).
        try {
          const st = await api.choisirFluxPrefere(f.radioId, url!);
          const neuve = ficheDeStation(st);
          fiche = { ...f, ...neuve, flux: neuve.flux?.length ? neuve.flux : f.flux };
          onChange?.(st);
        } catch {
          notifications.error($t('v2.radio.fiche.saveFailed' as any));
          return;
        }
      } else if (autreFlux && f.annuaireId) {
        // Pas de lien enregistré : on écoute ce flux sans rien changer (#7587).
        idMienne = null;
      }
      let refusAnnonce = false;
      const ok = await ecouterFicheAnnuaire(
        { external_id: f.annuaireId ?? '', my_radio_id: idMienne },
        zid,
        () => { refusAnnonce = true; },
        idMienne == null ? url : undefined,
      );
      if (!ok) {
        if (!refusAnnonce) notifications.error($t('v2.radio.dir.playFailed' as any).replace('{name}', f.nom));
        return;
      }
      if (idMienne != null) memoriserLecture(idMienne);
      onLue?.({ idMienne, annuaireId: f.annuaireId ?? null });
    } finally {
      enCours = null;
    }
  }

  /** Le cœur : met la station en favori (l'ajoute à « Mes radios » au besoin). */
  async function basculerFavori() {
    const f = fiche;
    if (!f) return;
    try {
      let st: RadioStation;
      if (f.idMienne != null) st = await api.updateRadio(f.idMienne, { favorite: !f.favori });
      else if (f.annuaireId) st = await api.ajouterDepuisAnnuaire(f.annuaireId, true);
      else return;
      const neuve = ficheDeStation(st);
      fiche = { ...f, favori: !!st.favorite, idMienne: st.id ?? f.idMienne ?? null,
        radioId: neuve.radioId ?? f.radioId, fluxActuel: st.stream_url ?? f.fluxActuel };
      onChange?.(st);
    } catch (e: any) {
      notifierErreur($t('common.error' as any), e, { motifSeul: true });
    }
  }

  // --- Clavier et focus : la fiche est une boîte de dialogue modale ----------
  // À l'ouverture le focus va sur Lecture (sinon sur la fenêtre) ; Tab reste
  // dans la fiche ; à la fermeture, il retourne à ce qui l'a ouverte.
  $effect(() => {
    const avant = document.activeElement as HTMLElement | null;
    return () => { if (avant?.isConnected) avant.focus?.(); };
  });
  $effect(() => {
    if (etat === 'charge') return;
    void tick().then(() => {
      const premier = panneau?.querySelector<HTMLElement>('[data-focus-initial]:not([disabled])');
      (premier ?? panneau)?.focus();
    });
  });
  function touche(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab' || !panneau) return;
    const cibles = [...panneau.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')];
    if (!cibles.length) { e.preventDefault(); panneau.focus(); return; }
    const premier = cibles[0], dernier = cibles[cibles.length - 1];
    const actif = document.activeElement;
    if (e.shiftKey && (actif === premier || actif === panneau)) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && actif === dernier) { e.preventDefault(); premier.focus(); }
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onClose(); }} />

<div class="fond tune-v2" role="presentation" use:portail onclick={onClose}>
  <div class="panneau" role="dialog" aria-modal="true" aria-label={titre} tabindex="-1"
    bind:this={panneau} onkeydown={touche} onclick={(e) => e.stopPropagation()}>
    <button class="fermer" aria-label={$t('common.close' as any)} onclick={onClose}>×</button>
    {#if etat === 'charge'}
      <p class="vide">{$t('v2.radio.loading' as any)}</p>
    {:else if fiche}
      <div class="tete">
        <span class="logo">
          <AlbumArt coverPath={fiche.logo} albumId={null} size={0} alt={fiche.nom} fallbackInitials={fiche.nom.slice(0, 1)} />
          {#if jouable}
            <button class="lecture" data-focus-initial disabled={enCours !== null}
              aria-label={`${$t('common.play' as any)} — ${fiche.nom}`} title={$t('common.play' as any)}
              onclick={() => lire()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>
            </button>
          {/if}
        </span>
        <div class="titres">
          <div class="nomligne">
            <h2>{fiche.nom}</h2>
            {#if fiche.metadataPlus}<BadgeMetadataPlus />{/if}
            {#if jouable}
              <button class="coeur" class:actif={fiche.favori} aria-pressed={!!fiche.favori}
                aria-label={fiche.favori ? $t('v2.cover.unfavorite' as any) : $t('v2.cover.favorite' as any)}
                title={fiche.favori ? $t('v2.cover.unfavorite' as any) : $t('v2.cover.favorite' as any)}
                onclick={basculerFavori}>
                <svg viewBox="0 0 24 24" fill={fiche.favori ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </button>
            {/if}
          </div>
          {#if pays}<p class="meta">{pays}</p>{/if}
        </div>
      </div>
      {#if genres.length}
        <ul class="genres" aria-label={$t('v2.radio.fiche.genres' as any)}>
          {#each genres as g (g)}<li>{g}</li>{/each}
        </ul>
      {/if}
      {#if enDirect}
        <p class="encours" aria-live="polite">
          <span class="direct">{$t('v2.radio.fiche.live' as any)}</span>
          {#if titreCourant}<span class="titre-en-cours">{titreCourant}</span>{/if}
        </p>
      {/if}
      {#if fiche.description}<p class="desc">{fiche.description}</p>{/if}
      {#if fiche.site}
        <a class="site" href={fiche.site} target="_blank" rel="noopener noreferrer">{$t('v2.radio.fiche.site' as any)}</a>
      {/if}
      {#if !fiche.description && !fiche.site}<p class="vide">{$t('v2.radio.fiche.nothing' as any)}</p>{/if}

      {#if fiche.flux?.length}
        <section class="flux">
          <h3>{$t('v2.radio.fiche.streams' as any)}</h3>
          {#if jouable}<p class="aide">{$t('v2.radio.fiche.pick' as any)}</p>{/if}
          <ul aria-label={$t('v2.radio.fiche.streams' as any)}>
            {#each fluxRanges as f (f.url)}
              {@const joue = enDirect && lecture?.source_id === f.url}
              <li class:actuel={f.url === fluxParDefaut} class:joue>
                {#if jouable}
                  <button class="flux-lire" disabled={enCours !== null} aria-current={joue ? 'true' : undefined}
                    aria-label={`${$t('common.play' as any)} — ${libelleFlux(f) || f.url}`}
                    onclick={() => lire(f.url)}>
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>
                    <span class="lib">{libelleFlux(f) || f.url}</span>
                    <span class="transport">{estHls(f) ? $t('v2.radio.fiche.hls' as any) : $t('v2.radio.fiche.direct' as any)}</span>
                    {#if f.url === fluxParDefaut}<span class="prin">{$t('v2.radio.fiche.default' as any)}</span>{/if}
                  </button>
                {:else}
                  <span class="flux-lire statique">
                    <span class="lib">{libelleFlux(f) || f.url}</span>
                    <span class="transport">{estHls(f) ? $t('v2.radio.fiche.hls' as any) : $t('v2.radio.fiche.direct' as any)}</span>
                    {#if f.url === fluxParDefaut}<span class="prin">{$t('v2.radio.fiche.default' as any)}</span>{/if}
                  </span>
                {/if}
                <span class="url" title={f.url}>{f.url}</span>
              </li>
            {/each}
          </ul>
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
  .panneau:focus{outline:none}
  .fermer{position:absolute; top:12px; right:12px; z-index:2; width:28px; height:28px; border:0; border-radius:8px;
    background:transparent; color:var(--v2-txt3); font-size:20px; line-height:1; cursor:pointer}
  .fermer:hover{background:var(--v2-surface2); color:var(--v2-txt)}
  button:focus-visible, a:focus-visible{outline:2px solid var(--v2-acc2); outline-offset:2px}
  .tete{display:flex; flex-direction:column; gap:14px; align-items:center; text-align:center; margin-bottom:12px}
  /* Le logo en grand ; Lecture au centre, toujours visible (pas seulement au survol). */
  .logo{position:relative; display:block; width:min(200px,60vw); aspect-ratio:1; flex:none; border-radius:var(--v2-r-card);
    overflow:hidden; box-shadow:var(--v2-sh-card)}
  .lecture{position:absolute; top:50%; left:50%; width:60px; height:60px; margin:-30px 0 0 -30px; padding:0;
    display:grid; place-items:center; border:0; border-radius:50%; cursor:pointer;
    background:var(--v2-acc1); color:var(--v2-on-acc); box-shadow:0 2px 12px rgba(0,0,0,.35); transition:transform .1s ease}
  .lecture:hover:not(:disabled){transform:scale(1.06)}
  .lecture:disabled{opacity:.6; cursor:progress}
  .lecture svg{width:26px; height:26px; fill:currentColor; margin-left:2px}
  .titres{display:flex; flex-direction:column; align-items:center; gap:4px; min-width:0; max-width:100%}
  .nomligne{display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:8px; min-width:0}
  h2{font-size:20px; font-weight:700}
  h3{font:700 13px var(--v2-sans); margin:16px 0 6px}
  .coeur{display:grid; place-items:center; width:30px; height:30px; padding:0; border:0; border-radius:8px; cursor:pointer;
    background:transparent; color:var(--v2-txt2)}
  .coeur:hover{background:var(--v2-surface2); color:var(--v2-txt)}
  .coeur.actif{color:var(--v2-acc1)}
  .coeur svg{width:18px; height:18px}
  .meta{font:12px var(--v2-sans); color:var(--v2-txt2)}
  .genres{display:flex; flex-wrap:wrap; justify-content:center; gap:6px; list-style:none; padding:0; margin:0 0 8px}
  .genres li{padding:2px 9px; border-radius:var(--v2-r-pill); background:var(--v2-surface2); font:600 11px var(--v2-sans); color:var(--v2-txt2)}
  .encours{display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:4px 8px; margin:4px 0 8px; font:13px var(--v2-sans)}
  .direct{padding:1px 8px; border-radius:var(--v2-r-pill); background:var(--v2-acc1); color:var(--v2-on-acc); font:700 10px var(--v2-sans); text-transform:uppercase; letter-spacing:.04em}
  .titre-en-cours{color:var(--v2-acc2); font-weight:600}
  .desc{font:13.5px/1.5 var(--v2-sans); color:var(--v2-txt); margin:8px 0}
  .site{display:inline-block; margin-top:6px; color:var(--v2-acc2); font:600 13px var(--v2-sans)}
  .vide{color:var(--v2-txt3); font:13px var(--v2-sans); margin-top:8px}
  .aide{font:12px var(--v2-sans); color:var(--v2-txt3); margin:0 0 6px}
  .flux ul{list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px}
  .flux li{display:flex; flex-direction:column; gap:2px; padding:7px 10px;
    border:1px solid var(--v2-line2); border-radius:10px}
  .flux li.actuel{border-color:var(--v2-acc1)}
  .flux li.joue{background:var(--v2-surface2)}
  .flux-lire{display:flex; align-items:center; gap:8px; width:100%; padding:0; border:0; background:transparent;
    color:inherit; font:inherit; text-align:left; cursor:pointer}
  .flux-lire:disabled{cursor:progress; opacity:.7}
  .flux-lire.statique{cursor:default}
  .flux-lire svg{width:14px; height:14px; flex:none; color:var(--v2-acc1)}
  .lib{font:600 12.5px var(--v2-sans)}
  .transport{font:600 10px var(--v2-mono); color:var(--v2-txt2); padding:0 6px; border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill)}
  .prin{font:600 10px var(--v2-mono); color:var(--v2-acc2)}
  .url{font:10.5px var(--v2-mono); color:var(--v2-txt3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
</style>
