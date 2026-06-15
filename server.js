#!/usr/bin/env node
/**
 * Enqilab — Online Rooms Server
 *
 * In-memory room-based multiplayer server for the Inquilab card game.
 * Uses polling (no WebSocket) for simplicity.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

/* ─── Role & Action Definitions (mirrors app.js) ─── */
const ROLE_DEFS = {
  Duke:      { ar: 'الدوق',    blocks: ['foreignAid'] },
  Assassin:  { ar: 'السفاح',   blocks: [] },
  Captain:   { ar: 'القبطان',  blocks: ['steal'] },
  Contessa:  { ar: 'الكونتيسة', blocks: ['assassinate'] },
  Ambassador:{ ar: 'السفير',   blocks: ['steal'] }
};

const ACTIONS = {
  income:     { label: 'الدخل',            claim: null,        target: false, cost: 0, unblockable: true, basic: true },
  foreignAid: { label: 'المساعدة الأجنبية', claim: null,        target: false, cost: 0, unblockable: false, basic: true },
  coup:       { label: 'الانقلاب',          claim: null,        target: true,  cost: 7, unblockable: true, basic: true, forceAt: 10 },
  tax:        { label: 'الضرائب',           claim: 'Duke',      target: false, cost: 0 },
  assassinate:{ label: 'الاغتيال',          claim: 'Assassin',  target: true,  cost: 3 },
  steal:      { label: 'السرقة',            claim: 'Captain',   target: true,  cost: 0 },
  exchange:   { label: 'التبادل',           claim: 'Ambassador', target: false, cost: 0 }
};

/* ─── Helpers ─── */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

function buildDeck() {
  return shuffle(Object.keys(ROLE_DEFS).flatMap(role => [role, role, role]));
}

function livePlayers(room) {
  return room.players.filter(p => p.alive);
}

function hiddenCards(player) {
  return player.cards.filter(c => !c.revealed);
}

function playerHasRole(player, role) {
  return player.cards.some(c => !c.revealed && c.role === role);
}

/* ─── Room Store ─── */
const rooms = new Map();

function sanitizeRoomForPlayer(room, playerId) {
  const players = room.players.map(p => {
    const safe = { ...p };
    // Hide other players' hidden cards
    if (p.id !== playerId) {
      safe.cards = p.cards.map(c => c.revealed ? c : { role: 'HIDDEN', revealed: false });
    }
    return safe;
  });
  return {
    code: room.code,
    hostId: room.hostId,
    playerId,
    isHost: room.hostId === playerId,
    phase: room.phase,
    players,
    currentPlayer: room.currentPlayer,
    pending: room.pending,
    log: room.log,
    winner: room.winner,
    version: room.version,
    blockOptions: room.blockOptions
  };
}

function sanitizeRoomForHost(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    players: room.players.map(p => ({
      ...p,
      cards: p.cards.map(c => c.revealed ? c : { role: 'HIDDEN', revealed: false })
    })),
    currentPlayer: room.currentPlayer,
    pending: room.pending ? { ...room.pending, responses: undefined } : null,
    log: room.log,
    winner: room.winner,
    version: room.version,
    blockOptions: room.blockOptions
  };
}

/* ─── Game Logic ─── */
function initRoomGame(room) {
  const deck = buildDeck();
  const playerCount = room.players.length;
  room.players.forEach((p, i) => {
    p.cards = [
      { role: deck[i * 2], revealed: false },
      { role: deck[i * 2 + 1], revealed: false }
    ];
    p.coins = 2;
    p.alive = true;
  });
  room.deck = deck.slice(playerCount * 2);
  room.bank = Infinity;
  room.currentPlayer = 0;
  room.phase = 'chooseAction';
  room.pending = null;
  room.log = ['بدأت اللعبة!'];
  room.winner = null;
  room.version = (room.version || 0) + 1;
}

function advanceTurn(room) {
  const alive = livePlayers(room);
  if (alive.length <= 1) {
    room.phase = 'gameOver';
    room.winner = alive[0]?.id || null;
    room.version++;
    return;
  }
  let idx = room.currentPlayer;
  do {
    idx = (idx + 1) % room.players.length;
  } while (!room.players[idx].alive);
  room.currentPlayer = idx;
  room.phase = 'chooseAction';
  room.pending = null;
  room.version++;
}

