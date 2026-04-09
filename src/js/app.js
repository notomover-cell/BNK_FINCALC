/* ===== BNK 금융계산기 — Core JS ===== */

// ══════════════════════════════════════════════════════
// POLICY VARIABLES (defaults, saved to localStorage)
// ══════════════════════════════════════════════════════
const POLICY_DEFAULTS = {
  'ltv-first': 70, 'ltv-low': 60, 'ltv-none': 40, 'ltv-one': 50,
  'small-seoul': 5500, 'small-capital': 4800, 'small-metro': 2800, 'small-other': 2000,
  'stress-capital': 3.0, 'stress-local': 0.75, 'stress-other': 1.5,
  'prepay-rate': 0.58, 'prepay-period': 3,
  'dsr-limit1': 40, 'dsr-limit2': 50
};

let policyVars = { ...POLICY_DEFAULTS };
let policyDraft = {};  // 임시 수정값 (설정 저장 전까지 반영 안 됨)

function loadPolicy() {
  try {
    const saved = localStorage.getItem('bnk_policy');
    if (saved) Object.assign(policyVars, JSON.parse(saved));
  } catch (e) { /* ignore */ }
}

function savePolicy() {
  localStorage.setItem('bnk_policy', JSON.stringify(policyVars));
}

function getPolicy(key) {
  return policyVars[key] ?? POLICY_DEFAULTS[key];
}

// ══════════════════════════════════════════════════════
// FAVORITES (localStorage)
// ══════════════════════════════════════════════════════
let favorites = [];

function loadFavorites() {
  try {
    const saved = localStorage.getItem('bnk_favorites');
    if (saved) favorites = JSON.parse(saved);
  } catch (e) { /* ignore */ }
}

function saveFavorites() {
  localStorage.setItem('bnk_favorites', JSON.stringify(favorites));
}

// ══════════════════════════════════════════════════════
// CALCULATION HISTORY (localStorage + recent bar)
// ══════════════════════════════════════════════════════
let recentCalcs = [];
const MAX_RECENT = 2;
const MAX_HISTORY = 200;

function loadHistory() {
  try {
    const saved = localStorage.getItem('bnk_history');
    return saved ? JSON.parse(saved) : [];
  } catch (e) { return []; }
}

function saveHistory(history) {
  localStorage.setItem('bnk_history', JSON.stringify(history));
}

function captureFormSnapshot(tabId) {
  const panel = document.getElementById('panel-' + tabId);
  if (!panel) return {};
  const snap = {};
  // Text/number inputs
  panel.querySelectorAll('input[id]').forEach(inp => {
    snap[inp.id] = inp.value;
  });
  // Toggle groups
  panel.querySelectorAll('.toggle-group[data-field]').forEach(g => {
    const active = g.querySelector('.toggle-btn.active');
    if (active) snap['toggle:' + g.dataset.field] = active.dataset.value;
  });
  // Memo
  const memo = document.getElementById('memo-' + tabId);
  if (memo && memo.value.trim()) snap['__memo'] = memo.value.trim();
  return snap;
}

function restoreFormSnapshot(tabId, snap) {
  if (!snap) return;
  const panel = document.getElementById('panel-' + tabId);
  if (!panel) return;
  // Restore inputs
  Object.entries(snap).forEach(([key, val]) => {
    if (key.startsWith('toggle:')) {
      const field = key.replace('toggle:', '');
      const group = panel.querySelector(`.toggle-group[data-field="${field}"]`);
      if (group) {
        group.querySelectorAll('.toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.value === val));
      }
    } else if (key === '__memo') {
      const memo = document.getElementById('memo-' + tabId);
      if (memo) memo.value = val;
    } else {
      const inp = document.getElementById(key);
      if (inp) inp.value = val;
    }
  });
  // 조건부 필드 visibility 갱신
  if (tabId === 'loan') {
    const method = getToggle('loan-repay-type');
    const splitOpts = document.getElementById('loan-split-opts');
    if (splitOpts) splitOpts.style.display = method === 'principal' ? '' : 'none';
  }
}

function setFormDisabled(tabId, disabled) {
  const panel = document.getElementById('panel-' + tabId);
  if (!panel) return;
  panel.querySelectorAll('input').forEach(inp => inp.disabled = disabled);
  panel.querySelectorAll('.toggle-btn').forEach(btn => btn.disabled = disabled);
  panel.querySelectorAll('.quick-btn').forEach(btn => btn.disabled = disabled);
  panel.querySelectorAll('.btn--primary, .btn--reset').forEach(btn => btn.disabled = disabled);
  // History recall banner
  let banner = panel.querySelector('.history-banner');
  if (disabled) {
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'history-banner';
      panel.prepend(banner);
    }
  } else if (banner) {
    banner.remove();
  }
}

let historyRecallTab = null;

function recallFromHistory(entry) {
  // Clear previous recall if any
  if (historyRecallTab) setFormDisabled(historyRecallTab, false);

  switchTab(entry.tab);
  if (entry.snapshot) restoreFormSnapshot(entry.tab, entry.snapshot);
  setFormDisabled(entry.tab, true);
  historyRecallTab = entry.tab;

  // Show banner
  const panel = document.getElementById('panel-' + entry.tab);
  const banner = panel.querySelector('.history-banner');
  if (banner) {
    banner.innerHTML = `<span>&#128337; ${entry.date} ${entry.time} 계산 이력</span><button class="history-banner__edit" onclick="exitHistoryRecall()">편집하기</button>`;
  }
}

function exitHistoryRecall() {
  if (historyRecallTab) {
    setFormDisabled(historyRecallTab, false);
    const panel = document.getElementById('panel-' + historyRecallTab);
    const banner = panel?.querySelector('.history-banner');
    if (banner) banner.remove();
    historyRecallTab = null;
  }
}

function addRecentCalc(tabId, summary) {
  // Exit recall mode if calculating
  if (historyRecallTab) exitHistoryRecall();

  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const dateStr = now.toISOString().split('T')[0];
  const snapshot = captureFormSnapshot(tabId);
  const entry = { tab: tabId, summary, time, date: dateStr, ts: now.getTime(), snapshot };

  // Recent bar
  recentCalcs.unshift(entry);
  if (recentCalcs.length > MAX_RECENT) recentCalcs.length = MAX_RECENT;
  renderRecentBar();

  // Persistent history
  const history = loadHistory();
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  saveHistory(history);

  // Update history tab if active
  renderHistory();
}

function renderRecentBar() {
  const bar = document.getElementById('recentBar');
  const list = document.getElementById('recentList');
  if (!recentCalcs.length) { bar.classList.remove('show'); return; }
  bar.classList.add('show');
  list.innerHTML = recentCalcs.map(r => {
    const meta = TAB_META[r.tab];
    return `<div class="recent-bar__item" data-recent-tab="${r.tab}">
      <span class="recent-bar__item-tab">${meta ? meta.label : r.tab}</span>
      <span class="recent-bar__item-result">${r.summary}</span>
      <span class="recent-bar__item-time">${r.time}</span>
    </div>`;
  }).join('');
}

document.getElementById('recentBar').addEventListener('click', (e) => {
  const item = e.target.closest('.recent-bar__item');
  if (!item) return;
  switchTab(item.dataset.recentTab);
});

// ── History tab rendering ──
function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;
  const filter = getToggle('hist-date');
  const history = loadHistory();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const filtered = history.filter(h => {
    if (filter === 'today') return h.date === todayStr;
    if (filter === 'week') {
      const d = new Date(h.ts);
      const diff = (now - d) / 86400000;
      return diff < 7;
    }
    if (filter === 'month') {
      const d = new Date(h.ts);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true; // 'all'
  });

  lastFilteredHistory = filtered;

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state__icon">&#128196;</div><div class="empty-state__text">계산 이력이 없습니다</div></div>`;
    return;
  }

  list.innerHTML = filtered.map((h, idx) => {
    const meta = TAB_META[h.tab] || { label: h.tab, icon: '📋' };
    const memo = h.snapshot?.__memo ? `<div class="history-item__memo">${h.snapshot.__memo}</div>` : '';
    return `<div class="history-item" data-hist-idx="${idx}">
      <div class="history-item__icon">${meta.icon}</div>
      <div class="history-item__body">
        <div class="history-item__title">${meta.label}</div>
        <div class="history-item__summary">${h.summary}</div>
        ${memo}
      </div>
      <div class="history-item__time">${h.date === todayStr ? h.time : h.date + ' ' + h.time}</div>
    </div>`;
  }).join('') + `<button class="history-clear" id="historyClearBtn">이력 전체 삭제</button>`;
}

