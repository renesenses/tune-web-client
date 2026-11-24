/**
 * Serveur TESS SIMULÉ, conforme au contrat T01 (lot W1).
 *
 * L'API réelle (lot T08) n'était pas publiée quand l'écran a été écrit : cette
 * simulation en tient lieu pour les épreuves (`__tests__/tess*.test.ts`). Elle
 * reproduit ce que le contrat fixe et que l'écran doit traiter :
 *   - le catalogue de référence (11 greffons, droits des décisions Q2 révisée,
 *     Q3, P1 et D2 : `mono-downmix` Free) ;
 *   - l'ordre réel des étapes (Q9) : Source → Headroom → greffons →
 *     Upsampling → Volume → Quantization → Output, et l'exception DSD
 *     (Volume puis DsdModulator) ;
 *   - les refus du `PUT` : 400 `invalid_body`, 409 `unknown_plugin`,
 *     `duplicate_plugin`, `must_be_last_plugin`, `mutually_exclusive`
 *     (groupe crossfeed en politique `refuse`, décision du 18/11), 402
 *     `premium_required` ;
 *   - 404 pour un serveur sans TESS.
 *
 * Elle n'est importée par AUCUN écran : rien de ceci ne part dans le paquet
 * de production.
 */
import type {
  CatalogueTess, ChaineTess, DescripteurGreffonTess, EtapeTess, ReponseTessZone, RefusTess, PreReglagesTess,
} from './tess';

type Ligne = [id: string, name: string, category: string, premium: boolean, channels: string, position: string, groupe: number | null];

const LIGNES: Ligne[] = [
  ['equalizer-graphic', 'Graphic EQ', 'equalisation', false, 'any', 'free', null],
  ['equalizer-parametric', 'Parametric EQ', 'equalisation', true, 'any', 'free', null],
  ['equalizer-headphone', 'Headphone EQ', 'equalisation', false, 'any', 'free', null],
  ['crossfeed', 'Crossfeed', 'spatial', false, 'stereo_only', 'free', 1],
  ['crossfeed-pro', 'Crossfeed Pro', 'spatial', true, 'stereo_only', 'free', 2],
  ['crosstalk', 'Crosstalk', 'spatial', true, 'stereo_only', 'free', 3],
  ['convolution', 'Convolution', 'room_and_filters', true, 'any', 'free', null],
  ['room-correction', 'Room correction', 'room_and_filters', true, 'any', 'free', null],
  ['declick-live', 'Declick', 'restoration_and_routing', true, 'any', 'free', null],
  ['mono-downmix', 'Mono downmix', 'restoration_and_routing', false, 'stereo_only', 'free', null],
  ['channel-remap', 'Channel remapping', 'restoration_and_routing', false, 'remaps', 'last_plugin', null],
];

export function catalogueSimule(politique: 'refuse' | 'priority' = 'refuse'): CatalogueTess {
  const plugins: DescripteurGreffonTess[] = LIGNES.map(([id, name, category, premium, channels, position, groupe]) => ({
    id, name, category,
    entitlement: premium ? 'premium' : 'free',
    feature: id === 'convolution' || id === 'room-correction' ? 'room_correction' : null,
    origin: id === 'crossfeed-pro' || id === 'crosstalk' ? 'package' : 'reference',
    settings_schema: { type: 'object' },
    placement: {
      channels, position,
      exclusive_group: groupe == null ? null : { id: 'crossfeed_crosstalk', priority: groupe },
    },
  }));
  return { plugins, groups: [{ id: 'crossfeed_crosstalk', policy: politique }] };
}

/** Copie profonde d'une chaîne (données JSON). `structuredClone` n'existe
 *  qu'à partir de Safari 15.4, hors de la cible Safari 14 du client. */
function copieChaine(chaine: ChaineTess): ChaineTess {
  return JSON.parse(JSON.stringify(chaine)) as ChaineTess;
}

export interface ZoneSimulee {
  transport: string;
  chain: ChaineTess;
  active_preset?: string | null;
  volume_db?: number;
}

const etape = (code: string, o: Partial<EtapeTess> = {}): EtapeTess => ({
  code, plugin_id: null, fixed: true, requested: true, effective: true,
  reason: null, detail: null, params: null, latency_frames: null, ...o,
});

