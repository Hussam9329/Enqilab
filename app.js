'use strict';

const ROLE_DEFS = {
  Duke: {
    ar: 'الدوق', icon: '👑', claim: 'الدوق',
    image: 'assets/cards/duke.webp',
    power: 'يأخذ 3 عملات من البنك.',
    blocks: ['foreignAid']
  },
  Assassin: {
    ar: 'السفاح', icon: '🗡️', claim: 'السفاح',
    image: 'assets/cards/assassin.webp',
    power: 'يدفع 3 عملات لاغتيال تأثير لدى لاعب آخر.',
    blocks: []
  },
  Captain: {
    ar: 'القبطان', icon: '⚓', claim: 'القبطان',
    image: 'assets/cards/captain.webp',
    power: 'يسرق عملتين من لاعب آخر.',
    blocks: ['steal']
  },
  Ambassador: {
    ar: 'السفير', icon: '🕊️', claim: 'السفير',
    image: 'assets/cards/ambassador.webp',
    power: 'يسحب بطاقتين ويحتفظ باثنتين.',
    blocks: ['steal']
  },
  Contessa: {
    ar: 'الكونتيسة', icon: '💎', claim: 'الكونتيسة',
    image: 'assets/cards/contessa.webp',
    power: 'تمنع الاغتيال.',
    blocks: ['assassinate']
  }
};

const ACTIONS = {
  income: { label: 'الدخل', claim: null, description: 'خذ عملة واحدة من البنك. لا يمكن تحديه أو منعه.', target: false, cost: 0 },
  foreignAid: { label: 'المساعدات الأجنبية', claim: null, description: 'خذ عملتين من البنك. يمكن لأي لاعب ادعاء الدوق لمنعها.', target: false, cost: 0 },
  tax: { label: 'الضرائب', claim: 'Duke', description: 'ادّعِ أنك الدوق وخذ 3 عملات.', target: false, cost: 0 },
  assassinate: { label: 'الاغتيال', claim: 'Assassin', description: 'ادّعِ أنك السفاح، ادفع 3 عملات، واجعل خصماً يخسر تأثيراً.', target: true, cost: 3 },
  steal: { label: 'السرقة', claim: 'Captain', description: 'ادّعِ أنك القبطان واسرق حتى عملتين من خصم.', target: true, cost: 0 },
  exchange: { label: 'التبادل', claim: 'Ambassador', description: 'ادّعِ أنك السفير واسحب بطاقتين ثم احتفظ ببطاقتين.', target: false, cost: 0 }
};

const PHASE_LABELS = {
  setup: 'التجهيز',
  chooseAction: 'اختيار الإجراء',
  awaitChallenge: 'انتظار التحدي',
  awaitBlock: 'انتظار المنع',
  awaitBlockChallenge: 'تحدي المنع',
  loseInfluence: 'فقدان تأثير',
  exchange: 'التبادل',
  gameOver: 'انتهت اللعبة'
};

const PRESET_NAMES = {
  royal: ['الأمير الغامض', 'سيدة الرماد', 'حارس العرش', 'تاجر الأسرار', 'ظل القصر', 'وريث الليل'],
  neutral: ['لاعب 1', 'لاعب 2', 'لاعب 3', 'لاعب 4', 'لاعب 5', 'لاعب 6']
};

const state = {
  players: [],
  deck: [],
  bank: 50,
  currentPlayer: 0,
  phase: 'setup',
  pending: null,
  log: []
};

const $ = (selector) => document.querySelector(selector);
const setupScreen = $('#setupScreen');
const gameScreen = $('#gameScreen');
const playerCount = $('#playerCount');
const namePreset = $('#namePreset');
const playerNames = $('#playerNames');
const playersGrid = $('#playersGrid');
const actionList = $('#actionList');
const eventLog = $('#eventLog');
const modal = $('#modal');
const modalContent = $('#modalContent');

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDeck() {
  return shuffle(Object.keys(ROLE_DEFS).flatMap((role) => [role, role, role]));
}

function livePlayers() {
  return state.players.filter((p) => p.alive);
}

function activePlayer() {
  return state.players[state.currentPlayer];
}

function hiddenCards(player) {
  return player.cards.filter((card) => !card.revealed);
}

function playerHasRole(player, role) {
  return player.cards.some((card) => !card.revealed && card.role === role);
}