function resolveChallenge(room) {
  const pending = room.pending;
  const actor = room.players[pending.actorId];
  const challengeResponse = pending.responses.challengeResponse;

  if (challengeResponse === false) {
    // No one challenged — action proceeds
    const action = ACTIONS[pending.actionKey];
    if (action.claim) {
      room.log.push(`${actor.name} ادّعى ${ROLE_DEFS[action.claim].ar} ولم يتحداه أحد.`);
    }

    // Check if action is blockable
    if (!action.unblockable && (action.claim || pending.actionKey === 'foreignAid')) {
      // Check if any player can block
      const blockOptions = getBlockOptions(room, pending);
      if (blockOptions.length > 0) {
        room.phase = 'awaitBlock';
        room.blockOptions = blockOptions;
        room.pending.responses = {};
        room.version++;
        return;
      }
    }

    // Execute the action directly
    executeAction(room);
    return;
  }

  // Someone challenged
  const challengerId = pending.responses.challengerId;
  const challenger = room.players[challengerId];
  const action = ACTIONS[pending.actionKey];
  const claimedRole = action.claim;
  const actorHasRole = playerHasRole(actor, claimedRole);

  if (actorHasRole) {
    // Challenge failed — challenger loses a card
    room.log.push(`${challenger.name} تحدّى ${actor.name} وخسر التحدي!`);
    // Replace the revealed card with one from deck
    const revealedCard = actor.cards.find(c => !c.revealed && c.role === claimedRole);
    if (revealedCard) {
      revealedCard.revealed = true;
      room.deck.push(revealedCard.role);
      // Give replacement from deck
      if (room.deck.length > 0) {
        const newRole = room.deck.shift();
        actor.cards = actor.cards.map(c =>
          c === revealedCard ? { role: newRole, revealed: false } : c
        );
      }
    }
    // Challenger must lose influence
    room.phase = 'loseInfluence';
    room.pending = { ...pending, losingPlayerId: challengerId, reason: 'challengeFailed' };
    room.version++;
  } else {
    // Challenge succeeded — actor loses a card
    room.log.push(`${challenger.name} تحدّى ${actor.name} بنجاح! الادعاء كان كاذباً.`);
    if (action.cost) {
      actor.coins += action.cost;
      room.log.push(`أُعيدت تكلفة ${action.label} إلى ${actor.name}.`);
    }
    // Actor loses influence
    room.phase = 'loseInfluence';
    room.pending = { ...pending, losingPlayerId: pending.actorId, reason: 'challengeSucceeded' };
    room.version++;
  }
}

function getBlockOptions(room, pending) {
  const action = ACTIONS[pending.actionKey];
  const options = [];

  room.players.forEach(p => {
    if (!p.alive || p.id === pending.actorId) return;

    if (action.claim === 'Duke' || pending.actionKey === 'foreignAid') {
      // Duke blocks foreign aid
      if (playerHasRole(p, 'Duke') || true) { // Anyone can claim Duke to block
        options.push({ playerId: p.id, role: 'Duke', actionKey: 'foreignAid' });
      }
    }
    if (action.claim === 'Captain' || pending.actionKey === 'steal') {
      // Captain or Ambassador blocks steal
      if (true) { // Anyone can claim
        options.push({ playerId: p.id, role: 'Captain', actionKey: 'steal' });
        options.push({ playerId: p.id, role: 'Ambassador', actionKey: 'steal' });
      }
    }
    if (action.claim === 'Assassin' || pending.actionKey === 'assassinate') {
      // Contessa blocks assassinate
      if (true) {
        options.push({ playerId: p.id, role: 'Contessa', actionKey: 'assassinate' });
      }
    }
  });

  return options;
}

