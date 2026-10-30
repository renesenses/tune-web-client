<script lang="ts">
  /**
   * « Mon thème » — #2527 (go de Bertrand du 30/10/2026, rc10).
   *
   * Toutes les couleurs au choix, aperçu et contraste WCAG AA EN DIRECT ;
   * l'enregistrement est refusé tant qu'une paire est sous son seuil. Le thème
   * est rangé PAR PROFIL sur le serveur, par le greffon `mon-theme` ; il se
   * partage en fichier JSON (export / import).
   *
   * Monté dans Réglages › Interface, sous les palettes.
   */
  import { t } from '../../lib/i18n';
  import * as api from '../../lib/api';
  import { notifications } from '../../lib/stores/notifications';
  import { dialogs } from '../../lib/stores/dialogs';
  import {
    GROUPES_MON_THEME, LIBELLES_GROUPES, LIBELLES_JETONS, FORMAT_THEME, VERSION_THEME, NOM_THEME_MAX,
    ID_GREFFON_MON_THEME, IMPORT_MAX_OCTETS,
    paires, pairesIllisibles, jugerTheme, jetonsDuTheme, declarations, couleursCalculees,
    couleurNormalisee, texteExport, nomDeFichier, lireTheme,
    type CouleursTheme, type Paire,
  } from '../../lib/monTheme';
  import {
    etatGreffonTheme, themeDuProfil, rangerMonTheme, effacerMonTheme,
  } from '../../lib/stores/monTheme';

  let racine = $state<HTMLElement | undefined>();
  let ouvert = $state(false);
  let nom = $state('');
  let couleurs = $state<CouleursTheme>({});
  let enCours = $state(false);
  let installation = $state(false);
  let message = $state<{ texte: string; erreur: boolean } | null>(null);

  const toutes = $derived(paires(couleurs));
  const echecs = $derived(pairesIllisibles(couleurs));
  const brouillon = $derived({ format: FORMAT_THEME, version: VERSION_THEME, name: nom, colors: couleurs });
  const jugement = $derived(jugerTheme(brouillon));
  const styleApercu = $derived(declarations(jetonsDuTheme(couleurs)));
  /** La plus faible marge des textes, pour dire « lisible » avec un chiffre. */
  const pireTexte = $derived(
    toutes.filter((p) => p.minimum === 4.5).reduce((m, p) => Math.min(m, p.ratio), Infinity),
  );

  const lib = (j: string) => $t((LIBELLES_JETONS[j] ?? j) as any);
  /** Une phrase traduite, ses `{x}` remplacés. */
  function tv(cle: string, vars: Record<string, string | number>): string {
    let s: string = $t(cle as any);
    for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  }
  function phrasePaire(p: Paire): string {
    return tv('monTheme.paire', { texte: lib(p.texte), fond: lib(p.fond), ratio: p.ratio.toFixed(2), minimum: p.minimum });
  }

  function partirDuThemeActuel() {
    const el = racine?.closest('.tune-v2') ?? document.querySelector('.tune-v2');
    if (el) couleurs = couleursCalculees(el);
    if (!nom.trim()) nom = $t('monTheme.nomParDefaut' as any);
  }

  function ouvrir() {
    message = null;
    const e = $themeDuProfil;
    if (e.theme) {
      nom = e.theme.name;
      couleurs = { ...e.theme.colors };
    } else {
      nom = '';
      partirDuThemeActuel();
    }
    ouvert = true;
  }

  function poser(j: string, v: string) {
    const c = couleurNormalisee(v);
    if (c) couleurs[j] = c;
  }

  async function enregistrer() {
    if (!jugement.ok || enCours) return;
    enCours = true;
    message = null;
    const ok = $t('monTheme.enregistre' as any);
    const refus = $t('monTheme.refuseServeur' as any);
    const ko = $t('monTheme.erreurEnregistrement' as any);
    try {
      await rangerMonTheme(jugement.theme, true);
      message = { texte: ok, erreur: false };
      notifications.success?.(ok);
    } catch (e) {
      const code = (e as { corps?: { error?: unknown } })?.corps?.error;
      message = { texte: code === 'mon_theme.illisible' ? refus : ko, erreur: true };
    } finally {
      enCours = false;
    }
  }

  function exporter() {
    if (!jugement.ok) return;
    try {
      const blob = new Blob([texteExport(jugement.theme)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomDeFichier(jugement.theme);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { /* navigateur sans téléchargement : rien à faire */ }
  }

  async function importer(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    const tropGros = $t('monTheme.importTropGros' as any);
    if (f.size > IMPORT_MAX_OCTETS) { message = { texte: tropGros, erreur: true }; ouvert = true; return; }
    const r = lireTheme(await f.text());
    if (!r.ok) {
      message = { texte: tv('monTheme.importInvalide', { champ: r.champ }), erreur: true };
      return;
    }
    nom = r.theme.name;
    couleurs = { ...r.theme.colors };
    ouvert = true;
    message = { texte: $t('monTheme.importe' as any), erreur: false };
  }

  async function effacer() {
    const question = $t('monTheme.effacerQuestion' as any);
    const fait = $t('monTheme.efface' as any);
    const ko = $t('monTheme.erreurEnregistrement' as any);
    if (!(await dialogs.confirm(question, { danger: true }))) return;
    try {
      await effacerMonTheme();
      ouvert = false;
      notifications.success?.(fait);
    } catch {
      message = { texte: ko, erreur: true };
    }
  }

  async function installer() {
    if (installation) return;
    installation = true;
    const ko = $t('monTheme.installErreur' as any);
    try {
      const r = await api.installPlugin(ID_GREFFON_MON_THEME);
      etatGreffonTheme.set(r?.restart_required === false ? 'actif' : 'a_redemarrer');
    } catch {
      notifications.error(ko);
    } finally {
      installation = false;
    }
  }
</script>

<div class="mt" bind:this={racine} data-mon-theme={$etatGreffonTheme}>
  {#if $etatGreffonTheme === 'a_installer'}
    <div class="ligne">
      <span class="hint">{$t('monTheme.manque' as any)}</span>
      <button class="lnk" disabled={installation} onclick={installer}>
        {installation ? $t('monTheme.installation' as any) : $t('monTheme.installer' as any)}
      </button>
    </div>
  {:else if $etatGreffonTheme === 'a_redemarrer'}
    <p class="hint">{$t('monTheme.redemarrer' as any)}</p>
  {:else if $etatGreffonTheme === 'actif'}
    <div class="ligne">
      <button class="lnk" onclick={ouvrir} aria-expanded={ouvert}>
        {$themeDuProfil.theme ? $t('monTheme.modifier' as any) : $t('monTheme.creer' as any)}
      </button>
      <label class="lnk fichier">
        {$t('monTheme.importer' as any)}
        <input type="file" accept="application/json,.json" onchange={importer} />
      </label>
      {#if $themeDuProfil.theme}
        <button class="lnk" onclick={effacer}>{$t('monTheme.effacer' as any)}</button>
      {/if}
    </div>
    {#if message && !ouvert}<p class="hint" class:err={message.erreur}>{message.texte}</p>{/if}

    {#if ouvert}
      <div class="editeur">
        <div class="col">
          <label class="champ">
            <span>{$t('monTheme.nom' as any)}</span>
            <input class="txt" type="text" maxlength={NOM_THEME_MAX} bind:value={nom} />
          </label>
          <button class="lnk" onclick={partirDuThemeActuel}>{$t('monTheme.partirActuel' as any)}</button>

          {#each GROUPES_MON_THEME as g (g.groupe)}
            <fieldset class="groupe">
              <legend>{$t(LIBELLES_GROUPES[g.groupe] as any)}</legend>
              {#each g.jetons as j (j)}
                <div class="jeton">
                  <input type="color" value={(couleurs[j] ?? '#000000').toLowerCase()}
                    aria-label={lib(j)}
                    oninput={(e) => poser(j, e.currentTarget.value)} />
                  <span class="nomj" title={lib(j)}>{lib(j)}</span>
                  <input class="hex" type="text" value={couleurs[j] ?? ''} maxlength="7" spellcheck="false"
                    aria-label={tv('monTheme.couleurHex', { nom: lib(j) })}
                    oninput={(e) => poser(j, e.currentTarget.value)} />
                </div>
              {/each}
            </fieldset>
          {/each}
        </div>

        <div class="col">
          <span class="sous">{$t('monTheme.apercu' as any)}</span>
          <div class="apercu" style={styleApercu} data-apercu-mon-theme>
            <div class="ap-fond">
              <div class="ap-carte">
                <div class="ap-titre">{$t('monTheme.apercuTitre' as any)}</div>
                <div class="ap-sec">{$t('monTheme.apercuSecondaire' as any)}</div>
                <div class="ap-att">{$t('monTheme.apercuAttenue' as any)}</div>
                <div class="ap-actions">
                  <span class="ap-bouton">{$t('monTheme.apercuBouton' as any)}</span>
                  <span class="ap-teinte">{$t('monTheme.apercuAccent' as any)}</span>
                </div>
              </div>
              <div class="ap-choix">{$t('monTheme.apercuChoix' as any)}</div>
              <div class="ap-actif">{$t('monTheme.apercuActif' as any)}</div>
              <div class="ap-erreur">{$t('monTheme.apercuErreur' as any)}</div>
              <div class="ap-lecteur">{$t('monTheme.apercuLecteur' as any)}</div>
            </div>
          </div>

          <span class="sous">{$t('monTheme.contraste' as any)}</span>
          <div class="verdict" role="status" aria-live="polite" class:ko={echecs.length > 0}>
            {#if echecs.length === 0}
              {tv('monTheme.lisible', { ratio: Number.isFinite(pireTexte) ? pireTexte.toFixed(2) : '—' })}
            {:else}
              {tv('monTheme.illisible', { count: echecs.length })}
            {/if}
          </div>
          {#if echecs.length > 0}
            <ul class="echecs" data-echecs-mon-theme>
              {#each echecs.slice(0, 12) as p (p.texte + p.fond)}
                <li><span class="pastille" style="background:{couleurs[p.fond]};color:{couleurs[p.texte]}">{p.ratio.toFixed(2)}</span>{phrasePaire(p)}</li>
              {/each}
            </ul>
          {/if}

          <div class="ligne">
            <button class="lnk prim" disabled={!jugement.ok || enCours} onclick={enregistrer}>
              {$t('monTheme.enregistrer' as any)}
            </button>
            <button class="lnk" disabled={!jugement.ok} onclick={exporter}>{$t('monTheme.exporter' as any)}</button>
            <button class="lnk" onclick={() => { ouvert = false; }}>{$t('monTheme.fermer' as any)}</button>
          </div>
          {#if !jugement.ok && 'champ' in jugement && jugement.champ === 'name'}
            <p class="hint err">{$t('monTheme.nomRequis' as any)}</p>
          {/if}
          {#if message}<p class="hint" class:err={message.erreur}>{message.texte}</p>{/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .mt { display: flex; flex-direction: column; gap: 10px; }
  .ligne { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .hint { margin: 0; font-size: 13px; color: var(--v2-txt3); }
  .hint.err { color: var(--v2-danger); }
  .lnk {
    background: none; border: 1px solid var(--v2-line); border-radius: 6px;
    padding: 5px 10px; color: var(--v2-txt); font-size: 13px; cursor: pointer;
  }
  .lnk:hover:not(:disabled) { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .lnk:disabled { opacity: 0.45; cursor: default; }
  .lnk.prim { border-color: var(--v2-acc1); color: var(--v2-acc1); }
  .fichier { position: relative; overflow: hidden; }
  .fichier input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }

  .editeur { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; }
  @media (max-width: 760px) { .editeur { grid-template-columns: minmax(0, 1fr); } }
  .col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .champ { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--v2-txt2); }
  .txt, .hex {
    background: var(--v2-surface2); color: var(--v2-txt); border: 1px solid var(--v2-line);
    border-radius: 6px; padding: 5px 8px; font-size: 13px;
  }
  .hex { width: 6.5em; font-family: var(--v2-mono); }
  .groupe { border: 1px solid var(--v2-line); border-radius: 8px; padding: 8px 10px; margin: 0; display: flex; flex-direction: column; gap: 6px; }
  .groupe legend { font-size: 12px; color: var(--v2-txt3); padding: 0 4px; }
  .jeton { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
  .jeton input[type='color'] { width: 34px; height: 26px; padding: 0; border: 1px solid var(--v2-line); border-radius: 4px; background: none; cursor: pointer; }
  .nomj { font-size: 13px; color: var(--v2-txt); overflow: hidden; text-overflow: ellipsis; }
  .sous { font-size: 12px; color: var(--v2-txt3); text-transform: uppercase; letter-spacing: .04em; }

  /* L'aperçu lit les jetons posés en ligne sur `.apercu` : il montre le
     brouillon sans repeindre le reste de l'écran. */
  .apercu { border-radius: 10px; overflow: hidden; border: 1px solid var(--v2-line); }
  .ap-fond { background: var(--v2-bg); padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .ap-carte { background: var(--v2-surface); border: 1px solid var(--v2-line2); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 3px; }
  .ap-titre { color: var(--v2-txt); font-weight: 600; }
  .ap-sec { color: var(--v2-txt2); font-size: 13px; }
  .ap-att { color: var(--v2-txt3); font-size: 12px; }
  .ap-actions { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
  .ap-bouton { background: linear-gradient(90deg, var(--v2-acc1), var(--v2-acc2)); color: var(--v2-on-acc); border-radius: 14px; padding: 3px 12px; font-size: 13px; font-weight: 600; }
  .ap-teinte { color: var(--v2-acc1); font-size: 13px; }
  .ap-choix { background: var(--v2-surface2); color: var(--v2-txt); border: 1px solid var(--v2-line); border-radius: 6px; padding: 6px 8px; font-size: 13px; }
  .ap-actif { background: linear-gradient(90deg, var(--v2-active1), var(--v2-active2)); color: var(--v2-acc-tint); border-radius: 6px; padding: 6px 8px; font-size: 13px; }
  .ap-erreur { background: var(--v2-danger-soft); color: var(--v2-danger); border: 1px solid var(--v2-danger-bd); border-radius: 6px; padding: 6px 8px; font-size: 13px; }
  .ap-lecteur { background: linear-gradient(180deg, var(--v2-player1), var(--v2-player2)); color: var(--v2-txt2); border-top: 1px solid var(--v2-line); padding: 6px 8px; font-size: 12px; }

  .verdict { font-size: 13px; color: var(--v2-acc1); }
  .verdict.ko { color: var(--v2-danger); font-weight: 600; }
  .echecs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--v2-txt2); }
  .echecs li { display: flex; gap: 8px; align-items: center; }
  .pastille { font-size: 12px; font-weight: 700; border-radius: 4px; padding: 1px 5px; border: 1px solid var(--v2-line); }
</style>