function roleAlt(roleKey) {
  const role = ROLE_DEFS[roleKey];
  return `بطاقة ${role?.ar || roleKey}`;
}

function renderPickCardContent(roleKey, note = '') {
  const role = ROLE_DEFS[roleKey];
  return `
    <img class="pick-card-img" src="${role.image}" alt="${roleAlt(roleKey)}" loading="lazy" draggable="false" />
    <span class="pick-card-caption"><strong>${role.ar}</strong>${note ? `<small>${note}</small>` : ''}</span>
  `;
}

function nextAliveIndex(fromIndex) {
  if (livePlayers().length <= 1) return fromIndex;
  let idx = fromIndex;
  do {
    idx = (idx + 1) % state.players.length;
  } while (!state.players[idx].alive);
  return idx;
}

function addLog(text, type = 'info') {
  const time = new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
  state.log.unshift({ text, time, type });
}

function updateNameInputs() {
  const count = Number(playerCount.value);
  const preset = PRESET_NAMES[namePreset.value];
  playerNames.innerHTML = '';
  for (let i = 0; i < count; i += 1) {
    const label = document.createElement('label');
    label.className = 'field';
    label.innerHTML = `<span>اسم اللاعب ${i + 1}</span><input id="pname-${i}" maxlength="24" value="${preset[i]}" />`;
    playerNames.appendChild(label);
  }
}

function startGame() {
  const count = Number(playerCount.value);
  const names = Array.from({ length: count }, (_, i) => {
    const raw = $(`#pname-${i}`).value.trim();
    return raw || `لاعب ${i + 1}`;
  });

  const deck = buildDeck();
  const players = names.map((name, i) => ({
    id: i,
    name,
    coins: 2,
    alive: true,
    cards: [
      { role: deck.pop(), revealed: false },
      { role: deck.pop(), revealed: false }
    ]
  }));

  state.players = players;
  state.deck = deck;
  state.bank = 50 - count * 2;
  state.currentPlayer = Math.floor(Math.random() * count);
  state.phase = 'chooseAction';
  state.pending = null;
  state.log = [];
  addLog(`بدأ الانقلاب. ${activePlayer().name} يفتتح مجلس الظلال.`);
  setupScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  render();
}

function render() {
  $('#turnTitle').textContent = state.phase === 'gameOver' ? 'انتهى الصراع' : activePlayer()?.name || '—';
  $('#bankCoins').textContent = state.bank;
  $('#deckCount').textContent = state.deck.length;
  $('#phaseLabel').textContent = PHASE_LABELS[state.phase] || '—';
  $('#phaseHint').textContent = getPhaseHint();
  renderActions();
  renderPlayers();
  renderLog();
}

function getPhaseHint() {
  if (state.phase === 'chooseAction') return 'اختر إجراءً واحداً لتنفيذه.';
  if (state.phase === 'awaitChallenge') return 'يمكن لأي خصم تحدي ادعاء الشخصية.';
  if (state.phase === 'awaitBlock') return 'يمكن للهدف أو الخصوم المناسبين منع الإجراء.';
  if (state.phase === 'awaitBlockChallenge') return 'يمكن تحدي اللاعب الذي ادعى المنع.';
  if (state.phase === 'loseInfluence') return 'يجب اختيار بطاقة مخفية لكشفها وخسارتها.';
  if (state.phase === 'exchange') return 'اختر بطاقتين فقط للاحتفاظ بهما.';
  if (state.phase === 'gameOver') return 'تم إعلان الفائز.';
  return '—';
}

function renderActions() {
  actionList.innerHTML = '';
  Object.entries(ACTIONS).forEach(([key, action]) => {
    const btn = document.createElement('button');
    btn.className = 'action-card';
    const disabled = state.phase !== 'chooseAction' || !canUseAction(key);
    btn.disabled = disabled;
    btn.innerHTML = `<span class="cost">${action.cost ? `${action.cost} عملات` : 'مجاني'}</span><strong>${action.label}</strong><small>${action.description}</small>`;
    btn.addEventListener('click', () => chooseAction(key));
    actionList.appendChild(btn);
  });
}

function canUseAction(actionKey) {
  const player = activePlayer();
  if (!player || !player.alive) return false;
  if (actionKey === 'assassinate' && player.coins < 3) return false;
  if (ACTIONS[actionKey].target && validTargets(player.id, actionKey).length === 0) return false;
  return true;
}

