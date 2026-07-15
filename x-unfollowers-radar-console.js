/**
 * X Unfollowers Radar (Chrome Console Edition)
 * 极速版 V4.6 - 专为 Chrome 控制台 (F12) 或 Snippets 设计
 * 无需油猴插件，直接粘贴到 Console 运行即可，或保存在 Chrome 的 Snippets 中。
 */

(function() {
    'use strict';

    // 防止重复执行
    if (window._xRadarRunning) {
        console.log("%c[雷达提示] 脚本已经在运行中啦！", "color: #f91880; font-size: 14px;");
        return;
    }
    window._xRadarRunning = true;

    console.log("%c🚀 [X Unfollowers Radar] V4.6 已启动！前往 Following 列表向下滚动即可查看高亮！", "color: #00ba7c; font-size: 14px; font-weight: bold;");

    const followsYouTexts = new Set([
        'Follows you', '关注了你', '關注了你', '跟你互相追隨', '追隨了你',
        'フォローされています', '나를 팔로우합니다', 'Te sigue', 'Vous suit',
        'Folgt dir', 'Segue você', 'Ti segue', 'Твиттер читает вас', 'يتابعك'
    ]);

    // 【优化】抽取出的全局忽略列表 O(1)
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
        statsPanel.innerHTML = `[雷达 4.6 控制台版] 极速扫描中... <br> 💔页面发现未回关: ${unfCount}`;
    }

    function appendBadge(cell, username, badge) {
        // 【优化】更精准的定位及防御性判空
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
        // 只在 Following 页面生效
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
            
            // 【优化】使用 Set 进行 O(1) 判断
            if (IGNORED_USERNAMES.has(username)) return;

            const followBtn = cell.querySelector('[data-testid$="-unfollow"]');
            const isFollowing = !!followBtn;

            // 【优化】联合键缓存：用户名 + 关注状态
            const cacheKey = `${username}_${isFollowing}`;
            if (cell.dataset.radarScanned === cacheKey) return;

            // 清除旧样式和徽章
            const oldBadge = cell.querySelector('.x-radar-badge-cell');
            if (oldBadge) oldBadge.remove();
            cell.style.border = '';
            cell.style.backgroundColor = '';
            cell.style.borderRadius = '';

            cell.dataset.radarScanned = cacheKey;

            // 如果当前已经不是“正在关注”状态，如果TA之前在未回关集合里，需要剔除并退出
            if (!isFollowing) {
                unfollowersSet.delete(username);
                return;
            }

            let isFollowedBy = false;
            const spans = cell.querySelectorAll('span');
            for (let span of spans) {
                if (followsYouTexts.has(span.textContent.trim())) {
                    isFollowedBy = true;
                    break;
                }
            }

            // 仅对未回关的人进行高亮，速度拉满
            if (!isFollowedBy) {
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

    // 500毫秒轮询，体验丝滑
    setInterval(scanDOM, 500);

})();