function resolveBlock(room) {
  const pending = room.pending;
  const blockResponse = pending.responses.blockResponse;

  if (!blockResponse) {
    // No one blocked — execute action
    executeAction(room);
    return;
  }

  // Someone blocked
  const blockerId = pending.responses.blockerId;
  const blockerRole = pending.responses.blockerRole;
  const blocker = room.players.find(p => p.id === blockerId);

  room.log.push(`${blocker.name} يمنع بادعاء ${ROLE_DEFS[blockerRole]?.ar || blockerRole}.`);
  room.phase = 'awaitBlockChallenge';
  room.pending.responses = {};
  room.version++;
}

function resolveBlockChallenge(room) {
  const pending = room.pending;
  const challengeResponse = pending.responses.challengeResponse;

  if (challengeResponse === false) {
    // No one challenged the block — block succeeds, action fails
    const blockerId = pending.responses.blockerId;
    const blocker = room.players.find(p => p.id === blockerId);
    room.log.push(`نجح المنع. فشل إجراء ${ACTIONS[pending.actionKey].label}.`);
    advanceTurn(room);
    return;
  }

  // Someone challenged the block
  const challengerId = pending.responses.challengerId;
  const challenger = room.players.find(p => p.id === challengerId);
  const blockerId = pending.responses.blockerId;
  const blocker = room.players.find(p => p.id === blockerId);
  const blockerRole = pending.responses.blockerRole;
  const blockerHasRole = playerHasRole(blocker, blockerRole);

  if (blockerHasRole) {
    // Challenge failed — challenger loses influence
    room.log.push(`${challenger.name} تحدّى منع ${blocker.name} وخسر!`);
    const revealedCard = blocker.cards.find(c => !c.revealed && c.role === blockerRole);
    if (revealedCard) {
      revealedCard.revealed = true;
      room.deck.push(revealedCard.role);
      if (room.deck.length > 0) {
        const newRole = room.deck.shift();
        blocker.cards = blocker.cards.map(c =>
          c === revealedCard ? { role: newRole, revealed: false } : c
        );
      }
    }
    room.phase = 'loseInfluence';
    room.pending = { ...pending, losingPlayerId: challengerId, reason: 'blockChallengeFailed' };
    room.version++;
  } else {
    // Challenge succeeded — blocker was lying, block fails
    room.log.push(`${challenger.name} تحدّى منع ${blocker.name} بنجاح! المنع كان كاذباً.`);
    // Blocker loses influence
    // Then the original action continues
    room.phase = 'loseInfluence';
    room.pending = { ...pending, losingPlayerId: blockerId, reason: 'blockChallengeSucceeded', continueAction: true };
    room.version++;
  }
}

function executeAction(room) {
  const pending = room.pending;
  const actor = room.players[pending.actorId];
  const action = ACTIONS[pending.actionKey];

  switch (pending.actionKey) {
    case 'income':
      actor.coins += 1;
      room.log.push(`${actor.name} أخذ عملة واحدة (الدخل).`);
      advanceTurn(room);
      break;

    case 'foreignAid':
      actor.coins += 2;
      room.log.push(`${actor.name} أخذ عملتين (المساعدة الأجنبية).`);
      advanceTurn(room);
      break;

    case 'coup': {
      const target = room.players[pending.targetId];
      actor.coins -= 7;
      room.log.push(`${actor.name} نفّذ الانقلاب على ${target.name}!`);
      if (hiddenCards(target).length <= 1) {
        const card = target.cards.find(c => !c.revealed);
        if (card) card.revealed = true;
        target.alive = hiddenCards(target).length > 0;
        if (!target.alive) room.log.push(`${target.name} خرج من اللعبة!`);
      } else {
        room.phase = 'loseInfluence';
        room.pending = { ...pending, losingPlayerId: pending.targetId, reason: 'coup' };
        room.version++;
        return;
      }
      advanceTurn(room);
      break;
    }

    case 'tax':
      actor.coins += 3;
      room.log.push(`${actor.name} أخذ 3 عملات (الضرائب).`);
      // Check for forced coup
      if (actor.coins >= 10) {
        room.phase = 'chooseAction';
        room.log.push(`${actor.name} يجب أن ينفّذ الانقلاب (10 عملات أو أكثر)!`);
        room.version++;
        return;
      }
      advanceTurn(room);
      break;

    case 'assassinate': {
      const target = room.players[pending.targetId];
      actor.coins -= 3;
      room.log.push(`${actor.name} اغتال تأثيراً لدى ${target.name}.`);
      if (hiddenCards(target).length <= 1) {
        const card = target.cards.find(c => !c.revealed);
        if (card) card.revealed = true;
        target.alive = hiddenCards(target).length > 0;
        if (!target.alive) room.log.push(`${target.name} خرج من اللعبة!`);
        advanceTurn(room);
      } else {
        room.phase = 'loseInfluence';
        room.pending = { ...pending, losingPlayerId: pending.targetId, reason: 'assassinate' };
        room.version++;
      }
      break;
    }

    case 'steal': {
      const target = room.players[pending.targetId];
      const stolen = Math.min(target.coins, 2);
      target.coins -= stolen;
      actor.coins += stolen;
      room.log.push(`${actor.name} سرق ${stolen} عملة من ${target.name}.`);
      if (actor.coins >= 10) {
        room.phase = 'chooseAction';
        room.version++;
        return;
      }
      advanceTurn(room);
      break;
    }

    case 'exchange': {
      const drawn = room.deck.splice(0, 2);
      room.pending.exchangeOptions = [...hiddenCards(actor).map(c => c.role), ...drawn];
      room.phase = 'exchange';
      room.version++;
      break;
    }

    default:
      advanceTurn(room);
  }
}

