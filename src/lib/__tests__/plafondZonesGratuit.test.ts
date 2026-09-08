/**
 * #3672 — le plafond de zones du gratuit se lit comme « votre protocole est
 * payant ».
 *
 * Un prospect anglophone (Claudio Osorio, 08/09/2026) écrit qu'il ne peut pas
 * jouer sur ses appareils **AirPlay 2, DLNA et BluOS** et que Tune lui annonce
 * que c'est réservé au Premium :
 *
 *   « in the web page description it shows for the Free version → airplay,
 *     DLNA, iOS remote, is not the case in my experience, so it is not so easy
 *     to trust. »
 *
 * Aucun protocole n'est premium. Ce qu'il a rencontré est le **plafond de
 * zones**, et c'est le LIBELLÉ du refus qui lui a fait comprendre autre chose.
 * Deux moitiés, aux deux bouts :
 *
 *  - côté serveur, le refus composait une phrase anglaise en dur (« Free tier
 *    is limited to 3 active zones… ») ;
 *  - côté client, `fetchJSON` traite TOUS les 402 pareil et affiche
 *    « Cette fonctionnalité fait partie de Tune Premium ». Servie à quelqu'un
 *    qui vient de cliquer sur son enceinte BluOS, cette phrase-là dit
 *    exactement ce qu'il a compris.
 *
 * Le serveur distingue désormais les deux refus par un `code` stable
 * (`free_zone_cap_reached`, contrat de #2392/#2419 : le code porte le sens,
 * `message` n'est qu'un repli). Ce fichier garde ce que le CLIENT en fait.
 *
 * La garde APPELLE `api.play()` contre un `fetch` stubé — le chemin réel du
 * bouton Lecture — et lit la notification réellement émise. Elle ne recopie
 * aucune condition du code.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { estRefusPremium } from '../premiumRefus';
import * as locales from '../locales';

vi.mock('../stores/notifications', () => ({
  notifications: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k),
});
vi.stubGlobal('window', { ...globalThis.window, location: { hash: '' } });

/** Le corps que le serveur rend désormais sur le plafond de zones. */
const REFUS_PLAFOND = {
  error: 'premium_required',
  code: 'free_zone_cap_reached',
  zone_limit: 3,
  zones_actives: 3,
  message: 'phrase du serveur, dans la langue de la requête',
  upgrade_url: 'https://mozaiklabs.fr/pricing',
};

/** Un refus premium ordinaire : une vraie fonction payante (l'égaliseur). */
const REFUS_PREMIUM = {
  error: 'premium_required',
  code: 'dsp_eq',
  message: 'Parametric EQ requires Tune Premium',
};

function stub402(corps: unknown) {
  const texte = JSON.stringify(corps);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: false,
      status: 402,
      statusText: 'Payment Required',
      headers: { get: () => null },
      json: async () => corps,
      text: async () => texte,
    })) as unknown as typeof fetch,
  );
}

let api: typeof import('../api');
let notifications: { error: ReturnType<typeof vi.fn> };
let i18n: typeof import('../i18n');

