<script lang="ts">
  /**
   * rc14 — le panneau du greffon TESS « Casque » (`equalizer-headphone`).
   *
   * Chercher son casque dans OPRA (marque, modèle, variante), voir la courbe
   * de correction et le préampli automatique, appliquer, régler le niveau
   * d'effet. L'interrupteur est celui de l'en-tête (`ReglagesGreffonTess`).
   *
   * C'est le SERVEUR qui cherche, lit la correction et calcule bandes,
   * préampli et courbe (`tessCasque.ts`). Le panneau pose les `settings` de
   * l'aperçu (référence OPRA comprise) par `onChange` : l'écran TESS les
   * envoie avec la chaîne entière, comme pour tout greffon.
   */
  import { t, locale } from '../../../lib/i18n';
  import * as api from '../../../lib/api';
  import type { LienGreffonTess } from '../../../lib/tess';
  import {
    referenceOpra, aDesBandesLibres, reglagesDepuisApercu, nomDuCasque, libelleVariante, formatDb,
    plageCourbe, traceCourbe, cleErreurOpra, bornerNiveau, NIVEAU_MIN, NIVEAU_MAX, NIVEAU_PAS,
    SOURCE_OPRA, LICENCE_OPRA,
  } from '../../../lib/tessCasque';

  let {
    lien,
    verrou = null,
    onChange,
  }: {
    lien: LienGreffonTess;
    /** Motif du verrou, ou `null` (le casque est Free : rare). */
    verrou?: string | null;
    onChange: (id: string, reglages: Record<string, unknown>) => void;
  } = $props();

  const tr = (k: string) => $t(k as any);
  const bloque = $derived(verrou != null);
  const reglages = $derived((lien.settings as Record<string, unknown> | null) ?? null);
  const reference = $derived(referenceOpra(reglages));
  const libres = $derived(aDesBandesLibres(reglages));

  // ── Recherche ────────────────────────────────────────────────────────────
  let requete = $state('');
  let resultats = $state<api.CasqueOpraProduit[] | null>(null);
  let total = $state(0);
  let recherche = $state(false);
  let erreur = $state<string | null>(null);
  let numeroRecherche = 0;

  async function chercher(e?: Event) {
    e?.preventDefault();
    const q = requete.trim();
    if (!q || bloque) return;
    const n = ++numeroRecherche;
    recherche = true;
    erreur = null;
    try {
      const r = await api.chercherCasqueOpra(q);
      if (n !== numeroRecherche) return;
      resultats = r.results;
      total = r.total;
    } catch (err) {
      if (n !== numeroRecherche) return;
      resultats = null;
      erreur = tr(cleErreurOpra(err));
    } finally {
      if (n === numeroRecherche) recherche = false;
    }
  }

  // ── Aperçu (le profil choisi, ou celui en place) ─────────────────────────
  let choisi = $state<string | null>(null);
  let niveau = $state(100);
  let apercu = $state<api.CasqueOpraApercu | null>(null);
  let chargement = $state(false);
  let numeroApercu = 0;

  // Le niveau suit celui du maillon tant qu'aucun geste n'est en cours.
  let niveauRecu = -1;
  $effect(() => {
    const n = reference?.level ?? 100;
    if (n !== niveauRecu) { niveauRecu = n; niveau = n; }
  });

  async function charger(id: string, n: number): Promise<api.CasqueOpraApercu | null> {
    const k = ++numeroApercu;
    chargement = true;
    erreur = null;
    try {
      const a = await api.apercuCasqueOpra(id, n);
      if (k !== numeroApercu) return null;
      apercu = a;
      return a;
    } catch (err) {
      if (k !== numeroApercu) return null;
      erreur = tr(cleErreurOpra(err));
      return null;
    } finally {
      if (k === numeroApercu) chargement = false;
    }
  }

  // La courbe du profil en place, quand rien d'autre n'est choisi.
  let enPlaceCharge = '';
  $effect(() => {
    const r = reference;
    if (!r || choisi) return;
    const cle = `${r.id}@${r.level}`;
    if (cle === enPlaceCharge) return;
    enPlaceCharge = cle;
    void charger(r.id, r.level);
  });

  function choisir(variante: api.CasqueOpraVariante) {
    if (bloque) return;
    choisi = variante.id;
    void charger(variante.id, niveau);
  }

  function appliquer(a: api.CasqueOpraApercu) {
    if (bloque) return;
    onChange(lien.id, reglagesDepuisApercu(reglages, a));
    choisi = null;
    enPlaceCharge = `${a.id}@${a.level}`;
    resultats = null;
  }

  async function changerNiveau(v: number) {
    niveau = bornerNiveau(v);
    const id = choisi ?? reference?.id;
    if (!id || bloque) return;
    const a = await charger(id, niveau);
    // Sur le profil en place, le niveau s'applique aussitôt ; sur un profil
    // choisi, il attend « Appliquer ».
    if (a && !choisi) appliquer(a);
  }

  const enApercu = $derived(apercu && (choisi ? apercu.id === choisi : apercu.id === reference?.id) ? apercu : null);
  const LARGEUR = 320;
  const HAUTEUR = 120;
  const plage = $derived(enApercu ? plageCourbe(enApercu.curve.gain_db) : 6);
  const trace = $derived(enApercu ? traceCourbe(enApercu.curve.frequency_hz, enApercu.curve.gain_db, LARGEUR, HAUTEUR, plage) : '');
  const nomApercu = $derived(enApercu ? nomDuCasque(enApercu.product.vendor, enApercu.product.name) : '');
  const formes = new Set(['over_the_ear', 'in_ear', 'on_ear', 'earbuds']);