let lastFilteredHistory = [];
document.getElementById('history-list').addEventListener('click', (e) => {
  const item = e.target.closest('.history-item');
  if (item) {
    const idx = parseInt(item.dataset.histIdx);
    const entry = lastFilteredHistory[idx];
    if (entry) recallFromHistory(entry);
    return;
  }
  if (e.target.id === 'historyClearBtn') {
    if (confirm('계산 이력을 전체 삭제하시겠습니까?')) {
      localStorage.removeItem('bnk_history');
      renderHistory();
      showToast('이력이 삭제되었습니다');
    }
  }
});

function reorderTabs() {
  const nav = document.getElementById('tabNav');
  const buttons = Array.from(nav.querySelectorAll('.tab-nav__item'));
  const sorted = [...buttons].sort((a, b) => {
    const aFav = favorites.includes(a.dataset.tab) ? 0 : 1;
    const bFav = favorites.includes(b.dataset.tab) ? 0 : 1;
    if (aFav !== bFav) return aFav - bFav;
    return TAB_ORDER.indexOf(a.dataset.tab) - TAB_ORDER.indexOf(b.dataset.tab);
  });
  sorted.forEach(btn => {
    const isFav = favorites.includes(btn.dataset.tab);
    btn.classList.toggle('is-fav', isFav);
    nav.appendChild(btn);
  });
}

function toggleFavorite(tab) {
  const idx = favorites.indexOf(tab);
  if (idx >= 0) favorites.splice(idx, 1);
  else favorites.push(tab);
  saveFavorites();
  reorderTabs();
  renderMegaMenu();
}

// ══════════════════════════════════════════════════════
// THEME
// ══════════════════════════════════════════════════════
function loadTheme() {
  const saved = localStorage.getItem('bnk_theme') || 'light';
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('bnk_theme', theme);
  // Update settings UI
  document.querySelectorAll('.theme-option').forEach(el => {
    el.classList.toggle('active', el.dataset.themeSelect === theme);
  });

  // Update sun/moon icon
  const themeBtn = document.getElementById('btnThemeToggle');
  if (themeBtn) themeBtn.textContent = theme === 'dark' ? '☀' : '☾';
}

// Theme toggle button (sun/moon)
document.getElementById('btnThemeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ══════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════
function parseNum(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  return parseFloat(el.value.replace(/,/g, '')) || 0;
}

function fmt(n) {
  return Math.ceil(n).toLocaleString('ko-KR') + '원';
}

function fmtPercent(n) {
  return n.toFixed(3) + '%';
}

function getToggle(field) {
  const group = document.querySelector(`[data-field="${field}"]`);
  if (!group) return '';
  const active = group.querySelector('.toggle-btn.active');
  return active ? active.dataset.value : '';
}

function getMonths(periodId, unitField) {
  const p = parseNum(periodId);
  const unit = getToggle(unitField);
  return unit === 'month' ? p : p * 12;
}

function getTaxRate(field) {
  const v = getToggle(field);
  switch (v) {
    case 'normal': return 0.154;
    case 'exempt': return 0;
    case 'prefer': return 0.095;
    case 'low':    return 0.014;
    default:       return 0.154;
  }
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}

// ══════════════════════════════════════════════════════
// TAB DATA
// ══════════════════════════════════════════════════════
const TAB_META = {
  calc:     { label: '계산기',    icon: '🔢', category: 'basic' },
  todo:     { label: '할일',     icon: '✅', category: 'basic' },
  history:  { label: '이력',      icon: '📋', category: 'basic' },
  deposit:  { label: '예금',      icon: '💰', category: 'deposit' },
  savings:  { label: '적금',      icon: '🏦', category: 'deposit' },
  loan:     { label: '대출',      icon: '💳', category: 'loan' },
  mortgage: { label: '주담대종합', icon: '🏠', category: 'loan' },
  ltv:      { label: 'LTV',       icon: '📊', category: 'loan' },
  dti:      { label: 'DTI',       icon: '📈', category: 'loan' },
  dsr:      { label: 'DSR',       icon: '📉', category: 'loan' },
  prepay:   { label: '중도상환',   icon: '🔄', category: 'loan' },
};

const TAB_ORDER = Object.keys(TAB_META);

// ══════════════════════════════════════════════════════
// TAB NAVIGATION
// ══════════════════════════════════════════════════════
function switchTab(tabId) {
  document.querySelectorAll('.tab-nav__item').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tabId));

  // History fixed button active state
  const histBtn = document.getElementById('tabHistoryBtn');
  if (histBtn) histBtn.classList.toggle('active', tabId === 'history');

  // Scroll active tab into view
  const activeBtn = document.querySelector(`.tab-nav__item[data-tab="${tabId}"]`);
  if (activeBtn) activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

  // Close mega menu
  closeMegaMenu();

  // Update mega menu active state
  renderMegaMenu();

  // Render history when switching to history tab
  if (tabId === 'history') renderHistory();
}

document.getElementById('tabNav').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-nav__item');
  if (!btn) return;
  switchTab(btn.dataset.tab);
});

// History fixed button
document.getElementById('tabHistoryBtn').addEventListener('click', () => switchTab('history'));

// ══════════════════════════════════════════════════════
// MEGA MENU
// ══════════════════════════════════════════════════════
function getHiddenTabs() {
  const nav = document.getElementById('tabNav');
  const navRect = nav.getBoundingClientRect();
  const hidden = [];
  nav.querySelectorAll('.tab-nav__item').forEach(btn => {
    const r = btn.getBoundingClientRect();
    // 탭이 nav 영역 밖으로 나간 경우 (오른쪽으로 잘림)
    if (r.right > navRect.right - 10 || r.left < navRect.left) {
      hidden.push(btn.dataset.tab);
    }
  });
  return hidden;
}

function renderMegaMenu() {
  const activeTab = document.querySelector('.tab-nav__item.active')?.dataset.tab
    || document.querySelector('.tab-nav__fixed-item.active')?.dataset.tab;
  const categories = {
    basic:   document.getElementById('megaGridBasic'),
    deposit: document.getElementById('megaGridDeposit'),
    loan:    document.getElementById('megaGridLoan'),
  };
  Object.values(categories).forEach(el => el.innerHTML = '');

  TAB_ORDER.forEach(tab => {
    const meta = TAB_META[tab];
    const isFav = favorites.includes(tab);
    const html = `<button class="mega-menu__item ${tab === activeTab ? 'active' : ''}" data-mega-tab="${tab}">
      ${meta.label}<span class="fav-star ${isFav ? 'is-fav' : ''}" data-fav-tab="${tab}" title="즐겨찾기">${isFav ? '★' : '☆'}</span>
    </button>`;
    categories[meta.category].insertAdjacentHTML('beforeend', html);
  });
}

function openMegaMenu() {
  renderMegaMenu();
  document.getElementById('megaMenu').classList.add('open');
}

function closeMegaMenu() {
  document.getElementById('megaMenu').classList.remove('open');
}

// Mega menu — 탭 영역 호버 시 열기
document.getElementById('tabNavWrap').addEventListener('mouseenter', openMegaMenu);
document.getElementById('tabNavWrap').addEventListener('mouseleave', closeMegaMenu);

// Click on mega menu item — star toggles favorite, rest navigates
document.getElementById('megaMenu').addEventListener('click', (e) => {
  // Star click → toggle favorite
  const star = e.target.closest('.fav-star');
  if (star) {
    e.stopPropagation();
    const tab = star.dataset.favTab;
    toggleFavorite(tab);
    showToast(favorites.includes(tab) ? '즐겨찾기 추가' : '즐겨찾기 제거');
    renderMegaMenu();
    return;
  }
  // Item click → navigate
  const item = e.target.closest('.mega-menu__item');
  if (!item) return;
  switchTab(item.dataset.megaTab);
});

// ══════════════════════════════════════════════════════
// TOGGLE BUTTONS
// ══════════════════════════════════════════════════════
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.toggle-btn');
  if (!btn) return;
  const group = btn.closest('.toggle-group');
  if (!group) return;

  group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // Show/hide 송금수수료 field
  if (group.dataset.field === 'ex-type') {
    const v = btn.dataset.value;
    const feeField = document.getElementById('ex-fee-field');
    if (feeField) feeField.style.display = (v === 'send' || v === 'receive') ? '' : 'none';
  }

  // 상환방식 전환 — 원금균등(분할)일 때만 분할단위/차액납부 표시
  if (group.dataset.field === 'loan-repay-type') {
    const isPrincipal = btn.dataset.value === 'principal';
    const splitOpts = document.getElementById('loan-split-opts');
    if (splitOpts) splitOpts.style.display = isPrincipal ? '' : 'none';
  }

  // History filter change
  if (group.dataset.field === 'hist-date') renderHistory();
});