export class ServeurTessSimule {
  zones = new Map<number, ZoneSimulee>();
  premium = true;
  /** `false` : serveur sans TESS (toutes les routes en 404). */
  avecTess = true;
  /**
   * `GET /tess/catalog` (T08), la sonde sans zone du lot W2. Désactivée par
   * défaut : les bancs de W1 décrivent un serveur qui ne la servait pas, et
   * vérifient le repli sur `GET /zones/{id}/tess`.
   */
  avecCatalogue = false;
  /** Droits publiés par `GET /tess/catalog` qui s'écartent de la règle `premium` (par greffon). */
  droitsPublies: Record<string, { entitled?: boolean | null; available?: boolean; reason?: string | null }> = {};
  /** `false` : un serveur ancien, dont le catalogue ne publie pas `plugins[]`. */
  avecDroitsPublies = true;
  /** Greffons que `plugins[]` ne mentionne pas (liste publiée mais incomplète). */
  absentsDesDroits: string[] = [];
  catalogue: CatalogueTess = catalogueSimule();
  presets: PreReglagesTess | null = null;
  /** Les corps de `PUT` reçus, dans l'ordre. */
  puts: { zoneId: number; corps: unknown }[] = [];
  /** T17 : les appels aux routes des préréglages, dans l'ordre. */
  appelsPreReglages: { methode: string; url: string; corps: unknown }[] = [];
  /** rc14 : `warnings` rendus au chargement d'un préréglage. */
  avertissementsChargement: string[] = [];
  /** T17 : étages rendus `not_applied` au chargement (motif par greffon). */
  nonAppliques: { plugin_id: string | null; reason: string }[] = [];

  /** Routes T17 (`/tess/presets`, `/tess/apply-mode`, `/zones/{id}/tess/presets/{p}/apply`). */
  routesPreReglages(url: string, methode: string, init?: RequestInit): Response | null {
    const l = this.presets!;
    const corps = (() => { try { return init?.body ? JSON.parse(String(init.body)) : null; } catch { return null; } })();
    const noter = () => this.appelsPreReglages.push({ methode, url, corps });
    const introuvable = (id: string) => json(404, { error: 'preset_not_found', message: 'x', preset_id: id });
    if (/\/api\/v1\/tess\/presets(?:\?|$)/.test(url)) {
      if (methode === 'GET') return json(200, l);
      if (methode === 'POST') {
        noter();
        const nom = String(corps?.name ?? '').trim();
        if (!nom) return json(400, { error: 'invalid_name', message: 'x', preset_id: null });
        const base = nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'preset';
        let id = base; let n = 2;
        while (id === 'pure' || l.presets.some((p) => p.id === id)) id = `${base}-${n++}`;
        const z = this.zones.get(corps.zone_id);
        if (!z) return json(404, { error: 'zone_not_found' });
        const p = { id, name: nom, builtin: false, chain: copieChaine(z.chain) };
        l.presets.push(p);
        z.active_preset = id;
        return json(201, p);
      }
    }
    const un = url.match(/\/api\/v1\/tess\/presets\/([^/?]+)(?:\?|$)/);
    if (un) {
      noter();
      const id = decodeURIComponent(un[1]);
      const p = l.presets.find((x) => x.id === id);
      if (!p) return introuvable(id);
      if (methode === 'PATCH') {
        const nom = String(corps?.name ?? '').trim();
        if (!nom) return json(400, { error: 'invalid_name', message: 'x', preset_id: null });
        p.name = nom;
        return json(200, p);
      }
      if (methode === 'DELETE') {
        l.presets = l.presets.filter((x) => x.id !== id);
        for (const z of this.zones.values()) if (z.active_preset === id) z.active_preset = null;
        return { ok: true, status: 204, statusText: '204', headers: new Headers(), json: async () => null, text: async () => '' } as unknown as Response;
      }
    }
    if (/\/api\/v1\/tess\/apply-mode(?:\?|$)/.test(url) && methode === 'PUT') {
      noter();
      if (corps?.apply_mode !== 'immediately' && corps?.apply_mode !== 'at_next_playback') {
        return json(400, { error: 'invalid_apply_mode', message: 'x', preset_id: null });
      }
      l.apply_mode = corps.apply_mode;
      return json(200, l);
    }
    const app = url.match(/\/api\/v1\/zones\/(\d+)\/tess\/presets\/([^/?]+)\/apply(?:\?|$)/);
    if (app && methode === 'POST') {
      noter();
      const zid = Number(app[1]);
      const id = decodeURIComponent(app[2]);
      const p = l.presets.find((x) => x.id === id);
      if (!p) return introuvable(id);
      // Même voie que le PUT : la validation (402 compris) d'abord.
      const r = this.valider(p.chain);
      if (r) return json(r.status, r);
      const z = this.zones.get(zid)!;
      z.chain = copieChaine(p.chain);
      z.active_preset = id;
      return json(200, {
        preset_id: id,
        apply_mode: l.apply_mode === 'at_next_playback' ? 'at_next_playback' : 'immediately',
        // Un motif sans greffon (`plugin_id: null`) est toujours rendu.
        not_applied: this.nonAppliques.filter((n) => n.plugin_id === null || (p.chain.plugins ?? []).some((m) => m.id === n.plugin_id && m.enabled)),
        zone: this.reponse(zid),
        ...(this.avertissementsChargement.length > 0 ? { warnings: this.avertissementsChargement } : {}),
      });
    }
    return null;
  }

