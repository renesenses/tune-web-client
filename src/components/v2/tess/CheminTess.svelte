<script lang="ts">
  /**
   * Colonne « Signal path » de l'écran TESS (maquette A1, lot W1).
   *
   * 🔴 L'ORDRE AFFICHÉ EST CELUI DE `signal_path`, tel que le serveur l'a
   * résolu (Q9 : Upsampling avant Volume, Dither en dernier, exception DSD).
   * Cette colonne ne trie rien et ne recalcule rien : `lignesDuChemin` ne fait
   * que poser chaque étape à sa place et y rattacher le greffon de la chaîne.
   *
   * Les gestes (cocher, retirer, glisser-déposer, ajouter, « Bypass all »)
   * remontent à l'écran, qui envoie la chaîne au serveur et redessine depuis
   * SA réponse : rien n'est affiché qui n'ait été accepté.
   */
  import { t } from '../../../lib/i18n';
  import {
    lignesDuChemin, descripteur, estPremium, conflitExclusif, resumeFlux, dbLisible, libelleOuRepli, deplacerGreffon,
    liensDe, marqueServeur, CATEGORIES_TESS, cleExclusivite,
    type ReponseTessZone, type EtapeTess, type LienGreffonTess,
  } from '../../../lib/tess';
  import type { MotifVerrouTess } from '../../../lib/tessPanneaux';
  import { SELECTION_HEADROOM, notesOrdreReel, ordreSuivi } from '../../../lib/tessPanneaux';
  import type { Snippet } from 'svelte';
  import InterrupteurTess from './InterrupteurTess.svelte';
  // rc13.91 — la raison, constatée par la sortie, d'une étape qui ne tourne pas.
  import { cadenceJoueeDsd, annonceCadenceSuivante } from '../../../lib/tessBarre';
  import { texteDeLaRaisonDeLaSortie } from '../../../lib/tessRaisonDeLaSortie';

  // rc14 (recette du 24/11, point 6) — « EXCLUSIF » plutôt qu'« INDISPONIBLE ».
  import { cleDuBadgeVerrou } from '../../../lib/tessPanneaux';
  // rc14 — l'étage « Suréchantillonnage » se choisit : sa cible (PCM ou DSD) se règle à droite.
  import { SELECTION_SURECHANTILLONNAGE, cleMotifDsd } from '../../../lib/tessDsd';

  let {
    reponse,
    verrouDe,
    occupe = false,
    selection = null,
    onSelect,
    onToggle,
    onRemove,
    onMove,
    onBypass,
    onAdd,
    onInstall = null,
    installation = null,
    entete,
  }: {
    reponse: ReponseTessZone;
    /** Le verrou d'un greffon, décidé par le serveur (repli : licence locale). */
    verrouDe: (id: string) => MotifVerrouTess | null;
    occupe?: boolean;
    selection?: string | null;
    onSelect: (id: string) => void;
    onToggle: (id: string, actif: boolean) => void;
    onRemove: (id: string) => void;
    onMove: (de: number, vers: number) => void;
    onBypass: (bypass: boolean) => void;
    onAdd: (id: string) => void;
    /**
     * rc14 — installe le paquet d'un greffon `plugin_not_installed` (le
     * paquet vient du catalogue), ou celui d'un étage fixe (`paquet` lu dans
     * `params.install_package` de son étape).
     */
    onInstall?: ((id: string, paquet?: string | null) => void) | null;
    /** Le greffon dont l'installation est en cours, ou `null`. */
    installation?: string | null;
    /**
     * Refonte rc14 (demande 4) — ce que l'écran pose à DROITE du titre
     * « Signal path » : le bouton des préréglages et sa surcouche.
     */
    entete?: Snippet;
  } = $props();

  const tr = (k: string) => $t(k as any);
  const lignes = $derived(lignesDuChemin(reponse));
  const catalogue = $derived(reponse.catalog);
  const chaine = $derived(reponse.chain);
  const nbGreffons = $derived(liensDe(chaine).length);
  // tune-server-rust#9520 — la place RÉELLE d'un greffon, quand elle diffère
  // de celle affichée (sortie locale) ; sur une sortie réseau, l'ordre est fixe.
  const local = $derived(ordreSuivi(reponse.transport));
  const notesOrdre = $derived(local ? notesOrdreReel(chaine) : new Map());
  const ordreFixe = $derived(!local && liensDe(chaine).filter((l) => l.enabled).length > 1);
  function texteOrdre(id: string): string | null {
    const n = notesOrdre.get(id);
    if (!n) return null;
    return 'premier' in n ? tr('tess.order.withEq').replace('{name}', nomGreffon(n.premier)) : tr('tess.order.atEnd');
  }

  function nomGreffon(id: string): string {
    return libelleOuRepli(tr(`tess.plugin.${id}`), `tess.plugin.${id}`, descripteur(catalogue, id)?.name ?? id);
  }

  /** Le motif d'extinction, en clair (`reason` du contrat, § 4). */
  function motif(e: EtapeTess | null): string {
    if (!e?.reason) return '';
    // rc13.91 — toute étape éteinte : la raison de la sortie, en clair.
    const refus = texteDeLaRaisonDeLaSortie(e);
    if (refus) return refus;
    if (e.reason === 'replaced_in_group' && typeof e.params?.replaced_by === 'string') {
      return tr('tess.reason.replaced_in_group').replace('{x}', nomGreffon(e.params.replaced_by));
    }
    // rc14 — cible DSD que la sortie ne prend pas : `detail` porte le motif précis.
    if (e.reason === 'dsd_not_supported_by_output' && e.detail) {
      return `${tr('tess.reason.dsd_not_supported_by_output')} · ${tr(cleMotifDsd(e.detail))}`;
    }
    return libelleOuRepli(tr(`tess.reason.${e.reason}`), `tess.reason.${e.reason}`, e.detail ?? e.reason);
  }

  function titreEtape(e: EtapeTess): string {
    return libelleOuRepli(tr(`tess.step.${e.code}`), `tess.step.${e.code}`, tr('tess.step.unknown'));
  }

  /** La seconde ligne d'un étage fixe (maquette A1 : « −3 dB · on automatically »). */
  function resumeFixe(e: EtapeTess): string {
    const fixe = chaine.fixed ?? {};
    switch (e.code) {
      case 'headroom': {
        if (!e.effective && e.reason && e.reason !== 'nothing_to_protect') return motif(e);
        const auto = (fixe.headroom?.mode ?? 'auto') === 'auto';
        const db = reponse.headroom_db === 0 ? '0 dB' : dbLisible(reponse.headroom_db);
        return `${db} · ${tr(auto ? 'tess.headroomAuto' : 'tess.headroomManual')}`;
      }
      case 'upsampling': {
        const up = fixe.upsampling ?? { mode: 'off' };
        if (!up || up.mode === 'off' || up.mode === undefined) return tr('tess.off');
        if (!e.effective && e.reason) return motif(e);
        if (up.mode === 'dsd') {
          // rc14 — le transport de la cible acceptée, publié sur l'étape du modulateur.
          const tp = reponse.signal_path.find((x) => x.code === 'dsd_modulator')?.params?.transport;
          const transport = tp === 'native' ? tr('v2.lbl.native') : tp === 'dop' ? 'DoP' : '';
          // rc14 (serveur #9575) — la cadence RÉELLEMENT JOUÉE (`params.rate` du chemin), pas la
          // cible de la chaîne ; la suivante, si le serveur l'annonce. Serveur ancien : la cible.
          const jouee = cadenceJoueeDsd(reponse.signal_path) || String(up.rate ?? 'DSD').toUpperCase();
          return [jouee, transport, annonceCadenceSuivante(reponse.signal_path, tr)].filter(Boolean).join(' · ');
        }
        const ratio = up.max_ratio ? `×${up.max_ratio}` : tr('tess.upMax');
        return ['PCM', ratio, up.filter].filter(Boolean).join(' · ');
      }
      case 'volume': {
        const v = reponse.volume;
        const mode = libelleOuRepli(tr(`tess.vol.${v?.control}`), `tess.vol.${v?.control}`, String(v?.control ?? ''));
        const db = typeof v?.db === 'number' ? (v.db === 0 ? '0 dB' : dbLisible(v.db)) : '';
        return [mode, db].filter(Boolean).join(' · ');
      }
      case 'quantization': {
        if (e.reason === 'nothing_to_quantize') return motif(e);
        const d = fixe.quantization?.dither ?? 'tpdf';
        return libelleOuRepli(tr(`tess.dither.${d}`), `tess.dither.${d}`, String(d));
      }
      case 'dsd_modulator':
        return String(e.params?.rate ?? '').toUpperCase();
      default:
        return e.reason ? motif(e) : '';
    }
  }

  function resumeGreffon(lien: LienGreffonTess, e: EtapeTess | null): string {
    if (!lien.enabled) {
      // Décoché par le serveur (migration T02) : on dit pourquoi, sinon
      // l'utilisateur croit à un réglage perdu (contrat § 8, D2 et décision B).
      const m = marqueServeur(lien);
      if (m?.genre === 'replaced_in_group') {
        return `${tr('tess.off')} · ${tr('tess.reason.replaced_in_group').replace('{x}', nomGreffon(m.par))}`;
      }
      if (m?.genre === 'inert_on_network') return `${tr('tess.off')} · ${tr('tess.mark.inertOnNetwork')}`;
      return tr('tess.off');
    }
    if (e && !e.effective && e.reason) return motif(e);
    return tr('tess.on');
  }

  /** La dernière ligne fixe avant la sortie porte « LAST » (maquette A1). */
  const indexDernierFixe = $derived.by(() => {
    let k = -1;
    lignes.forEach((l, i) => { if (l.genre === 'fixe') k = i; });
    return k;
  });

  /**
   * rc14 — le paquet à installer d'un étage fixe éteint `plugin_not_installed`
   * (base neuve : suréchantillonneur), ou `null`. Serveur ancien : jamais.
   */
  function paquetDeLEtape(e: EtapeTess | null): string | null {
    if (!e || e.effective || e.reason !== 'plugin_not_installed') return null;
    const p = (e.params as Record<string, unknown> | null | undefined)?.install_package;
    return typeof p === 'string' && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(p) ? p : null;
  }

  /** Pourquoi la case d'un greffon ne peut pas être cochée, ou `null`. */
  function blocage(lien: LienGreffonTess): string | null {
    if (lien.enabled) return null;
    const autre = conflitExclusif(chaine, catalogue, lien.id);
    if (autre) {
      return tr(cleExclusivite(catalogue, lien.id)).replace(/\{a\}/g, nomGreffon(lien.id)).replace(/\{b\}/g, nomGreffon(autre));
    }
    const m = verrouDe(lien.id);
    if (m === 'plugin_not_installed') return tr('tess.pluginNotInstalled');
    if (m === 'plugin_unavailable') return tr('tess.pluginUnavailable').replace('{name}', nomGreffon(lien.id));
    if (m === 'premium_required') return tr('tess.premiumRequired').replace('{name}', nomGreffon(lien.id));
    return null;
  }

  // ── Glisser-déposer (souris) et flèches (clavier) ────────────────────────
  let glisse = $state<number | null>(null);
  let survol = $state<number | null>(null);
  let annonce = $state('');

  function deposer(vers: number) {
    const de = glisse;
    glisse = null;
    survol = null;
    if (de == null || de === vers) return;
    onMove(de, vers);
  }

  function clavier(ev: KeyboardEvent, index: number, id: string) {
    const vers = ev.key === 'ArrowUp' ? index - 1 : ev.key === 'ArrowDown' ? index + 1 : null;
    if (vers == null) return;
    ev.preventDefault();
    if (vers < 0 || vers >= nbGreffons) return;
    const place = String(vers + 1);
    const total = String(nbGreffons);
    annonce = tr('tess.moved').replace('{name}', nomGreffon(id)).replace('{p}', place).replace('{n}', total);
    onMove(index, vers);
  }

  // ── Flèches haut et bas (lot W2) ─────────────────────────────────────────
  // Le glisser-déposer ne marche ni au doigt ni au lecteur d'écran : deux
  // boutons visibles font la même chose. Une flèche est grisée quand le
  // déplacement serait refusé (bout de liste, réaffectation qui doit rester
  // dernière) : on ne propose pas un geste que le serveur refuserait.
  const peutDeplacer = (de: number, vers: number) => deplacerGreffon(chaine, catalogue, de, vers) != null;
  function fleche(index: number, vers: number, id: string) {
    const place = String(vers + 1);
    const total = String(nbGreffons);
    annonce = tr('tess.moved').replace('{name}', nomGreffon(id)).replace('{p}', place).replace('{n}', total);
    onMove(index, vers);
  }

  /** Le cadenas d'un greffon Premium sans licence (trait, 24 × 24). */
  const CADENAS = 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z';

  // ── « + Add plugin » ─────────────────────────────────────────────────────
  // Une liste simple, groupée par catégorie et marquée Free/Premium ; la
  // fenêtre complète de la maquette A3 (recherche, descriptions) est le lot W4.
  let ajoutOuvert = $state(false);
  const presents = $derived(new Set(liensDe(chaine).map((l) => l.id)));
  const groupes = $derived(
    [...CATEGORIES_TESS, null].map((cat) => ({
      cat,
      greffons: (catalogue?.plugins ?? []).filter((p) =>
        !presents.has(p.id)
        && (cat === null ? !CATEGORIES_TESS.includes(p.category as any) : p.category === cat)),
    })).filter((g) => g.greffons.length > 0),
  );