function renderPlayers() {
  playersGrid.innerHTML = '';
  state.players.forEach((player, index) => {
    const card = document.createElement('article');
    card.className = `player-card glass-panel ${index === state.currentPlayer && state.phase !== 'gameOver' ? 'active' : ''} ${player.alive ? '' : 'out'}`;
    const revealed = player.cards.filter((c) => c.revealed).length;
    const lives = hiddenCards(player).length;
    card.innerHTML = `
      <div class="player-head">
        <h3>${escapeHtml(player.name)}</h3>
        <span class="badge ${player.alive ? 'alive' : 'dead'}">${player.alive ? 'داخل اللعبة' : 'خارج اللعبة'}</span>
      </div>
      <div class="badges">
        <span class="badge coin">🪙 ${player.coins} عملات</span>
        <span class="badge">تأثير مخفي: ${lives}</span>
        <span class="badge">مكشوف: ${revealed}</span>
      </div>
      <div class="card-row">
        ${player.cards.map((c) => renderInfluence(c)).join('')}
      </div>
      <div class="player-actions">
        ${player.alive ? `<button class="mini-btn" data-view="${index}">كشف خاص</button>` : ''}
      </div>
    `;
    playersGrid.appendChild(card);
  });

  playersGrid.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => showCards(Number(btn.dataset.view)));
  });
}

function renderInfluence(card) {
  if (!card.revealed) {
    return `<div class="influence-card hidden-card"><span>بطاقة مخفية</span></div>`;
  }
  const role = ROLE_DEFS[card.role];
  return `
    <div class="influence-card revealed card-art-mini">
      <img src="${role.image}" alt="${roleAlt(card.role)}" loading="lazy" draggable="false" />
      <strong>${role.ar}</strong>
    </div>
  `;
}

function renderLog() {
  eventLog.innerHTML = state.log.slice(0, 70).map((entry) => `
    <div class="log-entry"><div>${entry.text}</div><small>${entry.time}</small></div>
  `).join('');
}

function chooseAction(actionKey) {
  if (!canUseAction(actionKey)) return;
  const action = ACTIONS[actionKey];
  if (action.target) {
    chooseTarget(actionKey);
    return;
  }
  beginAction(actionKey, null);
}

function chooseTarget(actionKey) {
  const options = validTargets(activePlayer().id, actionKey);
  showModal(`
    <h2>اختر الهدف</h2>
    <p>الإجراء: <strong>${ACTIONS[actionKey].label}</strong></p>
    <div class="option-grid">
      ${options.map((p) => `<button class="btn btn-ghost" data-target="${p.id}" value="cancel">${escapeHtml(p.name)} — ${p.coins} عملات</button>`).join('')}
    </div>
  `);
  modalContent.querySelectorAll('[data-target]').forEach((btn) => {
    btn.addEventListener('click', () => beginAction(actionKey, Number(btn.dataset.target)));
  });
}

function validTargets(actorId, actionKey = null) {
  return state.players.filter((p) => p.alive && p.id !== actorId && !(p.coins === 0 && actionKey === 'steal'));
}

function beginAction(actionKey, targetId) {
  closeModal();
  const actor = activePlayer();
  const action = ACTIONS[actionKey];
  state.pending = {
    actionKey,
    actorId: actor.id,
    targetId,
    claimRole: action.claim,
    block: null,
    challengersResolved: []
  };
  addLog(`${actor.name} أعلن إجراء: ${action.label}${targetId !== null ? ` ضد ${state.players[targetId].name}` : ''}.`);

  if (action.cost > 0) {
    actor.coins -= action.cost;
    state.bank += action.cost;
    addLog(`${actor.name} دفع ${action.cost} عملات للبنك.`);
  }

  if (!action.claim) {
    if (actionKey === 'income') {
      resolveAction();
      return;
    }
    state.phase = 'awaitBlock';
    render();
    showBlockModal();
    return;
  }

  state.phase = 'awaitChallenge';
  render();
  showChallengeModal();
}

