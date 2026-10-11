<script lang="ts">
  /**
   * Réaffectation des canaux — les réglages du greffon
   * (renesenses/tune-server-rust#6044).
   *
   * Une grille N entrées × M sorties, gains en dB (case vide = muet), par
   * zone ; une règle facultative pour l'album en cours (#5279), qui prime.
   * Le serveur valide, normalise et dit ce que vaut la matrice
   * (`effective`) : l'écran l'affiche, il ne la recalcule pas.
   */
  import { t } from '../../lib/i18n';
  import { zoneRequise } from '../../lib/zoneRequise';
  import { currentZoneId, currentZone } from '../../lib/stores/zones';
  import { notifications } from '../../lib/stores/notifications';
  import {
    type CatalogueReaffectation, type EtatReaffectation, type ReglageReaffectation,
    getPrereglagesReaffectation, getReaffectationZone, setReaffectationZone, deleteReaffectationZone,
    getReaffectationAlbum, setReaffectationAlbum, deleteReaffectationAlbum,
    nomsDesCanaux, redimensionner, lireGain, afficherGain, avecGain, formeValide, identite,
    LIBELLES_PREREGLAGES, CANAUX_MAX,
  } from '../../lib/reaffectationCanaux';
  import '../../styles/tune-v2.css';

  let catalogue = $state<CatalogueReaffectation | null>(null);
  let etat = $state<EtatReaffectation | null>(null);
  let reglage = $state<ReglageReaffectation>(identite(2));
  let albumEtat = $state<EtatReaffectation | null>(null);
  let erreur = $state<string | null>(null);
  let occupe = $state(false);

  const albumId = $derived($currentZone?.current_track?.album_id ?? null);
  const albumTitre = $derived($currentZone?.current_track?.album_title ?? null);
  const nomsEntrees = $derived(nomsDesCanaux(reglage.inputs));
  const nomsSorties = $derived(nomsDesCanaux(reglage.outputs));
  /** La grille affichée est-elle celle que le serveur a jugée ? Sinon, son
   *  `effective` décrit l'ancienne et ne s'affiche pas. */
  const aJour = $derived(etat != null && JSON.stringify(reglage) === JSON.stringify(etat.settings));
  const largeurs = Array.from({ length: CANAUX_MAX }, (_, i) => i + 1);

  $effect(() => {
    getPrereglagesReaffectation().then((c) => { catalogue = c; }).catch(() => { catalogue = null; });
  });

  $effect(() => {
    const zid = $currentZoneId;
    if (zid == null) { etat = null; return; }
    getReaffectationZone(zid)
      .then((e) => { if ($currentZoneId === zid) { etat = e; reglage = e.settings; erreur = null; } })
      .catch((e) => { erreur = e?.message ?? String(e); });
  });

  $effect(() => {
    const aid = albumId;
    if (aid == null) { albumEtat = null; return; }
    getReaffectationAlbum(aid).then((e) => { if (albumId === aid) albumEtat = e; }).catch(() => { albumEtat = null; });
  });

  function appliquerPrereglage(id: string) {
    const p = catalogue?.presets.find((x) => x.id === id);
    if (p) reglage = { ...p.settings };
  }

  function changerTaille(entrees: number, sorties: number) {
    reglage = redimensionner(reglage, entrees, sorties);
  }

  function saisir(sortie: number, entree: number, ev: Event) {
    const champ = ev.currentTarget as HTMLInputElement;
    const g = lireGain(champ.value);
    if (g === undefined) {
      champ.value = afficherGain(reglage.gains_db[sortie][entree]);
      notifications.error($t('v2.cr.errGain' as any));
      return;
    }
    reglage = avecGain(reglage, sortie, entree, g);
  }

  async function enregistrer() {
    const zid = zoneRequise();
    if (zid == null || !formeValide(reglage)) return;
    occupe = true;
    try {
      etat = await setReaffectationZone(zid, reglage);
      reglage = etat.settings;
      erreur = null;
      if (!etat.applied_live) notifications.info($t('v2.cr.nextTrack' as any));
    } catch (e: any) {
      erreur = e?.message ?? String(e);
    } finally { occupe = false; }
  }

  async function effacer() {
    const zid = zoneRequise();
    if (zid == null) return;
    occupe = true;
    try { etat = await deleteReaffectationZone(zid); reglage = etat.settings; erreur = null; }
    catch (e: any) { erreur = e?.message ?? String(e); }
    finally { occupe = false; }
  }

  async function enregistrerPourLAlbum() {
    if (albumId == null || !formeValide(reglage)) return;
    occupe = true;
    try { albumEtat = await setReaffectationAlbum(albumId, reglage); erreur = null; }
    catch (e: any) { erreur = e?.message ?? String(e); }
    finally { occupe = false; }
  }

  async function retirerDeLAlbum() {
    if (albumId == null) return;
    occupe = true;
    try { albumEtat = await deleteReaffectationAlbum(albumId); erreur = null; }
    catch (e: any) { erreur = e?.message ?? String(e); }
    finally { occupe = false; }
  }