</script>

<section class="chemin" aria-labelledby="tess-chemin-titre" data-tess-chemin>
  <header class="tete">
    <div class="titre-et-prereglages">
      <h2 id="tess-chemin-titre">{$t('tess.signalPath' as any)}</h2>
      {#if entete}{@render entete()}{/if}
    </div>
    <span class="bypass">
      <InterrupteurTess data-tess-bypass checked={chaine.bypass_all === true} disabled={occupe}
                        texte={$t('tess.bypassAll' as any)} label={$t('tess.bypassAll' as any)}
                        onToggle={(v) => onBypass(v)} />
    </span>
  </header>

  <div class="sr" aria-live="polite">{annonce}</div>
  {#if ordreFixe}<p class="ordre-fixe" data-tess-ordre-fixe>{$t('tess.order.networkFixed' as any)}</p>{/if}

  <ol class="lignes">
    {#each lignes as l, i (l.genre === 'greffon' ? `g:${l.lien.id}` : l.genre === 'ajout' ? 'ajout' : `e:${i}:${l.etape.code}`)}
      {#if l.genre === 'extremite'}
        <li class="extremite" data-tess-etape={l.etape.code}>
          {titreEtape(l.etape)}{#if resumeFlux(l.etape.params)} · {resumeFlux(l.etape.params)}{/if}{#if l.etape.code === 'output'} · {reponse.transport.toUpperCase()}{/if}
        </li>
      {:else if l.genre === 'fixe'}
        <li class="carte fixe" class:eteint={!l.etape.effective} data-tess-etape={l.etape.code}
            class:choisi={(l.etape.code === 'upsampling' && selection === SELECTION_SURECHANTILLONNAGE)
              || (l.etape.code === 'headroom' && selection === SELECTION_HEADROOM)}>
          {#if l.etape.code === 'upsampling'}
            <!-- rc14 : la cible du suréchantillonnage (PCM ou DSD) se choisit ici, panneau à droite. -->
            <button class="txt choisir" data-tess-choisir-etape="upsampling" onclick={() => onSelect(SELECTION_SURECHANTILLONNAGE)}
                    aria-pressed={selection === SELECTION_SURECHANTILLONNAGE}>
              <span class="nom">
                {titreEtape(l.etape)}
                <span class="premium">{$t('tess.premium' as any)}</span>
              </span>
              <span class="sous">{resumeFixe(l.etape)}</span>
            </button>
          {:else if l.etape.code === 'headroom'}
            <!-- Refonte rc14 (demande 8) : le Headroom se règle ici, panneau à droite. -->
            <button class="txt choisir" data-tess-choisir-etape="headroom" aria-pressed={selection === SELECTION_HEADROOM}
                    onclick={() => onSelect(SELECTION_HEADROOM)}>
              <span class="nom">{titreEtape(l.etape)}</span>
              <span class="sous">{resumeFixe(l.etape)}</span>
            </button>
          {:else}
            <div class="txt">
              <div class="nom">{titreEtape(l.etape)}</div>
              <div class="sous">{resumeFixe(l.etape)}</div>
            </div>
          {/if}
          {#if onInstall && paquetDeLEtape(l.etape)}
            <button class="installer" data-tess-installer-etape={l.etape.code}
                    disabled={occupe || installation != null}
                    onclick={() => onInstall?.(l.etape.code, paquetDeLEtape(l.etape))}>
              {installation === l.etape.code ? $t('tess.installing' as any) : $t('tess.install' as any)}
            </button>
          {/if}
          <span class="tag">{$t('tess.fixed' as any)}{#if i === indexDernierFixe} · {$t('tess.last' as any)}{/if}</span>
        </li>
      {:else if l.genre === 'greffon'}
        {@const bloque = blocage(l.lien)}
        {@const d = descripteur(catalogue, l.lien.id)}
        <li
          class="carte greffon"
          class:choisi={selection === l.lien.id}
          class:verrouille={verrouDe(l.lien.id) === 'premium_required'}
          class:survol={survol === l.index && glisse !== l.index}
          class:glisse={glisse === l.index}
          data-tess-greffon={l.lien.id}
          data-tess-index={l.index}
          draggable={!occupe}
          ondragstart={(e) => { glisse = l.index; e.dataTransfer?.setData('text/plain', l.lien.id); }}
          ondragover={(e) => { if (glisse != null) { e.preventDefault(); survol = l.index; } }}
          ondragleave={() => { if (survol === l.index) survol = null; }}
          ondrop={(e) => { e.preventDefault(); deposer(l.index); }}
          ondragend={() => { glisse = null; survol = null; }}
        >
          <button class="poignee" data-tess-poignee disabled={occupe}
                  aria-label={$t('tess.dragAria' as any).replace('{name}', nomGreffon(l.lien.id))}
                  title={$t('tess.dragAria' as any).replace('{name}', nomGreffon(l.lien.id))}
                  onkeydown={(e) => clavier(e, l.index, l.lien.id)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" />
              <circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
            </svg>
          </button>
          <button class="txt choisir" onclick={() => onSelect(l.lien.id)} aria-pressed={selection === l.lien.id}>
            <span class="nom">
              {nomGreffon(l.lien.id)}
              {#if estPremium(d)}<span class="premium">{$t('tess.premium' as any)}</span>{/if}
              {#if verrouDe(l.lien.id)}
                <span class="verrou" data-tess-verrou-chemin={l.lien.id} data-tess-motif={verrouDe(l.lien.id)}>
                  {#if verrouDe(l.lien.id) === 'premium_required'}<svg class="cadenas" viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path d={CADENAS} /></svg>{/if}
                  {$t(cleDuBadgeVerrou(verrouDe(l.lien.id)!, conflitExclusif(chaine, catalogue, l.lien.id)) as any)}
                </span>
              {/if}
            </span>
            <span class="sous">{resumeGreffon(l.lien, l.etape)}</span>
            {#if texteOrdre(l.lien.id)}<span class="rang-reel" data-tess-rang-reel={l.lien.id}>{texteOrdre(l.lien.id)}</span>{/if}
            {#if bloque}<span class="bloque" data-tess-blocage={l.lien.id}>{bloque}</span>{/if}
          </button>
          {#if onInstall && verrouDe(l.lien.id) === 'plugin_not_installed'}
            <button class="installer" data-tess-installer-chemin={l.lien.id}
                    disabled={occupe || installation != null}
                    onclick={() => onInstall?.(l.lien.id)}>
              {installation === l.lien.id ? $t('tess.installing' as any) : $t('tess.install' as any)}
            </button>
          {/if}
          <span class="fleches">
            <button class="fleche" data-tess-monter={l.lien.id} disabled={occupe || !peutDeplacer(l.index, l.index - 1)}
                    aria-label={$t('tess.moveUpAria' as any).replace('{name}', nomGreffon(l.lien.id))}
                    title={$t('tess.moveUpAria' as any).replace('{name}', nomGreffon(l.lien.id))}
                    onclick={() => fleche(l.index, l.index - 1, l.lien.id)}>↑</button>
            <button class="fleche" data-tess-descendre={l.lien.id} disabled={occupe || !peutDeplacer(l.index, l.index + 1)}
                    aria-label={$t('tess.moveDownAria' as any).replace('{name}', nomGreffon(l.lien.id))}
                    title={$t('tess.moveDownAria' as any).replace('{name}', nomGreffon(l.lien.id))}
                    onclick={() => fleche(l.index, l.index + 1, l.lien.id)}>↓</button>
          </span>
          <InterrupteurTess data-tess-case={l.lien.id}
                            checked={l.lien.enabled} disabled={occupe || bloque != null}
                            label={$t('tess.enableAria' as any).replace('{name}', nomGreffon(l.lien.id))}
                            title={bloque ?? undefined}
                            onToggle={(v) => onToggle(l.lien.id, v)} />
          <button class="croix" data-tess-retirer={l.lien.id} disabled={occupe}
                  aria-label={$t('tess.removeAria' as any).replace('{name}', nomGreffon(l.lien.id))}
                  title={$t('tess.removeAria' as any).replace('{name}', nomGreffon(l.lien.id))}
                  onclick={() => onRemove(l.lien.id)}>×</button>
        </li>
      {:else}
        <li class="ajout">
          <button class="ajouter" data-tess-ajouter disabled={occupe || groupes.length === 0}
                  aria-expanded={ajoutOuvert} onclick={() => (ajoutOuvert = !ajoutOuvert)}>
            + {$t('tess.addPlugin' as any)}
          </button>
          {#if ajoutOuvert}
            <div class="menu" role="menu" data-tess-menu-ajout>
              {#each groupes as g (g.cat ?? 'autre')}
                <div class="groupe">{libelleOuRepli(tr(`tess.cat.${g.cat}`), `tess.cat.${g.cat}`, tr('tess.cat.other'))}</div>
                {#each g.greffons as p (p.id)}
                  {@const ferme = verrouDe(p.id) === 'premium_required'}
                  <!-- Refonte rc14 (demande 6) : tout le catalogue est visible ; en
                       Free, un Premium est grisé, cadenassé, et n'ajoute rien. -->
                  <button role="menuitem" class="item" class:ferme data-tess-ajout={p.id}
                          data-tess-ajout-verrouille={ferme ? '' : undefined}
                          aria-disabled={ferme}
                          title={ferme ? $t('tess.premiumRequired' as any).replace('{name}', nomGreffon(p.id)) : undefined}
                          onclick={() => { if (ferme) return; ajoutOuvert = false; onAdd(p.id); }}>
                    <span class="nom-item">
                      {#if ferme}<svg class="cadenas" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d={CADENAS} /></svg>{/if}
                      {nomGreffon(p.id)}
                    </span>
                    <span class="niveau" class:payant={estPremium(p)}>
                      {estPremium(p) ? $t('tess.premium' as any) : $t('tess.free' as any)}
                    </span>
                  </button>
                {/each}
              {/each}
            </div>
          {/if}
        </li>
      {/if}
    {/each}
  </ol>
</section>

<style>
  .chemin{border:1px solid var(--v2-line); border-radius:16px; background:var(--v2-surface); padding:18px 20px 16px;
    display:flex; flex-direction:column; gap:10px; min-width:0}
  .tete{display:flex; align-items:center; justify-content:space-between; gap:12px}
  .tete h2{font-size:calc(19px * var(--v2-txt-echelle, 1)); font-weight:700; margin:0}
  .bypass{display:inline-flex; align-items:center; gap:8px; color:var(--v2-txt2); font-size:calc(12.5px * var(--v2-txt-echelle, 1)); cursor:pointer}
  .titre-et-prereglages{display:flex; align-items:center; gap:10px; flex-wrap:wrap; min-width:0; position:relative}
  .carte.verrouille{opacity:.6}
  .rang-reel{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2); font-style:italic; line-height:1.4}
  .ordre-fixe{margin:0; font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3); line-height:1.45}
  .carte.verrouille .nom{color:var(--v2-txt2)}
  .cadenas{fill:none; stroke:currentColor; stroke-width:2; stroke-linejoin:round; vertical-align:-1px; margin-right:3px}
  .item.ferme{opacity:.55; cursor:not-allowed}
  .item.ferme:hover{background:none}
  .nom-item{display:inline-flex; align-items:center; gap:4px}
  .sr{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0)}
  .lignes{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px}
  .extremite{font:calc(11px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.1em; text-transform:uppercase; color:var(--v2-txt3); padding:4px 0}
  .carte{display:flex; align-items:center; gap:10px; border:1px solid var(--v2-line); border-radius:12px; padding:12px 14px; background:var(--v2-surface2)}
  .carte.fixe{border-style:dashed; background:transparent}
  .carte.eteint .sous{color:var(--v2-txt3)}
  .carte.choisi{border-color:var(--v2-acc1); box-shadow:0 0 0 1px var(--v2-acc1) inset}
  .carte.survol{border-color:var(--v2-acc2)}
  .carte.glisse{opacity:.5}
  .txt{display:flex; flex-direction:column; gap:3px; min-width:0; flex:1; text-align:left}
  .choisir{background:none; border:0; color:inherit; font:inherit; padding:0; cursor:pointer}
  .nom{font-weight:600; font-size:calc(14px * var(--v2-txt-echelle, 1)); display:flex; align-items:center; gap:8px; flex-wrap:wrap}
  .sous{font-size:calc(12.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .bloque{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3); line-height:1.4}
  .premium{font:700 calc(9.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.06em; padding:1px 6px; border-radius:4px;
    color:var(--v2-on-acc); background:var(--v2-acc1)}
  .tag{font:calc(10.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.08em; color:var(--v2-txt3); white-space:nowrap}
  .poignee{background:none; border:0; color:var(--v2-txt3); cursor:grab; padding:2px; display:flex}
  .fleches{display:inline-flex; flex-direction:column; gap:2px}
  .fleche{background:none; border:1px solid var(--v2-line); border-radius:6px; color:var(--v2-txt2); cursor:pointer;
    font-size:calc(11px * var(--v2-txt-echelle, 1)); line-height:1; padding:2px 5px}
  .fleche:disabled{opacity:.3; cursor:default}
  .verrou{font:700 calc(9.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.06em; padding:1px 6px; border-radius:4px;
    color:var(--v2-txt2); border:1px solid var(--v2-line2)}
  .installer{border:1px solid var(--v2-acc1); background:transparent; color:var(--v2-acc1); border-radius:var(--v2-r-pill);
    font:600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans); padding:4px 10px; cursor:pointer; white-space:nowrap}
  .installer:disabled{opacity:.5; cursor:default}
  .croix{background:none; border:0; color:var(--v2-txt3); cursor:pointer; font-size:calc(18px * var(--v2-txt-echelle, 1)); line-height:1; padding:2px 4px}
  .croix:hover:not(:disabled){color:var(--v2-txt)}
  .ajout{position:relative}
  .ajouter{width:100%; border:1px dashed var(--v2-acc2); border-radius:12px; background:transparent; color:var(--v2-acc1);
    font:600 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans); padding:12px; cursor:pointer}
  .ajouter:disabled{opacity:.5; cursor:default}
  .menu{position:absolute; z-index:5; left:0; right:0; top:calc(100% + 4px); background:var(--v2-surface); border:1px solid var(--v2-line2);
    border-radius:12px; box-shadow:var(--v2-sh-menu); padding:8px; display:flex; flex-direction:column; max-height:360px; overflow-y:auto}
  .groupe{font:calc(10.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3); padding:8px 8px 4px}
  .item{display:flex; justify-content:space-between; align-items:center; gap:10px; background:none; border:0; color:var(--v2-txt);
    font:inherit; padding:8px; border-radius:8px; cursor:pointer; text-align:left}
  .item:hover{background:var(--v2-hover)}
  .niveau{font:700 calc(9.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3)}
  .niveau.payant{color:var(--v2-acc1)}
</style>
