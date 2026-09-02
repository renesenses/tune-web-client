<script lang="ts">
  /**
   * Page d'accueil CONFIGURABLE.
   *
   * Chantier ouvert par Bertrand le 02/09/2026. L'accueil affichait quatre
   * sections figées dans son balisage ; il en veut une page composée par
   * l'utilisateur : ajouter, retirer, réordonner.
   *
   * ## Ce que ce composant sait
   *
   * Presque rien. Il lit une liste d'identifiants de widgets, demande au
   * registre (`lib/accueilWidgets`) de charger chacun, et rend une bande
   * horizontale. Aucun widget n'est écrit ici — en ajouter un se fait dans le
   * registre, sans toucher à cet écran.
   *
   * ## Chargement PARESSEUX, widget par widget
   *
   * Quatorze widgets, c'est jusqu'à quatorze appels. On ne charge que ce qui
   * est réellement affiché, et chacun indépendamment : un widget lent ou en
   * panne ne retient pas les autres, et son échec ne vide pas la page.
   *
   * ## Le mode édition
   *
   * Glisser-déposer, choix de Bertrand. La poignée porte `draggable` — et non
   * la carte entière : rendre toute la bande déplaçable empêcherait de la faire
   * défiler à la souris, qui est son geste principal.
   */
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { albums } from '../../lib/stores/library';
  import { currentZoneId, zones } from '../../lib/stores/zones';
  import { activeView } from '../../lib/stores/navigation';
  import { currentProfileId } from '../../lib/stores/profile';
  import { notifications } from '../../lib/stores/notifications';
  import {
    WIDGETS,
    DISPOSITION_DEFAUT,
    widgetParId,
    type Element,
  } from '../../lib/accueilWidgets';
  import AlbumArt from '../AlbumArt.svelte';
  import AudioVisualizer from '../AudioVisualizer.svelte';
  import AlbumDetailV2 from './AlbumDetailV2.svelte';
  import '../../styles/tune-v2.css';

  /** Clé sous laquelle la disposition est rangée dans les préférences. */
  const CLE = 'home_widgets';

  let disposition = $state<string[]>([...DISPOSITION_DEFAUT]);
  let charge = $state(false);
  let edition = $state(false);
  let ajoutOuvert = $state(false);

  /**
   * L'état de chaque widget, dans UN SEUL tableau réactif.
   *
   * 🔴 Quatre dictionnaires séparés indexés par identifiant — `contenu`,
   * `chiffres`, `enCours`, `echecs` — laissaient trop de place au doute :
   * d'abord parce que les recopies `{ ...objet, [id]: … }` se perdaient entre
   * elles quand deux widgets répondaient dans la même trame, ensuite parce que
   * même corrigées en écriture directe, Bertrand voyait encore des widgets
   * figés sur « Chargement… » (02/09/2026).
   *
   * Une entrée par widget, mutée sur place dans un tableau `$state` : la
   * réactivité en profondeur de Svelte 5 s'y applique sans ambiguïté, et il n'y
   * a plus qu'un seul endroit où l'état d'un widget peut changer.
   */
  interface Etat {
    id: string;
    phase: 'attente' | 'charge' | 'echec';
    elements: Element[];
    chiffres: { cle: string; valeur: string }[];
    raison?: string;
  }
  let etats = $state<Etat[]>([]);
  const etatDe = (id: string) => etats.find((e) => e.id === id);

  /**
   * Écrit dans l'entrée du tableau — la version SUIVIE, jamais une référence
   * gardée de côté. C'est la seule écriture d'état de ce composant.
   */
  function majEtat(id: string, patch: Partial<Etat>) {
    const e = etats.find((x) => x.id === id);
    if (e) Object.assign(e, patch);
  }

  /**
   * 🔴 Garde NON RÉACTIF des widgets déjà demandés.
   *
   * `chargerWidget` est appelée depuis un `$effect`. Si son garde lisait
   * `etats` — un `$state` qu'elle ÉCRIT juste après — l'effet dépendrait de ce
   * qu'il modifie : boucle de dépendance, Svelte l'interrompt, et plus AUCUN
   * widget ne se charge.
   *
   * C'est exactement ce qui est arrivé le 02/09/2026 en remplaçant les quatre
   * dictionnaires par un tableau unique : j'avais supprimé ce `Set` sans voir
   * qu'il servait à ça. Bertrand : « rien ne charge ».
   *
   * Un `Set` ordinaire n'est pas suivi par la réactivité : il coupe le cycle.
   */
  const demandes = new Set<string>();

  /**
   * Délai au-delà duquel on cesse d'attendre.
   *
   * Une attente sans limite ne se distingue pas d'un widget lent : il faut
   * qu'elle finisse par DIRE quelque chose. Huit secondes : les quatorze
   * sources répondent en quelques dizaines de millisecondes sur le serveur de
   * Bertrand, et attendre quinze secondes pour apprendre qu'on a échoué se
   * ressent comme une lenteur — c'est ce qu'il a signalé.
   */
  const DELAI_MS = 8000;
  function avecDelai<T>(p: Promise<T>): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, rejeter) => setTimeout(() => rejeter(new Error('delai')), DELAI_MS)),
    ]);
  }

  const disponibles = $derived(WIDGETS.filter((w) => !disposition.includes(w.id)));

  async function charger() {
    const pid = $currentProfileId;
    if (pid == null) {
      charge = true;
      return;
    }
    try {
      const prefs = await api.getProfilePreferences(pid);
      const d = prefs?.[CLE];
      // On ne garde que les identifiants CONNUS : un widget retiré du registre
      // laisserait sinon un trou muet dans la page de qui l'avait choisi.
      if (Array.isArray(d) && d.length) {
        disposition = d.filter((id: any) => typeof id === 'string' && widgetParId(id));
      }
    } catch {
      // Préférences illisibles : on garde la disposition par défaut plutôt que
      // d'afficher une page vide.
    }
    charge = true;
    chargerTout();
  }

  async function enregistrer() {
    const pid = $currentProfileId;
    if (pid == null) return;
    try {
      await api.setProfilePreferences(pid, { [CLE]: disposition });
    } catch (e: any) {
      notifications.error(e?.message ?? $t('common.error' as any));
    }
  }

  /** Charge un widget, une seule fois, et sans retenir les autres. */
  function chargerWidget(id: string) {
    if (demandes.has(id)) return;
    demandes.add(id);
    const w = widgetParId(id);
    if (!w) return;
    /**
     * 🔴 On ne garde PAS la référence qu'on vient de pousser.
     *
     * `$state` enveloppe le tableau dans un proxy : `etats.push(objet)` y range
     * une version SUIVIE, tandis que la variable locale pointe encore l'objet
     * BRUT. Muter cette variable ne déclenche donc aucun rendu — l'écran reste
     * sur « Chargement… » pendant que l'état, lui, a bien changé.
     *
     * C'est la vraie cause des « Chargement… x4 » de Bertrand (02/09/2026),
     * après trois correctifs qui visaient ailleurs. On passe donc par `majEtat`,
     * qui retrouve l'entrée DANS le tableau à chaque écriture.
     */
    etats.push({ id, phase: 'attente', elements: [], chiffres: [] });

    // `get()` et non `$store` : lus avec `$`, ces deux magasins deviendraient
    // des DÉPENDANCES de l'effet appelant, et la bibliothèque arrive en deux
    // temps — l'effet repartait à chaque étape.
    const ctx = { profileId: get(currentProfileId), albums: get(albums), zones: get(zones) };
    const p = w.forme === 'chiffres' && w.chiffres ? w.chiffres(ctx) : w.charger(ctx);

    avecDelai(Promise.resolve(p))
      .then((r: any) => {
        majEtat(id, w.forme === 'chiffres'
          ? { phase: 'charge', chiffres: r ?? [] }
          : { phase: 'charge', elements: r ?? [] });
      })
      .catch((err: any) => {
        // On DIT ce qui a échoué, et POURQUOI : une bande vide se lit comme
        // « rien à montrer », et on cherche alors un défaut de bibliothèque.
        majEtat(id, {
          phase: 'echec',
          raison: err?.message === 'delai' ? 'delai' : (err?.message ?? 'erreur'),
        });
        console.warn('[accueil] widget en échec', id, err);
      });
  }

  /**
   * 🔴 AUCUN `$effect` pour lancer les chargements.
   *
   * Il y en avait un — `for (const id of disposition) chargerWidget(id)` — et
   * il était la cause de tout : `chargerWidget` ÉCRIT `etats`, et l'écriture
   * `etats = [...etats, e]` le RELIT au passage. L'effet dépendait donc de ce
   * qu'il modifie. Svelte interrompt la boucle, et plus rien ne se charge.
   *
   * J'ai d'abord cru couper le cycle avec un `Set` non réactif pour le garde —
   * ça ne suffisait pas, la lecture restait dans l'affectation. Trois tours
   * perdus (Bertrand : « rien ne charge », puis « trop lent et ne marche
   * pas »).
   *
   * Le chargement suit désormais les GESTES : au montage, à l'ajout d'un
   * widget. C'est déterministe, et rien ne peut plus boucler.
   */
  function chargerTout() {
    for (const id of disposition) chargerWidget(id);
  }

  /**
   * Recharge un widget DÉJÀ chargé, sans repasser par le garde.
   *
   * `chargerWidget` refuse la seconde demande — c'est ce qui empêche les
   * « chargements x4 ». Ici on veut explicitement rejouer la source.
   */
  function rechargerWidget(id: string) {
    const w = widgetParId(id);
    if (!w || !etats.some((e) => e.id === id)) return;
    const ctx = { profileId: get(currentProfileId), albums: get(albums), zones: get(zones) };
    Promise.resolve(w.charger(ctx))
      .then((r: any) => majEtat(id, { phase: 'charge', elements: r ?? [] }))
      .catch(() => {});
  }

  /**
   * 🔴 Une souscription IMPÉRATIVE, jamais un `$effect`.
   *
   * « Zones d'écoute actives » montrait l'état du montage et n'en bougeait
   * plus : la page charge une fois, par construction — c'est ce qui a cassé le
   * cycle de dépendances qui figeait tout (voir `chargerTout`).
   *
   * Un `$effect` qui lirait le magasin rouvrirait ce cycle : `rechargerWidget`
   * écrit `etats`, et `majEtat`/`etats.some` le RELISENT. `store.subscribe()`
   * n'est pas suivi par Svelte — la boucle est impossible par construction.
   *
   * On se raccroche aux zones plutôt qu'à un minuteur : la bande suit la
   * lecture au lieu de la sonder.
   */
  onMount(() => {
    let premier = true;
    return zones.subscribe(() => {
      // La première émission est l'état déjà servi par le chargement initial.
      if (premier) { premier = false; return; }
      rechargerWidget('zones');
    });
  });

  function jouer(e: Element) {
    const z = $currentZoneId;
    if (z == null || !e.jouer) return;
    Promise.resolve(e.jouer(z)).catch(() => {});
  }

  /** Fiche album ouverte par-dessus la page, comme sur les autres écrans. */
  let ficheOuverte = $state<any | null>(null);
  let serviceOuvert = $state<string | null>(null);

  /**
   * Un clic AILLEURS que sur le disque. Ouvre, ne joue pas.
   *
   * Une zone mène à « Lecture en cours », après y avoir bascule la selection :
   * sans cela on ouvrirait l'ecran sur une AUTRE zone que celle cliquee.
   */
  function ouvrirElement(e: Element) {
    if (e.ouvrir === 'zone') {
      if (e.zoneId != null) currentZoneId.set(e.zoneId);
      activeView.set('nowplaying');
      return;
    }
    if (e.ouvrir === 'album' && e.fiche) {
      ficheOuverte = e.fiche;
      // La fiche distingue local et service par CE drapeau : avec lui elle va
      // chercher les pistes chez le service, sans lui dans la bibliotheque.
      serviceOuvert = e.fiche.id == null ? (e.source ?? null) : null;
    }
  }

  // ── Édition ──────────────────────────────────────────────────────────────
  function retirer(id: string) {
    disposition = disposition.filter((x) => x !== id);
    // Sans cela, le remettre plus tard n'entraînerait aucun chargement : son
    // état serait toujours là, figé sur ce qu'il contenait.
    etats = etats.filter((e) => e.id !== id);
    demandes.delete(id);
    void enregistrer();
  }

  function ajouter(id: string) {
    if (disposition.includes(id)) return;
    disposition = [...disposition, id];
    ajoutOuvert = false;
    chargerWidget(id);
    void enregistrer();
  }

  /** Index du widget saisi, `null` quand rien n'est en cours de déplacement. */
  let saisi = $state<number | null>(null);
  let survole = $state<number | null>(null);

  function deposer(cible: number) {
    const src = saisi;
    saisi = null;
    survole = null;
    if (src == null || src === cible) return;
    const copie = [...disposition];
    const [w] = copie.splice(src, 1);
    copie.splice(cible, 0, w);
    disposition = copie;
    void enregistrer();
  }

  /**
   * Déplacement au CLAVIER.
   *
   * Le glisser-déposer n'existe pas au clavier : sans ces raccourcis, un
   * utilisateur qui ne se sert pas d'une souris ne pourrait jamais réordonner
   * sa page. La poignée est focalisable, et les flèches la déplacent.
   */
  function auClavier(e: KeyboardEvent, i: number) {
    const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    const cible = i + d;
    if (cible < 0 || cible >= disposition.length) return;
    const copie = [...disposition];
    [copie[i], copie[cible]] = [copie[cible], copie[i]];
    disposition = copie;
    void enregistrer();
  }

  onMount(() => {
    void charger();
  });
