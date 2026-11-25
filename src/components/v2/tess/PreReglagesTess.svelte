<script lang="ts">
  /**
   * Panneau « Presets » de l'écran TESS (lot W4, maquette A2 ; routes T17).
   *
   * Un préréglage garde chaque greffon, leur ordre et tous leurs réglages ;
   * la liste est commune au serveur, le préréglage « ACTIVE » est celui de la
   * zone affichée. Charger REMPLACE la chaîne de la zone (le serveur passe
   * par la même voie que le `PUT` : droits et motifs compris). On enregistre
   * la chaîne courante sous un nom ; on renomme, on supprime (avec une
   * confirmation dans le panneau, jamais une boîte native).
   *
   * Refonte rc14 (Rémi) : « APPLY CHANGES » a quitté ce panneau ; c'est un
   * interrupteur de l'en-tête de l'écran. Le panneau se ferme après un
   * chargement ou un enregistrement réussi (c'est l'écran qui le ferme).
   * Il montre aussi les ANCIENS préréglages de l'écran Égaliseur
   * (`GET /eq/presets`) : les charger écrit leur courbe dans l'égaliseur
   * correspondant de la chaîne (décision du 25/11 : rien ne se perd).
   *
   * Le panneau ne parle jamais au serveur lui-même : l'écran (`TessV2`) fait
   * les appels et lui rend la liste.
   */
  import { t } from '../../../lib/i18n';
  import { nomDuPreReglage, type PreReglagesTess } from '../../../lib/tess';
  import type { EqProPreset } from '../../../lib/api';

  let {
    liste,
    actif = null,
    occupe = false,
    onLoad,
    onSave,
    onRename,
    onDelete,
    anciens = [],
    onLoadAncien = null,
  }: {
    liste: PreReglagesTess;
    actif?: string | null;
    occupe?: boolean;
    onLoad: (id: string) => void;
    onSave: (nom: string) => void;
    onRename: (id: string, nom: string) => void;
    onDelete: (id: string) => void;
    /** Les anciens préréglages de l'écran Égaliseur. */
    anciens?: EqProPreset[];
    onLoadAncien?: ((p: EqProPreset) => void) | null;
  } = $props();

  const tr = (k: string) => $t(k as any);
  const NOM_MAX = 80;

  let nouveauNom = $state('');
  let enRenommage = $state<string | null>(null);
  let nomRenomme = $state('');
  let aSupprimer = $state<string | null>(null);
  let boutonConfirmer = $state<HTMLButtonElement | null>(null);
  // La confirmation prend le focus : Échap l'annule sans la souris.
  $effect(() => { if (aSupprimer && boutonConfirmer) boutonConfirmer.focus(); });
  const annulerSuppression = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); aSupprimer = null; } };

  const nomOk = (n: string) => n.trim().length > 0 && n.trim().length <= NOM_MAX;
  const nom = (p: PreReglagesTess['presets'][number]) => nomDuPreReglage(p, tr('tess.presets.pure'));

  function enregistrer() {
    if (!nomOk(nouveauNom) || occupe) return;
    onSave(nouveauNom.trim());
    nouveauNom = '';
  }
  function renommer(id: string) {
    if (!nomOk(nomRenomme) || occupe) return;
    onRename(id, nomRenomme.trim());
    enRenommage = null;
  }
</script>