function applyLoseInfluence(room, cardIndex) {
  const pending = room.pending;
  const loser = room.players.find(p => p.id === pending.losingPlayerId);
  const hidden = hiddenCards(loser);

  if (hidden.length === 0) {
    loser.alive = false;
    room.log.push(`${loser.name} خرج من اللعبة!`);
  } else {
    const cardToReveal = hidden[cardIndex] || hidden[0];
    cardToReveal.revealed = true;
    room.deck.push(cardToReveal.role);
    loser.alive = hiddenCards(loser).length > 0;
    if (!loser.alive) {
      room.log.push(`${loser.name} خرج من اللعبة!`);
    } else {
      room.log.push(`${loser.name} خسر تأثيراً (${ROLE_DEFS[cardToReveal.role]?.ar || cardToReveal.role}).`);
    }
  }

  const continueAction = pending.continueAction;
  room.pending = null;

  if (continueAction) {
    // Block challenge succeeded, continue with original action
    executeAction({ ...room, pending: pending });
    return;
  }

  const alive = livePlayers(room);
  if (alive.length <= 1) {
    room.phase = 'gameOver';
    room.winner = alive[0]?.id || null;
  } else {
    advanceTurn(room);
  }
}

function applyExchange(room, keepIndexes) {
  const pending = room.pending;
  const actor = room.players[pending.actorId];
  const options = pending.exchangeOptions;
  const hiddenCount = hiddenCards(actor).length;

  // Return unkept cards to deck
  const kept = new Set(keepIndexes.slice(0, hiddenCount));
  const returned = options.filter((_, i) => !kept.has(i));
  room.deck.push(...returned);

  // Replace actor's hidden cards with kept ones
  const keptRoles = keepIndexes.slice(0, hiddenCount).map(i => options[i]);
  let roleIdx = 0;
  actor.cards = actor.cards.map(c => {
    if (c.revealed) return c;
    return { role: keptRoles[roleIdx++] || c.role, revealed: false };
  });

  room.log.push(`${actor.name} أتمّ التبادل.`);
  room.pending = null;

  if (actor.coins >= 10) {
    room.phase = 'chooseAction';
    room.version++;
    return;
  }

  advanceTurn(room);
}

