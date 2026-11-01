// @vitest-environment jsdom
// rc11 — écrire à tout un cercle (site-mozaiklabs#454, go de Bertrand du 01/11/2026).
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Messagerie from '../../components/v2/MessagerieCercleV2.svelte';
import { preparerLocale } from '../i18n';
import { fetchJSON } from '../api';
import { conversations, demandeConversation, ecrireAuCercle, envoyerAuCercle, messagerieSupport, nomConversation } from '../circleMessagerie';
import { motifCercle } from '../circle';
import fr from '../locales/fr';
import en from '../locales/en';
import de from '../locales/de';
import es from '../locales/es';
import it_ from '../locales/it';
import el from '../locales/el';
import hu from '../locales/hu';
import ja from '../locales/ja';
import ko from '../locales/ko';
import nb from '../locales/nb';
import pl from '../locales/pl';
import ro from '../locales/ro';
import sv from '../locales/sv';
import vi_ from '../locales/vi';
import zh from '../locales/zh';

vi.mock('../api', () => ({ BASE: '/api/v1', fetchJSON: vi.fn(), searchLibrary: vi.fn(), getPlaylists: vi.fn() }));
vi.mock('../circleNotifications', () => ({ relireNotifications: vi.fn(async () => {}) }));
const appel = vi.mocked(fetchJSON);
let hote: HTMLDivElement;
let vue: ReturnType<typeof mount> | null = null;