// ══════════════════════════════════════════════════════
// QUICK BUTTONS
// ══════════════════════════════════════════════════════
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.quick-btn');
  if (!btn) return;

  const targetId = btn.dataset.target;
  const el = document.getElementById(targetId);
  if (!el) return;

  if (btn.dataset.set) {
    el.value = btn.dataset.set;
    formatInput(el);
    return;
  }

  const addVal = parseFloat(btn.dataset.add) || 0;
  const current = parseFloat(el.value.replace(/,/g, '')) || 0;
  el.value = (current + addVal).toString();
  formatInput(el);
});

// ══════════════════════════════════════════════════════
// INPUT FORMATTING
// ══════════════════════════════════════════════════════
function formatInput(el) {
  if (el.type === 'date') return;
  const raw = el.value.replace(/,/g, '');
  if (raw === '' || raw === '-') return;
  if (raw.includes('.')) {
    const parts = raw.split('.');
    const intPart = parseInt(parts[0]) || 0;
    el.value = intPart.toLocaleString('ko-KR') + '.' + (parts[1] || '');
    return;
  }
  const n = parseInt(raw);
  if (!isNaN(n)) el.value = n.toLocaleString('ko-KR');
}

document.addEventListener('input', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'date') {
    formatInput(e.target);
  }
});

// 텐키 Del(.) → 00 입력 (금액 필드), 이자율 필드 자동 소수점
document.addEventListener('keydown', (e) => {
  if (e.target.tagName !== 'INPUT') return;
  const id = e.target.id || '';
  const isRateField = id.includes('-rate') || id.includes('-discount');

  // 이자율 필드: 숫자 한자리 입력 후 자동 소수점
  if (isRateField && !e.target.value && /^[0-9]$/.test(e.key)) {
    e.preventDefault();
    e.target.value = e.key + '.';
    return;
  }

  // 텐키 Del(.) → 00 입력 (금액 필드에서만, 이미 소수점 있으면 무시)
  if (e.key === '.' && !isRateField && e.target.inputMode === 'numeric') {
    e.preventDefault();
    const pos = e.target.selectionStart;
    const val = e.target.value;
    e.target.value = val.slice(0, pos) + '00' + val.slice(pos);
    e.target.setSelectionRange(pos + 2, pos + 2);
    e.target.dispatchEvent(new Event('input', { bubbles: true }));
  }
});

// Currency suffix update
document.getElementById('ex-currency')?.addEventListener('change', (e) => {
  const suffix = document.getElementById('ex-currency-suffix');
  if (suffix) suffix.textContent = e.target.value;
});

// ══════════════════════════════════════════════════════
// SETTINGS PANEL
// ══════════════════════════════════════════════════════
function openSettings() {
  // Load current values into settings fields
  document.querySelectorAll('[data-policy]').forEach(el => {
    const key = el.dataset.policy;
    const val = policyVars[key] ?? POLICY_DEFAULTS[key];
    if (key.startsWith('small-')) {
      el.value = val.toLocaleString('ko-KR');
    } else {
      el.value = val;
    }
  });
  // 시스템 폰트 목록 로드 및 커스텀 폰트 설정값 복원
  loadSystemFonts();

  document.getElementById('settingsOverlay').classList.add('open');
  checkStartupStatus();
}

// 시작프로그램 등록 상태 확인
function checkStartupStatus() {
  const btn = document.getElementById('startupToggle');
  if (!btn) return;
  fetch('/api/startup').then(r => r.json()).then(data => {
    btn.textContent = data.registered ? '해제하기' : '등록하기';
    btn.classList.toggle('btn--danger', data.registered);
  }).catch(() => {
    btn.textContent = '사용 불가';
    btn.disabled = true;
  });
}

// 시작프로그램 등록/해제 토글
function toggleStartup() {
  const btn = document.getElementById('startupToggle');
  if (!btn) return;
  const isRegistered = btn.textContent === '해제하기';
  const url = isRegistered ? '/api/startup/unregister' : '/api/startup/register';
  fetch(url, { method: 'POST' }).then(r => r.json()).then(data => {
    btn.textContent = data.registered ? '해제하기' : '등록하기';
    btn.classList.toggle('btn--danger', data.registered);
    showToast(data.registered ? '시작프로그램에 등록되었습니다.' : '시작프로그램에서 해제되었습니다.');
  }).catch(() => showToast('시작프로그램 설정에 실패했습니다.'));
}

function applyCustomFont() {
  const customFont = localStorage.getItem('customFont');
  const fallback = "'NanumSquare', 'NanumSquareRound', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Malgun Gothic', '맑은 고딕', sans-serif";
  if (customFont) {
    document.documentElement.style.setProperty('--font', `'${customFont}', ${fallback}`);
  } else {
    document.documentElement.style.setProperty('--font', fallback);
  }
}

async function loadSystemFonts() {
  const select = document.getElementById('set-custom-font');
  if (!select) return;
  const saved = localStorage.getItem('customFont') || '';

  // 기본 옵션만 남기기
  select.innerHTML = '<option value="">기본 (나눔스퀘어→시스템 폰트)</option>';

  if (window.queryLocalFonts) {
    try {
      const fonts = await window.queryLocalFonts();
      const families = [...new Set(fonts.map(f => f.family))].sort((a, b) => a.localeCompare(b, 'ko'));
      families.forEach(family => {
        const opt = document.createElement('option');
        opt.value = family;
        opt.textContent = family;
        if (family === saved) opt.selected = true;
        select.appendChild(opt);
      });
    } catch {
      // 권한 거부 시 기본 목록으로 폴백
      addFallbackFonts(select, saved);
    }
  } else {
    // API 미지원 시 기본 목록
    addFallbackFonts(select, saved);
  }

  if (saved && !select.value) select.value = saved;
}

function addFallbackFonts(select, saved) {
  const list = [
    'NanumSquare', 'NanumSquareRound', 'NanumGothic', 'NanumMyeongjo',
    'Malgun Gothic', 'Pretendard', 'Gulim', 'Dotum', 'D2Coding'
  ];
  list.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === saved) opt.selected = true;
    select.appendChild(opt);
  });
}

function closeSettings() {
  document.getElementById('settingsOverlay').classList.remove('open');
}

function saveSettings() {
  document.querySelectorAll('[data-policy]').forEach(el => {
    const key = el.dataset.policy;
    const val = parseFloat(el.value.replace(/,/g, ''));
    if (!isNaN(val)) policyVars[key] = val;
  });
  savePolicy();

  // 커스텀 폰트 저장 및 적용
  const customFont = document.getElementById('set-custom-font')?.value;
  if (customFont) {
    localStorage.setItem('customFont', customFont);
  } else {
    localStorage.removeItem('customFont');
  }
  applyCustomFont();

  // Sync inline policy fields
  syncPolicyToForms();

  closeSettings();
  showToast('설정이 저장되었습니다');
}

function syncPolicyToForms() {
  // 중도상환 기본값 sync
  const preRate = document.getElementById('pre-fee-rate');
  if (preRate && !preRate.dataset.userEdited) preRate.value = getPolicy('prepay-rate').toFixed(2);
  const prePeriod = document.getElementById('pre-fee-period');
  if (prePeriod && !prePeriod.dataset.userEdited) prePeriod.value = getPolicy('prepay-period');
  // 소액임차보증금 sync
  const ltvSmall = document.getElementById('ltv-small-deposit');
  if (ltvSmall && !ltvSmall.dataset.userEdited) ltvSmall.value = (getPolicy('small-metro') * 10000).toLocaleString('ko-KR');
  const mortSmall = document.getElementById('mort-small-deposit');
  if (mortSmall && !mortSmall.dataset.userEdited) mortSmall.value = (getPolicy('small-metro') * 10000).toLocaleString('ko-KR');
}

// Settings button
document.getElementById('btnSettings').addEventListener('click', openSettings);
// Badge-policy labels also open settings
document.querySelectorAll('.badge-policy').forEach(el => {
  el.style.cursor = 'pointer';
  el.addEventListener('click', openSettings);
});
document.getElementById('settingsClose').addEventListener('click', closeSettings);
document.getElementById('settingsCancel').addEventListener('click', closeSettings);
document.getElementById('settingsSave').addEventListener('click', saveSettings);
// Click overlay to close
document.getElementById('settingsOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeSettings();
});

// Theme switcher in settings
document.querySelectorAll('.theme-option').forEach(el => {
  el.addEventListener('click', () => {
    applyTheme(el.dataset.themeSelect);
  });
});

