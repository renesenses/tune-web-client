// @vitest-environment jsdom
//
// Tune Circle (19/11/2026) : la lecture seule (`cercleLectureSeule`, profil non
// administrateur ou client distant) vaut pour TOUS les écrans du cercle, pas
// seulement `CircleV2` : messagerie, cercles généraux, boîte de partage,
// grille des playlists. Ouvrir une conversation n'y marque plus rien comme lu,
// et un refus du marquage n'empêche jamais d'afficher la conversation.
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Messagerie from '../../components/v2/MessagerieCercleV2.svelte';
import Generaux from '../../components/v2/CerclesGenerauxV2.svelte';
import Partage from '../../components/v2/PartageMessageV2.svelte';
import Grille from '../../components/v2/PlaylistsGrilleCercleV2.svelte';
import { fetchJSON } from '../api';
import { preparerLocale } from '../i18n';
import { carteAPartager, messagerieSupport, demandeConversation } from '../circleMessagerie';
import { cercleLectureSeule } from '../circleDroits';
import fr from '../locales/fr';

vi.mock('../api', () => ({ BASE: '/api/v1', fetchJSON: vi.fn(), searchLibrary: vi.fn(), getPlaylists: vi.fn() }));
vi.mock('../circleNotifications', () => ({ relireNotifications: vi.fn(async () => {}) }));
const appel = vi.mocked(fetchJSON);
let hote: HTMLDivElement;
let vue: ReturnType<typeof mount> | null = null;
/** `POST …/read` lève ce refus (sinon il réussit). */
let refusLu: Error | null = null;

const direct = { id: 12, kind: 'direct', contact: { user_id: 7, name: 'Alice' }, unread_count: 2 };
const messages = [{ id: 5, sender_id: 7, sender_name: 'Alice', mine: false, body: 'Bonjour', card: null, created_at: '2026-11-19T10:00:00Z' }];
const PHRASE_ADMIN = (fr as Record<string, string>)['v2.circle.err.adminRequired'];
const finir = async () => { for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
const appels = (fin: string, methode = 'POST') => appel.mock.calls.filter((c) => String(c[0]).split('?')[0].endsWith(fin) && (c[1]?.method ?? 'GET') === methode);
const bandeau = () => hote.querySelector('.lecture-seule-cercle')?.textContent?.trim();

beforeAll(async () => preparerLocale('fr'));
beforeEach(() => {
  refusLu = null;
  cercleLectureSeule.set(null);
  demandeConversation.set(null); messagerieSupport.set(null); carteAPartager.set(null); appel.mockReset();
  hote = document.createElement('div'); document.body.append(hote);
  appel.mockImplementation(async (url: any, options: any) => {
    const u = String(url); const m = options?.method ?? 'GET';
    if (u.endsWith('/ext/circle')) return { members: [{ user_id: 7, name: 'Alice' }], sent: [], received: [] } as any;
    if (u.endsWith('/general-circles')) return { circles: [{ id: 8, name: 'Jazz modal', category: 'genre', member_count: 3, joined: false }] } as any;
    if (u.endsWith('/conversations')) return { conversations: [direct] } as any;
    if (u.includes('/conversations/12/messages?')) return { conversation: direct, messages, next_cursor: null } as any;
    if (u.endsWith('/conversations/12/read') && m === 'POST') { if (refusLu) throw refusLu; return { ok: true } as any; }
    return { unread_count: 0 } as any;
  });
});
afterEach(async () => {
  if (vue) await unmount(vue); vue = null;
  hote.remove(); vi.restoreAllMocks();
  cercleLectureSeule.set(null);
});

async function ouvrirAlice() {
  vue = mount(Messagerie, { target: hote });
  await finir();
  const b = [...hote.querySelectorAll('button.conversation')].find((x) => x.textContent?.includes('Alice')) as HTMLButtonElement;
  expect(b).toBeTruthy();
  b.click();
  await finir();
}

it('messagerie en lecture seule : la conversation s’affiche, rien n’est marqué lu, on n’écrit pas', async () => {
  cercleLectureSeule.set('admin');
  await ouvrirAlice();
  expect(hote.textContent).toContain('Bonjour');
  expect(appels('/conversations/12/read')).toHaveLength(0);
  expect(hote.querySelector('form.composeur')).toBeNull();
  expect(bandeau()).toBe(PHRASE_ADMIN);
});

it('un refus du marquage « lu » ne casse pas l’ouverture de la conversation', async () => {
  refusLu = Object.assign(new Error('refus'), { status: 403, code: 'circle.admin_required' });
  const rejet = vi.fn();
  process.on('unhandledRejection', rejet);
  try {
    await ouvrirAlice();
    expect(appels('/conversations/12/read')).toHaveLength(1);
    expect(hote.textContent).toContain('Bonjour');
    await finir();
    expect(rejet).not.toHaveBeenCalled();
    // Aucun message d'erreur : le refus du marquage est rattrapé, pas affiché.
    expect(hote.querySelector('[role="alert"]')?.textContent ?? '').toBe('');
    expect(hote.textContent).not.toContain(PHRASE_ADMIN);
  } finally {
    process.off('unhandledRejection', rejet);
  }
});

it('cercles généraux : rejoindre est désactivé en lecture seule', async () => {
  cercleLectureSeule.set('distant');
  vue = mount(Generaux, { target: hote });
  await finir();
  const rejoindre = hote.querySelector('button[aria-pressed]') as HTMLButtonElement | null;
  expect(rejoindre).toBeTruthy();
  expect(rejoindre!.disabled).toBe(true);
});

it('boîte de partage : la phrase, et l’envoi désactivé', async () => {
  cercleLectureSeule.set('admin');
  const carte = { type: 'album', title: 'Kind of Blue', artist_name: 'Miles Davis' } as any;
  vue = mount(Partage, { target: hote, props: { carte } });
  await finir();
  expect(bandeau()).toBe(PHRASE_ADMIN);
  const envoi = hote.querySelector('button[type="submit"]') as HTMLButtonElement | null;
  expect(envoi?.disabled).toBe(true);
});

it('grille des playlists : créer et partager désactivés en lecture seule, offerts sinon', async () => {
  const props = {
    playlists: [], occupe: false, cercles: [{ id: 1, name: 'Amis', member_ids: [] }] as any,
    invitePar: [{ circle_id: 3, owner_id: 7, owner_name: 'Alice', circle_name: 'Jazz' }] as any,
    onOuvrir: () => {}, onLire: () => {}, onCreer: () => {}, onPartager: () => {},
  };
  vue = mount(Grille, { target: hote, props });
  await finir();
  const creer = () => hote.querySelector('button.creer-une-playlist') as HTMLButtonElement | null;
  const partager = () => hote.querySelector('button.partager-une-playlist') as HTMLButtonElement | null;
  expect(creer()?.disabled).toBe(false);
  expect(partager()?.disabled).toBe(false);
  cercleLectureSeule.set('admin');
  await finir();
  expect(creer()?.disabled).toBe(true);
  expect(partager()?.disabled).toBe(true);
});
