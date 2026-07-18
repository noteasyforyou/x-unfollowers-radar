/**
 * X Unfollowers Radar (Chrome Console Edition)
 * 极速版 V4.8 - 专为 Chrome 控制台 (F12) 或 Snippets 设计
 * 无需油猴插件，直接粘贴到 Console 运行即可，或保存在 Chrome 的 Snippets 中。
 */

(function() {
    'use strict';

    // 判断当前推特页面语言是否为中文
    const isChinese = document.documentElement.lang.startsWith('zh');
    const i18n = {
        badgeText: isChinese ? '💔 未回关' : '💔 Not following back',
        radarTitle: isChinese ? '[雷达 4.8 控制台版]' : '[Radar 4.8 Console]',
        scanning: isChinese ? '极速扫描中...' : 'Scanning...',
        found: isChinese ? '💔页面发现未回关' : '💔 Unfollowers found',
        runningMsg: isChinese ? '%c[雷达提示] 脚本已经在运行中啦！' : '%c[Radar] Script is already running!',
        startMsg: isChinese ? '%c🚀 [X Unfollowers Radar] V4.8 已启动！前往 Following 列表向下滚动即可查看高亮！' : '%c🚀 [X Unfollowers Radar] V4.8 Started! Scroll down your Following list to see highlights!'
    };

    if (window._xRadarRunning) {
        console.log(i18n.runningMsg, "color: #f91880; font-size: 14px;");
        return;
    }
    window._xRadarRunning = true;

    console.log(i18n.startMsg, "color: #00ba7c; font-size: 14px; font-weight: bold;");

    const followsYouTexts = new Set([
        'follows you', '关注了你', '關注了你', '跟你互相追隨', '追隨了你',
        'フォローされています', '나를 팔로우합니다', 'te sigue', 'vous suit',
        'folgt dir', 'segue você', 'ti segue', 'твиттер читает вас', 'يتابعك'
    ]);

    const IGNORED_USERNAMES = new Set([
        'search', 'explore', 'notifications', 'messages', 'home', 'settings', 'i'
    ]);

    const unfollowersSet = new Set();
    let lastUnfCount = -1;
    let statsPanel = null;

    function updateStats() {
        if (!document.body) return;
        const unfCount = unfollowersSet.size;
        
        if (unfCount === lastUnfCount && statsPanel) return; 
        lastUnfCount = unfCount;

        if (!statsPanel) {
            statsPanel = document.createElement('div');
            statsPanel.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 999999; background: rgba(0,0,0,0.8); color: #fff; padding: 10px 15px; border-radius: 8px; font-size: 13px; font-family: monospace; pointer-events: none; border: 1px solid #333; transition: all 0.2s;';
            document.body.appendChild(statsPanel);
        }
        statsPanel.innerHTML = `${i18n.radarTitle} ${i18n.scanning} <br> ${i18n.found}: ${unfCount}`;
    }

    function appendBadge(cell, username, badge) {
        const textDivs = cell.querySelectorAll('span');
        let inserted = false;
        for (let t of textDivs) {
            if (t.textContent.toLowerCase() === '@' + username) {
                if (t.parentElement) {
                    t.parentElement.appendChild(badge);
                    inserted = true;
                }
                break;
            }
        }
        if (!inserted) cell.appendChild(badge);
    }

    function scanDOM() {
        if (!window.location.pathname.endsWith('/following')) {
            if (statsPanel) statsPanel.style.display = 'none';
            return;
        } else {
            if (statsPanel) statsPanel.style.display = 'block';
        }

        document.querySelectorAll('[data-testid="UserCell"]').forEach(cell => {
            const link = cell.querySelector('a[href^="/"]');
            if (!link) return;
            
            const parts = link.getAttribute('href').split('/');
            if (parts.length < 2 || !parts[1]) return;
            
            const username = parts[1].toLowerCase();
            
            if (IGNORED_USERNAMES.has(username)) return;

            const followBtn = cell.querySelector('[data-testid$="-unfollow"]');
            const isFollowing = !!followBtn;

            let isFollowedBy = false;
            const tags = cell.querySelectorAll('div, span');
            for (let tag of tags) {
                const text = tag.textContent.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
                if (followsYouTexts.has(text)) {
                    isFollowedBy = true;
                    break;
                }
            }

            const cacheKey = `${username}_${isFollowing}_${isFollowedBy}`;
            if (cell.dataset.radarScanned === cacheKey) return;

            const oldBadge = cell.querySelector('.x-radar-badge-cell');
            if (oldBadge) oldBadge.remove();
            cell.style.border = '';
            cell.style.backgroundColor = '';
            cell.style.borderRadius = '';

            cell.dataset.radarScanned = cacheKey;

            if (!isFollowing || isFollowedBy) {
                unfollowersSet.delete(username);
                return;
            }

            unfollowersSet.add(username);
            cell.style.border = '2px dashed #f91880';
            cell.style.backgroundColor = 'rgba(249, 24, 128, 0.04)';
            cell.style.borderRadius = '16px';
            
            const badge = document.createElement('div');
            badge.className = 'x-radar-badge-cell';
            badge.innerText = i18n.badgeText;
            badge.style.cssText = 'color: #f91880; font-size: 13px; font-weight: bold; padding: 2px 8px; border: 1px solid #f91880; border-radius: 999px; margin-left: 8px; display: inline-flex; background: white; z-index: 99;';
            appendBadge(cell, username, badge);
        });
        
        updateStats();
    }

    setInterval(scanDOM, 500);

})();