function showChallengeModal() {
  const pending = state.pending;
  const actor = state.players[pending.actorId];
  const role = ROLE_DEFS[pending.claimRole];
  const challengers = state.players.filter((p) => p.alive && p.id !== actor.id);
  showModal(`
    <h2>هل يتحدى أحد هذا الادعاء؟</h2>
    <p><strong>${actor.name}</strong> يدّعي أنه يملك <strong>${role.ar}</strong>.</p>
    <div class="option-grid">
      ${challengers.map((p) => `<button class="btn btn-danger" data-challenge="${p.id}" value="cancel">${escapeHtml(p.name)} يتحدى</button>`).join('')}
      <button class="btn btn-primary" id="noChallenge" value="cancel">لا يوجد تحدي</button>
    </div>
  `);
  modalContent.querySelectorAll('[data-challenge]').forEach((btn) => {
    btn.addEventListener('click', () => resolveClaimChallenge(Number(btn.dataset.challenge)));
  });
  $('#noChallenge').addEventListener('click', () => {
    closeModal();
    if (canBeBlocked(pending.actionKey)) {
      state.phase = 'awaitBlock';
      render();
      showBlockModal();
    } else {
      resolveAction();
    }
  });
}

function resolveClaimChallenge(challengerId) {
  closeModal();
  const pending = state.pending;
  const actor = state.players[pending.actorId];
  const challenger = state.players[challengerId];
  const role = pending.claimRole;
  const honest = playerHasRole(actor, role);

  if (honest) {
    addLog(`${challenger.name} تحدى ${actor.name}… وكان ${actor.name} صادقاً بامتلاك ${ROLE_DEFS[role].ar}.`);
    requestLoseInfluence(challenger.id, () => {
      if (canBeBlocked(pending.actionKey) && actor.alive) {
        state.phase = 'awaitBlock';
        render();
        showBlockModal();
      } else if (actor.alive) {
        resolveAction();
      } else {
        finishTurn();
      }
    }, `${challenger.name} خسر تحدياً خاطئاً.`);
  } else {
    addLog(`${challenger.name} تحدى ${actor.name}… وانكشفت الكذبة. لا يملك ${actor.name} ${ROLE_DEFS[role].ar}.`);
    requestLoseInfluence(actor.id, () => {
      addLog(`فشل إجراء ${ACTIONS[pending.actionKey].label} بسبب التحدي الناجح.`);
      finishTurn();
    }, `${actor.name} خسر تأثيراً بسبب ادعاء كاذب.`);
  }
}

function canBeBlocked(actionKey) {
  return ['foreignAid', 'steal', 'assassinate'].includes(actionKey);
}

function blockOptions() {
  const pending = state.pending;
  if (!pending) return [];
  if (pending.actionKey === 'foreignAid') {
    return state.players.filter((p) => p.alive && p.id !== pending.actorId)
      .map((p) => ({ player: p, role: 'Duke' }));
  }
  if (pending.actionKey === 'steal' && pending.targetId !== null) {
    const target = state.players[pending.targetId];
    return target.alive ? [{ player: target, role: 'Captain' }, { player: target, role: 'Ambassador' }] : [];
  }
  if (pending.actionKey === 'assassinate' && pending.targetId !== null) {
    const target = state.players[pending.targetId];
    return target.alive ? [{ player: target, role: 'Contessa' }] : [];
  }
  return [];
}

function showBlockModal() {
  const opts = blockOptions();
  if (opts.length === 0) {
    resolveAction();
    return;
  }
  const pending = state.pending;
  const action = ACTIONS[pending.actionKey];
  showModal(`
    <h2>هل يوجد منع؟</h2>
    <p>الإجراء <strong>${action.label}</strong> يمكن منعه الآن.</p>
    <div class="option-grid">
      ${opts.map((item, i) => `<button class="btn btn-ghost" data-block="${i}" value="cancel">${escapeHtml(item.player.name)} يمنع بـ ${ROLE_DEFS[item.role].ar}</button>`).join('')}
      <button class="btn btn-primary" id="noBlock" value="cancel">لا يوجد منع</button>
    </div>
  `);
  modalContent.querySelectorAll('[data-block]').forEach((btn) => {
    btn.addEventListener('click', () => declareBlock(opts[Number(btn.dataset.block)]));
  });
  $('#noBlock').addEventListener('click', () => resolveAction());
}

function declareBlock({ player, role }) {
  closeModal();
  state.pending.block = { playerId: player.id, role };
  addLog(`${player.name} أعلن المنع ببطاقة ${ROLE_DEFS[role].ar}.`);
  state.phase = 'awaitBlockChallenge';
  render();
  showBlockChallengeModal();
}