</script>

<section class="v2-home tune-v2">
  <header class="top">
    <div>
      <div class="eyebrow">{$t('v2.home.eyebrow' as any)}</div>
      <h1>{$t('v2.home.title' as any)}</h1>
    </div>
    <div class="outils">
      {#if edition}
        <button class="ghost" onclick={() => (ajoutOuvert = !ajoutOuvert)} disabled={!disponibles.length}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          {$t('v2.home.add' as any)}
        </button>
      {/if}
      <button class="ghost" class:on={edition} onclick={() => { edition = !edition; ajoutOuvert = false; }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l4 4"/></svg>
        {edition ? $t('v2.home.done' as any) : $t('v2.home.edit' as any)}
      </button>
    </div>
  </header>

  {#if edition && ajoutOuvert}
    <div class="ajout">
      {#if !disponibles.length}
        <p class="vide">{$t('v2.home.allAdded' as any)}</p>
      {:else}
        {#each disponibles as w (w.id)}
          <button class="puce" onclick={() => ajouter(w.id)}>+ {$t(w.cleTitre as any)}</button>
        {/each}
      {/if}
    </div>
  {/if}

  <div class="scroll">
    {#if !charge}
      <div class="state">{$t('common.loading' as any)}</div>
    {:else if !disposition.length}
      <!-- Page vidée par l'utilisateur : on le DIT et on montre le chemin,
           sinon elle se lit comme une panne. -->
      <div class="state">{$t('v2.home.emptyHint' as any)}</div>
    {:else}
      {#each disposition as id, i (id)}
        {@const w = widgetParId(id)}
        <!-- Les DEUX `{@const}` ici : ils ne sont légaux qu'en enfant direct
             d'un bloc, et sous la `<section>` ils ne compilent pas. -->
        {@const et = etatDe(id)}
        {#if w}
          <section
            class="bloc"
            class:cible={survole === i && saisi !== null && saisi !== i}
            ondragover={(e) => { if (saisi !== null) { e.preventDefault(); survole = i; } }}
            ondrop={(e) => { e.preventDefault(); deposer(i); }}
          >
            <div class="tete">
              {#if edition}
                <!-- La POIGNÉE seule est déplaçable. Rendre la bande entière
                     `draggable` empêcherait de la faire défiler à la souris,
                     qui est son geste principal. -->
                <span
                  class="poignee"
                  role="button"
                  tabindex="0"
                  draggable="true"
                  aria-label={$t('v2.home.move' as any)}
                  ondragstart={() => (saisi = i)}
                  ondragend={() => { saisi = null; survole = null; }}
                  onkeydown={(e) => auClavier(e, i)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8h16M4 16h16"/></svg>
                </span>
              {/if}
              <h2>{$t(w.cleTitre as any)}</h2>
              {#if edition}
                <button class="retirer" onclick={() => retirer(id)} aria-label={$t('v2.home.remove' as any)}>×</button>
              {/if}
            </div>

            {#if !et || et.phase === 'attente'}
              <div class="state mince">{$t('common.loading' as any)}</div>
            {:else if et.phase === 'echec'}
              <div class="state mince err">
                {$t('v2.home.widgetFailed' as any)}{et.raison ? ` (${et.raison})` : ''}
              </div>
            {:else if w.forme === 'chiffres'}
              <div class="chiffres">
                {#each et.chiffres as c (c.cle)}
                  <div class="stat"><span class="v">{c.valeur}</span><span class="l">{$t(c.cle as any)}</span></div>
                {/each}
              </div>
            {:else if !et.elements.length}
              <div class="state mince">{$t('v2.home.widgetEmpty' as any)}</div>
            {:else}
              <div class="bande">
                {#each et.elements as el (el.id)}
                  <!--
                    La carte n'est PLUS un seul bouton.

                    Elle en portait un unique, englobant, et un bouton Play
                    centre a l'interieur aurait ete un bouton DANS un bouton :
                    balisage invalide, et Svelte le refuse. La pochette et le
                    texte sont donc deux boutons FRERES, meme geste, sous un
                    conteneur neutre.
                  -->
                  <!--
                    TROIS boutons FRERES, jamais imbriques.

                    La pochette et le texte OUVRENT ; seul le disque central
                    LIT. Bertrand, 02/09/2026 : « quand je clique sur le nom de
                    l'album ou sur la cover hors bouton, cela m'ouvre l'album ».
                    Le disque est donc pose en `absolute` DANS la carte, a cote
                    du bouton de pochette et non dedans : un bouton dans un
                    bouton est du balisage invalide, que Svelte refuse.
                  -->
                  <div class="carte">
                    <button
                      class="cv"
                      onclick={() => ouvrirElement(el)}
                      disabled={!el.ouvrir}
                      aria-label={el.ouvrir ? `${$t('common.open' as any)} — ${el.titre}` : el.titre}
                    >
                      <AlbumArt coverPath={el.cover} albumId={null} size={0} alt={el.titre}
                        source={el.source} fallbackInitials={el.titre?.slice(0, 1)} />
                    </button>
                    {#if el.jouer}
                      <!-- Meme disque que `PochetteActions` : accent du theme,
                           triangle en `--v2-on-acc`, 52 px, decale de 2 px
                           pour compenser son decentrage optique. -->
                      <button
                        class="centre"
                        onclick={() => jouer(el)}
                        aria-label={`${$t('common.play' as any)} — ${el.titre}`}
                        title={$t('common.play' as any)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M8 5.5v13l11-6.5z"/></svg>
                      </button>
                    {/if}
                    <button class="meta" onclick={() => ouvrirElement(el)} disabled={!el.ouvrir}>
                      <span class="ct">{el.titre}</span>
                      {#if el.sous}<span class="ca">{el.sous}</span>{/if}
                    </button>
                    {#if el.zoneId != null}
                      <!-- Le mini-analyseur de la version actuelle, sous la
                           zone. `zoneId` nomme la zone A SUIVRE : la bande en
                           montre plusieurs, et sans lui elles porteraient
                           toutes le meme trace. -->
                      <div class="viz"><AudioVisualizer playing={!!el.enLecture} mode="spectrum" height={20} mini zoneId={el.zoneId} /></div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </section>
        {/if}
      {/each}
    {/if}
  </div>
</section>

{#if ficheOuverte}
  <AlbumDetailV2 album={ficheOuverte} service={serviceOuvert} onClose={() => { ficheOuverte = null; serviceOuvert = null; }} />
{/if}

<style>
  .v2-home{display:flex; flex-direction:column; height:100%; min-width:0; background:var(--v2-bg); color:var(--v2-txt);
    font-family:var(--v2-sans); overflow:hidden}
  .top{display:flex; align-items:flex-end; justify-content:space-between; gap:20px; padding:24px 30px 12px; padding-right:130px}
  .eyebrow{font:600 13px var(--v2-mono); letter-spacing:.06em; color:var(--v2-acc1)}
  .top h1{font-size:30px; font-weight:800; letter-spacing:-.01em; margin-top:4px}
  .outils{display:flex; gap:8px}
  .ghost{display:inline-flex; align-items:center; gap:7px; cursor:pointer; border:1px solid var(--v2-line2);
    border-radius:var(--v2-r-pill); background:transparent; color:var(--v2-txt2);
    font:600 12.5px var(--v2-sans); padding:8px 14px}
  .ghost:hover{color:var(--v2-txt); background:var(--v2-hover)}
  .ghost.on{color:var(--v2-on-acc); background:var(--v2-acc1); border-color:transparent}
  .ghost:disabled{opacity:.45; cursor:default}
  .ghost svg{width:14px; height:14px}

  .ajout{display:flex; flex-wrap:wrap; gap:6px; padding:6px 30px 10px}
  .puce{border:1px dashed var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    font:600 12px var(--v2-sans); padding:6px 12px; border-radius:var(--v2-r-pill)}
  .puce:hover{color:var(--v2-txt); border-color:var(--v2-acc2); border-style:solid}
  .vide{color:var(--v2-txt3); font-size:13px}

  /* `min-width: 0` : sans lui, une bande large POUSSE la colonne au lieu de
     défiler dans son cadre, et c'est la page entière qui prend une barre de
     défilement horizontale — visible sur la capture du 02/09/2026. */
  .scroll{flex:1; min-width:0; overflow-y:auto; overflow-x:hidden; padding:4px 0 40px}
  .bloc{min-width:0}
  .state{padding:26px 30px; color:var(--v2-txt3); font-size:13.5px}
  .state.mince{padding:8px 30px 18px}
  .state.err{color:var(--v2-danger)}

  .bloc{padding:10px 0 6px; border-top:1px solid transparent}
  /* La cible de dépôt se voit : sans repère, on lâche à l'aveugle. */
  .bloc.cible{border-top-color:var(--v2-acc1)}
  .tete{display:flex; align-items:center; gap:9px; padding:0 30px 10px}
  .tete h2{font-size:15px; font-weight:700; flex:1}
  .poignee{display:grid; place-items:center; width:24px; height:24px; border-radius:6px; cursor:grab;
    color:var(--v2-txt3); background:var(--v2-surface2)}
  .poignee:hover{color:var(--v2-txt)}
  .poignee:focus-visible{outline:2px solid var(--v2-acc1); outline-offset:2px}
  .poignee svg{width:14px; height:14px}
  .retirer{width:24px; height:24px; border:0; border-radius:6px; background:transparent; color:var(--v2-txt3);
    font-size:17px; line-height:1; cursor:pointer}
  .retirer:hover{color:var(--v2-danger); background:var(--v2-hover)}

  /* TOUS les widgets sont des bandes horizontales — décision de Bertrand.
     Mêler grilles et bandes rendrait la hauteur de la page imprévisible. */
  .bande{display:flex; gap:16px; overflow-x:auto; padding:0 30px 10px; scrollbar-width:thin}
  /*
    `min-width: 0` — sans lui, la vignette DÉBORDE.

    Un élément de conteneur flexible a `min-width: auto` par défaut : il ne peut
    pas devenir plus étroit que son contenu. Une pochette de 600 px poussait
    donc la carte à 600 px malgré `flex-basis: 148px`, et la bande se retrouvait
    avec des vignettes de tailles toutes différentes — visible sur la capture de
    Bertrand du 02/09/2026, où Charlie Parker faisait quatre fois la largeur de
    ses voisines.

    C'est le même piège que sur la page elle-même, où l'absence de `min-width`
    lui donnait une barre de défilement horizontale.
  */
  .carte{position:relative; flex:0 0 148px; min-width:0; max-width:148px; display:flex; flex-direction:column; gap:6px;
    /* Cinquante vignettes par bande, et jusqu'à vingt et une bandes : ce qui
       sort du cadre n'est ni stylé, ni disposé, ni peint. Sans cela, dérouler
       la page coûterait plusieurs milliers de vignettes rendues pour rien.

       ⚠️ `content-visibility` implique `contain: layout style paint`, qui
       CONTIENT un descendant `position: fixed`. Le disque de lecture est en
       `absolute` dans la carte : il reste dedans, rien à craindre ici. */
    content-visibility:auto; contain-intrinsic-size:auto 200px}
  .meta{display:flex; flex-direction:column; gap:2px; min-width:0;
    border:0; background:transparent; padding:0; text-align:left; color:inherit; cursor:pointer}
  .meta:disabled{cursor:default}
  .cv{position:relative; display:block; width:100%; min-width:0; aspect-ratio:1;
    border-radius:var(--v2-r-card); overflow:hidden; background:var(--v2-surface);
    border:0; padding:0; cursor:pointer}
  .cv:disabled{cursor:default}
  .cv :global(img){width:100%; height:100%; object-fit:cover; display:block}
  /* Le disque de lecture, centré. Révélé au survol ET au clavier : sans
     `focus-within` on tabulerait jusqu'à un bouton invisible. */
  /* Ancre sur la POCHETTE, pas sur la carte : celle-ci porte aussi le texte et
     l'analyseur, et un centrage sur sa hauteur totale poserait le disque a
     cheval sur le titre. La pochette est carree, d'ou `top: 74px` — la moitie
     de 148. */
  .centre{position:absolute; top:74px; left:50%; width:52px; height:52px; margin:-26px 0 0 -26px;
    border:0; padding:0; cursor:pointer;
    border-radius:50%; display:grid; place-items:center;
    background:var(--v2-acc1); color:var(--v2-on-acc); box-shadow:0 2px 12px rgba(0,0,0,.35);
    opacity:0; transition:opacity .16s ease}
  .centre svg{width:24px; height:24px; fill:currentColor; margin-left:2px}
  .carte:hover .centre, .carte:focus-within .centre{opacity:1; transition-duration:0s}
  .viz{height:20px; opacity:.85}
  /* Sur tactile il n'y a pas de survol : le disque reste visible. */
  @media (hover: none){ .centre{opacity:1} }
  .ct{font:600 12.5px var(--v2-sans); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ca{font:11px var(--v2-mono); color:var(--v2-txt3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}

  .chiffres{display:flex; flex-wrap:wrap; gap:22px; padding:0 30px 12px}
  .stat{display:flex; flex-direction:column}
  .stat .v{font:800 22px var(--v2-sans); letter-spacing:-.01em}
  .stat .l{font:10.5px var(--v2-mono); color:var(--v2-txt3); text-transform:uppercase; letter-spacing:.06em}
</style>
