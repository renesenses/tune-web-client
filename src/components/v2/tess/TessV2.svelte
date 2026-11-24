<script lang="ts">
  /**
   * TESS — Tune Engine for Sound Shaping (lot W1, maquette A1).
   *
   * Deux colonnes : le chemin du signal à gauche (`CheminTess`), le greffon
   * choisi à droite (`ReglagesGreffonTess`). Sélecteurs Zone et Préréglage en
   * tête.
   *
   * 🔴 CACHÉ sans la capacité serveur : l'entrée de la barre et la pastille
   * de la barre de lecture n'existent que si `GET /zones/{id}/tess` répond
   * selon le contrat. Ouvert par son adresse sur un serveur sans TESS, la
   * coquille revient à l'accueil dès que la capacité vaut `non` ; en attendant,
   * l'écran le dit et ne montre rien d'autre. Les préréglages ne sont lus
   * qu'une fois la capacité confirmée.
   *
   * Préréglages (lot W4, maquette A2, routes T17) : le bouton « Préréglage »
   * de l'en-tête ouvre le panneau `PreReglagesTess` (charger, enregistrer la
   * chaîne courante, renommer, supprimer, mode d'application). Charger passe
   * par la route du serveur, qui marque le préréglage « ACTIVE » pour la zone
   * et dit ce qui ne s'applique pas sur cette sortie.
   *
   * Chaque geste envoie la chaîne entière (`PUT /zones/{id}/tess`) et
   * l'écran se redessine depuis la RÉPONSE : l'ordre affiché est toujours
   * celui que le serveur a résolu (Q9), jamais une supposition locale.
   */
  import { t } from '../../../lib/i18n';
  import * as api from '../../../lib/api';
  import { zones, currentZoneId } from '../../../lib/stores/zones';
  import { isPremium } from '../../../lib/stores/license';
  import { capaciteTess } from '../../../lib/stores/tess';
  import {
    contratCompris, basculerGreffon, retirerGreffon, ajouterGreffon, deplacerGreffon, avecBypassAll,
    conflitExclusif, descripteur, estPremium, liensDe, libelleOuRepli,
    nomDuPreReglage,
    type ReponseTessZone, type ChaineTess, type RefusTess, type PreReglagesTess, type NonAppliqueTess,
  } from '../../../lib/tess';
  import PanneauPreReglages from './PreReglagesTess.svelte';
  import CheminTess from './CheminTess.svelte';
  import ReglagesGreffonTess from './ReglagesGreffonTess.svelte';
  import '../../../styles/tune-v2.css';

  const tr = (k: string) => $t(k as any);

  let zoneId = $state<number | null>(null);
  let reponse = $state<ReponseTessZone | null>(null);
  let chargement = $state(false);
  let absent = $state(false);
  let occupe = $state(false);
  let message = $state<string | null>(null);
  let selection = $state<string | null>(null);
  let preReglages = $state<PreReglagesTess | null>(null);
  let panneauPreReglages = $state(false);
  let avis = $state<string | null>(null);

  // La zone de l'écran part de la zone courante, puis suit le sélecteur.
  $effect(() => { if (zoneId == null && $currentZoneId != null) zoneId = $currentZoneId; });

  let jeton = 0;
  async function charger(id: number) {
    const moi = ++jeton;
    chargement = true;
    message = null;
    avis = null;
    try {
      const r = await api.getTessZone(id);
      if (moi !== jeton) return;
      if (r.ok && contratCompris(r.reponse)) {
        reponse = r.reponse;
        absent = false;
        capaciteTess.set('oui');
      } else if (r.ok || 'absent' in r) {
        reponse = null;
        absent = true;
        capaciteTess.set('non');
      } else if ('zoneInconnue' in r) {
        // La zone a disparu : TESS reste annoncé, on le dit sans rien cacher.
        reponse = null;
        message = tr('tess.zoneNotFound');
      } else {
        message = texteRefus(r.refus);
      }
    } catch {
      if (moi === jeton) message = tr('tess.loadError');
    } finally {
      if (moi === jeton) chargement = false;
    }
  }

  $effect(() => { if (zoneId != null) void charger(zoneId); });
  // `GET /tess/presets` seulement sur un serveur qui annonce TESS (pas de 404
  // inutile face à un rc12 ou rc13), et une seule fois.
  let preReglagesDemandes = false;
  $effect(() => {
    if ($capaciteTess !== 'oui' || preReglagesDemandes) return;
    preReglagesDemandes = true;
    void api.getTessPresets().then((p) => { preReglages = p; });
  });

  const nom = (id: string) =>
    libelleOuRepli(tr(`tess.plugin.${id}`), `tess.plugin.${id}`, descripteur(reponse?.catalog, id)?.name ?? id);

  function texteRefus(r: RefusTess): string {
    const base = libelleOuRepli(tr(`tess.refusal.${r.code}`), `tess.refusal.${r.code}`, r.detail || tr('tess.refusal.generic'));
    return base.replace('{name}', r.plugin_id ? nom(r.plugin_id) : '');
  }

  async function envoyer(chaine: ChaineTess | null) {
    if (!chaine || zoneId == null || occupe) return;
    occupe = true;
    message = null;
    try {
      const r = await api.putTessZone(zoneId, chaine);
      if (r.ok) reponse = r.reponse;
      else if ('refus' in r) message = texteRefus(r.refus);
      else if ('zoneInconnue' in r) { reponse = null; message = tr('tess.zoneNotFound'); }
      else { absent = true; capaciteTess.set('non'); }
    } catch {
      message = tr('tess.saveError');
    } finally {
      occupe = false;
    }
  }

  function basculer(id: string, actif: boolean) {
    if (!reponse) return;
    const autre = actif ? conflitExclusif(reponse.chain, reponse.catalog, id) : null;
    if (autre) {
      // L'exclusivité est tenue ICI, avant le serveur : on n'envoie rien.
      message = tr('tess.exclusive').replace(/\{a\}/g, nom(id)).replace(/\{b\}/g, nom(autre));
      return;
    }
    void envoyer(basculerGreffon(reponse.chain, reponse.catalog, id, actif));
  }
  function retirer(id: string) {
    if (!reponse) return;
    if (selection === id) selection = null;
    void envoyer(retirerGreffon(reponse.chain, id));
  }
  function deplacer(de: number, vers: number) {
    if (!reponse) return;
    const c = deplacerGreffon(reponse.chain, reponse.catalog, de, vers);
    if (!c) { message = tr('tess.cantMove'); return; }
    void envoyer(c);
  }
  function ajouter(id: string) {
    if (!reponse) return;
    selection = id;
    void envoyer(ajouterGreffon(reponse.chain, reponse.catalog, id, $isPremium));
  }
  function bypass(b: boolean) {
    if (reponse) void envoyer(avecBypassAll(reponse.chain, b));
  }
  // ── Préréglages (W4 / T17) ──
  const nomDuPreReglageAffiche = (id: string | null | undefined) => {
    const p = id ? preReglages?.presets.find((x) => x.id === id) : undefined;
    return p ? nomDuPreReglage(p, tr('tess.presets.pure')) : tr('tess.presetNone');
  };
  const motif = (r: string) => libelleOuRepli(tr(`tess.reason.${r}`), `tess.reason.${r}`, r);

  /** Une erreur propre aux préréglages (pas un refus de chaîne). */
  function texteErreurPreReglage(code: string): string {
    if (code === 'preset_not_found') return tr('tess.presets.notFound');
    if (code === 'invalid_name') return tr('tess.presets.invalidName');
    if (code === 'zone_not_found') return tr('tess.zoneNotFound');
    return tr('tess.presets.error');
  }

  async function relirePreReglages() {
    const p = await api.getTessPresets();
    if (p) preReglages = p;
  }

  async function gestePreReglage<T>(appel: () => Promise<api.ResultatPreReglageTess<T>>, succes: (c: T) => void) {
    if (occupe) return;
    occupe = true;
    message = null;
    avis = null;
    try {
      const r = await appel();
      if (r.ok) succes(r.corps);
      else if ('refus' in r) message = texteRefus(r.refus);
      else {
        message = texteErreurPreReglage(r.code);
        if (r.code === 'preset_not_found') void relirePreReglages();
      }
    } catch {
      message = tr('tess.presets.error');
    } finally {
      occupe = false;
    }
  }

  function chargerPreReglage(id: string) {
    if (zoneId == null) return;
    const zone = zoneId;
    // Charger un préréglage REMPLACE la chaîne de la zone (contrat § 5) ; le
    // serveur vérifie les droits et dit ce qui ne s'applique pas ici.
    void gestePreReglage(() => api.appliquerPreReglageTess(zone, id), (c) => {
      if (zoneId !== zone) return;
      reponse = c.zone;
      const absents = (c.not_applied ?? []) as NonAppliqueTess[];
      const morceaux: string[] = [];
      if (absents.length > 0) {
        const liste = absents.map((a) => `${a.plugin_id ? nom(a.plugin_id) : ''} (${motif(a.reason)})`).join(', ');
        morceaux.push(tr('tess.presets.notApplied').replace('{list}', liste));
      }
      if (c.apply_mode === 'at_next_playback') morceaux.push(tr('tess.presets.appliesAtNextPlayback'));
      avis = morceaux.length > 0 ? morceaux.join(' ') : null;
    });
  }
  function enregistrerPreReglage(nomChoisi: string) {
    if (zoneId == null) return;
    const zone = zoneId;
    void gestePreReglage(() => api.enregistrerPreReglageTess(zone, nomChoisi), (p) => {
      if (preReglages) preReglages = { ...preReglages, presets: [...preReglages.presets, p] };
      if (reponse && zoneId === zone) reponse = { ...reponse, active_preset: p.id };
    });
  }
  function renommerPreReglage(id: string, nomChoisi: string) {
    void gestePreReglage(() => api.renommerPreReglageTess(id, nomChoisi), (p) => {
      if (preReglages) preReglages = { ...preReglages, presets: preReglages.presets.map((x) => (x.id === p.id ? p : x)) };
    });
  }
  function supprimerPreReglage(id: string) {
    void gestePreReglage(() => api.supprimerPreReglageTess(id), () => {
      if (preReglages) preReglages = { ...preReglages, presets: preReglages.presets.filter((x) => x.id !== id) };
      if (reponse?.active_preset === id) reponse = { ...reponse, active_preset: null };
    });
  }
  function reglerMode(mode: 'immediately' | 'at_next_playback') {
    void gestePreReglage(() => api.reglerModeApplicationTess(mode), (l) => { preReglages = l; });
  }

  const lienChoisi = $derived(reponse ? liensDe(reponse.chain).find((l) => l.id === selection) ?? null : null);
  const blocageChoisi = $derived.by(() => {
    if (!reponse || !lienChoisi || lienChoisi.enabled) return null;
    const autre = conflitExclusif(reponse.chain, reponse.catalog, lienChoisi.id);
    if (autre) return tr('tess.exclusive').replace(/\{a\}/g, nom(lienChoisi.id)).replace(/\{b\}/g, nom(autre));
    if (!$isPremium && estPremium(descripteur(reponse.catalog, lienChoisi.id))) {
      return tr('tess.premiumRequired').replace('{name}', nom(lienChoisi.id));
    }
    return null;
  });
  const horsTess = $derived(reponse?.applicability?.status === 'outside_tess' ? reponse.applicability : null);