// ══════════════════════════════════════════════════════
// RESULT TOGGLE
// ══════════════════════════════════════════════════════
function toggleResult(id) {
  const card = document.getElementById(id);
  if (!card) return;
  const body = card.querySelector('.result-card__body');
  const icon = card.querySelector('.result-card__toggle');
  if (body.style.display === 'none') {
    body.style.display = '';
    const footer = card.querySelector('.result-footer');
    if (footer) footer.style.display = '';
    icon.classList.remove('collapsed');
  } else {
    body.style.display = 'none';
    const footer = card.querySelector('.result-footer');
    if (footer) footer.style.display = 'none';
    icon.classList.add('collapsed');
  }
}

// ══════════════════════════════════════════════════════
// RESET FORM
// ══════════════════════════════════════════════════════
function resetForm(panelName) {
  const panel = document.getElementById('panel-' + panelName);
  if (!panel) return;
  panel.querySelectorAll('input[type="text"], input[type="number"]').forEach(el => {
    if (el.closest('.field')?.querySelector('.badge-policy')) return;
    el.value = '';
  });
  panel.querySelectorAll('input[type="date"]').forEach(el => el.value = '');
  panel.querySelectorAll('.result-card').forEach(rc => rc.style.display = 'none');
}

// ══════════════════════════════════════════════════════
// LOAN CALCULATION HELPERS
// ══════════════════════════════════════════════════════
function calcAnnualRepay(principal, annualRate, months, method) {
  if (principal <= 0 || months <= 0) return 0;
  const mr = annualRate / 100 / 12;

  if (method === 'equal') {
    if (mr === 0) return (principal / months) * 12;
    const monthly = principal * mr * Math.pow(1 + mr, months) / (Math.pow(1 + mr, months) - 1);
    return monthly * 12;
  }
  if (method === 'principal') {
    const monthlyPrincipal = principal / months;
    let total = 0;
    const count = Math.min(12, months);
    for (let k = 1; k <= count; k++) {
      total += monthlyPrincipal + (principal - monthlyPrincipal * (k - 1)) * mr;
    }
    return total * (12 / count);
  }
  // bullet (만기일시)
  return principal * mr * 12;
}

function calcMonthlyPayment(principal, annualRate, totalMonths, method, roundUnit, roundMethod, gracePeriod) {
  if (principal <= 0 || totalMonths <= 0) return { monthly: 0, totalInterest: 0, first: 0, last: 0, graceInterest: 0 };
  const mr = annualRate / 100 / 12;
  const grace = gracePeriod || 0;
  const months = totalMonths - grace; // 실제 상환 개월수
  const graceMonthlyInterest = principal * mr;
  const graceInterest = graceMonthlyInterest * grace;

  if (months <= 0) {
    // 거치기간이 전체 기간 이상이면 이자만 납부
    return { monthly: graceMonthlyInterest, totalInterest: graceInterest, first: graceMonthlyInterest, last: graceMonthlyInterest, graceInterest };
  }

  if (method === 'equal') {
    // 원리금균등 — 절사 없음
    if (mr === 0) {
      const m = Math.round(principal / months);
      return { monthly: m, totalInterest: graceInterest, first: m, last: m, graceInterest };
    }
    const monthly = principal * mr * Math.pow(1 + mr, months) / (Math.pow(1 + mr, months) - 1);
    const repayInterest = monthly * months - principal;
    return { monthly, totalInterest: graceInterest + repayInterest, first: monthly, last: monthly, graceInterest };
  }
  if (method === 'principal') {
    // 원금균등 — 원금 절사 적용, 이자는 절사 안함
    const ru = roundUnit || 1;
    function trunc(v) { return Math.floor(v / ru) * ru; }
    const mp = trunc(principal / months);
    const diff = principal - mp * months;
    let repayInterest = 0;
    let balance = principal;
    let first = mp + balance * mr;
    let last = 0;
    for (let k = 1; k <= months; k++) {
      const interest = balance * mr;
      repayInterest += interest;
      if (k === months) last = mp + interest;
      balance -= mp;
    }
    if (roundMethod === 'first') first += diff;
    else last += diff;
    return { monthly: null, totalInterest: Math.round(graceInterest + repayInterest), first, last, graceInterest };
  }
  // bullet (만기일시) — 절사 없음
  const monthlyInterest = principal * mr;
  const totalInterest = monthlyInterest * totalMonths;
  return { monthly: monthlyInterest, totalInterest, first: monthlyInterest, last: monthlyInterest + principal, graceInterest };
}

// ══════════════════════════════════════════════════════
// CALCULATORS
// ══════════════════════════════════════════════════════

// ── 예금 ───────────────────────────────────────────────
function calcDeposit() {
  const principal = parseNum('dep-amount');
  const months = getMonths('dep-period', 'dep-period-unit');
  const rate = parseNum('dep-rate') / 100;
  const interestType = getToggle('dep-interest-type');
  const taxRate = getTaxRate('dep-tax-type');

  if (principal <= 0 || months <= 0) return showToast('금액과 기간을 입력해주세요.');

  let interest;
  if (interestType === 'simple') {
    interest = principal * rate * (months / 12);
  } else {
    interest = principal * Math.pow(1 + rate / 12, months) - principal;
  }

  const tax = Math.ceil(interest * taxRate);
  interest = Math.ceil(interest);
  const total = principal + interest - tax;

  document.getElementById('dep-r-principal').textContent = fmt(principal);
  document.getElementById('dep-r-interest').textContent = fmt(interest);
  document.getElementById('dep-r-tax').textContent = '-' + fmt(tax);
  document.getElementById('dep-r-total').innerHTML = fmt(total).replace('원', '<span>원</span>');
  document.getElementById('dep-result').style.display = '';
  addRecentCalc('deposit', '세후 ' + fmt(total));
}

// ── 적금 ───────────────────────────────────────────────
function calcSavings() {
  const monthly = parseNum('sav-amount');
  const months = getMonths('sav-period', 'sav-period-unit');
  const rate = parseNum('sav-rate') / 100;
  const interestType = getToggle('sav-interest-type');
  const taxRate = getTaxRate('sav-tax-type');

  if (monthly <= 0 || months <= 0) return showToast('금액과 기간을 입력해주세요.');

  const totalPaid = monthly * months;
  let interest;

  if (interestType === 'simple') {
    interest = monthly * (rate / 12) * months * (months + 1) / 2;
  } else {
    const mr = rate / 12;
    interest = mr === 0 ? 0 : monthly * ((Math.pow(1 + mr, months) - 1) / mr) - totalPaid;
  }

  const tax = Math.ceil(interest * taxRate);
  interest = Math.ceil(interest);
  const total = totalPaid + interest - tax;

  document.getElementById('sav-r-principal').textContent = fmt(totalPaid);
  document.getElementById('sav-r-interest').textContent = fmt(interest);
  document.getElementById('sav-r-tax').textContent = '-' + fmt(tax);
  document.getElementById('sav-r-total').innerHTML = fmt(total).replace('원', '<span>원</span>');
  document.getElementById('sav-result').style.display = '';
  addRecentCalc('savings', '수령 ' + fmt(total));
}

// ── 대출 ───────────────────────────────────────────────
function calcLoan() {
  const principal = parseNum('loan-amount');
  const totalMonths = getMonths('loan-period', 'loan-period-unit');
  const rate = parseNum('loan-rate');
  const method = getToggle('loan-repay-type') || 'equal';
  const gracePeriod = parseNum('loan-grace') || 0;
  let roundUnit = 1, roundMethod = 'last';

  if (method === 'principal') {
    roundUnit = parseInt(getToggle('loan-round-unit')) || 1000;
    roundMethod = getToggle('loan-round-method') || 'last';
  }

  if (principal <= 0 || totalMonths <= 0) return showToast('금액과 기간을 입력해주세요.');
  if (gracePeriod >= totalMonths && method !== 'bullet') return showToast('거치기간이 대출기간보다 길 수 없습니다.');

  const result = calcMonthlyPayment(principal, rate, totalMonths, method, roundUnit, roundMethod, gracePeriod);

  document.getElementById('loan-r-principal').textContent = fmt(principal);
  document.getElementById('loan-r-interest').textContent = fmt(result.totalInterest);
  document.getElementById('loan-r-total-repay').textContent = fmt(principal + result.totalInterest);

  const label = document.getElementById('loan-r-monthly-label');
  const value = document.getElementById('loan-r-monthly');
  const graceNote = gracePeriod > 0 ? ' (거치 후)' : '';

  if (method === 'principal') {
    label.textContent = '매월 상환금액' + graceNote + ' (첫 달 ~ 마지막 달)';
    value.innerHTML = fmt(result.first).replace('원', '') + ' ~ ' + fmt(result.last).replace('원', '<span>원</span>');
  } else if (method === 'bullet') {
    label.textContent = '매월 이자 / 만기 상환';
    value.innerHTML = fmt(result.monthly).replace('원', '') + ' / ' + fmt(result.last).replace('원', '<span>원</span>');
  } else {
    label.textContent = '매월 상환금액' + graceNote;
    value.innerHTML = fmt(result.monthly).replace('원', '<span>원</span>');
  }

  document.getElementById('loan-result').style.display = '';

  // 상환스케줄 리셋 (조건 변경 후 재계산 시)
  const scheduleWrap = document.getElementById('loan-schedule');
  if (scheduleWrap) {
    scheduleWrap.style.display = 'none';
    const scheduleBody = document.getElementById('loan-schedule-body');
    if (scheduleBody) scheduleBody.innerHTML = '';
  }

  addRecentCalc('loan', '월 ' + fmt(result.monthly || result.first));
}

