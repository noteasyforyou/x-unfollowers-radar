// ==UserScript==
// @name         X Unfollowers Radar
// @namespace    http://tampermonkey.net/
// @version      4.5
// @description  无感内联高亮版 - 极速单向关注高亮（移除了互关高亮，速度更快，视觉更清爽）
// @author       You
// @match        *://x.com/*
// @match        *://twitter.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const followsYouTexts = new Set([
        'Follows you',
        '关注了你',
        '關注了你',
        '跟你互相追隨',
        '追隨了你',
        'フォローされています',
        '나를 팔로우합니다',
        'Te sigue',
        'Vous suit',
        'Folgt dir',
        'Segue você',
        'Ti segue',
        'Твиттер читает вас',
        'يتابعك'
    ]);

    const unfollowersSet = new Set();
    let lastUnfCount = -1;

    let statsPanel = null;
    function updateStats() {
        if (!document.body) return;
        
        const unfCount = unfollowersSet.size;
        
        if (unfCount === lastUnfCount && statsPanel) {
            return; 
        }
        
        lastUnfCount = unfCount;

        if (!statsPanel) {
            statsPanel = document.createElement('div');
            statsPanel.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 999999; background: rgba(0,0,0,0.8); color: #fff; padding: 10px 15px; border-radius: 8px; font-size: 13px; font-family: monospace; pointer-events: none; border: 1px solid #333; transition: all 0.2s;';
            document.body.appendChild(statsPanel);
        }
        statsPanel.innerHTML = `[雷达 4.5] 极速扫描中... <br> 💔页面发现未回关: ${unfCount}`;
    }

    function appendBadge(cell, username, badge) {
        const textDivs = cell.querySelectorAll('[dir="ltr"]');
        let inserted = false;
        for (let t of textDivs) {
            if (t.textContent.toLowerCase() === '@' + username) {
                t.parentElement.appendChild(badge);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            cell.appendChild(badge);
        }
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
            if (['search', 'explore', 'notifications', 'messages', 'home', 'settings', 'i'].includes(username)) return;

            if (cell.dataset.radarScanned === username) return;

            const oldBadge = cell.querySelector('.x-radar-badge-cell');
            if (oldBadge) oldBadge.remove();
            cell.style.border = '';
            cell.style.backgroundColor = '';
            cell.style.borderRadius = '';

            cell.dataset.radarScanned = username;

            const followBtn = cell.querySelector('[data-testid$="-unfollow"]');
            const isFollowing = !!followBtn;
            
            if (!isFollowing) return;

            let isFollowedBy = false;
            const spans = cell.querySelectorAll('span');
            for (let span of spans) {
                if (followsYouTexts.has(span.textContent.trim())) {
                    isFollowedBy = true;
                    break;
                }
            }

            // 仅对未回关的人进行高亮和 DOM 操作
            if (isFollowing && !isFollowedBy) {
                unfollowersSet.add(username);
                cell.style.border = '2px dashed #f91880';
                cell.style.backgroundColor = 'rgba(249, 24, 128, 0.04)';
                cell.style.borderRadius = '16px';
                
                const badge = document.createElement('div');
                badge.className = 'x-radar-badge-cell';
                badge.innerText = '💔 未回关';
                badge.style.cssText = 'color: #f91880; font-size: 13px; font-weight: bold; padding: 2px 8px; border: 1px solid #f91880; border-radius: 999px; margin-left: 8px; display: inline-flex; background: white; z-index: 99;';
                appendBadge(cell, username, badge);
            }
        });
        
        updateStats();
    }

    setInterval(scanDOM, 500);

})();
