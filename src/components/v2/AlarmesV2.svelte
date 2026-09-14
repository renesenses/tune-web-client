<script lang="ts">
  /**
   * Réveils — nouveau client (direction Levente).
   *
   * Porté depuis `AlarmsView` (399 lignes), la première des deux fonctions que
   * la v2 ne couvrait pas (voir `docs/chantiers/basculer-la-v2-en-v1.md`).
   * Bertrand, 14/09/2026 : « Alarmes : porter, concerts plus tard. »
   *
   * ## Trois défauts de l'écran d'origine, corrigés ici — pas recopiés
   *
   * 1. **La suppression ne demandait rien.** Un `×` au bord de la carte, et le
   *    réveil disparaissait. Aucun retour en arrière : il faut le ressaisir en
   *    entier. Ici, `dialogs.confirm` en `danger`, comme partout ailleurs dans
   *    la v2.
   *
   * 2. **Les échecs partaient dans `console.error`.** Enregistrer un réveil
   *    sur un serveur injoignable fermait le formulaire et ne disait rien :
   *    l'utilisateur croyait son réveil posé. Le sien ne sonnait pas. Ici,
   *    `notifications.error`, et le formulaire RESTE ouvert — ce qu'on vient
   *    de saisir n'est pas perdu.
   *
   * 3. **`toggleEnabled` envoyait un corps PARTIEL** (`{enabled}`) là où
   *    `save` envoie les treize champs. Le serveur traite `PUT /alarms/{id}`
   *    comme un remplacement : basculer l'interrupteur pouvait donc effacer le
   *    reste du réveil. On envoie désormais le réveil COMPLET, avec le seul
   *    `enabled` changé.
   *
   * ## Densité par niveau
   *
   * Essentiel → la liste, l'interrupteur, l'heure. Créer et modifier.
   * Avancé    → zone de lecture, montée progressive.
   * Expert    → jours fériés, volume exact.
   *
   * Rien n'est CACHÉ à un niveau bas : un réveil déjà réglé affiche toujours
   * ce qu'il fera. Ce sont les CHAMPS du formulaire qui se dévoilent, pas les
   * réveils.
   */
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { currentZone } from '../../lib/stores/zones';
  import { dialogs } from '../../lib/stores/dialogs';
  import { notifications } from '../../lib/stores/notifications';
  import { preferences } from '../../lib/stores/preferences';
  import { atLeast } from '../../lib/uiLevel';
  import { errText } from '../../lib/utils';
  import '../../styles/tune-v2.css';

  interface Reveil {
    id: number;
    name: string;
    time: string;
    days: string;
    skip_holidays: number;
    holiday_country: string;
    zone_id: number | null;
    source_type: string;
    source_id: string;
    source_name: string | null;
    volume: number;
    fade_in_seconds: number;
    enabled: number;
  }

  const niveau = $derived($preferences.settingsLevel ?? 'beginner');

  let reveils = $state<Reveil[]>([]);
  let zones = $state<any[]>([]);
  let edite = $state<Reveil | null>(null);
  let formulaire = $state(false);
  let chargement = $state(true);
  let enregistrement = $state(false);

  const joursCourts = $derived([
    $t('alarms.daySun'), $t('alarms.dayMon'), $t('alarms.dayTue'),
    $t('alarms.dayWed'), $t('alarms.dayThu'), $t('alarms.dayFri'), $t('alarms.daySat'),
  ]);

  let fNom = $state('');
  let fHeure = $state('07:00');
  let fJours = $state<number[]>([1, 2, 3, 4, 5]);
  let fFeries = $state(true);
  let fZone = $state<number | null>(null);
  let fTypeSource = $state('radio');
  let fIdSource = $state('');
  let fNomSource = $state('');
  let fVolume = $state(50);
  let fMontee = $state(30);

  $effect(() => {
    void charger();
  });

  async function charger() {
    chargement = true;
    try {
      const [r, z] = await Promise.all([
        api.fetchJSON<Reveil[]>(`${api.BASE}/alarms/`),
        api.fetchJSON<any[]>(`${api.BASE}/zones`),
      ]);
      reveils = r ?? [];
      zones = z ?? [];
    } catch (e) {
      // L'écran d'origine avalait cette erreur : une liste vide se lisait
      // « aucun réveil », alors que le serveur n'avait pas répondu.
      notifications.error(errText(e) ?? $t('common.error' as any));
    }
    chargement = false;
  }

  function ouvrirCreation() {
    edite = null;
    fNom = $t('alarms.defaultName');
    fHeure = '07:00';
    fJours = [1, 2, 3, 4, 5];
    fFeries = true;
    fZone = $currentZone?.id ?? null;
    fTypeSource = 'radio';
    fIdSource = '';
    fNomSource = '';
    fVolume = 50;
    fMontee = 30;
    formulaire = true;
  }

  function ouvrirEdition(r: Reveil) {
    edite = r;
    fNom = r.name;
    fHeure = r.time;
    fJours = r.days.split(',').map(Number);
    fFeries = !!r.skip_holidays;
    fZone = r.zone_id;
    fTypeSource = r.source_type;
    fIdSource = r.source_id;
    fNomSource = r.source_name || '';
    fVolume = r.volume;
    fMontee = r.fade_in_seconds;
    formulaire = true;
  }

  function basculerJour(j: number) {
    fJours = fJours.includes(j)
      ? fJours.filter((d) => d !== j)
      : [...fJours, j].sort();
  }

  /** Le corps COMPLET d'un réveil — `PUT /alarms/{id}` remplace, il ne fusionne pas.
   *
   * ⚠️ `Reveil.enabled` est un `number` (0/1, ce que rend le serveur) alors
   * qu'on ENVOIE un booléen. `Partial<Reveil> & { enabled: boolean }` réduisait
   * donc `enabled` à `never` — et avec lui tout l'objet : treize erreurs de
   * type relevées par `check-svelte`, invisibles au build parce qu'esbuild
   * transpile sans résoudre. D'où `Omit` : on retire le champ du type source
   * avant d'imposer le nôtre. */
  function corps(r: Partial<Omit<Reveil, 'enabled'>> & { enabled: boolean }) {
    return {
      name: r.name ?? fNom,
      time: r.time ?? fHeure,
      days: r.days ?? fJours.join(','),
      skip_holidays: r.skip_holidays ?? fFeries,
      holiday_country: r.holiday_country ?? 'FR',
      zone_id: r.zone_id !== undefined ? r.zone_id : fZone,
      source_type: r.source_type ?? fTypeSource,
      source_id: r.source_id ?? fIdSource,
      source_name: (r.source_name ?? fNomSource) || null,
      volume: r.volume ?? fVolume,
      fade_in_seconds: r.fade_in_seconds ?? fMontee,
      enabled: r.enabled,
    };
  }

  async function enregistrer() {
    if (enregistrement) return;
    enregistrement = true;
    try {
      const chemin = edite ? `${api.BASE}/alarms/${edite.id}` : `${api.BASE}/alarms/`;
      await api.fetchJSON(chemin, {
        method: edite ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps({ enabled: edite ? !!edite.enabled : true })),
      });
      formulaire = false;
      await charger();
    } catch (e) {
      // Le formulaire RESTE ouvert : la saisie n'est pas perdue.
      notifications.error(errText(e) ?? $t('common.error' as any));
    }
    enregistrement = false;
  }

  async function basculerActif(r: Reveil) {
    try {
      await api.fetchJSON(`${api.BASE}/alarms/${r.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Le réveil COMPLET, seul `enabled` change. Un corps partiel effaçait
        // le reste, `PUT` étant un remplacement côté serveur.
        body: JSON.stringify(corps({ ...r, enabled: !r.enabled })),
      });
      await charger();
    } catch (e) {
      notifications.error(errText(e) ?? $t('common.error' as any));
    }
  }

  async function supprimer(r: Reveil) {
    // Irréversible : il faudrait tout ressaisir. L'écran d'origine ne
    // demandait rien du tout.
    const ok = await dialogs.confirm(
      $t('v2.alarms.confirmDelete' as any).replace('{n}', r.name || r.time),
      { danger: true },
    );
    if (!ok) return;
    try {
      await api.fetchJSON(`${api.BASE}/alarms/${r.id}`, { method: 'DELETE' });
      await charger();
    } catch (e) {
      notifications.error(errText(e) ?? $t('common.error' as any));
    }
  }

  function libelleJours(jours: string): string {
    const n = jours.split(',').map(Number);
    if (n.length === 7) return $t('alarms.everyday');
    if (n.length === 5 && [1, 2, 3, 4, 5].every((d) => n.includes(d))) return $t('alarms.weekdays');
    if (n.length === 2 && [0, 6].every((d) => n.includes(d))) return $t('alarms.weekend');
    return n.map((d) => joursCourts[d]).join(', ');
  }

  const nomZone = $derived((id: number | null) =>
    id == null ? $t('alarms.defaultZone') : (zones.find((z) => z.id === id)?.name ?? '—'));
</script>

<div class="v2-ecran tune-v2">
  <header class="v2-entete">
    <h1>{$t('alarms.title')}</h1>
    <button class="v2-btn primaire" onclick={ouvrirCreation}>
      {$t('alarms.newAlarm')}
    </button>
  </header>

  {#if formulaire}
    <section class="carte form">
      <h2>{edite ? $t('alarms.editAlarm') : $t('alarms.newAlarm')}</h2>

      <label class="champ">
        <span>{$t('alarms.fieldName')}</span>
        <input type="text" bind:value={fNom} />
      </label>

      <label class="champ">
        <span>{$t('alarms.fieldTime')}</span>
        <input type="time" bind:value={fHeure} />
      </label>

      <div class="champ">
        <span>{$t('alarms.fieldDays')}</span>
        <div class="jours">
          {#each joursCourts as j, i}
            <button class="jour" class:on={fJours.includes(i)} onclick={() => basculerJour(i)}>{j}</button>
          {/each}
        </div>
      </div>

      <label class="champ">
        <span>{$t('alarms.source')}</span>
        <select bind:value={fTypeSource}>
          <option value="radio">{$t('alarms.sourceRadio')}</option>
          <option value="playlist">{$t('alarms.sourcePlaylist')}</option>
          <option value="album">{$t('alarms.sourceAlbum')}</option>
        </select>
      </label>

      <label class="champ">
        <span>{fTypeSource === 'radio' ? $t('alarms.radioUrl') : $t('alarms.id')}</span>
        <input
          type="text"
          bind:value={fIdSource}
          placeholder={fTypeSource === 'radio' ? 'https://stream.fip.fr/fip-hifi.aac' : $t('alarms.idPlaceholder')} />
      </label>

      {#if atLeast(niveau, 'intermediate')}
        <label class="champ">
          <span>{$t('alarms.nameOptional')}</span>
          <input type="text" bind:value={fNomSource} placeholder={$t('alarms.namePlaceholder')} />
        </label>

        <label class="champ">
          <span>{$t('alarms.playbackZone')}</span>
          <select bind:value={fZone}>
            <option value={null}>{$t('alarms.defaultZone')}</option>
            {#each zones as z}
              <option value={z.id}>{z.name}</option>
            {/each}
          </select>
        </label>

        <label class="champ">
          <span>{$t('alarms.fadeIn').replace('{value}', String(fMontee))}</span>
          <input type="range" min="0" max="120" step="5" bind:value={fMontee} />
        </label>
      {/if}

      {#if atLeast(niveau, 'expert')}
        <label class="champ ligne">
          <input type="checkbox" bind:checked={fFeries} />
          <span>{$t('alarms.skipHolidays')}</span>
        </label>

        <label class="champ">
          <span>{$t('alarms.volume').replace('{value}', String(fVolume))}</span>
          <input type="range" min="0" max="100" bind:value={fVolume} />
        </label>
      {/if}

      <div class="actions">
        <button class="v2-btn" onclick={() => (formulaire = false)}>{$t('common.cancel')}</button>
        <button class="v2-btn primaire" disabled={enregistrement} onclick={enregistrer}>
          {enregistrement ? $t('common.loading' as any) : $t('common.save')}
        </button>
      </div>
    </section>
  {:else if chargement}
    <div class="etat">{$t('common.loading' as any)}</div>
  {:else if !reveils.length}
    <div class="etat vide">
      <p>{$t('alarms.noneConfigured')}</p>
      <p class="indice">{$t('alarms.emptyHint')}</p>
    </div>
  {:else}
    <div class="liste">
      {#each reveils as r (r.id)}
        <div class="carte reveil" class:eteint={!r.enabled}>
          <button class="corps" onclick={() => ouvrirEdition(r)}>
            <span class="heure">{r.time}</span>
            <span class="detail">
              <b>{r.name}</b>
              <span class="jours-txt">
                {libelleJours(r.days)}{r.skip_holidays ? ' · ' + $t('alarms.exceptHolidays') : ''}
              </span>
              <span class="source">{r.source_name || r.source_id}</span>
              {#if atLeast(niveau, 'intermediate')}
                <span class="zone">{nomZone(r.zone_id)}</span>
              {/if}
            </span>
          </button>
          <div class="boutons">
            <label class="bascule" title={r.enabled ? $t('common.enabled' as any) : $t('common.disabled' as any)}>
              <input type="checkbox" checked={!!r.enabled} onchange={() => basculerActif(r)} />
              <span class="rail"></span>
            </label>
            <button class="v2-btn danger sm" onclick={() => supprimer(r)}>{$t('common.delete')}</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .v2-ecran { padding: 24px; max-width: 760px; margin: 0 auto; }
  .v2-entete { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .v2-entete h1 { margin: 0; font: 700 22px var(--v2-sans); color: var(--v2-txt); }

  .carte { background: var(--v2-surface); border: 1px solid var(--v2-line2); border-radius: var(--v2-r-card); }
  .liste { display: flex; flex-direction: column; gap: 10px; }

  .reveil { display: flex; align-items: center; gap: 12px; padding: 14px 16px; transition: opacity .16s; }
  .reveil.eteint { opacity: .5; }
  .corps { flex: 1; display: flex; align-items: center; gap: 16px; border: 0; background: transparent; text-align: left; cursor: pointer; padding: 0; color: inherit; }
  .heure { font: 700 26px var(--v2-sans); color: var(--v2-txt); font-variant-numeric: tabular-nums; }
  .detail { display: flex; flex-direction: column; gap: 2px; }
  .detail b { font: 600 14px var(--v2-sans); color: var(--v2-txt); }
  .jours-txt, .source, .zone { font: 400 12px var(--v2-sans); color: var(--v2-txt2); }

  .boutons { display: flex; align-items: center; gap: 10px; }
  .bascule { position: relative; width: 40px; height: 22px; flex: 0 0 auto; cursor: pointer; }
  .bascule input { position: absolute; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
  .rail { position: absolute; inset: 0; border-radius: 999px; background: var(--v2-line2); transition: background .16s; }
  .rail::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--v2-surface); transition: transform .16s; }
  .bascule input:checked + .rail { background: var(--v2-acc1); }
  .bascule input:checked + .rail::after { transform: translateX(18px); }
  .bascule input:focus-visible + .rail { outline: 2px solid var(--v2-acc1); outline-offset: 2px; }

  .form { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  .form h2 { margin: 0 0 4px; font: 700 17px var(--v2-sans); color: var(--v2-txt); }
  .champ { display: flex; flex-direction: column; gap: 6px; }
  .champ > span { font: 600 13px var(--v2-sans); color: var(--v2-txt2); }
  .champ.ligne { flex-direction: row; align-items: center; gap: 8px; }
  .champ input[type='text'], .champ input[type='time'], .champ select {
    padding: 9px 11px; border-radius: var(--v2-r-input, 8px); border: 1px solid var(--v2-line2);
    background: var(--v2-bg); color: var(--v2-txt); font: 400 14px var(--v2-sans);
  }

  .jours { display: flex; gap: 6px; flex-wrap: wrap; }
  .jour {
    min-width: 42px; padding: 7px 0; border-radius: var(--v2-r-pill); cursor: pointer;
    border: 1px solid var(--v2-line2); background: transparent; color: var(--v2-txt2);
    font: 600 12px var(--v2-sans);
  }
  .jour.on { background: var(--v2-acc1); border-color: var(--v2-acc1); color: var(--v2-on-acc); }

  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
  .etat { padding: 48px 0; text-align: center; color: var(--v2-txt2); font: 400 14px var(--v2-sans); }
  .etat.vide p { margin: 4px 0; }
  .indice { font-size: 12px; opacity: .8; }

  @media (max-width: 520px) {
    .reveil { flex-wrap: wrap; }
    .corps { gap: 12px; }
    .heure { font-size: 22px; }
  }
</style>
