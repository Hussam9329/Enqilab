'use strict';

const ROLE_DEFS = {
  Duke: {
    ar: 'الدوق', icon: '👑', claim: 'الدوق',
    image: 'assets/cards/duke.webp',
    power: 'يأخذ 3 عملات من البنك ويمنع المساعدات الأجنبية.',
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
    power: 'يسرق عملتين من لاعب آخر ويمنع السرقة.',
    blocks: ['steal']
  },
  Ambassador: {
    ar: 'السفير', icon: '🕊️', claim: 'السفير',
    image: 'assets/cards/ambassador.webp',
    power: 'يسحب بطاقتين ويحتفظ بعدد تأثيراته المخفية، ويمنع السرقة.',
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
  income: {
    label: 'الدخل', icon: '🪙', claim: null,
    simple: 'آمن ومضمون',
    description: 'خذ عملة واحدة فوراً. لا تحدي ولا منع.',
    target: false, cost: 0, unblockable: true, basic: true
  },
  foreignAid: {
    label: 'المساعدة الأجنبية', icon: '🤝', claim: null,
    simple: 'عملتان مع مخاطرة منع',
    description: 'خذ عملتين من البنك. أي لاعب قد يمنعك بادعاء الدوق.',
    target: false, cost: 0, unblockable: false, basic: true
  },
  coup: {
    label: 'الانقلاب', icon: '💥', claim: null,
    simple: 'ضربة لا تُوقف',
    description: 'ادفع 7 عملات واجعل خصماً يخسر تأثيراً. إجباري عند 10 عملات.',
    target: true, cost: 7, unblockable: true, basic: true, forceAt: 10
  },
  tax: {
    label: 'الضرائب', icon: '👑', claim: 'Duke',
    simple: 'ادّعِ الدوق',
    description: 'قل إنك الدوق وخذ 3 عملات. يمكن تحديك.',
    target: false, cost: 0
  },
  assassinate: {
    label: 'الاغتيال', icon: '🗡️', claim: 'Assassin',
    simple: 'ادفع 3 واقتل تأثيراً',
    description: 'ادّعِ السفاح، ادفع 3 عملات، واختر هدفاً. الكونتيسة قد تمنع.',
    target: true, cost: 3
  },
  steal: {
    label: 'السرقة', icon: '⚓', claim: 'Captain',
    simple: 'خذ حتى عملتين',
    description: 'ادّعِ القبطان واسرق من لاعب لديه عملات. القبطان أو السفير يمنعان.',
    target: true, cost: 0
  },
  exchange: {
    label: 'التبادل', icon: '🕊️', claim: 'Ambassador',
    simple: 'رتّب بطاقاتك',
    description: 'ادّعِ السفير، اسحب بطاقتين، واحتفظ بالأفضل حسب تأثيراتك المخفية.',
    target: false, cost: 0
  }
};

const PHASE_LABELS = {
  setup: 'التجهيز',
  chooseAction: 'اختيار الإجراء',
  awaitChallenge: 'انتظار التحدي',
  awaitBlock: 'انتظار المنع',
  awaitBlockChallenge: 'تحدي المنع',
  loseInfluence: 'فقدان تأثير',
  exchange: 'التبادل',
  passDevice: 'تمرير الجهاز',
  gameOver: 'انتهت اللعبة'
};

const PRESET_NAMES = {
  royal: ['الأمير الغامض', 'سيدة الرماد', 'حارس العرش', 'تاجر الأسرار', 'ظل القصر', 'وريث الليل'],
  neutral: ['لاعب 1', 'لاعب 2', 'لاعب 3', 'لاعب 4', 'لاعب 5', 'لاعب 6']
};

const STORAGE_KEYS = {
  sound: 'inquilab.sound',
  visuals: 'inquilab.visuals'
};

const state = {
  players: [],
  deck: [],
  bank: Infinity,
  currentPlayer: 0,
  phase: 'setup',
  pending: null,
  log: [],
  ui: {
    lastDrama: {
      title: 'الهدوء قبل أول كذبة',
      text: 'كل قرار سيترك أثراً بصرياً واضحاً حتى يشعر اللاعبون بالضغط بدل انتظار دور رتيب.',
      tone: 'gold'
    },
    bannerTimer: null
  },
  settings: {
    sound: readBoolSetting(STORAGE_KEYS.sound, true),
    visuals: readBoolSetting(STORAGE_KEYS.visuals, true)
  },
  audio: {
    ctx: null,
    master: null,
    music: null,
    musicTimer: null
  }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const setupScreen = $('#setupScreen');
const gameScreen = $('#gameScreen');
const playerCount = $('#playerCount');
const namePreset = $('#namePreset');
const playerNames = $('#playerNames');
const playersGrid = $('#playersGrid');
const actionList = $('#actionList');
const eventLog = $('#eventLog');
const dramaKicker = $('#dramaKicker');
const dramaTitle = $('#dramaTitle');
const dramaText = $('#dramaText');
const dramaPercent = $('#dramaPercent');
const dramaMeter = $('#dramaMeter');
const dramaHint = $('#dramaHint');
const modal = $('#modal');
const modalContent = $('#modalContent');
const fxLayer = $('#fxLayer');
const turnOrder = $('#turnOrder');
const modalCloseButton = $('.modal-close');

function readBoolSetting(key, fallback) {
  try {
    const saved = window.localStorage?.getItem(key);
    if (saved === null || saved === undefined) return fallback;
    return saved === 'true';
  } catch (error) {
    return fallback;
  }
}

function saveSetting(key, value) {
  try {
    window.localStorage?.setItem(key, String(value));
  } catch (error) {
    // Some embedded/file contexts block localStorage; the UI still works without persistence.
  }
}

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

function setDrama(title, text = '', tone = 'gold') {
  state.ui.lastDrama = { title, text, tone };
  renderDramaPanel();
}

function getPlayerPressure(player) {
  if (!player || !player.alive) return 0;
  const coins = Math.min(10, player.coins) * 6;
  const wounds = (2 - hiddenCards(player).length) * 18;
  const coupReady = player.coins >= 7 ? 16 : 0;
  const forced = player.coins >= 10 ? 22 : 0;
  return Math.min(100, Math.max(8, coins + wounds + coupReady + forced));
}

function getPlayerRead(player) {
  if (!player?.alive) return 'صوته انطفأ من المجلس.';
  if (player.coins >= 10) return 'ضغط أحمر: لازم ينفذ انقلاباً.';
  if (player.coins >= 7) return 'يمتلك ثمن انقلاب… كل كرسي حوله مهدد.';
  if (hiddenCards(player).length === 1) return 'على آخر نفس؛ أي خسارة تعني الخروج.';
  if (player.coins <= 1) return 'فقير الآن، لكن الكذبة الرخيصة قد تغيّر الطاولة.';
  return 'ما زال يملك مساحة للكذب والمناورة.';
}

function getActionDrama(actionKey) {
  const action = ACTIONS[actionKey];
  if (!action) return { level: 15, label: 'هادئ' };
  if (actionKey === 'coup') return { level: 100, label: 'لا رجعة' };
  if (actionKey === 'assassinate') return { level: 88, label: 'مميت' };
  if (actionKey === 'steal') return { level: 67, label: 'استفزاز' };
  if (actionKey === 'tax') return { level: 58, label: 'كذبة ذهبية' };
  if (actionKey === 'exchange') return { level: 44, label: 'غموض' };
  if (actionKey === 'foreignAid') return { level: 35, label: 'قابل للمنع' };
  return { level: 18, label: 'آمن' };
}

function getTargetVibe(player, actionKey) {
  const influence = hiddenCards(player).length;
  const pressure = getPlayerPressure(player);
  const labels = [];
  if (player.coins >= 7) labels.push('خطر انقلاب');
  if (influence === 1) labels.push('هدف هش');
  if (actionKey === 'steal' && player.coins > 0) labels.push(`غنيمة ${Math.min(2, player.coins)}`);
  if (!labels.length) labels.push(pressure >= 50 ? 'ضغط متوسط' : 'هدف هادئ');
  return labels.join(' · ');
}

function getSuspenseSnapshot() {
  if (!state.players.length) {
    return {
      level: 0,
      title: state.ui.lastDrama.title,
      text: state.ui.lastDrama.text,
      hint: 'ابدأ اللعبة حتى تظهر قراءة الضغط.',
      tone: state.ui.lastDrama.tone
    };
  }

  const actor = activePlayer();
  const pressures = state.players.map(getPlayerPressure);
  const topPressure = Math.max(0, ...pressures);
  const pendingBoost = ['awaitChallenge', 'awaitBlock', 'awaitBlockChallenge', 'loseInfluence'].includes(state.phase) ? 24 : 0;
  const duelBoost = state.pending?.targetId !== null && state.pending?.targetId !== undefined ? 12 : 0;
  const level = Math.min(100, Math.round(topPressure * 0.72 + pendingBoost + duelBoost));

  let title = state.ui.lastDrama.title;
  let text = state.ui.lastDrama.text;
  let hint = actor ? getPlayerRead(actor) : 'المجلس ينتظر أول حركة.';
  let tone = state.ui.lastDrama.tone || 'gold';

  if (state.phase === 'chooseAction' && actor) {
    title = actor.coins >= 10 ? 'الانقلاب صار إجبارياً' : `القرار بيد ${actor.name}`;
    text = actor.coins >= 10
      ? 'كل شيء في الواجهة يضغط باتجاه الضربة الحتمية، بدون تغيير أي قانون.'
      : 'راقب العملات والتأثيرات: الواجهة الآن تفضح من يملك تهديداً ومن ينهار.';
    tone = actor.coins >= 7 ? 'red' : 'gold';
  } else if (state.phase === 'awaitChallenge') {
    title = 'لحظة الصمت الخطرة';
    text = 'ادعاء شخصية على الطاولة. السؤال الآن: تحدي أم ابتلاع الكذبة؟';
    hint = 'التحدي الصحيح يكسر الحركة، والخاطئ يحرق تأثيراً.';
    tone = 'violet';
  } else if (state.phase === 'awaitBlock') {
    title = 'نافذة المنع مفتوحة';
    text = 'الكل يعرف القانون، لكن لا أحد يعرف من يملك البطاقة فعلاً.';
    hint = 'المنع نفسه قد يكون كذبة أكبر من الهجوم.';
    tone = 'cyan';
  } else if (state.phase === 'awaitBlockChallenge') {
    title = 'من يتحدى الجدار؟';
    text = 'المنع أعلن نفسه. الآن المواجهة بين مصدّق ومشكّك.';
    hint = 'قبول المنع ينهي الحركة، تحديه قد يقلب الطاولة.';
    tone = 'violet';
  } else if (state.phase === 'loseInfluence') {
    title = 'بطاقة ستُحرق الآن';
    text = 'الخسارة صارت ملموسة: اللاعب يختار أي نفوذ يدفنه أمام المجلس.';
    hint = 'كل بطاقة مكشوفة تجعل اللاعب أسهل قراءة.';
    tone = 'red';
  } else if (state.phase === 'exchange') {
    title = 'الظل يبدّل وجهه';
    text = 'التبادل لا يغيّر القواعد، لكنه يعيد الغموض إلى يد اللاعب.';
    hint = 'بعد التبادل، لا تثق بذاكرتك القديمة عن بطاقاته.';
    tone = 'cyan';
  } else if (state.phase === 'passDevice') {
    title = 'الكرسي ينتقل بسرّية';
    text = 'لحظة تمرير الجهاز صارت جزءاً من المسرح بدل أن تكون توقفاً بارداً.';
    hint = 'لا تنظروا للشاشة قبل أن يأخذ اللاعب دوره.';
    tone = 'gold';
  } else if (state.phase === 'gameOver') {
    title = 'المجلس سقط';
    text = 'انتهى الصراع وبقي صاحب النفوذ الأخير.';
    hint = 'ابدأ جولة جديدة لتبدأ كذبة جديدة.';
    tone = 'gold';
  }

  return { level, title, text, hint, tone };
}

function renderDramaPanel() {
  if (!dramaTitle || !dramaText || !dramaMeter || !dramaPercent || !dramaHint) return;
  const snapshot = getSuspenseSnapshot();
  dramaTitle.textContent = snapshot.title;
  dramaText.textContent = snapshot.text;
  dramaPercent.textContent = `${snapshot.level}%`;
  dramaMeter.style.width = `${snapshot.level}%`;
  dramaHint.textContent = snapshot.hint;
  const tone = snapshot.tone || 'gold';
  dramaMeter.dataset.tone = tone;
  if (dramaKicker) dramaKicker.textContent = tone === 'red' ? 'إنذار المجلس' : tone === 'violet' ? 'منطقة الشك' : tone === 'cyan' ? 'نافذة المناورة' : 'نبض المجلس';
}

function showDramaBanner(title, subtitle = '', tone = 'gold') {
  setDrama(title, subtitle, tone);
  if (!state.settings.visuals || !fxLayer) return;
  const banner = document.createElement('div');
  banner.className = `drama-banner drama-${tone}`;
  banner.innerHTML = `<strong>${escapeHtml(title)}</strong>${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ''}`;
  fxLayer.appendChild(banner);
  window.clearTimeout(state.ui.bannerTimer);
  state.ui.bannerTimer = window.setTimeout(() => banner.remove(), 2400);
  banner.addEventListener('animationend', () => banner.remove(), { once: true });
}

function updateNameInputs() {
  const count = Number(playerCount.value);
  const preset = PRESET_NAMES[namePreset.value];
  playerNames.innerHTML = '';
  for (let i = 0; i < count; i += 1) {
    const label = document.createElement('label');
    label.className = 'field';
    label.innerHTML = `<span>اسم اللاعب ${i + 1}</span><input id="pname-${i}" maxlength="24" value="${preset[i]}" autocomplete="off" />`;
    playerNames.appendChild(label);
  }
}

function startGame() {
  ensureAudio();
  if (state.settings.sound) startMusic();
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
  state.bank = Infinity;
  state.currentPlayer = Math.floor(Math.random() * count);
  state.phase = 'chooseAction';
  state.pending = null;
  state.log = [];
  addLog(`بدأ الانقلاب ببطاقات Coup كاملة: 15 بطاقة، عملتان لكل لاعب، و${deck.length} بطاقة في كومة الاحتياط.`);
  addLog(`${activePlayer().name} يفتتح مجلس الظلال.`);
  setDrama('المجلس انعقد', `${activePlayer().name} يفتتح أول مناورة.`, 'gold');
  setupScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  playEffect('start');
  burstAtCenter('gold');
  showDramaBanner('المجلس انعقد', `${activePlayer().name} يبدأ أول دور.`, 'gold');
  render();
  showPassDeviceModal('ابدأ الدور الأول', true);
}

function render() {
  const actor = activePlayer();
  $('#turnTitle').textContent = state.phase === 'gameOver' ? 'انتهى الصراع' : actor?.name || '—';
  $('#bankCoins').textContent = Number.isFinite(state.bank) ? state.bank : '∞';
  $('#deckCount').textContent = state.deck.length;
  const liveCounter = $('#livePlayersCount');
  if (liveCounter) liveCounter.textContent = livePlayers().length;
  $('#phaseLabel').textContent = PHASE_LABELS[state.phase] || '—';
  $('#phaseHint').textContent = getPhaseHint();
  $('#soundToggle').textContent = state.settings.sound ? 'الصوت: تشغيل' : 'الصوت: إيقاف';
  $('#visualToggle').textContent = state.settings.visuals ? 'المؤثرات: تشغيل' : 'المؤثرات: إيقاف';
  document.body.classList.toggle('fx-off', !state.settings.visuals);
  document.body.dataset.phase = state.phase;
  renderDramaPanel();
  renderTurnOrder();
  renderActions();
  renderPlayers();
  renderLog();
}

function renderTurnOrder() {
  if (!turnOrder) return;
  if (!state.players.length) {
    turnOrder.innerHTML = '';
    return;
  }
  const nextIndex = state.phase === 'gameOver' ? -1 : nextAliveIndex(state.currentPlayer);
  turnOrder.innerHTML = state.players.map((player, index) => {
    const classes = ['turn-seat'];
    let stateLabel = 'ينتظر';
    if (!player.alive) {
      classes.push('out');
      stateLabel = 'خارج';
    } else if (state.phase !== 'gameOver' && index === state.currentPlayer) {
      classes.push('current');
      stateLabel = 'اللاعب الحالي';
    } else if (state.phase !== 'gameOver' && index === nextIndex && nextIndex !== state.currentPlayer) {
      classes.push('next');
      stateLabel = 'التالي';
    }

    return `
      <article class="${classes.join(' ')}">
        <strong>${escapeHtml(player.name)}</strong>
        <small>${stateLabel}</small>
      </article>
    `;
  }).join('');
}

function getPhaseHint() {
  const actor = activePlayer();
  if (state.phase === 'chooseAction' && actor?.coins >= 10) return 'تنبيه مهم: لديك 10 عملات أو أكثر، لذلك كل الأزرار تقفل ما عدا الانقلاب.';
  if (state.phase === 'chooseAction') return 'اختر حركة واحدة. الأزرار تشرح نفسها، ولا تحتاج حفظ القواعد.';
  if (state.phase === 'awaitChallenge') return 'الآن لحظة الشك: هل يصدقه الآخرون أم يتحدونه؟';
  if (state.phase === 'awaitBlock') return 'قبل تنفيذ الحركة، أعطِ فرصة للمنع إذا كان القانون يسمح.';
  if (state.phase === 'awaitBlockChallenge') return 'أي لاعب آخر يستطيع تحدي المنع، وإلا يُقبل المنع وينتهي الإجراء.';
  if (state.phase === 'loseInfluence') return 'اللاعب يختار بنفسه أي بطاقة مخفية يكشفها ويخسرها.';
  if (state.phase === 'exchange') return 'اختر البطاقات التي تريد الاحتفاظ بها، والباقي يعود لكومة الاحتياط.';
  if (state.phase === 'passDevice') return 'مرّر الجهاز إلى اللاعب التالي. بعدها يفتح بطاقاته الخاصة ثم يبدأ دوره.';
  if (state.phase === 'gameOver') return 'انتهى الصراع وتم إعلان الفائز.';
  return '—';
}

function renderActions() {
  actionList.innerHTML = '';
  Object.entries(ACTIONS).forEach(([key, action]) => {
    const btn = document.createElement('button');
    btn.className = `action-card action-${key}`;
    const disabledReason = getActionDisabledReason(key);
    btn.disabled = Boolean(disabledReason);
    const claim = action.claim ? `يتطلب ادعاء ${ROLE_DEFS[action.claim].ar}` : 'بدون شخصية';
    const blockText = action.unblockable ? 'لا يُمنع' : canBeBlocked(key) ? 'قد يُمنع' : 'قابل للتحدي';
    const mandatory = activePlayer()?.coins >= 10 && key === 'coup' ? '<em>إجباري الآن</em>' : '';
    const drama = getActionDrama(key);
    btn.style.setProperty('--risk', `${drama.level}%`);
    btn.innerHTML = `
      <span class="action-icon" aria-hidden="true">${action.icon || '✦'}</span>
      <span class="cost">${action.cost ? `${action.cost} عملات` : 'مجاني'}</span>
      <strong>${action.label}</strong>
      <small>${action.description}</small>
      <span class="action-meta">
        <span class="action-chip">${action.simple || claim}</span>
        <span class="action-chip">${claim}</span>
        <span class="action-chip">${blockText}</span>
        ${mandatory}
      </span>
      <span class="action-risk" aria-hidden="true"><b>توتر ${drama.label}</b><i></i></span>
      ${disabledReason ? `<span class="disabled-reason">${disabledReason}</span>` : ''}
    `;
    btn.addEventListener('click', () => chooseAction(key));
    actionList.appendChild(btn);
  });
}


function getActionDisabledReason(actionKey) {
  const player = activePlayer();
  const action = ACTIONS[actionKey];
  if (state.phase !== 'chooseAction') return 'انتظر حل المرحلة الحالية';
  if (!player || !player.alive) return 'اللاعب خارج اللعبة';
  if (player.coins >= 10 && actionKey !== 'coup') return 'الانقلاب إجباري عند 10 عملات';
  if (player.coins < action.cost) return `تحتاج ${action.cost} عملات`;
  if (action.target && validTargets(player.id, actionKey).length === 0) return 'لا يوجد هدف صالح';
  return '';
}

function canUseAction(actionKey) {
  return !getActionDisabledReason(actionKey);
}

function renderPlayers() {
  playersGrid.innerHTML = '';
  state.players.forEach((player, index) => {
    const card = document.createElement('article');
    const pending = state.pending;
    const playerClasses = ['player-card', 'glass-panel'];
    if (index === state.currentPlayer && state.phase !== 'gameOver') playerClasses.push('active');
    if (!player.alive) playerClasses.push('out');
    if (pending?.actorId === player.id) playerClasses.push('plotter');
    if (pending?.targetId === player.id) playerClasses.push('marked');
    if (pending?.block?.playerId === player.id) playerClasses.push('blocker');
    if (player.coins >= 7 && player.alive) playerClasses.push('wealthy');
    if (hiddenCards(player).length === 1 && player.alive) playerClasses.push('wounded');
    card.className = playerClasses.join(' ');
    card.dataset.playerId = String(player.id);
    const revealed = player.cards.filter((c) => c.revealed).length;
    const lives = hiddenCards(player).length;
    const danger = player.coins >= 10 ? '<span class="badge danger">انقلاب إجباري</span>' : player.coins >= 7 ? '<span class="badge warning">جاهز للانقلاب</span>' : '';
    const turnBadge = index === state.currentPlayer && state.phase !== 'gameOver' ? '<span class="badge warning">دوره الآن</span>' : '';
    const pressure = getPlayerPressure(player);
    card.style.setProperty('--pressure', `${pressure}%`);
    card.innerHTML = `
      <span class="seat-number">${index + 1}</span>
      <div class="player-head">
        <div>
          <h3>${escapeHtml(player.name)}</h3>
          <div class="player-subline">${player.alive ? 'لا يزال داخل المؤامرة' : 'أُقصي من المجلس'}</div>
        </div>
        <span class="badge ${player.alive ? 'alive' : 'dead'}">${player.alive ? 'حي' : 'خارج'}</span>
      </div>
      <div class="badges">
        ${turnBadge}
        <span class="badge coin">🪙 ${player.coins} عملات</span>
        <span class="badge">${lives} تأثير مخفي</span>
        <span class="badge">${revealed} مكشوف</span>
        ${danger}
      </div>
      <div class="player-pressure" aria-label="ضغط اللاعب"><span></span></div>
      <div class="player-read">${getPlayerRead(player)}</div>
      <div class="card-row">
        ${player.cards.map((c) => renderInfluence(c)).join('')}
      </div>
    `;
    playersGrid.appendChild(card);
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
  if (!state.log.length) {
    eventLog.innerHTML = '<div class="log-entry"><div>سيظهر هنا كل ما يحدث في المجلس خطوة بخطوة.</div><small>جاهز</small></div>';
    return;
  }
  eventLog.innerHTML = state.log.slice(0, 90).map((entry) => `
    <div class="log-entry log-${entry.type}"><div>${escapeHtml(entry.text)}</div><small>${entry.time}</small></div>
  `).join('');
}

function chooseAction(actionKey) {
  if (!canUseAction(actionKey)) {
    playEffect('deny');
    showDramaBanner('الطريق مغلق', getActionDisabledReason(actionKey), 'red');
    return;
  }
  playEffect('select');
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
    <h2>حدّد الضحية</h2>
    <p>الإجراء: <strong>${ACTIONS[actionKey].label}</strong>. الواجهة تعرض لك ضغط كل هدف فقط، القرار يبقى للاعب.</p>
    <div class="option-grid target-grid">
      ${options.map((p) => `
        <button class="btn btn-ghost target-option cinematic-target" data-target="${p.id}" value="cancel" style="--pressure:${getPlayerPressure(p)}%">
          <strong>${escapeHtml(p.name)}</strong>
          <small>${p.coins} عملات · ${hiddenCards(p).length} تأثير مخفي</small>
          <span>${getTargetVibe(p, actionKey)}</span>
          <i aria-hidden="true"></i>
        </button>`).join('')}
    </div>
  `);
  $$('[data-target]', modalContent).forEach((btn) => {
    btn.addEventListener('click', () => beginAction(actionKey, Number(btn.dataset.target)));
  });
}

function validTargets(actorId, actionKey = null) {
  return state.players.filter((p) => {
    if (!p.alive || p.id === actorId) return false;
    if (actionKey === 'steal' && p.coins === 0) return false;
    return true;
  });
}

function beginAction(actionKey, targetId) {
  closeModal();
  const actor = activePlayer();
  const action = ACTIONS[actionKey];
  if (actor.coins < action.cost) return;

  state.pending = {
    actionKey,
    actorId: actor.id,
    targetId,
    claimRole: action.claim,
    block: null
  };

  addLog(`${actor.name} أعلن إجراء: ${action.label}${targetId !== null ? ` ضد ${state.players[targetId].name}` : ''}.`, actionKey);
  showDramaBanner(action.label, targetId !== null ? `${actor.name} يضع ${state.players[targetId].name} تحت الضوء.` : `${actor.name} يختبر أعصاب المجلس.`, actionKey === 'coup' || actionKey === 'assassinate' ? 'red' : action.claim ? 'violet' : 'gold');

  if (action.cost > 0) {
    actor.coins -= action.cost;
    addLog(`${actor.name} دفع ${action.cost} عملات للبنك.`);
    playEffect(actionKey === 'coup' ? 'coup' : 'coin');
  }

  render();

  if (actionKey === 'coup') {
    resolveAction();
    return;
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
    <h2>لحظة الشك</h2>
    <p><strong>${escapeHtml(actor.name)}</strong> وضع بطاقة <strong>${role.ar}</strong> على الطاولة بالكلام فقط. أول تحدي يتم اختياره هو الذي يُحلّ.</p>
    <div class="claim-card">
      <img src="${role.image}" alt="${roleAlt(pending.claimRole)}" />
      <div><strong>${role.ar}</strong><small>${role.power}</small></div>
    </div>
    <div class="option-grid">
      ${challengers.map((p) => `<button class="btn btn-danger challenge-button" data-challenge="${p.id}" value="cancel"><strong>${escapeHtml(p.name)}</strong><small>يتحدى ويخاطر بتأثير</small></button>`).join('')}
      <button class="btn btn-primary" id="noChallenge" value="cancel">لا أحد يجرؤ على التحدي</button>
    </div>
  `);
  $$('[data-challenge]', modalContent).forEach((btn) => {
    btn.addEventListener('click', () => resolveClaimChallenge(Number(btn.dataset.challenge)));
  });
  $('#noChallenge').addEventListener('click', () => {
    closeModal();
    showDramaBanner('مرّت الكذبة… أو الحقيقة', 'لا يوجد تحدي على الادعاء.', 'gold');
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
  playEffect('challenge');

  if (honest) {
    addLog(`${challenger.name} تحدى ${actor.name}… وكان ${actor.name} صادقاً بامتلاك ${ROLE_DEFS[role].ar}.`, 'challenge');
    showDramaBanner('التحدي ارتدّ على صاحبه', `${actor.name} كان صادقاً — ${challenger.name} سيدفع الثمن.`, 'violet');
    showProofModal(actor, role, () => {
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
    });
  } else {
    addLog(`${challenger.name} تحدى ${actor.name}… وانكشفت الكذبة. لا يملك ${actor.name} ${ROLE_DEFS[role].ar}.`, 'challenge');
    showDramaBanner('انكشفت الكذبة', `${actor.name} لا يملك ${ROLE_DEFS[role].ar}.`, 'red');
    refundActionCost(pending);
    requestLoseInfluence(actor.id, () => {
      if (ACTIONS[pending.actionKey].cost) {
        addLog(`أُعيدت تكلفة ${ACTIONS[pending.actionKey].label} إلى ${actor.name} لأن التحدي ضد الادعاء كان ناجحاً.`, 'coin');
      }
      addLog(`فشل إجراء ${ACTIONS[pending.actionKey].label} بسبب التحدي الناجح.`);
      finishTurn();
    }, `${actor.name} خسر تأثيراً بسبب ادعاء كاذب.`);
  }
}

function replaceProvenInfluence(player, role) {
  const cardIndex = player.cards.findIndex((card) => !card.revealed && card.role === role);
  if (cardIndex === -1) return;

  state.deck.push(role);
  state.deck = shuffle(state.deck);

  const replacement = state.deck.pop();
  player.cards[cardIndex] = { role: replacement, revealed: false };
}

function refundActionCost(pending) {
  const action = ACTIONS[pending?.actionKey];
  if (!action?.cost) return;
  const actor = state.players[pending.actorId];
  if (actor?.alive) actor.coins += action.cost;
}

function showProofModal(player, role, after) {
  const roleDef = ROLE_DEFS[role];
  showModal(`
    <h2>لحظة كشف الحكم</h2>
    <p><strong>${escapeHtml(player.name)}</strong> سيكشف الدليل الآن. البطاقة تثبت الادعاء ثم تعود إلى كومة المحكمة ويأخذ اللاعب بطاقة بديلة عشوائية للحفاظ على الغموض.</p>
    <div class="proof-card proof-concealed" id="proofCard">
      <div class="proof-back">؟</div>
      <img src="${roleDef.image}" alt="${roleAlt(role)}" />
      <strong>${roleDef.ar}</strong>
    </div>
    <div class="option-grid proof-actions">
      <button class="btn btn-danger" id="revealProof" type="button" value="cancel">اكشف البطاقة</button>
      <button class="btn btn-primary" id="continueAfterProof" disabled value="cancel">متابعة الحكم</button>
    </div>
  `, true);
  $('#revealProof').addEventListener('click', () => {
    $('#proofCard')?.classList.remove('proof-concealed');
    $('#continueAfterProof').disabled = false;
    $('#revealProof').disabled = true;
    playEffect('challenge');
    burstAtCenter('violet');
  });
  $('#continueAfterProof').addEventListener('click', () => {
    replaceProvenInfluence(player, role);
    closeModal();
    after?.();
  });
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
    return target?.alive ? [{ player: target, role: 'Captain' }, { player: target, role: 'Ambassador' }] : [];
  }
  if (pending.actionKey === 'assassinate' && pending.targetId !== null) {
    const target = state.players[pending.targetId];
    return target?.alive ? [{ player: target, role: 'Contessa' }] : [];
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
    <h2>نافذة المنع</h2>
    <p>الإجراء <strong>${action.label}</strong> وصل للحافة. من يملك الجرأة ليقول: «أوقفه»؟ الدوق يمنع المساعدات فقط ولا يأخذ العملات لنفسه.</p>
    <div class="option-grid">
      ${opts.map((item, i) => `<button class="btn btn-ghost block-button" data-block="${i}" value="cancel"><strong>${escapeHtml(item.player.name)}</strong><small>يمنع بـ ${ROLE_DEFS[item.role].ar}</small></button>`).join('')}
      <button class="btn btn-primary" id="noBlock" value="cancel">لا أحد يمنع</button>
    </div>
  `);
  $$('[data-block]', modalContent).forEach((btn) => {
    btn.addEventListener('click', () => declareBlock(opts[Number(btn.dataset.block)]));
  });
  $('#noBlock').addEventListener('click', () => {
    showDramaBanner('لا يوجد حاجز', `إجراء ${action.label} سيستمر.`, 'gold');
    resolveAction();
  });
}

function declareBlock({ player, role }) {
  closeModal();
  state.pending.block = { playerId: player.id, role };
  addLog(`${player.name} أعلن المنع ببطاقة ${ROLE_DEFS[role].ar}.`, 'block');
  showDramaBanner('تم إعلان المنع', `${player.name} يقول إنه يملك ${ROLE_DEFS[role].ar}.`, 'cyan');
  playEffect('block');
  state.phase = 'awaitBlockChallenge';
  render();
  showBlockChallengeModal();
}

function showBlockChallengeModal() {
  const pending = state.pending;
  const blocker = state.players[pending.block.playerId];
  const role = ROLE_DEFS[pending.block.role];
  const challengers = state.players.filter((p) => p.alive && p.id !== blocker.id);
  showModal(`
    <h2>هل الجدار حقيقي؟</h2>
    <p><strong>${escapeHtml(blocker.name)}</strong> يدّعي امتلاك <strong>${role.ar}</strong> لمنع الإجراء. أي لاعب حي آخر يستطيع تحدي هذا المنع.</p>
    <div class="claim-card">
      <img src="${role.image}" alt="${roleAlt(pending.block.role)}" />
      <div><strong>${role.ar}</strong><small>${role.power}</small></div>
    </div>
    <div class="option-grid">
      ${challengers.map((p) => `<button class="btn btn-danger challenge-button" data-block-challenge="${p.id}" value="cancel"><strong>${escapeHtml(p.name)}</strong><small>يتحدى المنع</small></button>`).join('')}
      <button class="btn btn-primary" id="acceptBlock" value="cancel">قبول المنع — تنطفئ الحركة</button>
    </div>
  `);
  $$('[data-block-challenge]', modalContent).forEach((btn) => {
    btn.addEventListener('click', () => resolveBlockChallenge(Number(btn.dataset.blockChallenge)));
  });
  $('#acceptBlock').addEventListener('click', () => {
    closeModal();
    addLog(`تم قبول المنع. فشل إجراء ${ACTIONS[pending.actionKey].label}.`, 'block');
    showDramaBanner('المنع نجح بصمت', `انتهى إجراء ${ACTIONS[pending.actionKey].label}.`, 'cyan');
    finishTurn();
  });
}

function resolveBlockChallenge(challengerId) {
  closeModal();
  const pending = state.pending;
  const blocker = state.players[pending.block.playerId];
  const challenger = state.players[challengerId];
  const role = pending.block.role;
  const honest = playerHasRole(blocker, role);
  playEffect('challenge');

  if (honest) {
    addLog(`${challenger.name} تحدى منع ${blocker.name}… وكان المنع صادقاً بامتلاك ${ROLE_DEFS[role].ar}.`, 'challenge');
    showDramaBanner('الجدار كان حقيقياً', `${blocker.name} أثبت المنع، و${challenger.name} سيدفع.`, 'cyan');
    showProofModal(blocker, role, () => {
      requestLoseInfluence(challenger.id, () => {
        addLog(`نجح المنع. فشل إجراء ${ACTIONS[pending.actionKey].label}.`, 'block');
        finishTurn();
      }, `${challenger.name} خسر تأثيراً بسبب تحدي منع صحيح.`);
    });
  } else {
    addLog(`${challenger.name} تحدى منع ${blocker.name}… والمنع كان كاذباً.`, 'challenge');
    showDramaBanner('سقط المنع الكاذب', `${blocker.name} لا يملك ${ROLE_DEFS[role].ar}.`, 'red');
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
      addLog(`${actor.name} أخذ دخلاً: عملة واحدة.`, 'coin');
      showDramaBanner('دخل آمن', `${actor.name} يربح عملة بلا ضجيج.`, 'gold');
      playEffect('coin');
      finishTurn();
      break;
    case 'foreignAid':
      transferBankToPlayer(actor, 2);
      addLog(`${actor.name} حصل على مساعدات أجنبية: عملتان.`, 'coin');
      showDramaBanner('المساعدة وصلت', `${actor.name} أخذ عملتين بعد عبور المنع.`, 'gold');
      playEffect('coin');
      finishTurn();
      break;
    case 'tax':
      transferBankToPlayer(actor, 3);
      addLog(`${actor.name} فرض الضرائب وأخذ 3 عملات.`, 'coin');
      showDramaBanner('ذهب الدوق', `${actor.name} جمع 3 عملات ورفع تهديده.`, 'gold');
      playEffect('coin');
      burstAtPlayer(actor.id, 'gold');
      finishTurn();
      break;
    case 'coup':
      if (target && target.alive) {
        addLog(`${actor.name} نفّذ انقلاباً مباشراً ضد ${target.name}. لا يمكن تحديه أو منعه.`, 'coup');
        showDramaBanner('انقلاب لا يُرد', `${target.name} سيفقد تأثيراً الآن.`, 'red');
        playEffect('coup');
        shakeBoard();
        requestLoseInfluence(target.id, () => finishTurn(), `${target.name} خسر تأثيراً بسبب انقلاب ناجح.`);
      } else {
        finishTurn();
      }
      break;
    case 'steal':
      if (target && target.alive) {
        const amount = Math.min(2, target.coins);
        target.coins -= amount;
        actor.coins += amount;
        addLog(`${actor.name} سرق ${amount} عملات من ${target.name}.`, 'steal');
        showDramaBanner('سرقة ناجحة', `${actor.name} أخذ ${amount} عملات من ${target.name}.`, 'violet');
        playEffect('coin');
      }
      finishTurn();
      break;
    case 'assassinate':
      if (target && target.alive) {
        addLog(`نجح الاغتيال ضد ${target.name}.`, 'assassinate');
        showDramaBanner('الخنجر وصل', `${target.name} تحت حكم الاغتيال.`, 'red');
        playEffect('hit');
        shakeBoard();
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
  player.coins += amount;
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
  $$('[data-lose]', modalContent).forEach((btn) => {
    btn.addEventListener('click', () => {
      const cardIndex = Number(btn.dataset.lose);
      const lostRole = player.cards[cardIndex].role;
      player.cards[cardIndex].revealed = true;
      addLog(`${player.name} كشف بطاقة ${ROLE_DEFS[lostRole].ar} وخسر تأثيراً.`, 'loss');
      showDramaBanner('سقط تأثير', `${player.name} كشف ${ROLE_DEFS[lostRole].ar}.`, 'red');
      playEffect('loss');
      burstAtPlayer(player.id, 'red');
      if (hiddenCards(player).length === 0) {
        player.alive = false;
        player.coins = 0;
        addLog(`${player.name} خرج من اللعبة وأعاد عملاته إلى البنك.`, 'loss');
        showDramaBanner('إقصاء من المجلس', `${player.name} خرج من اللعبة.`, 'red');
      }
      closeModal();
      if (checkWinner()) return;
      after?.();
    });
  });
}

function startExchange(playerId) {
  const player = state.players[playerId];
  refillDeckIfNeeded(2);
  const drawn = [];
  for (let i = 0; i < 2 && state.deck.length > 0; i += 1) {
    drawn.push({ role: state.deck.pop(), revealed: false, fromDeck: true });
  }
  const currentHidden = player.cards.filter((c) => !c.revealed).map((c) => ({ role: c.role, revealed: false, fromDeck: false }));
  const revealed = player.cards.filter((c) => c.revealed);
  const choices = [...currentHidden, ...drawn];
  state.phase = 'exchange';
  addLog(`${player.name} سحب ${drawn.length} بطاقة للتبادل.`);
  showDramaBanner('أوراق جديدة في الظل', `${player.name} يسحب ${drawn.length} بطاقة للتبادل.`, 'cyan');
  playEffect('exchange');
  render();
  showExchangeModal(player, choices, revealed);
}

function showExchangeModal(player, choices, revealedCards) {
  let selected = new Set();
  const maxKeep = hiddenCards(player).length;
  showModal(`
    <h2>تبادل السفير</h2>
    <p>${escapeHtml(player.name)} يختار ${maxKeep} بطاقة للاحتفاظ بها. الباقي يعود إلى أسفل/داخل كومة الاحتياط مخلوطاً.</p>
    <div class="choose-cards">
      ${choices.map((card, i) => `
        <button class="pick-card card-pick" data-pick="${i}" type="button">
          ${renderPickCardContent(card.role, card.fromDeck ? 'من كومة الاحتياط' : 'من بطاقاتك الحالية')}
        </button>
      `).join('')}
    </div>
    <button class="btn btn-primary" id="confirmExchange" disabled value="cancel">تأكيد التبادل</button>
  `);
  $$('[data-pick]', modalContent).forEach((btn) => {
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
      playEffect('select');
    });
  });
  $('#confirmExchange').addEventListener('click', () => {
    const keep = choices.filter((_, idx) => selected.has(idx)).map((c) => ({ role: c.role, revealed: false }));
    const back = choices.filter((_, idx) => !selected.has(idx)).map((c) => c.role);
    state.deck = shuffle([...back, ...state.deck]);
    player.cards = [...revealedCards, ...keep];
    addLog(`${player.name} أنهى التبادل واحتفظ ببطاقاته الجديدة.`);
    showDramaBanner('الغموض عاد', `${player.name} أنهى التبادل.`, 'cyan');
    playEffect('exchange');
    closeModal();
    finishTurn();
  });
}

function refillDeckIfNeeded(minimum = 2) {
  if (state.deck.length >= minimum) return;
  state.deck = shuffle([...state.deck]);
}

function finishTurn() {
  closeModal();
  if (checkWinner()) return;
  const previous = state.currentPlayer;
  const previousName = state.players[previous]?.name || 'اللاعب السابق';
  state.currentPlayer = nextAliveIndex(previous);
  const nextName = activePlayer().name;
  state.phase = 'chooseAction';
  state.pending = null;
  addLog(`انتهى دور ${previousName}. الدور التالي على ${nextName}.`, 'turn');
  showDramaBanner('انتقال الكرسي', `${nextName} يستلم القرار.`, 'gold');
  playEffect('turn');
  render();
  showPassDeviceModal('انتهى الدور', false, previousName);
}

function checkWinner() {
  const alive = livePlayers();
  if (alive.length === 1) {
    state.phase = 'gameOver';
    state.pending = null;
    render();
    showDramaBanner('انتهى الانقلاب', `${alive[0].name} بقي آخر صاحب نفوذ.`, 'gold');
    playEffect('win');
    confetti();
    showModal(`
      <div class="winner-screen">
        <div class="crown">👑</div>
        <h2>${escapeHtml(alive[0].name)} انتصر في الانقلاب</h2>
        <p>بقي آخر صاحب نفوذ في المجلس. العرش له… حتى الانقلاب القادم.</p>
        <button class="btn btn-primary" id="restartFromWin" value="cancel">بدء لعبة جديدة</button>
      </div>
    `, true);
    $('#restartFromWin').addEventListener('click', resetToSetup);
    return true;
  }
  return false;
}

function showPassDeviceModal(title = 'مرّر الجهاز', firstTurn = false, previousPlayerName = null) {
  if (state.phase === 'gameOver') return;
  state.phase = 'passDevice';
  render();
  const player = activePlayer();
  showDramaBanner('مرّر الجهاز بسرّية', `${player.name} هو التالي.`, 'gold');
  const sequenceText = firstTurn
    ? `سيبدأ <strong>${escapeHtml(player.name)}</strong> الدور الأول.`
    : `انتهى دور <strong>${escapeHtml(previousPlayerName || 'اللاعب السابق')}</strong>. اللاعب التالي هو <strong>${escapeHtml(player.name)}</strong>.`;
  showModal(`
    <h2>${title}</h2>
    <p>${sequenceText} مرّر الجهاز الآن بدون أن ينظر بقية اللاعبين.</p>
    <div class="privacy-card">
      <span>🔒</span>
      <strong>${escapeHtml(player.name)}</strong>
      <small>${player.coins} عملات · ${hiddenCards(player).length} تأثير مخفي</small>
    </div>
    <div class="option-grid">
      <button class="btn btn-primary" id="beginPrivateTurn" value="cancel">${firstTurn ? 'عرض بطاقاتي وابدأ' : 'عرض بطاقاتي وابدأ دوري'}</button>
      <button class="btn btn-ghost" id="startWithoutView" value="cancel">بدء الدور مباشرة</button>
    </div>
  `, true);
  $('#beginPrivateTurn').addEventListener('click', () => {
    closeModal();
    state.phase = 'chooseAction';
    render();
    showCards(state.currentPlayer);
  });
  $('#startWithoutView').addEventListener('click', () => {
    closeModal();
    state.phase = 'chooseAction';
    render();
  });
}

function showCards(playerIndex) {
  const player = state.players[playerIndex];
  showModal(`
    <h2>بطاقات ${escapeHtml(player.name)}</h2>
    <p>هذه النافذة خاصة باللاعب الحالي فقط. راجع بطاقاتك ثم أغلقها لتختار إجراءً واحداً في دورك.</p>
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
  `, false);
}

function showRules() {
  showModal(`
    <h2>دليل انقلاب السريع</h2>
    <div class="rules-card-strip">
      ${Object.entries(ROLE_DEFS).map(([roleKey, role]) => `
        <div class="rules-card">
          <img src="${role.image}" alt="${roleAlt(roleKey)}" loading="lazy" draggable="false" />
          <strong>${role.ar}</strong>
        </div>
      `).join('')}
    </div>
    <div class="rules-sections">
      <section>
        <h3>إجراءات عامة</h3>
        <ul class="rules-list">
          <li><strong>الدخل:</strong> خذ عملة واحدة، لا تحدي ولا منع.</li>
          <li><strong>المساعدات الأجنبية:</strong> خذ عملتين، ويمكن منعها فقط بادعاء الدوق.</li>
          <li><strong>الانقلاب:</strong> ادفع 7 عملات ليستهدف لاعباً يخسر تأثيراً. لا تحدي ولا منع، ويصبح إجبارياً عند 10 عملات.</li>
        </ul>
      </section>
      <section>
        <h3>ادعاءات الشخصيات</h3>
        <ul class="rules-list">
          <li><strong>الدوق:</strong> يأخذ 3 عملات أو يمنع المساعدات الأجنبية.</li>
          <li><strong>السفاح:</strong> يدفع 3 عملات لاغتيال بطاقة خصم.</li>
          <li><strong>القبطان:</strong> يسرق حتى عملتين، ويمكنه منع السرقة.</li>
          <li><strong>السفير:</strong> يبدّل البطاقات، ويمكنه منع السرقة.</li>
          <li><strong>الكونتيسة:</strong> تمنع الاغتيال فقط.</li>
        </ul>
      </section>
      <section>
        <h3>التحدي والمنع</h3>
        <ul class="rules-list">
          <li>أي ادعاء شخصية يمكن تحديه. الخاسر في التحدي يكشف بطاقة ويخسر تأثيراً.</li>
          <li>إذا كان المدّعي صادقاً، يكشف البطاقة لإثبات الادعاء ثم يعيدها إلى الكومة ويأخذ بطاقة بديلة، بينما يخسر المتحدي تأثيراً.</li>
          <li>إذا فشل منع الكونتيسة ضد اغتيال بعد تحديه، يخسر الهدف تأثيراً بسبب كذب المنع ثم يستمر الاغتيال إن بقي لديه تأثير.</li>
          <li>آخر لاعب لديه بطاقة مخفية واحدة على الأقل هو الفائز.</li>
        </ul>
      </section>
    </div>
  `, false);
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
  return ['awaitChallenge', 'awaitBlock', 'awaitBlockChallenge', 'loseInfluence', 'exchange', 'passDevice'].includes(state.phase);
}

function resetToSetup() {
  closeModal();
  stopMusic();
  setupScreen.classList.remove('hidden');
  gameScreen.classList.add('hidden');
  state.players = [];
  state.deck = [];
  state.bank = Infinity;
  state.currentPlayer = 0;
  state.phase = 'setup';
  state.pending = null;
  state.log = [];
  state.ui.lastDrama = {
    title: 'الهدوء قبل أول كذبة',
    text: 'كل قرار سيترك أثراً بصرياً واضحاً حتى يشعر اللاعبون بالضغط بدل انتظار دور رتيب.',
    tone: 'gold'
  };
  renderDramaPanel();
  updateNameInputs();
  renderSettingsButtons();
}

function renderSettingsButtons() {
  $('#soundToggle').textContent = state.settings.sound ? 'الصوت: تشغيل' : 'الصوت: إيقاف';
  $('#visualToggle').textContent = state.settings.visuals ? 'المؤثرات: تشغيل' : 'المؤثرات: إيقاف';
}

function toggleSound() {
  ensureAudio();
  state.settings.sound = !state.settings.sound;
  saveSetting(STORAGE_KEYS.sound, state.settings.sound);
  if (state.settings.sound) {
    playEffect('select');
    if (state.players.length) startMusic();
  } else {
    stopMusic();
  }
  renderSettingsButtons();
}

function toggleVisuals() {
  state.settings.visuals = !state.settings.visuals;
  saveSetting(STORAGE_KEYS.visuals, state.settings.visuals);
  document.body.classList.toggle('fx-off', !state.settings.visuals);
  if (state.settings.visuals) burstAtCenter('gold');
  renderSettingsButtons();
}

function ensureAudio() {
  if (state.audio.ctx) return state.audio.ctx;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.18;
  master.connect(ctx.destination);
  state.audio.ctx = ctx;
  state.audio.master = master;
  return ctx;
}

function playEffect(kind) {
  if (!state.settings.sound) return;
  const ctx = ensureAudio();
  if (!ctx || !state.audio.master) return;
  if (ctx.state === 'suspended') ctx.resume();
  const now = ctx.currentTime;
  const patterns = {
    select: [[440, 0, 0.055], [660, 0.05, 0.065]],
    start: [[196, 0, 0.16], [392, 0.12, 0.20], [523, 0.28, 0.26]],
    coin: [[880, 0, 0.045], [1320, 0.05, 0.07]],
    challenge: [[180, 0, 0.12], [120, 0.11, 0.16]],
    block: [[330, 0, 0.09], [220, 0.09, 0.12]],
    hit: [[95, 0, 0.18], [70, 0.14, 0.22]],
    coup: [[90, 0, 0.22], [180, 0.06, 0.18], [60, 0.2, 0.28]],
    loss: [[150, 0, 0.12], [100, 0.12, 0.18]],
    exchange: [[520, 0, 0.08], [620, 0.08, 0.08], [740, 0.16, 0.1]],
    turn: [[294, 0, 0.055], [392, 0.06, 0.065]],
    win: [[392, 0, 0.13], [523, 0.12, 0.15], [659, 0.26, 0.2], [784, 0.42, 0.28]],
    deny: [[80, 0, 0.08]]
  };
  (patterns[kind] || patterns.select).forEach(([freq, offset, duration]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = kind === 'coin' || kind === 'exchange' || kind === 'win' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, now + offset);
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(kind === 'coup' ? 0.34 : 0.18, now + offset + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
    osc.connect(gain);
    gain.connect(state.audio.master);
    osc.start(now + offset);
    osc.stop(now + offset + duration + 0.025);
  });
}

function startMusic() {
  if (state.audio.music || !state.settings.sound) return;
  const ctx = ensureAudio();
  if (!ctx || !state.audio.master) return;
  if (ctx.state === 'suspended') ctx.resume();
  const musicGain = ctx.createGain();
  musicGain.gain.value = 0.035;
  musicGain.connect(state.audio.master);
  const drone = ctx.createOscillator();
  const fifth = ctx.createOscillator();
  drone.type = 'sine';
  fifth.type = 'sine';
  drone.frequency.value = 110;
  fifth.frequency.value = 165;
  drone.connect(musicGain);
  fifth.connect(musicGain);
  drone.start();
  fifth.start();
  state.audio.music = { drone, fifth, musicGain };
  state.audio.musicTimer = window.setInterval(() => {
    if (state.settings.sound) playEffect('turn');
  }, 18000);
}

function stopMusic() {
  if (state.audio.musicTimer) {
    window.clearInterval(state.audio.musicTimer);
    state.audio.musicTimer = null;
  }
  if (!state.audio.music) return;
  try {
    state.audio.music.musicGain.gain.setTargetAtTime(0.0001, state.audio.ctx.currentTime, 0.08);
    state.audio.music.drone.stop(state.audio.ctx.currentTime + 0.2);
    state.audio.music.fifth.stop(state.audio.ctx.currentTime + 0.2);
  } catch (error) {
    // Oscillators may already be stopped; no user-facing action needed.
  }
  state.audio.music = null;
}

function burstAtCenter(color = 'gold') {
  createParticles(window.innerWidth / 2, window.innerHeight / 2, color, 24);
}

function burstAtPlayer(playerId, color = 'gold') {
  const cards = $$('.player-card');
  const card = cards[playerId];
  if (!card) return burstAtCenter(color);
  const rect = card.getBoundingClientRect();
  createParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, color, 22);
}

function createParticles(x, y, color = 'gold', count = 18) {
  if (!state.settings.visuals || !fxLayer) return;
  for (let i = 0; i < count; i += 1) {
    const p = document.createElement('span');
    p.className = `particle particle-${color}`;
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const distance = 60 + Math.random() * 120;
    p.style.setProperty('--x', `${x}px`);
    p.style.setProperty('--y', `${y}px`);
    p.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
    p.style.setProperty('--ty', `${Math.sin(angle) * distance}px`);
    p.style.setProperty('--delay', `${Math.random() * 90}ms`);
    fxLayer.appendChild(p);
    p.addEventListener('animationend', () => p.remove(), { once: true });
  }
}

function shakeBoard() {
  if (!state.settings.visuals) return;
  document.body.classList.add('shake');
  window.setTimeout(() => document.body.classList.remove('shake'), 420);
}

function confetti() {
  if (!state.settings.visuals || !fxLayer) return;
  for (let i = 0; i < 90; i += 1) {
    const p = document.createElement('span');
    p.className = `confetti-piece confetti-${i % 4}`;
    p.style.setProperty('--left', `${Math.random() * 100}vw`);
    p.style.setProperty('--delay', `${Math.random() * 700}ms`);
    p.style.setProperty('--spin', `${180 + Math.random() * 720}deg`);
    fxLayer.appendChild(p);
    p.addEventListener('animationend', () => p.remove(), { once: true });
  }
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
$('#showMyCards').addEventListener('click', () => {
  if (!state.players.length || state.phase === 'setup' || state.phase === 'gameOver') return;
  showCards(state.currentPlayer);
});
$('#openRules').addEventListener('click', showRules);
$('#soundToggle').addEventListener('click', toggleSound);
$('#visualToggle').addEventListener('click', toggleVisuals);

modalCloseButton?.addEventListener('click', () => {
  if (modal.dataset.locked === 'true') {
    playEffect('deny');
    return;
  }
  closeModal();
});

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
renderSettingsButtons();
