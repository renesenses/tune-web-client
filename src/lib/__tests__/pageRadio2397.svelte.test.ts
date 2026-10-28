// @vitest-environment jsdom
import { clearViewContext } from '../stores/navigation';
//
// #2397 — la page Radio (Mes radios / Annuaire) après le rapport de Rémi
// (RC7, 25/10/2026). Un test par comportement ; chacun a sa contre-épreuve.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const mocks = vi.hoisted(() => ({
  getRadios: vi.fn(), updateRadio: vi.fn(), playRadio: vi.fn(), deleteRadio: vi.fn(),
  importRadios: vi.fn(), exportRadiosUrl: vi.fn(() => '#'),
  getAnnuaireRadios: vi.fn(), ajouterDepuisAnnuaire: vi.fn(), jouerDepuisAnnuaire: vi.fn(),
}));
vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<object>()), ...mocks }));
vi.mock('../zoneRequise', () => ({ zoneRequise: () => 3 }));

import RadiosV2 from '../../components/v2/RadiosV2.svelte';
import { dialogs } from '../stores/dialogs';
import { locale } from '../i18n';
import { dernieresLues, estDeLAnnuaire, memoriserLecture } from '../mesRadios';

const FIP = { id: 7, name: 'FIP', stream_url: 'https://a/fip.aac', favorite: false, genre: 'Éclectique',
  annuaire: { external_id: 'S000973', rapproche_par: 'id' } };
const MAISON = { id: 8, name: 'Radio Maison', stream_url: 'https://a/maison.mp3', favorite: false, genre: 'Jazz' };
const ANNUAIRE = {
  total: 2, offset: 0, limit: 120, count: 2, stations: 836, origine: 'reseau',
  items: [
    { external_id: 'S000973', name: 'FIP', country_code: 'FR', genre: 'eclectic', stream_url: 'x', now_playing: true, my_radio_id: 7 },
    { external_id: 'S002479', name: 'Radio Paradise', country_code: 'US', genre: 'news', stream_url: 'y', now_playing: false, my_radio_id: null },
  ],
  countries: [{ code: 'FR', count: 1 }], genres: [{ key: 'news', count: 1 }, { key: 'eclectic', count: 1 }],
  attribution: { name: 'radio-metadata.fr', url: 'https://radio-metadata.fr', support_url: 'https://ko-fi.com/aleceiffel' },
};

const respirer = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); flushSync(); };
let hote: HTMLDivElement;
let instance: Record<string, unknown> | null = null;

async function monter() {
  hote = document.createElement('div');
  document.body.append(hote);
  instance = mount(RadiosV2, { target: hote, props: {} });
  flushSync();
  await respirer();
}
const onglet = (i: number) => hote.querySelectorAll<HTMLButtonElement>('.sections button')[i];