function showBlockChallengeModal() {
  const pending = state.pending;
  const blocker = state.players[pending.block.playerId];
  const actor = state.players[pending.actorId];
  showModal(`
    <h2>هل يتم تحدي المنع؟</h2>
    <p><strong>${blocker.name}</strong> يدّعي امتلاك <strong>${ROLE_DEFS[pending.block.role].ar}</strong> لمنع الإجراء.</p>
    <div class="option-grid">
      <button class="btn btn-danger" id="challengeBlock" value="cancel">${escapeHtml(actor.name)} يتحدى المنع</button>
      <button class="btn btn-primary" id="acceptBlock" value="cancel">قبول المنع</button>
    </div>
  `);
  $('#challengeBlock').addEventListener('click', () => resolveBlockChallenge());
  $('#acceptBlock').addEventListener('click', () => {
    closeModal();
    addLog(`تم قبول المنع. فشل إجراء ${ACTIONS[pending.actionKey].label}.`);
    finishTurn();
  });
}

function resolveBlockChallenge() {
  closeModal();
  const pending = state.pending;
  const blocker = state.players[pending.block.playerId];
  const actor = state.players[pending.actorId];
  const role = pending.block.role;
  const honest = playerHasRole(blocker, role);

  if (honest) {
    addLog(`${actor.name} تحدى منع ${blocker.name}… وكان المنع صادقاً بامتلاك ${ROLE_DEFS[role].ar}.`);
    requestLoseInfluence(actor.id, () => {
      addLog(`نجح المنع. فشل إجراء ${ACTIONS[pending.actionKey].label}.`);
      finishTurn();
    }, `${actor.name} خسر تأثيراً بسبب تحدي منع صحيح.`);
  } else {
    addLog(`${actor.name} تحدى منع ${blocker.name}… والمنع كان كاذباً.`);
    requestLoseInfluence(blocker.id, () => {
      addLog(`فشل المنع. يستمر إجراء ${ACTIONS[pending.actionKey].label}.`);
      resolveAction();
    }, `${blocker.name} خسر تأثيراً بسبب منع كاذب.`);
  }
}

function resolveAction() {
  closeModal();
  const pending = state.pending;
  if (!pending) return;
  const actor = state.players[pending.actorId];
  const target = pending.targetId !== null ? state.players[pending.targetId] : null;

  if (!actor.alive) {
    finishTurn();
    return;
  }

  switch (pending.actionKey) {
    case 'income':
      transferBankToPlayer(actor, 1);
      addLog(`${actor.name} أخذ دخلاً: عملة واحدة.`);
      finishTurn();
      break;
    case 'foreignAid':
      transferBankToPlayer(actor, 2);
      addLog(`${actor.name} حصل على مساعدات أجنبية: عملتان.`);
      finishTurn();
      break;
    case 'tax':
      transferBankToPlayer(actor, 3);
      addLog(`${actor.name} فرض الضرائب وأخذ 3 عملات.`);
      finishTurn();
      break;
    case 'steal':
      if (target && target.alive) {
        const amount = Math.min(2, target.coins);
        target.coins -= amount;
        actor.coins += amount;
        addLog(`${actor.name} سرق ${amount} عملات من ${target.name}.`);
      }
      finishTurn();
      break;
    case 'assassinate':
      if (target && target.alive) {
        addLog(`نجح الاغتيال ضد ${target.name}.`);
        requestLoseInfluence(target.id, () => finishTurn(), `${target.name} خسر تأثيراً بسبب اغتيال ناجح.`);
      } else {
        finishTurn();
      }
      break;
    case 'exchange':
      startExchange(actor.id);
      break;
    default:
      finishTurn();
  }
}

function transferBankToPlayer(player, amount) {
  const taken = Math.min(amount, state.bank);
  state.bank -= taken;
  player.coins += taken;
}

