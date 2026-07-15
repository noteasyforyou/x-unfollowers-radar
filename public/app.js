/* ============================================================
   X Unfollowers Radar — Client-side Application Logic
   ============================================================ */

(function () {
  'use strict';

  // ----------------------------------------------------------------
  // Constants
  // ----------------------------------------------------------------

  const STORAGE_KEY = 'x-unfollowers-radar-history';
  const DEFAULT_AVATAR =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E" +
    "%3Ccircle cx='24' cy='24' r='24' fill='%231d9bf0'/%3E" +
    "%3Ctext x='24' y='30' text-anchor='middle' fill='white' font-size='20'%3E%3F%3C/text%3E%3C/svg%3E";

  const ERROR_MESSAGES = {
    auth_denied: '授权已取消',
    invalid_state: '登录状态异常，请重试',
    token_exchange: '登录失败，请重试',
    user_fetch: '获取用户信息失败',
    server_error: '服务器错误，请稍后重试',
  };

  const EMPTY_MESSAGES = {
    'not-following-back': '🎉 太棒了！所有你关注的人都回关了你',
    fans: '你已经回关了所有粉丝',
    mutual: '暂无互相关注的用户',
  };

  // ----------------------------------------------------------------
  // State
  // ----------------------------------------------------------------

  let currentUser = null;
  let processedData = null;
  let currentTab = 'not-following-back';
  let isArchiveMode = false;

  // ----------------------------------------------------------------
  // DOM References
  // ----------------------------------------------------------------

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ----------------------------------------------------------------
  // View Management
  // ----------------------------------------------------------------

  /** Switch the visible view by element ID. */
  function switchView(viewId) {
    $$('.view').forEach((v) => v.classList.remove('active'));
    const target = $(`#${viewId}`);
    if (target) target.classList.add('active');
  }

  // ----------------------------------------------------------------
  // Error Handling
  // ----------------------------------------------------------------

  /** Display an error banner at the bottom of the screen. */
  function showError(message) {
    const banner = $('#error-banner');
    const msgEl = $('#error-message');
    msgEl.textContent = message;
    banner.hidden = false;
  }

  /** Hide the error banner. */
  function hideError() {
    $('#error-banner').hidden = true;
  }

  // ----------------------------------------------------------------
  // Authentication
  // ----------------------------------------------------------------

  /** Check if user is currently authenticated via the backend session. */
  async function checkAuthStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      return data;
    } catch {
      return { authenticated: false };
    }
  }

  // ----------------------------------------------------------------
  // Scanning (API mode)
  // ----------------------------------------------------------------

  /** Start the scan process — switch to scanning view and fetch data. */
  async function startScan() {
    switchView('scanning-view');
    updateScanStatus('正在连接 X 平台...');
    animateProgress(20);

    try {
      updateScanStatus('正在获取关注列表和粉丝列表...');
      animateProgress(50);

      const res = await fetch('/api/scan');

      if (res.status === 401) {
        showError('登录已过期，请重新登录');
        switchView('landing-view');
        return;
      }

      if (res.status === 429) {
        const data = await res.json();
        const retryAfter = data.retryAfter
          ? new Date(data.retryAfter * 1000).toLocaleTimeString()
          : '几分钟后';
        showError(`请求过于频繁，请在 ${retryAfter} 后重试`);
        switchView('landing-view');
        return;
      }

      if (!res.ok) {
        throw new Error('Scan failed');
      }

      animateProgress(80);
      updateScanStatus('正在分析数据...');

      const scanResult = await res.json();
      animateProgress(100);

      // Small delay for visual feedback
      await delay(400);

      processData(scanResult);
      switchView('dashboard-view');
    } catch (err) {
      console.error('Scan error:', err);
      showError('扫描失败，请稍后重试');
      switchView('landing-view');
    }
  }

  /** Update the scanning status text. */
  function updateScanStatus(text) {
    $('#scan-status').textContent = text;
  }

  /** Animate the progress bar to a given percentage. */
  function animateProgress(percent) {
    $('#scan-progress').style.width = `${percent}%`;
  }

  // ----------------------------------------------------------------
  // Data Processing
  // ----------------------------------------------------------------

  /**
   * Process raw scan result into categorized user lists.
   * @param {{ user: object, following: object[], followers: object[] }} result
   */
  function processData(result) {
    currentUser = result.user;

    const followingMap = new Map();
    const followersSet = new Set();

    result.following.forEach((u) => followingMap.set(u.username || u.id, u));
    result.followers.forEach((u) => followersSet.add(u.username || u.id));

    const followersMap = new Map();
    result.followers.forEach((u) => followersMap.set(u.username || u.id, u));

    const mutual = [];
    const notFollowingBack = [];
    const fans = [];

    // Users I follow: split into mutual vs not-following-back
    for (const [key, user] of followingMap) {
      if (followersSet.has(key)) {
        mutual.push(user);
      } else {
        notFollowingBack.push(user);
      }
    }

    // Users who follow me but I don't follow back
    for (const [key, user] of followersMap) {
      if (!followingMap.has(key)) {
        fans.push(user);
      }
    }

    processedData = {
      following: result.following,
      followers: result.followers,
      mutual,
      notFollowingBack,
      fans,
    };

    // Compare with history
    const history = loadHistory();
    let historyComparison = null;
    if (history) {
      historyComparison = compareWithHistory(processedData, history);
    }

    // Save current scan to history
    saveToHistory(processedData);

    // Render dashboard
    renderDashboard(historyComparison);
  }

  // ----------------------------------------------------------------
  // Dashboard Rendering
  // ----------------------------------------------------------------

  /** Render the full dashboard with stats, history, and user list. */
  function renderDashboard(historyComparison) {
    // User info
    if (currentUser) {
      const avatarUrl = currentUser.profile_image_url || DEFAULT_AVATAR;
      $('#user-avatar').src = avatarUrl;
      $('#user-avatar').onerror = function () {
        this.src = DEFAULT_AVATAR;
      };
      $('#user-name').textContent = `@${currentUser.username || currentUser.name || ''}`;
    }

    // Animate stat counters
    animateCounter($('#stat-following'), processedData.following.length);
    animateCounter($('#stat-followers'), processedData.followers.length);
    animateCounter($('#stat-mutual'), processedData.mutual.length);
    animateCounter($('#stat-not-following-back'), processedData.notFollowingBack.length);
    animateCounter($('#stat-fans'), processedData.fans.length);

    // History comparison banner
    if (historyComparison && historyComparison.newUnfollowers.length > 0) {
      const banner = $('#history-banner');
      const msg = $('#history-message');
      const date = new Date(historyComparison.lastScanDate).toLocaleDateString('zh-CN');
      msg.textContent =
        `自上次扫描（${date}）以来，${historyComparison.newUnfollowers.length} 人取关了你`;
      banner.hidden = false;
    }

    // Render default tab
    currentTab = 'not-following-back';
    setActiveTab(currentTab);
    renderUserList(processedData.notFollowingBack, currentTab, historyComparison);
  }

  // ----------------------------------------------------------------
  // Animated Counter
  // ----------------------------------------------------------------

  /**
   * Smoothly animate a number from 0 to target.
   * @param {HTMLElement} element - The element to update.
   * @param {number} target - Target value.
   * @param {number} [duration=800] - Animation duration in ms.
   */
  function animateCounter(element, target, duration = 800) {
    if (!element) return;
    if (target === 0) {
      element.textContent = '0';
      return;
    }

    const startTime = performance.now();

    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      element.textContent = Math.floor(eased * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
  }

  // ----------------------------------------------------------------
  // User List Rendering
  // ----------------------------------------------------------------

  /**
   * Render a list of user cards.
   * @param {object[]} users - Array of user objects.
   * @param {string} type - Tab type for empty state message.
   * @param {object|null} historyComparison - History comparison data.
   */
  function renderUserList(users, type, historyComparison = null) {
    const container = $('#user-list');
    const emptyState = $('#empty-state');
    const listCount = $('#list-count');

    container.innerHTML = '';

    if (users.length === 0) {
      emptyState.hidden = false;
      emptyState.querySelector('.empty-text').textContent =
        EMPTY_MESSAGES[type] || '列表为空';
      listCount.textContent = '';
      return;
    }

    emptyState.hidden = true;
    listCount.textContent = `共 ${users.length} 人`;

    const fragment = document.createDocumentFragment();

    users.forEach((user, index) => {
      const card = document.createElement('div');
      card.className = 'user-card';
      card.style.setProperty('--i', index);
      card.style.animationDelay = `${Math.min(index * 0.03, 0.6)}s`;

      // Check if this user is a "new unfollower" from history comparison
      const isNew =
        historyComparison &&
        type === 'not-following-back' &&
        historyComparison.newUnfollowers.includes(user.username || user.id);

      if (isNew) card.classList.add('is-new');

      const avatarUrl = user.profile_image_url || DEFAULT_AVATAR;
      const displayName = escapeHtml(user.name || user.username || user.id);
      const username = user.username || user.id;
      const profileUrl = user.username
        ? `https://x.com/${user.username}`
        : `https://x.com/intent/user?user_id=${user.id}`;

      card.innerHTML = `
        <img class="user-avatar" src="${avatarUrl}" alt="" 
             onerror="this.src='${DEFAULT_AVATAR}'" loading="lazy" />
        <div class="user-details">
          <div class="user-name">${displayName}</div>
          <div class="user-username">@${escapeHtml(username)}</div>
        </div>
        <a class="btn btn-outline btn-sm user-link" 
           href="${profileUrl}" target="_blank" rel="noopener noreferrer">查看主页</a>
      `;

      fragment.appendChild(card);
    });

    container.appendChild(fragment);
  }

  // ----------------------------------------------------------------
  // Tab Switching
  // ----------------------------------------------------------------

  /** Set the active tab visually. */
  function setActiveTab(tabName) {
    $$('.tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });
  }

  /** Get the user list for a given tab. */
  function getUsersForTab(tabName) {
    if (!processedData) return [];
    switch (tabName) {
      case 'not-following-back':
        return processedData.notFollowingBack;
      case 'fans':
        return processedData.fans;
      case 'mutual':
        return processedData.mutual;
      default:
        return [];
    }
  }

  // ----------------------------------------------------------------
  // Search
  // ----------------------------------------------------------------

  /** Filter users by search query (name or username, case-insensitive). */
  function filterUsers(users, query) {
    if (!query) return users;
    const q = query.toLowerCase().trim();
    return users.filter(
      (u) =>
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.username && u.username.toLowerCase().includes(q)) ||
        (u.id && u.id.toLowerCase().includes(q)),
    );
  }

  // ----------------------------------------------------------------
  // CSV Export
  // ----------------------------------------------------------------

  /** Export the current tab's user list as a CSV file. */
  function exportCSV() {
    const users = getUsersForTab(currentTab);
    if (users.length === 0) return;

    const BOM = '\uFEFF';
    const header = 'Name,Username,Profile URL\n';
    const rows = users
      .map((u) => {
        const name = csvEscape(u.name || u.id);
        const username = csvEscape(u.username || u.id);
        const url = u.username
          ? `https://x.com/${u.username}`
          : `https://x.com/intent/user?user_id=${u.id}`;
        return `${name},${username},${url}`;
      })
      .join('\n');

    const blob = new Blob([BOM + header + rows], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `x-unfollowers-${currentTab}-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ----------------------------------------------------------------
  // Archive Upload (ZIP Parsing)
  // ----------------------------------------------------------------

  /**
   * Parse an X data archive ZIP file and extract following/follower data.
   * @param {File} file - The ZIP file.
   */
  async function handleArchiveUpload(file) {
    if (!file || !file.name.endsWith('.zip')) {
      showError('请上传 .zip 格式的 X 数据归档文件');
      return;
    }

    if (typeof JSZip === 'undefined') {
      showError('JSZip 库未加载，请检查网络连接后刷新页面');
      return;
    }

    switchView('scanning-view');
    updateScanStatus('正在解析归档文件...');
    animateProgress(20);
    isArchiveMode = true;

    try {
      const zip = await JSZip.loadAsync(file);
      animateProgress(40);

      // Find following and follower files
      const followingFile = findFileInZip(zip, 'following.js');
      const followerFile = findFileInZip(zip, 'follower.js');

      if (!followingFile && !followerFile) {
        throw new Error(
          '未在归档中找到 following.js 或 follower.js 文件。请确保上传的是 X 官方数据归档。',
        );
      }

      updateScanStatus('正在提取关注和粉丝数据...');
      animateProgress(60);

      const following = followingFile
        ? await parseArchiveFile(followingFile, 'following')
        : [];
      const followers = followerFile
        ? await parseArchiveFile(followerFile, 'follower')
        : [];

      animateProgress(100);
      await delay(300);

      // Create a mock user for archive mode
      const archiveUser = {
        id: 'archive',
        name: '归档模式',
        username: 'archive_user',
        profile_image_url: null,
      };

      processData({ user: archiveUser, following, followers });
      switchView('dashboard-view');
    } catch (err) {
      console.error('Archive parse error:', err);
      showError(err.message || '解析归档文件失败');
      switchView('landing-view');
    }
  }

  /**
   * Find a file in the ZIP by partial name match.
   * @param {JSZip} zip - The ZIP archive.
   * @param {string} filename - The filename to search for.
   * @returns {JSZip.JSZipObject|null}
   */
  function findFileInZip(zip, filename) {
    const matchingPaths = Object.keys(zip.files).filter(
      (path) => path.endsWith(filename) && !zip.files[path].dir,
    );
    return matchingPaths.length > 0 ? zip.files[matchingPaths[0]] : null;
  }

  /**
   * Parse an X archive JS file and extract user data.
   * Files contain: window.YTD.{type}.part0 = [...]
   * @param {JSZip.JSZipObject} zipEntry - The ZIP file entry.
   * @param {string} type - 'following' or 'follower'.
   * @returns {Promise<object[]>}
   */
  async function parseArchiveFile(zipEntry, type) {
    const text = await zipEntry.async('string');

    // Remove the variable assignment prefix: window.YTD.xxx.part0 =
    const jsonStart = text.indexOf('[');
    if (jsonStart === -1) return [];

    const jsonStr = text.slice(jsonStart);
    const data = JSON.parse(jsonStr);

    return data.map((entry) => {
      const item = entry[type] || entry;
      const accountId = item.accountId || 'unknown';
      return {
        id: accountId,
        name: `User ${accountId}`,
        username: accountId,
        profile_image_url: null,
      };
    });
  }

  // ----------------------------------------------------------------
  // History (LocalStorage)
  // ----------------------------------------------------------------

  /** Save the current scan results to localStorage. */
  function saveToHistory(data) {
    try {
      const historyEntry = {
        timestamp: Date.now(),
        following: data.following.map((u) => u.username || u.id),
        followers: data.followers.map((u) => u.username || u.id),
        mutual: data.mutual.map((u) => u.username || u.id),
        notFollowingBack: data.notFollowingBack.map((u) => u.username || u.id),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(historyEntry));
    } catch {
      // localStorage might be full or unavailable; silently ignore
    }
  }

  /** Load previous scan results from localStorage. */
  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /**
   * Compare current scan with previous history.
   * @param {object} current - Current processed data.
   * @param {object} history - Previous saved history.
   * @returns {{ newUnfollowers: string[], reFollowed: string[], lastScanDate: number }}
   */
  function compareWithHistory(current, history) {
    const prevMutualSet = new Set(history.mutual || []);
    const currentNotFollowingBack = new Set(
      current.notFollowingBack.map((u) => u.username || u.id),
    );

    // People who were mutual last time but are now in notFollowingBack → new unfollowers
    const newUnfollowers = [];
    for (const username of prevMutualSet) {
      if (currentNotFollowingBack.has(username)) {
        newUnfollowers.push(username);
      }
    }

    // People who were in notFollowingBack last time but are now mutual → re-followed
    const prevNotFollowingBack = new Set(history.notFollowingBack || []);
    const currentMutualSet = new Set(
      current.mutual.map((u) => u.username || u.id),
    );
    const reFollowed = [];
    for (const username of prevNotFollowingBack) {
      if (currentMutualSet.has(username)) {
        reFollowed.push(username);
      }
    }

    return {
      newUnfollowers,
      reFollowed,
      lastScanDate: history.timestamp,
    };
  }

  // ----------------------------------------------------------------
  // Utility Functions
  // ----------------------------------------------------------------

  /** HTML-escape a string to prevent XSS. */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /** Escape a value for CSV output. */
  function csvEscape(str) {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /** Promise-based delay. */
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ----------------------------------------------------------------
  // Event Listeners & Initialization
  // ----------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', async () => {
    // --- Check for URL error params ---
    const urlParams = new URLSearchParams(window.location.search);
    const errorCode = urlParams.get('error');
    if (errorCode) {
      showError(ERROR_MESSAGES[errorCode] || '发生未知错误');
      // Clean up URL
      window.history.replaceState({}, '', '/');
    }

    // --- Check authentication status ---
    const status = await checkAuthStatus();
    if (status.authenticated) {
      currentUser = status.user;
      // Auto-start scan if we have a session
      startScan();
    } else if (window.location.hash === '#dashboard') {
      // User was redirected here after OAuth but session expired
      showError('登录已过期，请重新登录');
      window.location.hash = '';
    }

    // --- Login button ---
    $('#login-btn').addEventListener('click', () => {
      window.location.href = '/auth/login';
    });

    // --- Logout button ---
    $('#logout-btn').addEventListener('click', () => {
      window.location.href = '/auth/logout';
    });

    // --- Rescan button ---
    const rescanBtn = $('#rescan-btn');
    if (rescanBtn) {
      rescanBtn.addEventListener('click', () => {
        if (isArchiveMode) {
          switchView('landing-view');
        } else {
          startScan();
        }
      });
    }

    // --- Error close ---
    $('#error-close').addEventListener('click', hideError);

    // --- Tab switching ---
    $$('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        currentTab = tab.dataset.tab;
        setActiveTab(currentTab);
        const query = $('#search-input').value;
        const users = filterUsers(getUsersForTab(currentTab), query);
        renderUserList(users, currentTab);
      });
    });

    // --- Search ---
    $('#search-input').addEventListener('input', (e) => {
      const query = e.target.value;
      const users = filterUsers(getUsersForTab(currentTab), query);
      renderUserList(users, currentTab);
    });

    // --- Export CSV ---
    $('#export-btn').addEventListener('click', exportCSV);

    // --- Archive upload: click ---
    const dropZone = $('#archive-drop-zone');
    const archiveInput = $('#archive-input');

    dropZone.addEventListener('click', () => archiveInput.click());

    archiveInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleArchiveUpload(file);
    });

    // --- Archive upload: drag & drop ---
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) handleArchiveUpload(file);
    });
  });
})();
