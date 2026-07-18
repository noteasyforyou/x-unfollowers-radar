// ==UserScript==
// @name         X Unfollowers Radar
// @namespace    http://tampermonkey.net/
// @version      4.7
// @description  完美版 - 极速单向关注高亮（解决异步渲染导致的假阳性误判，增强多语言与 DOM 容错）
// @author       You
// @match        *://x.com/*
// @match        *://twitter.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 全部转为小写，防备大小写变体
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
        
        if (unfCount === lastUnfCount && statsPanel) {
            return; 
        }
        
        lastUnfCount = unfCount;

        if (!statsPanel) {
            statsPanel = document.createElement('div');
            statsPanel.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 999999; background: rgba(0,0,0,0.8); color: #fff; padding: 10px 15px; border-radius: 8px; font-size: 13px; font-family: monospace; pointer-events: none; border: 1px solid #333; transition: all 0.2s;';
            document.body.appendChild(statsPanel);
        }
        statsPanel.innerHTML = `[雷达 4.7] 极速扫描中... <br> 💔页面发现未回关: ${unfCount}`;
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
            
            if (IGNORED_USERNAMES.has(username)) return;

            const followBtn = cell.querySelector('[data-testid$="-unfollow"]');
            const isFollowing = !!followBtn;

            // 动态判断回关状态，应对异步渲染和多语言变体
            let isFollowedBy = false;
            // 扩大搜索范围到 div 和 span
            const tags = cell.querySelectorAll('div, span');
            for (let tag of tags) {
                // 剔除不可见的零宽字符，并统一转为小写
                const text = tag.textContent.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
                if (followsYouTexts.has(text)) {
                    isFollowedBy = true;
                    break;
                }
            }

            // 动态联合缓存键：任意状态发生改变都会立即打破缓存，强制重绘纠错
            const cacheKey = `${username}_${isFollowing}_${isFollowedBy}`;
            if (cell.dataset.radarScanned === cacheKey) return;
            
            const oldBadge = cell.querySelector('.x-radar-badge-cell');
            if (oldBadge) oldBadge.remove();
            cell.style.border = '';
            cell.style.backgroundColor = '';
            cell.style.borderRadius = '';

            cell.dataset.radarScanned = cacheKey;

            // 如果已经取关，或者是互关状态，从列表中剔除并跳过
            if (!isFollowing || isFollowedBy) {
                unfollowersSet.delete(username);
                return;
            }

            // 确认为单向关注（未回关）
            unfollowersSet.add(username);
            cell.style.border = '2px dashed #f91880';
            cell.style.backgroundColor = 'rgba(249, 24, 128, 0.04)';
            cell.style.borderRadius = '16px';
            
            const badge = document.createElement('div');
            badge.className = 'x-radar-badge-cell';
            badge.innerText = '💔 未回关';
            badge.style.cssText = 'color: #f91880; font-size: 13px; font-weight: bold; padding: 2px 8px; border: 1px solid #f91880; border-radius: 999px; margin-left: 8px; display: inline-flex; background: white; z-index: 99;';
            appendBadge(cell, username, badge);
        });
        
        updateStats();
    }

    setInterval(scanDOM, 500);

})();