  reponse(zoneId: number): ReponseTessZone {
    const z = this.zones.get(zoneId)!;
    const hors = z.transport === 'hqplayer' || z.transport === 'diretta';
    const chain = z.chain;
    const liens = chain.plugins ?? [];
    const bypass = chain.bypass_all === true;
    const greffons = liens.map((l) => {
      const d = this.catalogue.plugins.find((p) => p.id === l.id);
      const e = etape('plugin', { plugin_id: l.id, fixed: false, requested: l.enabled, effective: l.enabled });
      if (hors) Object.assign(e, { effective: false, reason: 'outside_tess' });
      else if (bypass) Object.assign(e, { effective: false, reason: 'bypass_all' });
      else if (!d) Object.assign(e, { effective: false, reason: 'unknown_plugin' });
      else if (l.enabled && d.entitlement !== 'free' && !this.premium) Object.assign(e, { effective: false, reason: 'premium_required' });
      return e;
    });
    const traite = greffons.some((e) => e.effective);
    const up = chain.fixed?.upsampling ?? { mode: 'off' };
    const upsampling = etape('upsampling', {
      requested: up.mode !== 'off', effective: up.mode !== 'off' && !bypass && !hors,
      params: up.mode === 'off' ? null : { ...up },
    });
    const vol = z.volume_db ?? 0;
    const volume = etape('volume', { requested: vol !== 0, effective: vol !== 0 && !hors, params: { db: vol } });
    const headroom = etape('headroom', {
      requested: traite || upsampling.effective, effective: traite || upsampling.effective,
      reason: traite || upsampling.effective ? null : 'nothing_to_protect',
      params: { db: traite || upsampling.effective ? -3 : 0, mode: 'auto' },
    });
    const source = etape('source', { params: { kind: 'pcm', format: 'flac', sample_rate_hz: 96000, bits: 24, channels: 2 } });
    const dsd = up.mode === 'dsd' && upsampling.effective;
    const fin = dsd
      ? [etape('dsd_modulator', { params: { rate: up.rate } })]
      : [etape('quantization', { params: { dither: chain.fixed?.quantization?.dither ?? 'tpdf' } })];
    const sortie = etape('output', { params: dsd ? { kind: 'dsd', rate: up.rate } : { kind: 'pcm', sample_rate_hz: 96000, bits: 24, channels: 2 } });
    return {
      contract_version: 1,
      zone_id: zoneId,
      transport: z.transport,
      applicability: hors
        ? { status: 'outside_tess', reason: z.transport === 'hqplayer' ? 'hqplayer_own_processing' : 'diretta_outside_tess', detail: 'outside' }
        : { status: 'applied' },
      chain,
      active_preset: z.active_preset ?? null,
      headroom_db: hors ? 0 : (headroom.params!.db as number),
      volume: { control: 'software', placement: hors ? null : dsd ? 'before_dsd_modulator' : 'at_render', db: vol },
      badge: hors ? 'outside_tess' : traite || upsampling.effective || vol !== 0 ? 'processed_by_tess' : 'bit_perfect',
      signal_path: [source, headroom, ...greffons, upsampling, volume, ...fin, sortie],
      catalog: this.catalogue,
    };
  }