</script>

<div class="casque" data-tess-casque>
  {#if verrou}
    <p class="verrou" role="note">{verrou}</p>
  {/if}
  <fieldset disabled={bloque}>
    <!-- Profil en place -->
    <div class="actif" data-tess-casque-actif>
      <span class="lbl">{tr('tess.headphone.active')}</span>
      {#if reference}
        <strong data-tess-casque-nom>{nomDuCasque(reference.vendor, reference.product)}</strong>
        <span class="variante">{libelleVariante(reference.author, reference.details)}</span>
      {:else if libres}
        <p class="note" data-tess-casque-libres>{tr('tess.headphone.freeBands')}</p>
      {:else}
        <p class="note" data-tess-casque-aucun>{tr('tess.headphone.none')}</p>
      {/if}
    </div>

    <!-- Recherche dans OPRA -->
    <form class="recherche" onsubmit={chercher} data-tess-casque-recherche>
      <label class="champ">
        <span class="lbl">{tr('tess.headphone.searchLabel')}</span>
        <input type="search" bind:value={requete} placeholder={tr('tess.headphone.searchPlaceholder')}
               data-tess-casque-requete />
      </label>
      <button type="submit" class="petit" disabled={recherche || !requete.trim()} data-tess-casque-chercher>
        {recherche ? tr('tess.headphone.searching') : tr('tess.headphone.search')}
      </button>
    </form>

    {#if erreur}
      <p class="erreur" role="alert" data-tess-casque-erreur>{erreur}</p>
    {/if}

    {#if resultats}
      {#if resultats.length === 0}
        <p class="note" data-tess-casque-vide>{tr('tess.headphone.noResult').replace('{q}', requete.trim())}</p>
      {:else}
        <p class="note">{tr('tess.headphone.results').replace('{n}', String(total))}</p>
        <ul class="produits" data-tess-casque-resultats>
          {#each resultats as p (p.id)}
            <li class="produit" data-tess-casque-produit={p.id}>
              <div class="tete-produit">
                <strong>{nomDuCasque(p.vendor, p.name)}</strong>
                {#if formes.has(p.form)}<span class="forme">{tr(`tess.headphone.form.${p.form}`)}</span>{/if}
              </div>
              <div class="variantes">
                {#each p.variants as v (v.id)}
                  <button type="button" class="variante-btn" class:on={choisi === v.id} aria-pressed={choisi === v.id}
                          data-tess-casque-variante={v.id} onclick={() => choisir(v)}>
                    {libelleVariante(v.author, v.details)}
                  </button>
                {/each}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}

    <!-- Courbe, préampli, niveau -->
    {#if enApercu}
      <div class="apercu" data-tess-casque-apercu={enApercu.id}>
        {#if choisi}
          <div class="tete-produit">
            <span class="lbl">{tr('tess.headphone.preview')}</span>
            <strong>{nomApercu}</strong>
            <span class="variante">{libelleVariante(enApercu.variant.author, enApercu.variant.details)}</span>
          </div>
        {/if}
        <svg class="courbe" viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`} role="img" preserveAspectRatio="none"
             aria-label={tr('tess.headphone.curveAria').replace('{name}', nomApercu)} data-tess-casque-courbe>
          <line class="zero" x1="0" y1={HAUTEUR / 2} x2={LARGEUR} y2={HAUTEUR / 2} />
          <path d={trace} />
        </svg>
        <div class="echelle"><span>{`+${plage} dB`}</span><span>{`−${plage} dB`}</span></div>
        <p class="note" data-tess-casque-preampli>
          {tr('tess.headphone.preamp').replace('{db}', formatDb(enApercu.preamp_db, $locale ?? 'fr'))}
          <span class="aide">{tr('tess.headphone.preampHint')}</span>
        </p>
      </div>
    {:else if chargement}
      <p class="note">{tr('tess.headphone.loading')}</p>
    {/if}

    {#if reference || choisi}
      <label class="champ niveau">
        <span class="lbl">{tr('tess.headphone.level')} <b>{niveau} %</b></span>
        <input type="range" min={NIVEAU_MIN} max={NIVEAU_MAX} step={NIVEAU_PAS} value={niveau} data-tess-casque-niveau
               onchange={(e) => changerNiveau(Number((e.currentTarget as HTMLInputElement).value))} />
      </label>
    {/if}

    {#if choisi && enApercu}
      <div class="pied-ctrl">
        <button type="button" class="appliquer" disabled={chargement} data-tess-casque-appliquer
                onclick={() => enApercu && appliquer(enApercu)}>
          {tr('tess.headphone.apply')}
        </button>
      </div>
    {/if}

    <p class="source" data-tess-casque-source>
      {tr('tess.headphone.attribution').replace('{source}', SOURCE_OPRA).replace('{license}', enApercu?.source.license ?? reference?.license ?? LICENCE_OPRA)}
      {#if enApercu?.variant.author || reference?.author}
        · {tr('tess.headphone.author').replace('{author}', enApercu?.variant.author ?? reference?.author ?? '')}
      {/if}
    </p>
  </fieldset>
</div>

<style>
  .casque{display:flex; flex-direction:column; gap:12px; min-width:0}
  fieldset{border:0; margin:0; padding:0; min-width:0; display:flex; flex-direction:column; gap:12px}
  fieldset:disabled{opacity:.55}
  .verrou{margin:0; padding:10px 12px; border-radius:10px; border:1px solid var(--v2-acc2); background:var(--v2-acc-soft); color:var(--v2-txt2)}
  .note{margin:0; color:var(--v2-txt2); line-height:1.5; font-size:calc(13px * var(--v2-txt-echelle, 1))}
  .erreur{margin:0; padding:8px 12px; border-radius:10px; border:1px solid var(--v2-acc2); color:var(--v2-txt)}
  .lbl{color:var(--v2-txt2); font-size:calc(12.5px * var(--v2-txt-echelle, 1))}
  .lbl b{color:var(--v2-txt); font-weight:600; margin-left:4px}
  .actif{display:flex; flex-wrap:wrap; align-items:baseline; gap:8px}
  .variante{color:var(--v2-txt2); font-size:calc(12.5px * var(--v2-txt-echelle, 1))}
  .recherche{display:flex; flex-wrap:wrap; align-items:flex-end; gap:8px}
  .champ{display:flex; flex-direction:column; gap:6px; flex:1 1 220px; min-width:0}
  .champ input[type=search]{background:var(--v2-surface2); border:1px solid var(--v2-line2); border-radius:8px;
    color:var(--v2-txt); font:inherit; padding:7px 10px}
  .champ input[type=range]{accent-color:var(--v2-acc1)}
  .niveau{max-width:460px}
  .produits{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px; max-height:280px; overflow-y:auto}
  .produit{border:1px solid var(--v2-line); border-radius:10px; padding:8px 10px; display:flex; flex-direction:column; gap:6px}
  .tete-produit{display:flex; flex-wrap:wrap; align-items:baseline; gap:8px}
  .forme{font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3)}
  .variantes{display:flex; flex-wrap:wrap; gap:6px}
  .variante-btn{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); border-radius:var(--v2-r-pill);
    padding:4px 10px; cursor:pointer; font:inherit; font-size:calc(12px * var(--v2-txt-echelle, 1))}
  .variante-btn.on{background:var(--v2-acc-soft); color:var(--v2-txt); border-color:var(--v2-acc1)}
  .apercu{display:flex; flex-direction:column; gap:6px}
  .courbe{width:100%; max-width:520px; height:120px; border:1px solid var(--v2-line); border-radius:10px; background:var(--v2-surface2)}
  .courbe path{fill:none; stroke:var(--v2-acc1); stroke-width:2}
  .courbe .zero{stroke:var(--v2-line2); stroke-width:1}
  .echelle{display:flex; justify-content:space-between; max-width:520px; font:calc(10.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3)}
  .aide{display:block; color:var(--v2-txt3)}
  .pied-ctrl{display:flex; gap:8px}
  .petit{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt); border-radius:var(--v2-r-pill);
    padding:7px 14px; cursor:pointer; font:inherit; font-size:calc(12.5px * var(--v2-txt-echelle, 1))}
  .petit:disabled{opacity:.5; cursor:default}
  .appliquer{border:0; background:var(--v2-acc1); color:var(--v2-on-acc); border-radius:var(--v2-r-pill);
    font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); padding:8px 16px; cursor:pointer}
  .appliquer:disabled{opacity:.5; cursor:default}
  .source{margin:0; color:var(--v2-txt3); font-size:calc(11.5px * var(--v2-txt-echelle, 1))}
</style>