beforeEach(async () => {
  storage.clear();
  vi.resetModules();
  api = await import('../api');
  i18n = await import('../i18n');
  notifications = (await import('../stores/notifications')).notifications as never;
  notifications.error.mockClear();
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

/** Joue sur une zone, avale l'erreur, et rend la notification affichée. */
async function notificationDuRefus(corps: unknown): Promise<string> {
  stub402(corps);
  const e = await api.play(4, { track_id: 1 }).then(
    () => {
      throw new Error('la lecture aurait dû être refusée');
    },
    (err: unknown) => err,
  );
  // Le refus reste un refus : les écrans qui le trient ne doivent pas le
  // prendre pour une panne réseau (#2178).
  expect(estRefusPremium(e)).toBe(true);
  expect(notifications.error).toHaveBeenCalledTimes(1);
  return notifications.error.mock.calls[0][0] as string;
}

describe('le refus du plafond de zones ne parle pas de « fonctionnalité payante »', () => {
  it('affiche la phrase des ZONES, pas celle des fonctions premium', async () => {
    const phrase = await notificationDuRefus(REFUS_PLAFOND);
    expect(
      phrase,
      'le plafond de zones est encore annoncé comme une fonction payante',
    ).not.toBe(locales.fr['premium.required']);
    expect(phrase).toBe(
      (locales.fr as Record<string, string>)['zone.freeCapReached'].replace('{n}', '3'),
    );
  });

  it('nomme les protocoles inclus — la moitié de phrase qui aurait évité le ticket', async () => {
    const phrase = await notificationDuRefus(REFUS_PLAFOND);
    for (const protocole of ['DLNA', 'AirPlay 2', 'BluOS', 'Chromecast', 'OpenHome']) {
      expect(phrase, `la phrase ne rassure pas sur ${protocole}`).toContain(protocole);
    }
    expect(phrase, 'la phrase ne dit pas le nombre de zones').toContain('3');
  });

  it('dit le plafond RÉEL annoncé par le serveur, pas un 3 recopié', async () => {
    // `TUNE_FREE_MAX_ZONES` peut valoir autre chose : le client ne doit tenir
    // aucune copie du chiffre.
    const phrase = await notificationDuRefus({ ...REFUS_PLAFOND, zone_limit: 7 });
    expect(phrase).toContain('7');
    expect(phrase).not.toContain('{n}');
  });

  it('parle la langue choisie dans l’interface, pas celle du serveur', async () => {
    i18n.locale.set('en');
    const en = await notificationDuRefus(REFUS_PLAFOND);
    notifications.error.mockClear();
    i18n.locale.set('fr');
    const fr = await notificationDuRefus(REFUS_PLAFOND);
    expect(en).not.toBe(fr);
    expect(en).toBe(
      (locales.en as Record<string, string>)['zone.freeCapReached'].replace('{n}', '3'),
    );
    // Et surtout : jamais le `message` composé par le serveur.
    expect(en).not.toContain('phrase du serveur');
    expect(fr).not.toContain('phrase du serveur');
  });

  it('un refus premium ORDINAIRE garde sa phrase — rien n’a été détourné', async () => {
    const phrase = await notificationDuRefus(REFUS_PREMIUM);
    expect(phrase).toBe(locales.fr['premium.required']);
  });
});

describe('la clé du plafond existe dans les onze langues', () => {
  const LANGUES = {
    fr: locales.fr,
    en: locales.en,
    de: locales.de,
    es: locales.es,
    it: locales.it,
    zh: locales.zh,
    ja: locales.ja,
    ko: locales.ko,
    ro: locales.ro,
    sv: locales.sv,
    hu: locales.hu,
  } as Record<string, Record<string, string>>;

  for (const [code, dict] of Object.entries(LANGUES)) {
    it(`${code} traduit zone.freeCapReached`, () => {
      const phrase = dict['zone.freeCapReached'];
      expect(phrase, `clé absente en ${code}`).toBeTruthy();
      expect(phrase, `${code} ne porte pas le nombre`).toContain('{n}');
      // Les protocoles sont des noms propres : ils ne se traduisent pas, et
      // leur présence est justement ce que la phrase doit garantir.
      for (const protocole of ['DLNA', 'AirPlay 2', 'BluOS', 'Chromecast', 'OpenHome']) {
        expect(phrase, `${code} ne nomme pas ${protocole}`).toContain(protocole);
      }
    });
  }

  it('aucune langue ne se contente de recopier le français', () => {
    for (const [code, dict] of Object.entries(LANGUES)) {
      if (code === 'fr') continue;
      expect(
        dict['zone.freeCapReached'],
        `${code} recopie le français`,
      ).not.toBe(LANGUES.fr['zone.freeCapReached']);
    }
  });
});