<section class="prereglages" aria-labelledby="tess-prereglages-titre" data-tess-prereglages>
  <h2 id="tess-prereglages-titre">{tr('tess.presets.title')}</h2>
  <p class="intro">{tr('tess.presets.intro')}</p>

  {#if liste.presets.length === 0}
    <p class="vide" data-tess-prereglages-vide>{tr('tess.presets.empty')}</p>
  {/if}
  <ul class="liste">
    {#each liste.presets as p (p.id)}
      <li class="ligne" class:actif={p.id === actif} data-tess-prereglage={p.id}>
        {#if enRenommage === p.id}
          <input class="champ" type="text" maxlength={NOM_MAX} bind:value={nomRenomme}
                 aria-label={tr('tess.presets.renameAria').replace('{name}', nom(p))}
                 data-tess-prereglage-nom
                 onkeydown={(e) => { if (e.key === 'Enter') renommer(p.id); if (e.key === 'Escape') enRenommage = null; }} />
          <button class="bouton plein" disabled={occupe || !nomOk(nomRenomme)} onclick={() => renommer(p.id)}
                  data-tess-prereglage-valider>{tr('tess.presets.save')}</button>
          <button class="bouton" onclick={() => (enRenommage = null)}>{tr('tess.presets.cancel')}</button>
        {:else}
          <span class="nom" title={nom(p)}>{nom(p)}</span>
          {#if p.id === actif}
            <span class="badge" data-tess-prereglage-actif>{tr('tess.presets.active')}</span>
          {:else}
            <button class="bouton" disabled={occupe} onclick={() => onLoad(p.id)}
                    data-tess-prereglage-charger>{tr('tess.presets.load')}</button>
          {/if}
          <button class="icone" disabled={occupe} title={tr('tess.presets.renameAria').replace('{name}', nom(p))}
                  aria-label={tr('tess.presets.renameAria').replace('{name}', nom(p))}
                  data-tess-prereglage-renommer
                  onclick={() => { enRenommage = p.id; nomRenomme = nom(p); aSupprimer = null; }}>✎</button>
          {#if aSupprimer === p.id}
            <button class="bouton danger" disabled={occupe} onclick={() => { aSupprimer = null; onDelete(p.id); }}
                    bind:this={boutonConfirmer} onkeydown={annulerSuppression}
                    data-tess-prereglage-confirmer>{tr('tess.presets.confirmDelete')}</button>
            <button class="bouton" onclick={() => (aSupprimer = null)} onkeydown={annulerSuppression}
                    data-tess-prereglage-annuler>{tr('tess.presets.cancel')}</button>
          {:else}
            <button class="icone" disabled={occupe} title={tr('tess.presets.deleteAria').replace('{name}', nom(p))}
                    aria-label={tr('tess.presets.deleteAria').replace('{name}', nom(p))}
                    data-tess-prereglage-supprimer
                    onclick={() => { aSupprimer = p.id; enRenommage = null; }}>×</button>
          {/if}
        {/if}
      </li>
    {/each}
  </ul>

  <div class="ajout">
    <input class="champ" type="text" maxlength={NOM_MAX} bind:value={nouveauNom}
           placeholder={tr('tess.presets.namePlaceholder')} aria-label={tr('tess.presets.namePlaceholder')}
           data-tess-prereglage-nouveau
           onkeydown={(e) => { if (e.key === 'Enter') enregistrer(); }} />
    <button class="bouton plein" disabled={occupe || !nomOk(nouveauNom)} onclick={enregistrer}
            data-tess-prereglage-enregistrer>{tr('tess.presets.save')}</button>
  </div>

  {#if anciens.length > 0 && onLoadAncien}
    <div class="anciens" data-tess-anciens-prereglages>
      <div class="sur-titre">{tr('tess.presets.legacyTitle')}</div>
      <p class="aide">{tr('tess.presets.legacyIntro')}</p>
      <ul class="liste">
        {#each anciens as p (p.id)}
          <li class="ligne" data-tess-ancien-prereglage={p.id}>
            <span class="nom" title={p.name}>{p.name}</span>
            <span class="badge-type">{p.eq_type === 'parametric' ? tr('tess.plugin.equalizer-parametric') : tr('tess.plugin.equalizer-graphic')}</span>
            <button class="bouton" disabled={occupe} onclick={() => onLoadAncien?.(p)}
                    data-tess-ancien-charger>{tr('tess.presets.load')}</button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</section>

<style>
  .prereglages{border:1px solid var(--v2-line); border-radius:16px; background:var(--v2-surface); padding:20px 22px;
    display:flex; flex-direction:column; gap:12px; min-width:0}
  .prereglages h2{margin:0; font-size:calc(22px * var(--v2-txt-echelle, 1)); font-weight:700}
  .intro,.vide,.aide{margin:0; color:var(--v2-txt2); font-size:calc(13px * var(--v2-txt-echelle, 1)); line-height:1.5}
  .liste{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px}
  .ligne{display:flex; align-items:center; gap:10px; border:1px solid var(--v2-line); border-radius:12px; padding:10px 12px; min-width:0}
  .ligne.actif{border-color:var(--v2-acc1); background:var(--v2-acc-soft)}
  .nom{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600}
  .badge{font:600 calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-acc1); letter-spacing:.06em}
  .bouton{border:1px solid var(--v2-acc2); background:transparent; color:var(--v2-acc1); border-radius:var(--v2-r-pill);
    padding:6px 14px; cursor:pointer; font:inherit; white-space:nowrap}
  .bouton.plein{background:var(--v2-acc1); color:var(--v2-on-acc); border-color:var(--v2-acc1); font-weight:700}
  .bouton.danger{border-color:var(--v2-danger-bd); color:var(--v2-danger)}
  .bouton:disabled,.icone:disabled{opacity:.5; cursor:default}
  .icone{border:0; background:transparent; color:var(--v2-txt3); cursor:pointer; font-size:calc(16px * var(--v2-txt-echelle, 1));
    padding:4px 6px; border-radius:8px}
  .icone:hover{background:var(--v2-hover); color:var(--v2-txt)}
  .ajout{display:flex; gap:10px; align-items:center}
  .champ{flex:1; min-width:0; border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill); background:var(--v2-bg);
    color:var(--v2-txt); padding:9px 14px; font:inherit}
  .anciens{border-top:1px solid var(--v2-line); padding-top:12px; display:flex; flex-direction:column; gap:8px}
  .badge-type{font:calc(10.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3); white-space:nowrap}
  .sur-titre{font:600 calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3); letter-spacing:.12em; text-transform:uppercase}
</style>