function requestLoseInfluence(playerId, after, reason) {
  const player = state.players[playerId];
  if (!player || !player.alive || hiddenCards(player).length === 0) {
    after?.();
    return;
  }
  state.phase = 'loseInfluence';
  render();
  const hiddenIndexes = player.cards.map((card, i) => ({ card, i })).filter((x) => !x.card.revealed);
  showModal(`
    <h2>${escapeHtml(player.name)} يجب أن يخسر تأثيراً</h2>
    <p>${escapeHtml(reason || 'اختر بطاقة مخفية لكشفها.')}</p>
    <div class="choose-cards">
      ${hiddenIndexes.map(({ card, i }) => `
        <button class="pick-card card-pick" data-lose="${i}" value="cancel">
          ${renderPickCardContent(card.role, 'اكشف هذه البطاقة وخسر تأثيراً')}
        </button>
      `).join('')}
    </div>
  `);
  modalContent.querySelectorAll('[data-lose]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cardIndex = Number(btn.dataset.lose);
      player.cards[cardIndex].revealed = true;
      addLog(`${player.name} كشف بطاقة ${ROLE_DEFS[player.cards[cardIndex].role].ar} وخسر تأثيراً.`);
      if (hiddenCards(player).length === 0) {
        player.alive = false;
        addLog(`${player.name} خرج من اللعبة.`);
      }
      closeModal();
      if (checkWinner()) return;
      after?.();
    });
  });
}

function startExchange(playerId) {
  const player = state.players[playerId];
  refillDeckIfNeeded();
  const drawn = [];
  for (let i = 0; i < 2 && state.deck.length > 0; i += 1) {
    drawn.push({ role: state.deck.pop(), revealed: false, fromDeck: true });
  }
  const currentHidden = player.cards.filter((c) => !c.revealed).map((c) => ({ role: c.role, revealed: false, fromDeck: false }));
  const revealed = player.cards.filter((c) => c.revealed);
  const choices = [...currentHidden, ...drawn];
  state.phase = 'exchange';
  render();
  showExchangeModal(player, choices, revealed);
}

function showExchangeModal(player, choices, revealedCards) {
  let selected = new Set();
  const maxKeep = hiddenCards(player).length;
  showModal(`
    <h2>تبادل السفير</h2>
    <p>${escapeHtml(player.name)} يختار ${maxKeep} بطاقة للاحتفاظ بها. الباقي يعود إلى كومة الاحتياط.</p>
    <div class="choose-cards">
      ${choices.map((card, i) => `
        <button class="pick-card card-pick" data-pick="${i}" type="button">
          ${renderPickCardContent(card.role, card.fromDeck ? 'من كومة الاحتياط' : 'من بطاقاتك الحالية')}
        </button>
      `).join('')}
    </div>
    <button class="btn btn-primary" id="confirmExchange" disabled value="cancel">تأكيد التبادل</button>
  `);
  modalContent.querySelectorAll('[data-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.pick);
      if (selected.has(idx)) {
        selected.delete(idx);
        btn.classList.remove('selected');
      } else if (selected.size < maxKeep) {
        selected.add(idx);
        btn.classList.add('selected');
      }
      $('#confirmExchange').disabled = selected.size !== maxKeep;
    });
  });
  $('#confirmExchange').addEventListener('click', () => {
    const keep = choices.filter((_, idx) => selected.has(idx)).map((c) => ({ role: c.role, revealed: false }));
    const back = choices.filter((_, idx) => !selected.has(idx)).map((c) => c.role);
    state.deck = shuffle([...state.deck, ...back]);
    player.cards = [...revealedCards, ...keep];
    addLog(`${player.name} أنهى التبادل واحتفظ ببطاقاته الجديدة.`);
    closeModal();
    finishTurn();
  });
}

function refillDeckIfNeeded() {
  if (state.deck.length >= 2) return;
  const revealedRoles = [];
  state.players.forEach((player) => {
    player.cards.forEach((card) => {
      if (card.revealed) revealedRoles.push(card.role);
    });
  });
  if (revealedRoles.length > 0) {
    state.deck = shuffle([...state.deck, ...revealedRoles]);
    addLog('تم خلط البطاقات المكشوفة لتغذية كومة الاحتياط عند الحاجة.');
  }
}

function finishTurn() {
  closeModal();
  if (checkWinner()) return;
  const previous = state.currentPlayer;
  state.currentPlayer = nextAliveIndex(previous);
  state.phase = 'chooseAction';
  state.pending = null;
  addLog(`انتقل الدور إلى ${activePlayer().name}.`);
  render();
}