/* ─── HTTP Server ─── */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2'
};

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(__dirname, urlPath);
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function handleApi(req, res, method, urlPath) {
  // POST /api/rooms — create room
  if (method === 'POST' && urlPath === '/api/rooms') {
    const body = await readBody(req);
    const code = generateCode();
    const hostId = generateId();
    const playerId = generateId();
    const hostName = (body.hostName || 'المضيف').trim();

    const room = {
      code,
      hostId,
      players: [{ id: playerId, name: hostName, coins: 0, cards: [], alive: true }],
      phase: 'waiting',
      currentPlayer: 0,
      pending: null,
      log: [],
      winner: null,
      version: 1,
      blockOptions: [],
      deck: [],
      bank: Infinity,
      createdAt: Date.now()
    };

    rooms.set(code, room);
    sendJson(res, 201, { code, hostId, playerId, room: sanitizeRoomForPlayer(room, playerId) });
    return;
  }

  // Match /api/rooms/:code/...
  const roomMatch = urlPath.match(/^\/api\/rooms\/([A-Z0-9]{6})(\/.*)?$/);
  if (!roomMatch) {
    sendJson(res, 404, { error: 'غير موجود' });
    return;
  }

  const code = roomMatch[1];
  const subPath = roomMatch[2] || '';
  const room = rooms.get(code);

  if (!room) {
    sendJson(res, 404, { error: 'الغرفة غير موجودة' });
    return;
  }

  // GET /api/rooms/:code — poll room state
  if (method === 'GET' && !subPath) {
    const qs = new URLSearchParams(req.url.split('?')[1] || '');
    const playerId = qs.get('playerId') || '';
    const hostId = qs.get('hostId') || '';

    if (hostId && room.hostId !== hostId) {
      sendJson(res, 403, { error: 'ليس المضيف' });
      return;
    }

    const sanitized = playerId
      ? sanitizeRoomForPlayer(room, playerId)
      : sanitizeRoomForHost(room);
    sendJson(res, 200, sanitized);
    return;
  }

  // POST /api/rooms/:code/join — join room
  if (method === 'POST' && subPath === '/join') {
    if (room.phase !== 'waiting') {
      sendJson(res, 400, { error: 'اللعبة بدأت بالفعل' });
      return;
    }
    if (room.players.length >= 6) {
      sendJson(res, 400, { error: 'الغرفة ممتلئة' });
      return;
    }
    const body = await readBody(req);
    const playerName = (body.playerName || 'لاعب').trim();
    const playerId = generateId();
    room.players.push({ id: playerId, name: playerName, coins: 0, cards: [], alive: true });
    room.version++;
    sendJson(res, 200, { code, playerId, room: sanitizeRoomForPlayer(room, playerId) });
    return;
  }

  // POST /api/rooms/:code/start — start game
  if (method === 'POST' && subPath === '/start') {
    const body = await readBody(req);
    if (body.hostId !== room.hostId) {
      sendJson(res, 403, { error: 'فقط المضيف يستطيع بدء اللعبة' });
      return;
    }
    if (room.players.length < 2) {
      sendJson(res, 400, { error: 'يحتاج لاعبين على الأقل' });
      return;
    }
    if (room.phase !== 'waiting') {
      sendJson(res, 400, { error: 'اللعبة بدأت بالفعل' });
      return;
    }
    initRoomGame(room);
    const sanitized = body.playerId
      ? sanitizeRoomForPlayer(room, body.playerId)
      : sanitizeRoomForHost(room);
    sendJson(res, 200, sanitized);
    return;
  }

  // POST /api/rooms/:code/action — choose action
  if (method === 'POST' && subPath === '/action') {
    const body = await readBody(req);
    const playerId = body.playerId;
    const player = room.players.find(p => p.id === playerId);

    if (!player) {
      sendJson(res, 403, { error: 'لاعب غير معروف' });
      return;
    }
    if (room.phase !== 'chooseAction') {
      sendJson(res, 400, { error: 'ليس وقت اختيار الإجراء' });
      return;
    }
    if (room.players[room.currentPlayer].id !== playerId) {
      sendJson(res, 403, { error: 'ليس دورك' });
      return;
    }

    const actionKey = body.actionKey;
    const action = ACTIONS[actionKey];
    if (!action) {
      sendJson(res, 400, { error: 'إجراء غير معروف' });
      return;
    }

    // Check forced coup
    if (player.coins >= 10 && actionKey !== 'coup') {
      sendJson(res, 400, { error: 'يجب تنفيذ الانقلاب عند 10 عملات أو أكثر!' });
      return;
    }

    // Check cost
    if (action.cost && player.coins < action.cost) {
      sendJson(res, 400, { error: `تحتاج ${action.cost} عملات على الأقل` });
      return;
    }

    // Check target validity
    if (action.target) {
      const targetId = body.targetId;
      const target = room.players.find(p => p.id === targetId);
      if (!target || !target.alive) {
        sendJson(res, 400, { error: 'هدف غير صالح' });
        return;
      }
      if (actionKey === 'steal' && target.coins <= 0) {
        sendJson(res, 400, { error: 'لا يمكنك السرقة من لاعب لا يملك عملات' });
        return;
      }
    }

    // Deduct cost
    if (action.cost) player.coins -= action.cost;

    // Set pending action
    const actorIdx = room.players.indexOf(player);
    room.pending = {
      actionKey,
      actorId: actorIdx,
      targetId: body.targetId || null,
      claimRole: action.claim,
      responses: {},
      exchangeOptions: null
    };

    // Unblockable actions execute immediately
    if (action.unblockable && !action.claim) {
      executeAction(room);
      const sanitized = sanitizeRoomForPlayer(room, playerId);
      sendJson(res, 200, sanitized);
      return;
    }

    // Actions with claims go to awaitChallenge
    if (action.claim) {
      room.phase = 'awaitChallenge';
      const eligibleCount = room.players.filter(p => p.alive && p.id !== playerId).length;
      room.pending.responses = { challengeNeeded: eligibleCount, challengeCount: 0 };
      room.log.push(`${player.name} اختار إجراء ${action.label}.`);
      room.version++;
    } else if (!action.unblockable) {
      // foreignAid goes to awaitBlock
      const blockOptions = getBlockOptions(room, room.pending);
      if (blockOptions.length > 0) {
        room.phase = 'awaitBlock';
        room.blockOptions = blockOptions;
        room.log.push(`${player.name} اختار إجراء ${action.label}.`);
        room.version++;
      } else {
        executeAction(room);
      }
    }

    const sanitized = sanitizeRoomForPlayer(room, playerId);
    sendJson(res, 200, sanitized);
    return;
  }

  // POST /api/rooms/:code/challenge — challenge response
  if (method === 'POST' && subPath === '/challenge') {
    const body = await readBody(req);
    const playerId = body.playerId;
    const player = room.players.find(p => p.id === playerId);
    const pending = room.pending;

    if (!player || !pending || room.phase !== 'awaitChallenge') {
      sendJson(res, 400, { error: 'لا يمكنك التحدي الآن' });
      return;
    }

    if (body.challenge === true) {
      // First challenger wins
      const actorIdx = pending.actorId;
      pending.responses.challengeResponse = true;
      pending.responses.challengerId = room.players.indexOf(player);
      room.log.push(`${player.name} يتحدّى الادعاء!`);
      resolveChallenge(room);
    } else {
      // Pass
      pending.responses.challengeCount = (pending.responses.challengeCount || 0) + 1;
      const eligibleCount = room.players.filter(p => p.alive && p.id !== room.players[pending.actorId].id).length;

      if (pending.responses.challengeCount >= eligibleCount) {
        // Everyone passed
        pending.responses.challengeResponse = false;
        resolveChallenge(room);
      }
    }

    const sanitized = sanitizeRoomForPlayer(room, playerId);
    sendJson(res, 200, sanitized);
    return;
  }

  // POST /api/rooms/:code/block — block response
  if (method === 'POST' && subPath === '/block') {
    const body = await readBody(req);
    const playerId = body.playerId;
    const player = room.players.find(p => p.id === playerId);
    const pending = room.pending;

    if (!player || !pending || room.phase !== 'awaitBlock') {
      sendJson(res, 400, { error: 'لا يمكنك المنع الآن' });
      return;
    }

    if (body.pass === true) {
      pending.responses.blockPassCount = (pending.responses.blockPassCount || 0) + 1;
      const eligibleCount = room.players.filter(p => p.alive && p.id !== room.players[pending.actorId].id).length;
      if (pending.responses.blockPassCount >= eligibleCount) {
        pending.responses.blockResponse = false;
        resolveBlock(room);
      }
    } else if (body.role) {
      // Block with claimed role
      pending.responses.blockResponse = true;
      pending.responses.blockerId = playerId;
      pending.responses.blockerRole = body.role;
      resolveBlock(room);
    }

    const sanitized = sanitizeRoomForPlayer(room, playerId);
    sendJson(res, 200, sanitized);
    return;
  }

  // POST /api/rooms/:code/block-challenge — challenge a block
  if (method === 'POST' && subPath === '/block-challenge') {
    const body = await readBody(req);
    const playerId = body.playerId;
    const player = room.players.find(p => p.id === playerId);
    const pending = room.pending;

    if (!player || !pending || room.phase !== 'awaitBlockChallenge') {
      sendJson(res, 400, { error: 'لا يمكنك تحدي المنع الآن' });
      return;
    }

    if (body.challenge === true) {
      pending.responses.challengeResponse = true;
      pending.responses.challengerId = playerId;
      resolveBlockChallenge(room);
    } else {
      pending.responses.blockChallengePassCount = (pending.responses.blockChallengePassCount || 0) + 1;
      const eligibleCount = room.players.filter(p => p.alive && p.id !== pending.responses.blockerId && p.id !== room.players[pending.actorId].id).length;
      if (pending.responses.blockChallengePassCount >= eligibleCount) {
        pending.responses.challengeResponse = false;
        resolveBlockChallenge(room);
      }
    }

    const sanitized = sanitizeRoomForPlayer(room, playerId);
    sendJson(res, 200, sanitized);
    return;
  }

  // POST /api/rooms/:code/lose — lose influence (choose card)
  if (method === 'POST' && subPath === '/lose') {
    const body = await readBody(req);
    const playerId = body.playerId;
    const player = room.players.find(p => p.id === playerId);

    if (!player || room.phase !== 'loseInfluence') {
      sendJson(res, 400, { error: 'لا يمكنك اختيار بطاقة الآن' });
      return;
    }

    if (room.pending.losingPlayerId !== playerId) {
      sendJson(res, 403, { error: 'ليس عليك فقدان تأثير' });
      return;
    }

    const cardIndex = body.cardIndex ?? 0;
    applyLoseInfluence(room, cardIndex);

    const sanitized = sanitizeRoomForPlayer(room, playerId);
    sendJson(res, 200, sanitized);
    return;
  }

  // POST /api/rooms/:code/exchange — ambassador exchange
  if (method === 'POST' && subPath === '/exchange') {
    const body = await readBody(req);
    const playerId = body.playerId;
    const player = room.players.find(p => p.id === playerId);

    if (!player || room.phase !== 'exchange') {
      sendJson(res, 400, { error: 'لا يمكنك التبادل الآن' });
      return;
    }

    const keepIndexes = body.keepIndexes || [];
    applyExchange(room, keepIndexes);

    const sanitized = sanitizeRoomForPlayer(room, playerId);
    sendJson(res, 200, sanitized);
    return;
  }

  // Unknown endpoint
  sendJson(res, 404, { error: 'نقطة نهاية غير معروفة' });
}

/* ─── Cleanup old rooms every 10 minutes ─── */
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  for (const [code, room] of rooms) {
    if (now - room.createdAt > maxAge) {
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000);

/* ─── Main Server ─── */
const server = http.createServer(async (req, res) => {
  const method = req.method;
  const urlPath = req.url.split('?')[0];

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API routes
  if (urlPath.startsWith('/api/')) {
    try {
      await handleApi(req, res, method, urlPath);
    } catch (err) {
      console.error('API Error:', err);
      sendJson(res, 500, { error: 'خطأ داخلي في السيرفر' });
    }
    return;
  }

  // Static files
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n  🎴 انقلاب — Online Rooms Server`);
  console.log(`  Running at http://localhost:${PORT}\n`);
});