  /** Validation d'un `PUT`, dans l'ordre de `ChaineTess::valider`. */
  valider(corps: any): RefusTess | null {
    const refus = (status: number, code: string, plugin_id: string | null = null): RefusTess =>
      ({ status, code, detail: code, plugin_id });
    if (typeof corps !== 'object' || corps === null || typeof corps.version !== 'number') return refus(400, 'invalid_body');
    const connus = new Set(['version', 'bypass_all', 'plugins', 'fixed']);
    if (Object.keys(corps).some((k) => !connus.has(k))) return refus(400, 'invalid_body');
    if (corps.version < 1 || corps.version > 1) return refus(409, 'unsupported_version');
    const liens: any[] = corps.plugins ?? [];
    const vus = new Set<string>();
    for (const l of liens) {
      const d = this.catalogue.plugins.find((p) => p.id === l.id);
      if (!d) return refus(409, 'unknown_plugin', l.id);
      if (vus.has(l.id)) return refus(409, 'duplicate_plugin', l.id);
      vus.add(l.id);
    }
    // Comme `verifier_reglages` + `projeter_egaliseur` (T02/T08) : un profil
    // d'égaliseur incomplet est refusé, il ne peut pas devenir `eq_profile`.
    const REQUIS_EQ = ['listening', 'room_size', 'speaker_placement', 'bass_gain_db', 'mid_gain_db', 'treble_gain_db'];
    for (const l of liens) {
      if (l.settings != null && (typeof l.settings !== 'object' || Array.isArray(l.settings))) return refus(409, 'invalid_settings', l.id);
      if (l.settings && String(l.id).startsWith('equalizer-') && REQUIS_EQ.some((k) => !(k in l.settings))) {
        return refus(409, 'invalid_settings', l.id);
      }
    }
    for (let i = 0; i < liens.length - 1; i++) {
      const d = this.catalogue.plugins.find((p) => p.id === liens[i].id)!;
      if (d.placement.position === 'last_plugin') return refus(409, 'must_be_last_plugin', liens[i].id);
    }
    const parGroupe = new Map<string, string>();
    for (const l of liens) {
      const g = this.catalogue.plugins.find((p) => p.id === l.id)!.placement.exclusive_group?.id;
      const politique = this.catalogue.groups?.find((x) => x.id === g)?.policy;
      if (!g || !l.enabled || politique !== 'refuse') continue;
      if (parGroupe.has(g)) return refus(409, 'mutually_exclusive', l.id);
      parGroupe.set(g, l.id);
    }
    if (!this.premium && corps.bypass_all !== true) {
      const payant = liens.find((l) => l.enabled && this.catalogue.plugins.find((p) => p.id === l.id)!.entitlement !== 'free');
      if (payant) return refus(402, 'premium_required', payant.id);
      if (corps.fixed?.upsampling && corps.fixed.upsampling.mode !== 'off') return refus(402, 'premium_required');
    }
    return null;
  }

  /** Le `fetch` du serveur simulé (les autres routes rendent 404). */
  fetch = async (entree: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(entree);
    const methode = (init?.method ?? 'GET').toUpperCase();
    const zone = url.match(/\/api\/v1\/zones\/(\d+)\/tess(?:\?|$)/);
    if (zone && this.avecTess && this.zones.has(Number(zone[1]))) {
      const id = Number(zone[1]);
      if (methode === 'GET') return json(200, this.reponse(id));
      if (methode === 'PUT') {
        let corps: unknown;
        try { corps = JSON.parse(String(init?.body ?? '')); } catch { return json(400, { status: 400, code: 'invalid_body', detail: 'invalid_body', plugin_id: null }); }
        this.puts.push({ zoneId: id, corps });
        const r = this.valider(corps);
        if (r) return json(r.status, r);
        this.zones.get(id)!.chain = corps as ChaineTess;
        this.zones.get(id)!.active_preset = null;
        return json(200, this.reponse(id));
      }
    }
    // Serveur AVEC TESS, zone inconnue : la route existe, la zone non (forme
    // de T08). Ce 404-là ne veut PAS dire « pas de TESS ».
    if (zone && this.avecTess) return json(404, { error: 'zone_not_found', zone_id: Number(zone[1]) });
    if (/\/api\/v1\/tess\/catalog(?:\?|$)/.test(url) && this.avecTess && this.avecCatalogue) {
      return json(200, {
        contract_version: 1, premium: this.premium, catalog: this.catalogue,
        ...(this.avecDroitsPublies ? {
          plugins: this.catalogue.plugins.filter((p) => !this.absentsDesDroits.includes(p.id)).map((p) => ({
            id: p.id, entitled: this.premium || p.entitlement === 'free', available: true,
            reason: this.premium || p.entitlement === 'free' ? null : 'premium_required',
            ...this.droitsPublies[p.id],
          })),
        } : {}),
      });
    }
    if (this.avecTess && this.presets) {
      const r = this.routesPreReglages(url, methode, init);
      if (r) return r;
    }
    return json(404, { error: 'not_found' });
  };
}

function json(status: number, corps: unknown): Response {
  const texte = JSON.stringify(corps);
  return {
    ok: status >= 200 && status < 300, status, statusText: String(status),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => JSON.parse(texte),
    text: async () => texte,
  } as unknown as Response;
}

/** Une chaîne de la maquette A1 : Convolution, Graphic EQ, Crossfeed (décoché). */
export function chaineA1(): ChaineTess {
  return {
    version: 1,
    bypass_all: false,
    plugins: [
      { id: 'convolution', enabled: true, settings: { filter_set: 'living-room.zip' } },
      { id: 'equalizer-graphic', enabled: true, settings: null },
      { id: 'crossfeed', enabled: false, settings: null },
    ],
    fixed: {
      headroom: { mode: 'auto' },
      upsampling: { mode: 'off' },
      quantization: { dither: 'tpdf' },
    },
  };
}