function showSchedule() {
  const wrap = document.getElementById('loan-schedule');
  if (wrap.style.display !== 'none') { wrap.style.display = 'none'; return; }

  const principal = parseNum('loan-amount');
  const totalMonths = getMonths('loan-period', 'loan-period-unit');
  const annualRate = parseNum('loan-rate');
  const method = getToggle('loan-repay-type') || 'equal';
  const gracePeriod = parseNum('loan-grace') || 0;
  let roundUnit = 1, roundMethod = 'last';
  if (method === 'principal') {
    roundUnit = parseInt(getToggle('loan-round-unit')) || 1000;
    roundMethod = getToggle('loan-round-method') || 'last';
  }
  const mr = annualRate / 100 / 12;
  const repayMonths = totalMonths - gracePeriod;

  if (principal <= 0 || totalMonths <= 0) return;

  let rows = [];
  let balance = principal;
  let seq = 1;

  // 거치기간 — 이자만 납부
  for (let k = 0; k < gracePeriod; k++) {
    const interest = balance * mr;
    rows.push({ k: seq++, payment: interest, principalPay: 0, interest, balance, grace: true });
  }

  // 상환기간
  if (repayMonths > 0) {
    if (method === 'equal') {
      const monthly = mr === 0 ? principal / repayMonths :
        principal * mr * Math.pow(1 + mr, repayMonths) / (Math.pow(1 + mr, repayMonths) - 1);
      for (let k = 1; k <= repayMonths; k++) {
        const interest = balance * mr;
        const principalPay = monthly - interest;
        balance -= principalPay;
        rows.push({ k: seq++, payment: monthly, principalPay, interest, balance: Math.max(0, balance) });
      }
    } else if (method === 'principal') {
      const ru = roundUnit;
      function trunc(v) { return Math.floor(v / ru) * ru; }
      const mp = trunc(principal / repayMonths);
      const diff = principal - mp * repayMonths;
      for (let k = 1; k <= repayMonths; k++) {
        const interest = balance * mr;
        let curMp = mp;
        if (roundMethod === 'first' && k === 1) curMp += diff;
        else if (roundMethod === 'last' && k === repayMonths) curMp += diff;
        const payment = curMp + interest;
        balance -= curMp;
        if (k === repayMonths) balance = 0;
        rows.push({ k: seq++, payment, principalPay: curMp, interest, balance: Math.max(0, balance) });
      }
    } else {
      // bullet (만기일시)
      const interest = principal * mr;
      for (let k = 1; k <= repayMonths; k++) {
        const isLast = k === repayMonths;
        const principalPay = isLast ? principal : 0;
        const payment = interest + principalPay;
        rows.push({ k: seq++, payment, principalPay, interest, balance: isLast ? 0 : principal });
      }
    }
  }

  const n = (v) => Math.round(v).toLocaleString();
  const body = document.getElementById('loan-schedule-body');
  body.innerHTML = `
    <table class="schedule-table">
      <thead><tr><th>회차</th><th>상환액</th><th>원금</th><th>이자</th><th>잔액</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr${r.grace ? ' class="grace-row"' : ''}><td>${r.k}</td><td>${n(r.payment)}</td><td>${n(r.principalPay)}</td><td>${n(r.interest)}</td><td>${n(r.balance)}</td></tr>`).join('')}
      </tbody>
    </table>
  `;
  wrap.style.display = '';
}

// ── LTV ────────────────────────────────────────────────
function calcLTV() {
  const purpose = getToggle('ltv-purpose');
  const houses = getToggle('ltv-houses');
  const regulated = getToggle('ltv-regulated');
  const housePrice = parseNum('ltv-house-price');
  const existingLoan = parseNum('ltv-existing-loan');
  const smallDeposit = parseNum('ltv-small-deposit');

  if (housePrice <= 0) return showToast('담보주택 시세를 입력해주세요.');

  const ltvTable = {
    purchase: {
      regulated:       { first: getPolicy('ltv-first'), 'low-income': getPolicy('ltv-low'), none: getPolicy('ltv-none'), 'one-dispose': getPolicy('ltv-one'), multi: 0 },
      'non-regulated': { first: 80, none: 70, 'one-dispose': 60, multi: 50, 'low-income': 70 }
    },
    living: {
      regulated:       { 'one-dispose': 40, multi: 0, first: 40, none: 40, 'low-income': 40 },
      'non-regulated': { 'one-dispose': 70, multi: 60, first: 70, none: 70, 'low-income': 70 }
    }
  };

  const ltvRate = ltvTable[purpose]?.[regulated]?.[houses] ?? 0;
  const ltvLimit = Math.ceil(housePrice * ltvRate / 100 - existingLoan - smallDeposit);

  let absLimit = Infinity, absLimitText = '';
  if (regulated === 'regulated' && purpose === 'purchase') {
    if (housePrice <= 1500000000) { absLimit = 600000000; absLimitText = '6억원'; }
    else if (housePrice <= 2500000000) { absLimit = 400000000; absLimitText = '4억원'; }
    else { absLimit = 200000000; absLimitText = '2억원'; }
  }

  const maxLoan = Math.max(0, Math.min(ltvLimit, absLimit));
  const housesLabel = { first:'생애최초', 'low-income':'서민실수요', none:'무주택', 'one-dispose':'1주택(처분조건부)', multi:'2주택이상' };

  const body = document.getElementById('ltv-result-body');
  body.innerHTML = `
    <div class="result-row"><span class="result-row__label">적용 LTV</span><span class="result-row__value" style="color:var(--primary);font-size:16px;font-weight:800">${ltvRate}%</span></div>
    <div class="result-row"><span class="result-row__label">LTV 기준 한도</span><span class="result-row__value">${fmt(Math.max(0, ltvLimit))}</span></div>
    ${absLimit < Infinity ? `<div class="result-row"><span class="result-row__label">절대한도</span><span class="result-row__value">${absLimitText} (${fmt(absLimit)})</span></div>` : ''}
    <hr class="result-divider">
    <div class="result-highlight"><div class="result-highlight__label">최대 대출 가능 금액</div><div class="result-highlight__value">${fmt(maxLoan).replace('원', '<span>원</span>')}</div></div>
    <div class="cond-badges">
      <span class="cond-badge">${purpose === 'purchase' ? '신규주택구입' : '생활안정자금'}</span>
      <span class="cond-badge">${housesLabel[houses] || houses}</span>
      <span class="cond-badge">${regulated === 'regulated' ? '규제지역' : '비규제지역'}</span>
    </div>
    <div class="disclaimer">규정 기준일: 2026-04-05<br>입력 정보 기반 예상 금액입니다. 정확한 금액은 금융사 확인 필요.</div>
  `;
  document.getElementById('ltv-result').style.display = '';
  addRecentCalc('ltv', 'LTV ' + ltvRate + '% / ' + fmt(maxLoan));
}

// ── DTI ────────────────────────────────────────────────
function calcDTI() {
  const income = parseNum('dti-income');
  const loanAmount = parseNum('dti-loan-amount');
  const months = getMonths('dti-period', 'dti-period-unit');
  const rate = parseNum('dti-rate');
  const method = getToggle('dti-repay');
  const existMortgage = parseNum('dti-exist-mortgage');
  const otherInterest = parseNum('dti-other-interest');

  if (income <= 0) return showToast('연소득을 입력해주세요.');
  if (loanAmount <= 0 || months <= 0) return showToast('대출 정보를 입력해주세요.');

  const newAnnualRepay = calcAnnualRepay(loanAmount, rate, months, method);
  const dti = (newAnnualRepay + existMortgage + otherInterest) / income * 100;

  const body = document.getElementById('dti-result-body');
  body.innerHTML = `
    <div class="result-row"><span class="result-row__label">신규 주담대 연원리금</span><span class="result-row__value">${fmt(newAnnualRepay)}</span></div>
    <div class="result-row"><span class="result-row__label">보유 주담대 연원리금</span><span class="result-row__value">${fmt(existMortgage)}</span></div>
    <div class="result-row"><span class="result-row__label">기타대출 연이자</span><span class="result-row__value">${fmt(otherInterest)}</span></div>
    <hr class="result-divider">
    <div class="result-highlight"><div class="result-highlight__label">DTI</div><div class="result-highlight__value">${fmtPercent(dti)}</div></div>
    <p style="text-align:center;font-size:10.5px;color:var(--text-sub);margin-top:4px">(신DTI 기준: 보유 주담대 원리금 포함)</p>
    <div class="disclaimer">예상 수치이며 실제와 다를 수 있습니다.</div>
  `;
  document.getElementById('dti-result').style.display = '';
  addRecentCalc('dti', 'DTI ' + dti.toFixed(1) + '%');
}

// ── DSR ────────────────────────────────────────────────
function calcDSR() {
  const income = parseNum('dsr-income');
  const loanAmount = parseNum('dsr-loan-amount');
  const months = getMonths('dsr-period', 'dsr-period-unit');
  const rate = parseNum('dsr-rate');
  const method = getToggle('dsr-repay');
  const existRepay = parseNum('dsr-exist-repay');
  const region = getToggle('dsr-region');
  const rateType = getToggle('dsr-rate-type');

  if (income <= 0) return showToast('연소득을 입력해주세요.');
  if (loanAmount <= 0 || months <= 0) return showToast('대출 정보를 입력해주세요.');

  const newAnnualRepay = calcAnnualRepay(loanAmount, rate, months, method);
  const dsr = (newAnnualRepay + existRepay) / income * 100;

  // Stress DSR — uses policy variables
  const stressBase = {
    capital: getPolicy('stress-capital'),
    local:   getPolicy('stress-local'),
    other:   getPolicy('stress-other')
  };
  const applyRatio = { variable: 100, mixed: 80, periodic: 40, fixed: 0 };

  const baseStress = stressBase[region] || 1.5;
  const ratio = applyRatio[rateType] ?? 100;
  const actualAdded = baseStress * ratio / 100;
  const stressRate = rate + actualAdded;

  const stressAnnualRepay = calcAnnualRepay(loanAmount, stressRate, months, method);
  const stressDsr = (stressAnnualRepay + existRepay) / income * 100;

  const regionLabel = { capital: '수도권·규제지역', local: '지방', other: '기타(전국)' };
  const rateTypeLabel = { variable: '변동형', mixed: '혼합형', periodic: '주기형', fixed: '순수고정형' };

  const body = document.getElementById('dsr-result-body');
  body.innerHTML = `
    <div class="result-row"><span class="result-row__label">신규대출 연원리금</span><span class="result-row__value">${fmt(newAnnualRepay)}</span></div>
    <div class="result-highlight"><div class="result-highlight__label">기본 DSR</div><div class="result-highlight__value">${fmtPercent(dsr)}</div></div>
    <hr class="result-divider">
    <div class="stress-card">
      <div class="stress-card__title">스트레스 DSR</div>
      <div class="stress-card__row"><span>${regionLabel[region]}, ${rateTypeLabel[rateType]}</span></div>
      <div class="stress-card__row"><span>가산금리</span><span class="stress-card__value">${baseStress.toFixed(1)}% × ${ratio}% = +${actualAdded.toFixed(1)}%p</span></div>
      <div class="stress-card__row"><span>심사금리</span><span class="stress-card__value">${rate.toFixed(1)}% + ${actualAdded.toFixed(1)}% = ${stressRate.toFixed(1)}%</span></div>
      <div class="stress-highlight">${fmtPercent(stressDsr)}</div>
    </div>
    <div class="disclaimer">규정 기준일: 2026-04-05 | 예상 수치이며 실제와 다를 수 있습니다.</div>
  `;
  document.getElementById('dsr-result').style.display = '';
  addRecentCalc('dsr', 'DSR ' + dsr.toFixed(1) + '% / 스트레스 ' + stressDsr.toFixed(1) + '%');
}

// ── 중도상환수수료 ─────────────────────────────────────
function calcPrepay() {
  const amount = parseNum('pre-amount');
  const feeRate = parseNum('pre-fee-rate') / 100;
  const loanDate = document.getElementById('pre-loan-date').value;
  const repayDate = document.getElementById('pre-repay-date').value;
  const feePeriodYears = parseNum('pre-fee-period');

  if (amount <= 0) return showToast('상환금액을 입력해주세요.');
  if (!loanDate || !repayDate) return showToast('대출일자와 상환일자를 입력해주세요.');

  const d1 = new Date(loanDate);
  const d2 = new Date(repayDate);
  const feePeriodDays = feePeriodYears * 365;
  const feeEndDate = new Date(d1.getTime() + feePeriodDays * 86400000);
  const elapsed = Math.floor((d2 - d1) / 86400000);
  const remaining = Math.max(0, Math.floor((feeEndDate - d2) / 86400000));

  let fee = 0, feeText = '';
  if (remaining <= 0) {
    feeText = '<span style="color:var(--green);font-weight:700">부과기간 경과 — 수수료 없음</span>';
  } else {
    fee = Math.ceil(amount * feeRate * (remaining / feePeriodDays));
    feeText = fmt(fee).replace('원', '<span>원</span>');
  }

  const body = document.getElementById('pre-result-body');
  body.innerHTML = `
    <div class="result-row"><span class="result-row__label">상환금액</span><span class="result-row__value">${fmt(amount)}</span></div>
    <div class="result-row"><span class="result-row__label">적용 수수료율</span><span class="result-row__value">${(feeRate * 100).toFixed(2)}%</span></div>
    <div class="result-row"><span class="result-row__label">수수료 부과기간</span><span class="result-row__value">${feePeriodDays.toLocaleString()}일 (${feePeriodYears}년)</span></div>
    <div class="result-row"><span class="result-row__label">경과일수 / 잔존일수</span><span class="result-row__value">${elapsed.toLocaleString()}일 / ${remaining.toLocaleString()}일</span></div>
    <hr class="result-divider">
    <div class="result-highlight"><div class="result-highlight__label">예상 중도상환수수료</div><div class="result-highlight__value">${feeText}</div></div>
    ${fee > 0 ? `<p style="text-align:center;font-size:10.5px;color:var(--text-sub);margin-top:6px">${amount.toLocaleString()} × ${(feeRate * 100).toFixed(2)}% × (${remaining}/${feePeriodDays})</p>` : ''}
  `;
  document.getElementById('pre-result').style.display = '';
  addRecentCalc('prepay', fee > 0 ? '수수료 ' + fmt(fee) : '수수료 없음');
}

// ── 환전/송금 ──────────────────────────────────────────
function calcExchange() {
  const type = getToggle('ex-type');
  const foreignAmount = parseNum('ex-foreign-amount');
  const appliedRate = parseNum('ex-rate');
  const discount = parseNum('ex-discount');
  const fee = parseNum('ex-fee');
  const currency = document.getElementById('ex-currency').value;

  if (foreignAmount <= 0 || appliedRate <= 0) return showToast('외화 금액과 환율을 입력해주세요.');

  const effectiveRate = appliedRate * (1 - discount / 100);
  let krwAmount = foreignAmount * effectiveRate;
  let label = '원화 환산 금액';

  if (type === 'sell') { label = '원화 필요 금액'; }
  else if (type === 'buy') { label = '원화 수령 금액'; }
  else if (type === 'send') { label = '원화 필요 금액'; krwAmount += fee; }
  else if (type === 'receive') { label = '원화 수령 금액'; krwAmount -= fee; }

  krwAmount = Math.ceil(krwAmount);

  const body = document.getElementById('ex-result-body');
  body.innerHTML = `
    <div class="result-row"><span class="result-row__label">적용 환율 (우대 반영)</span><span class="result-row__value">${effectiveRate.toFixed(2)}원</span></div>
    <div class="result-row"><span class="result-row__label">외화 금액</span><span class="result-row__value">${currency} ${foreignAmount.toLocaleString()}</span></div>
    ${(type === 'send' || type === 'receive') ? `<div class="result-row"><span class="result-row__label">송금 수수료</span><span class="result-row__value">${fmt(fee)}</span></div>` : ''}
    <hr class="result-divider">
    <div class="result-highlight"><div class="result-highlight__label">${label}</div><div class="result-highlight__value">${fmt(krwAmount).replace('원', '<span>원</span>')}</div></div>
  `;
  document.getElementById('ex-result').style.display = '';
  addRecentCalc('exchange', label + ' ' + fmt(krwAmount));
}

// ── 주담대 종합 시뮬레이션 ─────────────────────────────
function calcMortgage() {
  const purpose = getToggle('mort-purpose');
  const houses = getToggle('mort-houses');
  const regulated = getToggle('mort-regulated');
  const housePrice = parseNum('mort-house-price');
  const loanAmount = parseNum('mort-loan-amount');
  const months = getMonths('mort-period', 'mort-period-unit');
  const rate = parseNum('mort-rate');
  const method = getToggle('mort-repay');
  const income = parseNum('mort-income');
  const existInterest = parseNum('mort-exist-interest');
  const existPrincipal = parseNum('mort-exist-principal');
  const smallDeposit = parseNum('mort-small-deposit');
  const rateType = getToggle('mort-rate-type');

  if (housePrice <= 0) return showToast('담보주택 시세를 입력해주세요.');
  if (loanAmount <= 0 || months <= 0) return showToast('대출금액과 기간을 입력해주세요.');
  if (income <= 0) return showToast('연소득을 입력해주세요.');

  // ─── LTV 한도 ───
  const ltvTable = {
    purchase: {
      regulated:       { first: getPolicy('ltv-first'), 'low-income': getPolicy('ltv-low'), none: getPolicy('ltv-none'), 'one-dispose': getPolicy('ltv-one'), one: getPolicy('ltv-one'), multi: 0 },
      'non-regulated': { first: 80, 'low-income': 70, none: 70, 'one-dispose': 60, one: 60, multi: 50 }
    },
    living: {
      regulated:       { first: 40, 'low-income': 40, none: 40, 'one-dispose': 40, one: 40, multi: 0 },
      'non-regulated': { first: 70, 'low-income': 70, none: 70, 'one-dispose': 70, one: 70, multi: 60 }
    }
  };
  const ltvRate = ltvTable[purpose]?.[regulated]?.[houses] ?? 0;
  const ltvGross = Math.ceil(housePrice * ltvRate / 100 - smallDeposit);

  let absLimit = Infinity, absLimitText = '';
  if (regulated === 'regulated' && purpose === 'purchase') {
    if (housePrice <= 1500000000) { absLimit = 600000000; absLimitText = '6억'; }
    else if (housePrice <= 2500000000) { absLimit = 400000000; absLimitText = '4억'; }
    else { absLimit = 200000000; absLimitText = '2억'; }
  }
  const ltvLimit = Math.max(0, Math.min(ltvGross, absLimit));

  // ─── 각 규제별 한도 계산 (단위금액당 연상환액 기준 역산) ───
  // 단위 대출(loanAmount)의 연상환액
  const unitAnnual = calcAnnualRepay(loanAmount, rate, months, method);
  const annualPerWon = unitAnnual / loanAmount; // 1원 빌렸을때 연상환액

  // DTI 한도 (60% 기준)
  const dtiCap = 60;
  const maxAnnualForDTI = income * dtiCap / 100 - existInterest - existPrincipal;
  const dtiLimit = maxAnnualForDTI > 0 ? Math.ceil(maxAnnualForDTI / annualPerWon) : 0;

  // DSR 한도
  const dsrCap = getPolicy('dsr-limit1');
  const maxAnnualForDSR = income * dsrCap / 100 - existInterest - existPrincipal;
  const dsrLimit = maxAnnualForDSR > 0 ? Math.ceil(maxAnnualForDSR / annualPerWon) : 0;

  // 스트레스 DSR
  const regionMap = { regulated: 'capital', 'non-regulated': 'local' };
  const stressRegion = regionMap[regulated] || 'other';
  const stressBase = {
    capital: getPolicy('stress-capital'),
    local:   getPolicy('stress-local'),
    other:   getPolicy('stress-other')
  };
  const applyRatio = { variable: 100, mixed: 80, periodic: 40, fixed: 0 };
  const baseStress = stressBase[stressRegion] || 1.5;
  const ratio = applyRatio[rateType] ?? 100;
  const actualAdded = baseStress * ratio / 100;
  const stressRate = rate + actualAdded;
  const stressAnnualPerWon = calcAnnualRepay(loanAmount, stressRate, months, method) / loanAmount;
  const maxAnnualForStress = income * dsrCap / 100 - existInterest - existPrincipal;
  const stressDsrLimit = maxAnnualForStress > 0 ? Math.ceil(maxAnnualForStress / stressAnnualPerWon) : 0;

  // ─── 종합한도 ───
  const limits = [
    { name: 'LTV', value: Math.max(0, ltvLimit) },
    { name: 'DTI', value: Math.max(0, dtiLimit) },
    { name: 'DSR', value: Math.max(0, dsrLimit) },
    { name: '스트레스DSR', value: Math.max(0, stressDsrLimit) }
  ];
  if (absLimit < Infinity) limits.push({ name: '절대한도', value: absLimit });

  const minLimit = limits.reduce((a, b) => a.value < b.value ? a : b);
  const compLimit = Math.min(loanAmount, minLimit.value);
  const isLimited = compLimit < loanAmount;

  // 가능한도 기준으로 DTI/DSR 재계산
  const compAnnual = calcAnnualRepay(compLimit, rate, months, method);
  const compDti = income > 0 ? (compAnnual + existInterest + existPrincipal) / income * 100 : 0;
  const compDsr = income > 0 ? (compAnnual + existInterest + existPrincipal) / income * 100 : 0;
  const compStressAnnual = calcAnnualRepay(compLimit, stressRate, months, method);
  const compStressDsr = income > 0 ? (compStressAnnual + existInterest + existPrincipal) / income * 100 : 0;

  // 종합한도 기준 월 상환액
  const compResult = calcMonthlyPayment(compLimit, rate, months, method);
  const compMonthly = compResult.monthly || compResult.first;

  // ─── 결과 렌더링 ───
  const dash = document.getElementById('mort-dash');
  const rateTypeLabel = { variable: '변동형', mixed: '혼합형', periodic: '주기형', fixed: '순수고정형' };

  // 희망금액 기준 비율 (참고용)
  const reqDti = income > 0 ? (unitAnnual + existInterest + existPrincipal) / income * 100 : 0;
  const reqDsr = reqDti; // 같은 분모/분자 구조
  const reqStressDsr = income > 0 ? (calcAnnualRepay(loanAmount, stressRate, months, method) + existInterest + existPrincipal) / income * 100 : 0;

  dash.innerHTML = `
    <div class="dash-card">
      <div class="dash-card__label">LTV</div>
      <div class="dash-card__percent">${ltvRate}%</div>
      <div class="dash-card__sub">한도 ${fmtShort(Math.max(0, ltvLimit))}</div>
    </div>
    <div class="dash-card">
      <div class="dash-card__label">DTI ${isLimited ? '<small>(가능한도 기준)</small>' : ''}</div>
      <div class="dash-card__percent">${isLimited ? compDti.toFixed(1) : reqDti.toFixed(1)}%</div>
      <div class="dash-card__sub">한도 ${fmtShort(Math.max(0, dtiLimit))}${isLimited && reqDti > dtiCap ? ' <span style="color:var(--red)">초과</span>' : ''}</div>
    </div>
    <div class="dash-card">
      <div class="dash-card__label">DSR ${isLimited ? '<small>(가능한도 기준)</small>' : ''}</div>
      <div class="dash-card__percent">${isLimited ? compDsr.toFixed(1) : reqDsr.toFixed(1)}%</div>
      <div class="dash-card__sub">한도 ${fmtShort(Math.max(0, dsrLimit))}${isLimited && reqDsr > dsrCap ? ' <span style="color:var(--red)">초과</span>' : ''}</div>
    </div>
    <div class="dash-card dash-card--stress">
      <div class="dash-card__label">스트레스 DSR</div>
      <div class="dash-card__percent">${isLimited ? compStressDsr.toFixed(1) : reqStressDsr.toFixed(1)}%</div>
      <div class="dash-card__sub">${rateTypeLabel[rateType]} +${actualAdded.toFixed(1)}%p</div>
    </div>
  `;

  const comp = document.getElementById('mort-comp-limit');
  if (isLimited) {
    comp.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="text-align:center;flex:1">
          <div style="font-size:10px;opacity:0.8">희망 대출금액</div>
          <div style="font-size:18px;font-weight:700;text-decoration:line-through;opacity:0.5">${fmtShort(loanAmount)}</div>
        </div>
        <div style="font-size:18px;opacity:0.5">→</div>
        <div style="text-align:center;flex:1">
          <div style="font-size:10px;opacity:0.8">가능 한도</div>
          <div style="font-size:22px;font-weight:800">${fmtShort(compLimit)}</div>
        </div>
      </div>
      <div class="comp-limit__detail">
        ${minLimit.name} 기준 제한${absLimit < Infinity ? ' · 절대한도 ' + absLimitText + ' 이내' : ''}<br>
        월 상환액: ${fmt(compMonthly)}
      </div>
    `;
  } else {
    comp.innerHTML = `
      <div class="comp-limit__label">종합 대출 가능 한도</div>
      <div class="comp-limit__value">${fmtShort(compLimit)}</div>
      <div class="comp-limit__detail">
        희망 금액 전액 가능 · 모든 규제 충족<br>
        월 상환액: ${fmt(compMonthly)}
      </div>
    `;
  }

  document.getElementById('mort-result').style.display = '';
  addRecentCalc('mortgage', '종합 ' + fmtShort(compLimit));
}