const cercle = (over: Record<string, unknown> = {}) => ({
  id: 30, kind: 'circle', contact: null, can_write: true, unread_count: 1,
  circle: { id: 5, name: 'Jazz', owner_id: 1, owner_name: 'Olga', mine: false, write: 'all' }, ...over,
});
const direct = { id: 12, kind: 'direct', contact: { user_id: 7, name: 'Alice' }, unread_count: 0 };
let conv: any = cercle();
const messages = [
  { id: 9, sender_id: 3, sender_name: null, mine: false, body: 'Message d’un ancien', card: null, created_at: '' },
  { id: 8, sender_id: 2, sender_name: 'Bob', mine: false, body: 'Salut le cercle', card: null, created_at: '' },
];
const finir = async () => { for (let n = 0; n < 5; n++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
const bouton = (s: string) => [...hote.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === s)!;
const appels = (fin: string, methode = 'POST') => appel.mock.calls.filter((c) => String(c[0]).split('?')[0].endsWith(fin) && (c[1]?.method ?? 'GET') === methode);

beforeAll(async () => { await preparerLocale('fr'); });
beforeEach(() => {
  conv = cercle(); demandeConversation.set(null); messagerieSupport.set(null); appel.mockReset();
  appel.mockImplementation(async (url: any, options: any) => {
    const u = String(url); const m = options?.method ?? 'GET';
    if (u.endsWith('/conversations')) return { conversations: [conv, direct] } as any;
    if (u.endsWith('/circles/5/conversation') && m === 'POST') return conv as any;
    if (u.includes('/conversations/30/messages?')) return { conversation: conv, messages, next_cursor: null } as any;
    if (u.includes('/conversations/12/messages?')) return { conversation: direct, messages: [], next_cursor: null } as any;
    if (u.endsWith('/messages') && m === 'POST') return { id: 10 } as any;
    if (u.endsWith('/messaging')) return { circle_id: 5, write: 'owner' } as any;
    return { unread_count: 0 } as any;
  });
  hote = document.createElement('div'); document.body.append(hote);
});
afterEach(async () => { if (vue) await unmount(vue); vue = null; hote.remove(); vi.restoreAllMocks(); });

async function ouvrirLeCercle() {
  vue = mount(Messagerie, { target: hote }); await finir();
  (hote.querySelector('.conversation') as HTMLButtonElement).click(); await finir();
}
function taper(texte: string) {
  const saisie = hote.querySelector('#message-texte') as HTMLTextAreaElement;
  saisie.value = texte; saisie.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
}

it('lit une conversation de cercle et rejette un cercle mal formé', async () => {
  const l = await conversations();
  expect(l.map(nomConversation)).toEqual(['# Jazz', 'Alice']);
  conv = cercle({ circle: { id: 'x', name: '' } });
  expect((await conversations()).map(nomConversation)).toEqual(['Alice']);
});

it('montre une entrée « # Nom du cercle » par cercle, avec son propriétaire, à côté des conversations privées', async () => {
  vue = mount(Messagerie, { target: hote }); await finir();
  const entrees = [...hote.querySelectorAll('.conversation strong')].map((e) => e.textContent);
  expect(entrees).toEqual(['# Jazz', 'Alice']);
  expect(hote.querySelector('.conversation .avatar')?.textContent).toBe('#');
  expect(hote.querySelector('.conversation')?.textContent).toContain('Cercle de Olga');
});

it('affiche le fil avec les auteurs, et « Ancien membre » pour qui est parti', async () => {
  await ouvrirLeCercle();
  const auteurs = [...hote.querySelectorAll('.auteur')].map((e) => e.textContent);
  expect(auteurs).toEqual(['Bob', 'Ancien membre']);
  expect(hote.querySelector('.entete-fil h3')?.textContent).toBe('# Jazz');
  expect(hote.textContent).toContain('publiés après leur arrivée');
});

it('envoie au cercle par sa route ; une conversation privée garde la sienne (contre-épreuve)', async () => {
  await ouvrirLeCercle();
  taper('Bonsoir tout le monde'); bouton('Envoyer').click(); await finir();
  expect(appels('/circles/5/conversation/messages')).toHaveLength(1);
  expect(JSON.parse(appels('/circles/5/conversation/messages')[0][1]?.body as string)).toEqual({ body: 'Bonsoir tout le monde' });
  expect(appels('/conversations/30/messages')).toHaveLength(0);

  (hote.querySelectorAll('.conversation')[1] as HTMLButtonElement).click(); await finir();
  taper('Coucou Alice'); bouton('Envoyer').click(); await finir();
  expect(appels('/conversations/12/messages')).toHaveLength(1);
  expect(appels('/circles/5/conversation/messages')).toHaveLength(1);
});

it('« seul le créateur » : pas de champ de saisie pour un membre ; le champ revient quand il peut écrire (contre-épreuve)', async () => {
  conv = cercle({ can_write: false, circle: { id: 5, name: 'Jazz', owner_id: 1, owner_name: 'Olga', mine: false, write: 'owner' } });
  await ouvrirLeCercle();
  expect(hote.querySelector('#message-texte')).toBeNull();
  expect(hote.querySelector('.lecture-seule')?.textContent).toBe('Seul le créateur du cercle peut y écrire.');
  await expect(Promise.resolve(motifCercle(Object.assign(new Error('x'), { status: 403, code: 'write_restricted' })).cle)).resolves.toBe('v2.circle.msg.ownerOnly');

  await unmount(vue!); vue = null; hote.replaceChildren();
  conv = cercle();
  await ouvrirLeCercle();
  expect(hote.querySelector('#message-texte')).not.toBeNull();
  expect(hote.querySelector('.lecture-seule')).toBeNull();
});

it('le propriétaire règle qui peut écrire ; un membre n\'a pas ce réglage (contre-épreuve)', async () => {
  await ouvrirLeCercle();
  expect(hote.querySelector('.reglage-ecriture select')).toBeNull();

  await unmount(vue!); vue = null; hote.replaceChildren();
  conv = cercle({ circle: { id: 5, name: 'Jazz', owner_id: 1, owner_name: 'Olga', mine: true, write: 'all' } });
  await ouvrirLeCercle();
  const choix = hote.querySelector('.reglage-ecriture select') as HTMLSelectElement;
  expect(choix.value).toBe('all');
  choix.value = 'owner'; choix.dispatchEvent(new Event('change', { bubbles: true })); await finir();
  expect(appels('/circles/5/messaging', 'PUT')).toHaveLength(1);
  expect(JSON.parse(appels('/circles/5/messaging', 'PUT')[0][1]?.body as string)).toEqual({ write: 'owner' });
});

it('« Écrire au cercle » depuis la fiche ouvre la conversation du cercle', async () => {
  vue = mount(Messagerie, { target: hote }); await finir();
  ecrireAuCercle(5); await finir();
  expect(appels('/circles/5/conversation')).toHaveLength(1);
  expect(hote.querySelector('.entete-fil h3')?.textContent).toBe('# Jazz');
  expect(hote.querySelector('#message-texte')).not.toBeNull();
});

it('refuse un message vide avant le réseau', async () => {
  await expect(envoyerAuCercle(5, '   ')).rejects.toThrow();
  expect(appel).not.toHaveBeenCalled();
});

it('traduit les neuf clés neuves dans les 15 langues, avec leurs jetons', () => {
  const langues: Record<string, Record<string, string>> = { fr, en, de, es, it: it_, el, hu, ja, ko, nb, pl, ro, sv, vi: vi_, zh } as any;
  const cles = ['writeToCircle', 'writeToCircleNamed', 'circleOf', 'formerMember', 'ownerOnly', 'writeSetting', 'writeAll', 'writeOwner', 'circlePrivacy'].map((k) => `v2.circle.msg.${k}`);
  expect(Object.keys(langues)).toHaveLength(15);
  for (const [code, l] of Object.entries(langues)) {
    for (const cle of cles) {
      expect(typeof l[cle], `${code} ${cle}`).toBe('string');
      expect(l[cle].trim(), `${code} ${cle}`).not.toBe('');
      if (code !== 'fr') expect(l[cle], `${code} ${cle} non traduite`).not.toBe(fr[cle as keyof typeof fr]);
    }
    expect(l['v2.circle.msg.writeToCircleNamed']).toContain('{circle}');
    expect(l['v2.circle.msg.circleOf']).toContain('{name}');
  }
});