</script>

<section class="v2-cr tune-v2" data-testid="reaffectation-canaux">
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('v2.cr.eyebrow' as any)}</div>
      <h1>{$t('v2.cr.title' as any)}</h1>
    </div>
  </header>

  <div class="scroll">
    <p class="lead">{$t('v2.cr.lead' as any)}</p>

    {#if erreur}<div class="err">{erreur}</div>{/if}

    {#if $currentZoneId == null}
      <div class="state">{$t('v2.cr.noZone' as any)}</div>
    {:else}
      <div class="warn" data-bit-perfect>{$t('v2.cr.bitPerfect' as any)}</div>

      <div class="card">
        <div class="row">
          <div class="lbl"><span>{$t('v2.cr.enabled' as any)}</span><span class="hint">{$t('v2.cr.enabledHint' as any)}</span></div>
          <label class="sw">
            <input type="checkbox" checked={reglage.enabled} aria-label={$t('v2.cr.enabled' as any)}
              onchange={(e) => { reglage = { ...reglage, enabled: (e.currentTarget as HTMLInputElement).checked }; }} />
            <span class="slider"></span>
          </label>
        </div>

        {#if catalogue}
          <div class="row">
            <div class="lbl"><span>{$t('v2.cr.preset' as any)}</span></div>
            <select class="sel" aria-label={$t('v2.cr.preset' as any)}
              value={reglage.preset ?? ''} onchange={(e) => appliquerPrereglage((e.currentTarget as HTMLSelectElement).value)}>
              <option value="" disabled>{$t('v2.cr.presetCustom' as any)}</option>
              {#each catalogue.presets as p (p.id)}
                <option value={p.id}>{LIBELLES_PREREGLAGES[p.id] ? $t(LIBELLES_PREREGLAGES[p.id] as any) : p.label}</option>
              {/each}
            </select>
          </div>
        {/if}

        <div class="row">
          <div class="lbl"><span>{$t('v2.cr.size' as any)}</span><span class="hint">{$t('v2.cr.sizeHint' as any)}</span></div>
          <div class="taille">
            <select class="sel" aria-label={$t('v2.cr.inputs' as any)} value={reglage.inputs}
              onchange={(e) => changerTaille(Number((e.currentTarget as HTMLSelectElement).value), reglage.outputs)}>
              {#each largeurs as n (n)}<option value={n}>{n}</option>{/each}
            </select>
            <span>→</span>
            <select class="sel" aria-label={$t('v2.cr.outputs' as any)} value={reglage.outputs}
              onchange={(e) => changerTaille(reglage.inputs, Number((e.currentTarget as HTMLSelectElement).value))}>
              {#each largeurs as n (n)}<option value={n}>{n}</option>{/each}
            </select>
          </div>
        </div>

        <div class="grille-cadre">
          <table class="grille" data-grille>
            <thead>
              <tr>
                <th scope="col">{$t('v2.cr.outIn' as any)}</th>
                {#each nomsEntrees as nom, i (i)}<th scope="col">{nom}</th>{/each}
                <th scope="col">{$t('v2.cr.normalization' as any)}</th>
              </tr>
            </thead>
            <tbody>
              {#each reglage.gains_db as ligne, o (o)}
                <tr>
                  <th scope="row">{nomsSorties[o]}</th>
                  {#each ligne as g, i (i)}
                    <td>
                      <input class="gain" class:muet={g === null} inputmode="decimal" value={afficherGain(g)}
                        aria-label={`${nomsSorties[o]} ← ${nomsEntrees[i]}`}
                        placeholder="—" onchange={(e) => saisir(o, i, e)} />
                    </td>
                  {/each}
                  <td class="att">
                    {#if aJour && etat?.effective?.normalization_db}
                      {(etat.effective.normalization_db[o] ?? 0).toFixed(1)} dB
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="hint">{$t('v2.cr.gridHint' as any)}</p>

        <div class="row">
          <div class="lbl"><span>{$t('v2.cr.normalize' as any)}</span><span class="hint">{$t('v2.cr.normalizeHint' as any)}</span></div>
          <label class="sw">
            <input type="checkbox" checked={reglage.normalize} aria-label={$t('v2.cr.normalize' as any)}
              onchange={(e) => { reglage = { ...reglage, normalize: (e.currentTarget as HTMLInputElement).checked }; }} />
            <span class="slider"></span>
          </label>
        </div>

        {#if aJour && etat?.effective?.valid}
          <p class="hint" data-effectif>
            {etat.effective.identity ? $t('v2.cr.effIdentity' as any)
              : etat.effective.bit_exact_copy ? $t('v2.cr.effCopy' as any) : $t('v2.cr.effMix' as any)}
          </p>
        {/if}

        <div class="actions">
          <button class="go" disabled={occupe || !formeValide(reglage)} onclick={enregistrer}>{$t('v2.cr.save' as any)}</button>
          {#if etat?.saved}<button class="lnk danger" disabled={occupe} onclick={effacer}>{$t('v2.cr.reset' as any)}</button>{/if}
        </div>
      </div>

      <div class="card album" data-album>
        <div class="row">
          <div class="lbl">
            <span>{$t('v2.cr.albumTitle' as any)}</span>
            <span class="hint">{$t('v2.cr.albumHint' as any)}</span>
            {#if albumTitre}<span class="val">{albumTitre}</span>{/if}
            {#if albumEtat?.saved}<span class="val" data-regle-album>{$t('v2.cr.albumActive' as any)}</span>{/if}
          </div>
          <div class="actions">
            <button class="go" disabled={occupe || albumId == null || !formeValide(reglage)} onclick={enregistrerPourLAlbum}>{$t('v2.cr.albumSave' as any)}</button>
            {#if albumEtat?.saved}<button class="lnk danger" disabled={occupe} onclick={retirerDeLAlbum}>{$t('v2.cr.albumRemove' as any)}</button>{/if}
          </div>
        </div>
        {#if albumId == null}<p class="hint">{$t('v2.cr.albumNone' as any)}</p>{/if}
      </div>
    {/if}
  </div>
</section>

<style>
  .v2-cr{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px; max-width:920px}
  .lead{font-size:14px; line-height:1.6; color:var(--v2-txt2); padding:6px 0 18px; max-width:62ch}
  .state{padding:24px 0; color:var(--v2-txt3)}
  .err,.warn{padding:11px 14px; border-radius:10px; font-size:12.5px; line-height:1.5; margin-bottom:16px}
  .err{color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .warn{color:var(--v2-txt2); border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .card{border:1px solid var(--v2-line); border-radius:14px; background:var(--v2-surface2); padding:6px 20px 18px; margin-bottom:16px}
  .row{display:flex; align-items:center; justify-content:space-between; gap:24px; padding:16px 0;
    border-bottom:1px solid var(--v2-line)}
  .lbl{display:flex; flex-direction:column; gap:4px; min-width:0}
  .lbl span:first-child{font-size:14px; font-weight:600}
  .hint{font-size:11.5px; line-height:1.45; color:var(--v2-txt3); max-width:62ch}
  .val{font:12px var(--v2-mono); color:var(--v2-txt2)}
  .sel{background:var(--v2-surface); color:var(--v2-txt); border:1px solid var(--v2-line2); border-radius:8px; padding:6px 8px}
  .taille{display:flex; align-items:center; gap:8px}
  .grille-cadre{overflow-x:auto; padding:14px 0 6px}
  .grille{border-collapse:collapse; font:12px var(--v2-mono)}
  .grille th{padding:4px 6px; color:var(--v2-txt2); font-weight:600; text-align:center}
  .grille td{padding:2px}
  .gain{width:58px; text-align:right; background:var(--v2-surface); color:var(--v2-txt);
    border:1px solid var(--v2-line2); border-radius:6px; padding:5px 6px; font:inherit}
  .gain.muet{opacity:.55}
  .att{color:var(--v2-txt3); padding-left:10px; white-space:nowrap}
  .actions{display:flex; gap:10px; align-items:center; padding-top:14px}
  .album .actions{padding-top:0}
  .go{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2)); color:var(--v2-on-acc, #fff); border:0;
    border-radius:9px; padding:8px 14px; font-weight:600; cursor:pointer}
  .go:disabled{opacity:.45; cursor:default}
  .lnk{background:none; border:0; color:var(--v2-txt2); cursor:pointer; text-decoration:underline}
  .lnk.danger{color:var(--v2-danger)}
  .sw{position:relative; flex:0 0 auto; width:46px; height:26px; cursor:pointer}
  .sw input{position:absolute; opacity:0; width:0; height:0}
  .slider{position:absolute; inset:0; border-radius:999px; background:var(--v2-line2); transition:.18s}
  .slider::before{content:""; position:absolute; left:3px; top:3px; width:20px; height:20px; border-radius:50%;
    background:var(--v2-knob); transition:.18s}
  .sw input:checked + .slider{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw input:checked + .slider::before{transform:translateX(20px)}
  @media (max-width: 640px){ .scroll{padding:6px 16px 40px} .row{flex-wrap:wrap} }
</style>