function checkWinner() {
  const alive = livePlayers();
  if (alive.length === 1) {
    state.phase = 'gameOver';
    state.pending = null;
    render();
    showModal(`
      <div class="winner-screen">
        <div class="crown">👑</div>
        <h2>${escapeHtml(alive[0].name)} انتصر في الانقلاب</h2>
        <p>بقي آخر صاحب نفوذ في المجلس. العرش له… حتى الانقلاب القادم.</p>
        <button class="btn btn-primary" id="restartFromWin" value="cancel">بدء لعبة جديدة</button>
      </div>
    `);
    $('#restartFromWin').addEventListener('click', resetToSetup);
    return true;
  }
  return false;
}

function showCards(playerIndex) {
  const player = state.players[playerIndex];
  showModal(`
    <h2>بطاقات ${escapeHtml(player.name)}</h2>
    <p>استخدم هذه النافذة كعرض خاص، ثم أغلقها قبل تمرير الجهاز.</p>
    <div class="card-view-grid">
      ${player.cards.map((card) => {
        const role = ROLE_DEFS[card.role];
        return `
          <article class="full-role-card ${card.revealed ? 'is-revealed' : ''}">
            <img src="${role.image}" alt="${roleAlt(card.role)}" draggable="false" />
            <div class="full-role-status">${card.revealed ? 'مكشوفة وخارج التأثير' : 'بطاقة فعّالة ومخفية'}</div>
          </article>
        `;
      }).join('')}
    </div>
  `);
}

function showRules() {
  showModal(`
    <h2>ورقة القواعد السريعة</h2>
    <div class="rules-card-strip">
      ${Object.entries(ROLE_DEFS).map(([roleKey, role]) => `
        <div class="rules-card">
          <img src="${role.image}" alt="${roleAlt(roleKey)}" loading="lazy" draggable="false" />
          <strong>${role.ar}</strong>
        </div>
      `).join('')}
    </div>
    <ul class="rules-list">
      <li><strong>الدخل:</strong> خذ عملة واحدة، لا تحدي ولا منع.</li>
      <li><strong>المساعدات الأجنبية:</strong> خذ عملتين، يمكن منعها بادعاء الدوق.</li>
      <li><strong>الدوق:</strong> يأخذ 3 عملات أو يمنع المساعدات الأجنبية.</li>
      <li><strong>السفاح:</strong> يدفع 3 عملات لاغتيال بطاقة خصم.</li>
      <li><strong>القبطان:</strong> يسرق عملتين، ويمكنه منع السرقة.</li>
      <li><strong>السفير:</strong> يبدّل البطاقات، ويمكنه منع السرقة.</li>
      <li><strong>الكونتيسة:</strong> تمنع الاغتيال فقط.</li>
      <li>أي ادعاء شخصية يمكن تحديه. الخاسر في التحدي يكشف بطاقة ويخسر تأثيراً.</li>
    </ul>
  `);
}

function showModal(html, locked = isCriticalPhase()) {
  modalContent.innerHTML = html;
  modal.dataset.locked = locked ? 'true' : 'false';
  modal.classList.toggle('locked', locked);
  if (!modal.open) modal.showModal();
}

function closeModal() {
  modal.dataset.locked = 'false';
  modal.classList.remove('locked');
  if (modal.open) modal.close();
}

function isCriticalPhase() {
  return ['awaitChallenge', 'awaitBlock', 'awaitBlockChallenge', 'loseInfluence', 'exchange'].includes(state.phase);
}

function resetToSetup() {
  closeModal();
  setupScreen.classList.remove('hidden');
  gameScreen.classList.add('hidden');
  state.players = [];
  state.deck = [];
  state.bank = 50;
  state.currentPlayer = 0;
  state.phase = 'setup';
  state.pending = null;
  state.log = [];
  updateNameInputs();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

playerCount.addEventListener('change', updateNameInputs);
namePreset.addEventListener('change', updateNameInputs);
$('#startGame').addEventListener('click', startGame);
$('#newGame').addEventListener('click', resetToSetup);
$('#showMyCards').addEventListener('click', () => showCards(state.currentPlayer));
$('#openRules').addEventListener('click', showRules);

modal.addEventListener('click', (event) => {
  if (modal.dataset.locked === 'true') return;
  const rect = modal.querySelector('.modal-card').getBoundingClientRect();
  const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  if (outside) modal.close();
});

modal.addEventListener('cancel', (event) => {
  if (modal.dataset.locked === 'true') event.preventDefault();
});

updateNameInputs();
