/**
 * DÉMO — bouchon `fetch` pour monter le VRAI `CircleV2` de main sans serveur
 * (capture « avant »). Rend `donnees.ts` sous la forme des routes du greffon
 * `circle`. Toute autre route : 404 (le client la traite déjà comme « absente »).
 * Les écritures (POST/PUT/DELETE) ne vont nulle part : 204.
 */
import { MOI, MEMBRES, CERCLES, PLAYLISTS, CONVERSATIONS, NOTIFS, nomDe, type ConversationDemo, type MessageDemo } from './donnees';

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

const lieu = (m: { ville: string; pays: string; lat: number; lon: number }) =>
  ({ label: m.ville, country_code: m.pays, lat: m.lat, lon: m.lon });

function message(m: MessageDemo) {
  return {
    id: m.id, sender_id: m.de, mine: m.de === MOI.id, sender_name: nomDe(m.de), created_at: m.le,
    body: m.texte ?? null,
    card: m.carte ? { type: m.carte.type, title: m.carte.titre, artist_name: m.carte.artiste } : null,
  };
}

function conversation(c: ConversationDemo) {
  const dernier = c.messages[c.messages.length - 1];
  if (c.genre === 'direct') {
    return { id: c.id, kind: 'direct', contact: { user_id: c.avec, name: nomDe(c.avec) }, unread_count: c.nonLus, last_message: message(dernier) };
  }
  return {
    id: c.id, kind: 'circle', contact: null, can_write: true, unread_count: c.nonLus, last_message: message(dernier),
    circle: { id: c.avec, name: nomDe(c.avec), owner_id: MOI.id, owner_name: MOI.nom, mine: true, write: 'all' },
  };
}

const ROUTES: [RegExp, () => unknown][] = [
  [/\/api\/v1\/plugins$/, () => [{ name: 'circle', installed: true, enabled: true }]],
  [/\/api\/v1\/auth\/me$/, () => ({ id: 1, role: 'admin' })],
  [/\/api\/v1\/cloud\/sso\/status$/, () => ({ connected: true, user: { display_name: MOI.nom } })],
  [/\/ext\/circle$/, () => ({
    connected: true,
    members: MEMBRES.map((m) => ({ user_id: m.id, name: m.nom, since: '2026-10-01T10:00:00Z' })),
    sent: [], received: [],
    circles: CERCLES.map((c) => ({ id: c.id, name: c.nom, member_ids: c.membres, members_see_each_other: true })),
  })],
  [/\/ext\/circle\/me\/location$/, () => lieu(MOI)],
  [/\/ext\/circle\/contacts\/locations$/, () => MEMBRES.map((m) => ({ contact_id: m.id, ...lieu(m) }))],
  [/\/ext\/circle\/world\/points$/, () => []],
  [/\/ext\/circle\/me\/public-map-opt-out$/, () => ({ opted_out: false })],
  [/\/ext\/circle\/playlists$/, () => PLAYLISTS.map((p) => ({
    id: p.id, name: p.nom, owner: { user_id: p.proprietaire, name: nomDe(p.proprietaire) }, count: p.morceaux,
    version: 1, updated_at: p.maj, mine: p.mine, circle_id: p.mine ? p.cercle : null, circle_name: nomDe(p.cercle),
  }))],
  [/\/ext\/circle\/recoverable-playlists$/, () => []],
  [/\/ext\/circle\/notifications$/, () => ({
    unread_count: 0,
    notifications: NOTIFS.map((n) => ({
      id: n.id, kind: n.genre, read: true, at: n.le, actor: { user_id: n.acteur, name: nomDe(n.acteur) },
      circle_name: n.cercle ?? null, playlist: n.playlist ? { id: n.playlist, name: PLAYLISTS.find((p) => p.id === n.playlist)?.nom } : null,
      conversation_id: null, invitation_id: null, count: 1,
    })),
  })],
  [/\/ext\/circle\/conversations$/, () => ({ conversations: CONVERSATIONS.map(conversation) })],
  [/\/ext\/circle\/conversations\/(\d+)\/messages/, () => null],
  [/\/ext\/circle\/general-circles$/, () => ({ circles: [] })],
];

export function installerBouchon(): void {
  const vrai = window.fetch.bind(window);
  window.fetch = async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
    if (!url.includes('/api/')) return vrai(entree, init);
    const chemin = url.split('?')[0];
    const methode = (init?.method ?? 'GET').toUpperCase();
    // Le fil d'une conversation : rendu à part (l'identifiant est dans le chemin).
    const fil = chemin.match(/\/ext\/circle\/conversations\/(\d+)\/messages$/);
    if (fil && methode === 'GET') {
      const c = CONVERSATIONS.find((x) => x.id === Number(fil[1]));
      if (!c) return json({ error: 'not found' }, 404);
      return json({ conversation: conversation(c), messages: c.messages.map(message), next_cursor: null });
    }
    if (methode !== 'GET') return new Response(null, { status: 204 });
    for (const [motif, corps] of ROUTES) if (motif.test(chemin)) return json(corps());
    console.info('[démo] route non bouchonnée :', chemin);
    return json({ error: 'not found' }, 404);
  };
}
