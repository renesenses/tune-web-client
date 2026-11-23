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
   * « APPLY CHANGES » règle le mode du serveur : `immediately` (pause puis
   * reprise) ou `at_next_playback`.
   *
   * Le panneau ne parle jamais au serveur lui-même : l'écran (`TessV2`) fait
   * les appels et lui rend la liste.
   */
  import { t } from '../../../lib/i18n';
  import { nomDuPreReglage, type PreReglagesTess } from '../../../lib/tess';

  let {
    liste,
    actif = null,
    occupe = false,
    onLoad,
    onSave,
    onRename,
    onDelete,
    onMode,
  }: {
    liste: PreReglagesTess;
    actif?: string | null;
    occupe?: boolean;
    onLoad: (id: string) => void;
    onSave: (nom: string) => void;
    onRename: (id: string, nom: string) => void;
    onDelete: (id: string) => void;
    onMode: (mode: 'immediately' | 'at_next_playback') => void;
  } = $props();

  const tr = (k: string) => $t(k as any);
  const NOM_MAX = 80;

  let nouveauNom = $state('');
  let enRenommage = $state<string | null>(null);
  let nomRenomme = $state('');
  let aSupprimer = $state<string | null>(null);

  const immediat = $derived(liste.apply_mode !== 'at_next_playback');
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
                    data-tess-prereglage-confirmer>{tr('tess.presets.confirmDelete')}</button>
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

  <div class="mode">
    <div class="sur-titre">{tr('tess.presets.applyChanges')}</div>
    <div class="bascule" role="radiogroup" aria-label={tr('tess.presets.applyChanges')}>
      <button role="radio" aria-checked={immediat} class:choisi={immediat} disabled={occupe}
              data-tess-mode="immediately" onclick={() => { if (!immediat) onMode('immediately'); }}>
        {tr('tess.presets.immediately')}
      </button>
      <button role="radio" aria-checked={!immediat} class:choisi={!immediat} disabled={occupe}
              data-tess-mode="at_next_playback" onclick={() => { if (immediat) onMode('at_next_playback'); }}>
        {tr('tess.presets.atNextPlayback')}
      </button>
    </div>
    <p class="aide" data-tess-mode-aide>
      {immediat ? tr('tess.presets.helpImmediately') : tr('tess.presets.helpAtNextPlayback')}
    </p>
  </div>
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
  .mode{border-top:1px solid var(--v2-line); padding-top:12px; display:flex; flex-direction:column; gap:10px}
  .sur-titre{font:600 calc(11.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3); letter-spacing:.12em; text-transform:uppercase}
  .bascule{display:grid; grid-template-columns:1fr 1fr; gap:4px; border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill); padding:4px}
  .bascule button{border:0; background:transparent; color:var(--v2-txt); border-radius:var(--v2-r-pill); padding:9px 12px;
    cursor:pointer; font:inherit}
  .bascule button.choisi{background:var(--v2-acc1); color:var(--v2-on-acc); font-weight:700}
  .bascule button:disabled{cursor:default}
</style>