beforeEach(() => {
  clearViewContext('radios');
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.getRadios.mockResolvedValue([FIP, MAISON]);
  mocks.exportRadiosUrl.mockReturnValue('#');
  mocks.getAnnuaireRadios.mockResolvedValue(ANNUAIRE);
  mocks.playRadio.mockResolvedValue({ zone_id: 3 });
  localStorage.clear();
  locale.set('fr');
});
afterEach(() => {
  if (instance) unmount(instance as any);
  instance = null;
  hote?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('recherche : même emplacement sur Mes radios et Annuaire', () => {
  it('🔴 le champ est dans la zone défilante, jamais dans l’en-tête, dans les deux onglets', async () => {
    await monter();
    expect(hote.querySelector('.v2-top .v2-rech'), 'recherche dans l’en-tête').toBeNull();
    const mes = hote.querySelector('.scroll > .filtres .v2-rech input') as HTMLInputElement;
    expect(mes).not.toBeNull();
    onglet(1).click();
    await respirer();
    const ann = hote.querySelector('.scroll > .annuaire > .filtres .v2-rech input') as HTMLInputElement;
    expect(ann).not.toBeNull();
    expect(ann.placeholder).toBe(mes.placeholder);
  });
});

describe('import / export M3U : Mes radios seulement', () => {
  it('🔴 présents sur Mes radios, absents sur Annuaire', async () => {
    await monter();
    expect(hote.querySelector('a[download="radios.m3u"]')).not.toBeNull();
    onglet(1).click();
    await respirer();
    expect(hote.querySelector('a[download="radios.m3u"]')).toBeNull();
    expect(hote.querySelector('input[type=file]')).toBeNull();
    onglet(0).click();
    await respirer();
    expect(hote.querySelector('a[download="radios.m3u"]')).not.toBeNull();
  });
});

describe('entrées de l’annuaire : non modifiables, à retirer', () => {
  it('estDeLAnnuaire : le lien enregistré seul compte', () => {
    expect(estDeLAnnuaire(FIP as any)).toBe(true);
    expect(estDeLAnnuaire(MAISON as any)).toBe(false);
    expect(estDeLAnnuaire({ annuaire: { external_id: 'S1', rapproche_par: 'flux' } })).toBe(false);
    expect(estDeLAnnuaire({ annuaire: { external_id: null } })).toBe(false);
  });

  it('🔴 FIP (annuaire) : « Retirer », pas « Modifier » ; la station maison : l’inverse', async () => {
    await monter();
    const tuiles = [...hote.querySelectorAll('.grid .st')];
    const fip = tuiles.find((t) => t.querySelector('.nm')?.textContent === 'FIP')!;
    const maison = tuiles.find((t) => t.querySelector('.nm')?.textContent === 'Radio Maison')!;
    const titres = (e: Element) => [...e.querySelectorAll('button.coin')].map((b) => b.getAttribute('title'));
    expect(titres(fip)).toContain('Retirer de Mes radios');
    expect(titres(fip)).not.toContain('Modifier');
    expect(titres(maison)).toContain('Modifier');
    expect(titres(maison)).not.toContain('Retirer de Mes radios');
  });

  it('🔴 retirer demande confirmation, puis supprime et retire la tuile', async () => {
    const confirm = vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
    mocks.deleteRadio.mockResolvedValue(undefined);
    await monter();
    const fip = [...hote.querySelectorAll('.grid .st')].find((t) => t.querySelector('.nm')?.textContent === 'FIP')!;
    (fip.querySelector('button.coin[title="Retirer de Mes radios"]') as HTMLButtonElement).click();
    await respirer();
    expect(confirm).toHaveBeenCalled();
    expect(mocks.deleteRadio).toHaveBeenCalledWith(7);
    expect([...hote.querySelectorAll('.grid .st .nm')].map((n) => n.textContent)).not.toContain('FIP');
  });

  it('CONTRE-ÉPREUVE : refus de la confirmation, rien n’est supprimé', async () => {
    vi.spyOn(dialogs, 'confirm').mockResolvedValue(false);
    await monter();
    const fip = [...hote.querySelectorAll('.grid .st')].find((t) => t.querySelector('.nm')?.textContent === 'FIP')!;
    (fip.querySelector('button.coin[title="Retirer de Mes radios"]') as HTMLButtonElement).click();
    await respirer();
    expect(mocks.deleteRadio).not.toHaveBeenCalled();
  });
});

describe('Dernières lues', () => {
  it('🔴 lancer une station la met en première rangée, la plus récente d’abord', async () => {
    await monter();
    expect(hote.querySelector('.recentes'), 'rangée visible sans lecture').toBeNull();
    const lancer = (nom: string) => ([...hote.querySelectorAll('.grid .st')]
      .find((t) => t.querySelector('.nm')?.textContent === nom)!
      .querySelector('button.ouvrir') as HTMLButtonElement).click();
    lancer('FIP'); await respirer();
    lancer('Radio Maison'); await respirer();
    const rangee = [...hote.querySelectorAll('.recentes .st .nm')].map((n) => n.textContent);
    expect(rangee).toEqual(['Radio Maison', 'FIP']);
    expect(hote.querySelector('.scroll')!.firstElementChild!.classList.contains('filtres')).toBe(true);
  });

  it('la rangée se masque quand une recherche est en cours', async () => {
    memoriserLecture(7);
    await monter();
    expect(hote.querySelector('.recentes')).not.toBeNull();
    const champ = hote.querySelector('.scroll .v2-rech input') as HTMLInputElement;
    champ.value = 'maison';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    await respirer();
    expect(hote.querySelector('.recentes')).toBeNull();
  });

  it('dernieresLues : le serveur (last_played_at) prime sur la mémoire locale', () => {
    memoriserLecture(7);
    const rs = [
      { ...FIP, last_played_at: '2026-10-01T10:00:00Z' },
      { ...MAISON, last_played_at: '2026-10-02T10:00:00Z' },
    ] as any[];
    expect(dernieresLues(rs).map((r) => r.id)).toEqual([8, 7]);
    // Contre-épreuve : sans date serveur, c'est la mémoire locale.
    expect(dernieresLues([FIP, MAISON] as any[]).map((r) => r.id)).toEqual([7]);
  });

  it('un stockage qui lève ne casse rien', () => {
    const casse = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(() => memoriserLecture(1, casse)).not.toThrow();
    expect(dernieresLues([FIP] as any[], casse)).toEqual([]);
  });
});

describe('badge « Live » sur le logo', () => {
  it('🔴 aucun badge pendant la lecture, ni sur Mes radios ni sur Annuaire', async () => {
    await monter();
    (hote.querySelector('.grid .st button.ouvrir') as HTMLButtonElement).click();
    await respirer();
    expect(hote.querySelector('.st.live'), 'la tuile ne joue pas').not.toBeNull();
    expect(hote.querySelector('.onair')).toBeNull();
    onglet(1).click();
    await respirer();
    mocks.jouerDepuisAnnuaire.mockResolvedValue({ zone_id: 3 });
    (hote.querySelectorAll('.fiche')[1].querySelector('button.ouvrir') as HTMLButtonElement).click();
    await respirer();
    expect(hote.querySelector('.fiche.live')).not.toBeNull();
    expect(hote.querySelector('.onair')).toBeNull();
  });
});

describe('filtre par genre : des boutons partout', () => {
  it('🔴 Mes radios et Annuaire offrent des puces ; l’annuaire n’a plus de liste de genres', async () => {
    await monter();
    // Niveau Avancé requis pour les filtres sur Mes radios.
    const { preferences } = await import('../stores/preferences');
    preferences.update((p: any) => ({ ...p, settingsLevel: 'expert' }));
    await respirer();
    expect(hote.querySelectorAll('.scroll .chip').length).toBeGreaterThan(1);
    onglet(1).click();
    await respirer();
    expect(hote.querySelectorAll('.annuaire .chip').length).toBe(3);
    expect(hote.querySelectorAll('.annuaire select').length).toBe(1);
  });
});

describe('Annuaire : icône d’ajout sur le logo', () => {
  it('🔴 le bouton est sur la pochette, avec « Ajouter à mes radios », et absent si déjà dedans', async () => {
    mocks.ajouterDepuisAnnuaire.mockResolvedValue({ id: 9, name: 'Radio Paradise', stream_url: 'y', favorite: false });
    await monter();
    onglet(1).click();
    await respirer();
    const fiches = hote.querySelectorAll('.fiche');
    const bouton = fiches[1].querySelector('.vignette button.coin.tl2') as HTMLButtonElement;
    expect(bouton.title).toBe('Ajouter à mes radios');
    expect(fiches[0].querySelector('button.coin.tl2')).toBeNull();
    expect(fiches[1].querySelector('.pied button'), 'le + du bas existe encore').toBeNull();
    bouton.click();
    await respirer();
    expect(mocks.ajouterDepuisAnnuaire).toHaveBeenCalledWith('S002479', false);
  });
});

describe('Annuaire relu à chaque ouverture', () => {
  it('🔴 rouvrir l’onglet relit l’annuaire ; revenir sur Mes radios relit la liste', async () => {
    await monter();
    onglet(1).click(); await respirer();
    const n1 = mocks.getAnnuaireRadios.mock.calls.length;
    onglet(0).click(); await respirer();
    expect(mocks.getRadios.mock.calls.length).toBe(2);
    onglet(1).click(); await respirer();
    expect(mocks.getAnnuaireRadios.mock.calls.length).toBeGreaterThan(n1);
  });
});

describe('« Nouvelle station » : trois choix', () => {
  const ouvrir = async () => {
    await monter();
    (hote.querySelector('.v2-btn.primaire') as HTMLButtonElement).click();
    await respirer();
  };
  const choix = (k: string) => document.querySelector(`[data-choix=${k}]`) as HTMLElement;

  it('🔴 le bouton ouvre le choix, sans ouvrir le formulaire', async () => {
    await ouvrir();
    expect(choix('annuaire')).not.toBeNull();
    expect(choix('proposer')).not.toBeNull();
    expect(choix('saisie')).not.toBeNull();
    expect(document.querySelector('form'), 'le formulaire s’ouvre d’emblée').toBeNull();
  });

  it('« annuaire » mène à l’onglet Annuaire', async () => {
    await ouvrir();
    choix('annuaire').click();
    await respirer();
    expect(onglet(1).getAttribute('aria-selected')).toBe('true');
    expect(choix('annuaire')).toBeNull();
  });

  it('« proposer » est un lien vers mozaiklabs.fr/radios, dans un nouvel onglet', async () => {
    await ouvrir();
    const a = choix('proposer') as HTMLAnchorElement;
    expect(a.href).toBe('https://mozaiklabs.fr/radios');
    expect(a.target).toBe('_blank');
  });

  it('« saisie » ouvre le formulaire actuel', async () => {
    await ouvrir();
    choix('saisie').click();
    await respirer();
    expect(document.querySelector('form')).not.toBeNull();
    expect(choix('saisie')).toBeNull();
  });
});