function fmtShort(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '억원';
  if (n >= 10000) return (n / 10000).toFixed(0) + '만원';
  return fmt(n);
}

// ══════════════════════════════════════════════════════
// EASTER EGG — 로고 더블클릭
// ══════════════════════════════════════════════════════
document.getElementById('titleLogo').addEventListener('dblclick', () => {
  showToast('v1.1.0 · Made by 손우창, 안종환 · 2026-04-09');
});

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════
(function init() {
  loadPolicy();
  loadFavorites();
  loadTheme();
  applyCustomFont();
  syncPolicyToForms();
  reorderTabs();
  renderMegaMenu();

  // Set today as default for date inputs
  const today = new Date().toISOString().split('T')[0];
  const loanDate = document.getElementById('pre-loan-date');
  const repayDate = document.getElementById('pre-repay-date');
  if (loanDate) loanDate.value = today;
  if (repayDate) repayDate.value = today;

  // ══════════════════════════════════════════════════════
  // BASIC CALCULATOR
  // ══════════════════════════════════════════════════════
  const calcState = {
    current: '0',
    prev: null,
    op: null,
    resetNext: false,
    memory: 0
  };

  function calcUpdate() {
    const valEl = document.getElementById('calc-value');
    const exprEl = document.getElementById('calc-expr');
    const memEl = document.getElementById('calc-memory');
    if (!valEl) return;

    // 숫자 포맷
    let display = calcState.current;
    if (display !== '' && display !== '-' && !isNaN(Number(display))) {
      const parts = display.split('.');
      parts[0] = Number(parts[0]).toLocaleString('ko-KR');
      display = parts.join('.');
    }
    valEl.textContent = display || '0';

    // 수식 표시
    if (calcState.prev !== null && calcState.op) {
      const prevFmt = Number(calcState.prev).toLocaleString('ko-KR');
      exprEl.textContent = prevFmt + ' ' + calcState.op;
    } else {
      exprEl.innerHTML = '&nbsp;';
    }

    // 메모리 표시
    memEl.textContent = calcState.memory !== 0 ? 'M: ' + calcState.memory.toLocaleString('ko-KR') : '';
  }

  function calcExecute() {
    if (calcState.prev === null || !calcState.op) return;
    const a = parseFloat(calcState.prev);
    const b = parseFloat(calcState.current);
    let result;
    switch (calcState.op) {
      case '+': result = a + b; break;
      case '-': result = a - b; break;
      case '×': result = a * b; break;
      case '÷': result = b === 0 ? 'Error' : a / b; break;
      default: return;
    }
    if (typeof result === 'number') {
      // 부동소수점 보정
      result = Math.round(result * 1e10) / 1e10;
    }
    calcState.current = String(result);
    calcState.prev = null;
    calcState.op = null;
    calcState.resetNext = true;
    calcUpdate();
  }

  function calcInput(key) {
    if (/^[0-9]$/.test(key)) {
      if (calcState.current === '0' || calcState.resetNext) {
        calcState.current = key;
        calcState.resetNext = false;
      } else {
        calcState.current += key;
      }
    } else if (key === '00') {
      if (calcState.resetNext) { calcState.current = '0'; calcState.resetNext = false; }
      if (calcState.current !== '0') calcState.current += '00';
    } else if (key === '.') {
      if (calcState.resetNext) { calcState.current = '0'; calcState.resetNext = false; }
      if (!calcState.current.includes('.')) calcState.current += '.';
    } else if (key === '±') {
      if (calcState.current !== '0' && calcState.current !== '') {
        calcState.current = calcState.current.startsWith('-')
          ? calcState.current.slice(1) : '-' + calcState.current;
      }
    } else if (['+', '-', '×', '÷'].includes(key)) {
      if (calcState.prev !== null && !calcState.resetNext) {
        calcExecute();
      }
      calcState.prev = calcState.current;
      calcState.op = key;
      calcState.resetNext = true;
    } else if (key === '=') {
      calcExecute();
    } else if (key === 'C') {
      calcState.current = '0';
      calcState.prev = null;
      calcState.op = null;
      calcState.resetNext = false;
    } else if (key === 'CE') {
      calcState.current = '0';
    } else if (key === 'back') {
      if (!calcState.resetNext) {
        calcState.current = calcState.current.slice(0, -1) || '0';
      }
    } else if (key === 'M+') {
      calcState.memory += parseFloat(calcState.current) || 0;
    } else if (key === 'M-') {
      calcState.memory -= parseFloat(calcState.current) || 0;
    } else if (key === 'MR') {
      calcState.current = String(calcState.memory);
      calcState.resetNext = true;
    } else if (key === 'MC') {
      calcState.memory = 0;
    }
    calcUpdate();
  }

  // 버튼 클릭
  document.querySelector('.calc-grid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.calc-btn');
    if (btn) calcInput(btn.dataset.calc);
  });

  // 키보드 입력 (계산기 탭 활성 시)
  document.addEventListener('keydown', (e) => {
    const calcPanel = document.getElementById('panel-calc');
    if (!calcPanel || !calcPanel.classList.contains('active')) return;
    // 다른 입력 필드에 포커스 있으면 무시
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const keyMap = {
      '0':'0','1':'1','2':'2','3':'3','4':'4','5':'5','6':'6','7':'7','8':'8','9':'9',
      '.':'00','+':'+','-':'-','*':'×','/':'÷',
      'Enter':'=','=':'=',
      'Escape':'C','Delete':'CE','Backspace':'back'
    };
    const mapped = keyMap[e.key];
    if (mapped) {
      e.preventDefault();
      calcInput(mapped);
    }
  });

  // 계산기 결과 저장
  window.saveCalcResult = function() {
    const val = calcState.current;
    if (!val || val === '0') return showToast('저장할 계산 결과가 없습니다.');
    const display = Number(val).toLocaleString('ko-KR');
    addRecentCalc('calc', display);
    showToast('계산 결과가 저장되었습니다.');
  };

  // ══════════════════════════════════════════════════════
  // TODO LIST
  // ══════════════════════════════════════════════════════
  let todos = [];

  function loadTodos() {
    try {
      const saved = localStorage.getItem('bnk_todos');
      if (saved) todos = JSON.parse(saved);
    } catch (e) { /* ignore */ }
  }

  function saveTodos() {
    localStorage.setItem('bnk_todos', JSON.stringify(todos));
  }

  function renderTodos() {
    const list = document.getElementById('todo-list');
    const clearBtn = document.getElementById('todoClearDone');
    if (!list) return;

    if (todos.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="empty-state__icon">✅</div><div class="empty-state__text">할일이 없습니다</div></div>';
      if (clearBtn) clearBtn.style.display = 'none';
      return;
    }

    const hasDone = todos.some(t => t.done);
    if (clearBtn) clearBtn.style.display = hasDone ? '' : 'none';

    list.innerHTML = todos.map((t, i) => `
      <div class="todo-item ${t.done ? 'todo-item--done' : ''}" data-idx="${i}">
        <input type="checkbox" class="todo-item__check" ${t.done ? 'checked' : ''} data-todo-toggle="${i}">
        <span class="todo-item__text">${t.text}</span>
        <button class="todo-item__delete" data-todo-del="${i}" title="삭제">×</button>
      </div>
    `).join('');
  }

  function addTodo() {
    const input = document.getElementById('todo-input');
    const text = input.value.trim();
    if (!text) return;
    todos.push({ text, done: false, ts: Date.now() });
    input.value = '';
    saveTodos();
    renderTodos();
  }

  // 추가 버튼
  document.getElementById('todoAddBtn')?.addEventListener('click', addTodo);

  // Enter키로 추가
  document.getElementById('todo-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTodo();
  });

  // 체크/삭제 이벤트
  document.getElementById('todo-list')?.addEventListener('click', (e) => {
    const toggleIdx = e.target.dataset.todoToggle;
    if (toggleIdx !== undefined) {
      todos[toggleIdx].done = e.target.checked;
      saveTodos();
      renderTodos();
      return;
    }
    const delIdx = e.target.dataset.todoDel;
    if (delIdx !== undefined) {
      todos.splice(delIdx, 1);
      saveTodos();
      renderTodos();
    }
  });

  // 완료 항목 일괄 삭제
  document.getElementById('todoClearDone')?.addEventListener('click', () => {
    todos = todos.filter(t => !t.done);
    saveTodos();
    renderTodos();
  });

  loadTodos();
  renderTodos();

})();