</script>

<section class="v2-tess tune-v2" data-ecran-tess>
  <header class="v2-top">
    <div class="v2-titres">
      <div class="v2-eyebrow">{$t('tess.eyebrow' as any)}</div>
      <h1>{$t('v2.nav.tess' as any)}</h1>
      <div class="sous-titre">{$t('tess.subtitle' as any)}</div>
    </div>
    {#if !absent}
      <div class="selecteurs">
        <label class="sel">
          <span>{$t('tess.zone' as any)}</span>
          <select data-tess-zone value={zoneId ?? ''} onchange={(e) => {
            const v = Number((e.currentTarget as HTMLSelectElement).value);
            if (Number.isFinite(v)) { zoneId = v; selection = null; }
          }}>
            {#each $zones as z (z.id)}<option value={z.id}>{z.name}</option>{/each}
          </select>
        </label>
        {#if preReglages}
          <button class="sel bouton-sel" data-tess-preset aria-expanded={panneauPreReglages} disabled={!reponse}
                  onclick={() => (panneauPreReglages = !panneauPreReglages)}>
            <span>{$t('tess.preset' as any)}</span>
            <strong title={nomDuPreReglageAffiche(reponse?.active_preset)}>{nomDuPreReglageAffiche(reponse?.active_preset)}</strong>
            <span aria-hidden="true">{panneauPreReglages ? '▴' : '▾'}</span>
          </button>
        {/if}
      </div>
    {/if}
  </header>

  <div class="scroll">
    {#if absent || $capaciteTess === 'non'}
      <div class="etat" data-tess-indisponible>{$t('tess.unavailable' as any)}</div>
    {:else if zoneId == null}
      <div class="etat">{$t('tess.noZone' as any)}</div>
    {:else if !reponse}
      <div class="etat" data-tess-etat>{chargement ? $t('tess.loading' as any) : (message ?? '')}</div>
    {:else}
      {#if horsTess}
        <div class="avis" role="note" data-tess-hors={horsTess.reason ?? ''}>
          {libelleOuRepli(tr(`tess.outside.${horsTess.reason}`), `tess.outside.${horsTess.reason}`, tr('tess.outside.generic'))}
        </div>
      {/if}
      {#if message}<div class="erreur" role="alert" data-tess-message>{message}</div>{/if}
      {#if avis}<div class="avis" role="status" data-tess-avis>{avis}</div>{/if}
      {#if panneauPreReglages && preReglages}
        <div class="panneau-prereglages">
          <PanneauPreReglages
            liste={preReglages}
            actif={reponse.active_preset ?? null}
            {occupe}
            onLoad={chargerPreReglage}
            onSave={enregistrerPreReglage}
            onRename={renommerPreReglage}
            onDelete={supprimerPreReglage}
            onMode={reglerMode}
          />
        </div>
      {/if}
      <div class="colonnes">
        <CheminTess
          {reponse}
          premium={$isPremium}
          {occupe}
          {selection}
          onSelect={(id) => (selection = id)}
          onToggle={basculer}
          onRemove={retirer}
          onMove={deplacer}
          onBypass={bypass}
          onAdd={ajouter}
        />
        {#if lienChoisi}
          <ReglagesGreffonTess
            lien={lienChoisi}
            nom={nom(lienChoisi.id)}
            bloque={blocageChoisi}
            {occupe}
            onToggle={basculer}
            onRemove={retirer}
          />
        {:else}
          <div class="vide">{$t('tess.selectPlugin' as any)}</div>
        {/if}
      </div>
    {/if}
  </div>
</section>

<style>
  .v2-tess{display:flex; flex-direction:column; height:100%; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .sous-titre{color:var(--v2-txt2); font-size:calc(13.5px * var(--v2-txt-echelle, 1)); margin-top:4px}
  .selecteurs{display:flex; gap:10px; flex-wrap:wrap; align-items:center}
  .sel{display:inline-flex; align-items:center; gap:8px; border:1px solid var(--v2-line2); border-radius:var(--v2-r-pill);
    padding:6px 8px 6px 14px; color:var(--v2-txt2); font-size:calc(13px * var(--v2-txt-echelle, 1))}
  .bouton-sel{background:transparent; cursor:pointer; font:inherit; padding-right:14px}
  .bouton-sel strong{color:var(--v2-txt); font-weight:600; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .bouton-sel:disabled{opacity:.5; cursor:default}
  .panneau-prereglages{max-width:520px; margin-bottom:18px}
  .sel select{background:transparent; border:0; color:var(--v2-txt); font:600 calc(13px * var(--v2-txt-echelle, 1)) var(--v2-sans); max-width:240px}
  .scroll{flex:1; overflow-y:auto; padding:6px 30px 40px}
  .etat{padding:24px 0; color:var(--v2-txt3)}
  .avis,.erreur{padding:11px 14px; border-radius:10px; font-size:calc(12.5px * var(--v2-txt-echelle, 1)); line-height:1.5; margin-bottom:14px}
  .avis{color:var(--v2-txt2); border:1px solid var(--v2-acc2); background:var(--v2-acc-soft)}
  .erreur{color:var(--v2-danger); border:1px solid var(--v2-danger-bd)}
  .colonnes{display:grid; grid-template-columns:minmax(300px, 520px) minmax(0, 1fr); gap:24px; align-items:start}
  .vide{border:1px dashed var(--v2-line2); border-radius:16px; padding:32px; color:var(--v2-txt3); text-align:center}
  @media (max-width: 900px){
    .colonnes{grid-template-columns:1fr}
    .scroll{padding:6px 16px 40px}
  }
</style>
