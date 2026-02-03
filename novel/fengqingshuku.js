// ==UserScript==
// @name         灵翼小说下载器
// @namespace    https://github.com/yourname/novel-downloader
// @version      1.0.0
// @description  点击「开始下载」自动保存章节 → 按序号生成文件 → 自动翻页 → 支持多网站
// @author       AI Assistant
// @match        *://*/read-*.html
// @match        https://tw.hjwzw.com/Book/Read/*
// @grant        GM_download
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @icon         https://cdn-icons-png.flaticon.com/128/15141/15141893.png
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const scriptInfo = {
        name: GM_info?.script?.name || '小说下载器',
        icon: GM_info?.script?.icon || ''
    };

    // ================== ⚙️ 网站配置区 ==================
    const SITE_CONFIGS = {
        'site-default': {
            name: '通用模板',
            matchPatterns: [],
            TITLE_SELECTOR: '.chapter_title',
            CONTENT_SELECTOR: '.chapter_con p',
            NAV_SELECTOR: '.prev_next',
            NEXT_KEYWORD: '下一章',
            DELAY_MIN: 2500,
            DELAY_MAX: 4000,
            MAX_RETRY: 3,
            SHOW_TOAST: true
        },
        'site-fengqingshuku': {
            name: '风情书库',
            matchPatterns: ['*://*/read-*.html'],
            TITLE_SELECTOR: '.chapter_title',
            CONTENT_SELECTOR: '.chapter_con p',
            NAV_SELECTOR: '.prev_next',
            NEXT_KEYWORD: '下一章',
            DELAY_MIN: 2500,
            DELAY_MAX: 4000,
            MAX_RETRY: 3,
            SHOW_TOAST: true
        },
         'site-hjwzw': {
            name: '黄金书屋',
            matchPatterns: ['https://tw.hjwzw.com/Book/Read/*'],
            TITLE_SELECTOR: 'tbody h1',
            CONTENT_SELECTOR: 'tbody td div:nth-child(6) p',
            NAV_SELECTOR: 'body',
            NEXT_KEYWORD: '下一章',
            DELAY_MIN: 2500,
            DELAY_MAX: 4000,
            MAX_RETRY: 3,
            SHOW_TOAST: true
        }
    };

    // ================== 🛠️ 工具函数 ==================
    function matchUrlPattern(pattern, url) {
        if (!pattern) return false;
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(url);
    }

    function getCurrentSiteConfig() {
        const url = window.location.href;
        for (const [key, config] of Object.entries(SITE_CONFIGS)) {
            if (key === 'site-default') continue;
            if (config.matchPatterns && config.matchPatterns.length > 0) {
                for (const pattern of config.matchPatterns) {
                    if (matchUrlPattern(pattern, url)) {
                        return { ...SITE_CONFIGS['site-default'], ...config, siteKey: key };
                    }
                }
            }
        }
        return { ...SITE_CONFIGS['site-default'], siteKey: 'site-default' };
    }

    // ================== 🔑 状态存储 ==================
    function getStateKey(siteKey, key) {
        return `novel_downloader_${siteKey}_${key}`;
    }

    function getCurrentIndex(siteKey) {
        const indexKey = getStateKey(siteKey, 'chapter_index');
        return GM_getValue(indexKey, 1);
    }

    function setCurrentIndex(siteKey, index) {
        const indexKey = getStateKey(siteKey, 'chapter_index');
        GM_setValue(indexKey, index);
    }

    function incrementIndex(siteKey) {
        const newIndex = getCurrentIndex(siteKey) + 1;
        setCurrentIndex(siteKey, newIndex);
        return newIndex;
    }

    // ================== 🎨 控制面板 ==================
    function createControlPanel(currentIndex, siteConfig) {
        if (document.getElementById('novel-control-panel')) return;

        const iconHtml = scriptInfo.icon ? `<img src="${scriptInfo.icon}" style="width: 20px; height: 20px; margin-right: 6px;">` : '';
        const displayName = scriptInfo.name || '小说下载器';

        const panel = document.createElement('div');
        panel.id = 'novel-control-panel';
        panel.style.cssText = `
            position: fixed; left: 20px; top: 20px;
            background: rgba(30,30,40,0.95); color: white; border-radius: 16px;
            box-shadow: 0 6px 30px rgba(0,0,0,0.5);
            z-index: 2147483647 !important; font-family: 'Segoe UI', system-ui;
            width: 300px; border: 1px solid rgba(255,255,255,0.1);
        `;
        panel.innerHTML = `
            <div class="drag-handle" style="
                position: absolute; top: 0; left: 0; right: 0; height: 35px;
                cursor: grab; border-radius: 16px 16px 0 0; z-index: 10;
                display: flex; align-items: center; justify-content: center;
                background: linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%);
                border-bottom: 1px solid rgba(255,255,255,0.05);
            ">
                <div style="display: flex; gap: 4px;">
                    <div style="width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,0.3);"></div>
                    <div style="width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,0.3);"></div>
                    <div style="width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,0.3);"></div>
                </div>
            </div>
            <div style="
                position: relative; padding: 18px; padding-top: 45px;
            ">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
                    <div style="
                        width: 12px; height: 12px; border-radius: 50%;
                        background: #64748b;
                        animation: pulse 2s infinite;
                    " id="status-dot"></div>
                    <strong style="font-size: 15px; background: linear-gradient(90deg, #60a5fa, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                        ${iconHtml}${displayName}
                    </strong>
                </div>

                <div style="font-size:12px; color:#60a5fa; margin-bottom: 6px;">
                    📍 ${siteConfig.name}
                </div>

                <div style="font-size:13px; color:#94a3b8; margin: 6px 0; line-height: 1.5;">
                    <div>📌 序号: <span id="current-index" style="color:#f472b6; font-weight:bold; font-size:14px">${currentIndex}</span></div>
                    <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                        <input type="number" id="reset-index-input" value="${currentIndex}" min="1" style="
                            width: 70px; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(96,165,250,0.3);
                            background: rgba(30,30,40,0.8); color: #f472b6; font-weight:bold; font-size:13px;
                        ">
                        <button id="btn-reset" style="
                            padding: 4px 10px; border-radius: 6px; border: none;
                            background: linear-gradient(120deg, #8b5cf6, #7c3aed);
                            color: white; font-weight:bold; font-size:12px; cursor: pointer;
                        ">重置</button>
                    </div>
                    <div>章节: <span id="current-title" style="color:#cbd5e1; font-weight:500">-</span></div>
                    <div>状态: <span id="status-text" style="color:#64748b">⏳ 等待中</span></div>
                </div>

                <div style="display: flex; gap: 8px; margin-top: 10px">
                    <button id="btn-start" style="
                        flex:1; padding:10px; border-radius:10px; border:none;
                        background: linear-gradient(120deg, #3b82f6, #2563eb);
                        color:white; font-weight:bold; cursor:pointer; box-shadow: 0 2px 8px rgba(59,130,246,0.4);
                    ">▶️ 开始下载</button>
                    <button id="btn-merge" style="
                        flex:1; padding:10px; border-radius:10px; border:none;
                        background: linear-gradient(120deg, #10b981, #059669);
                        color:white; font-weight:bold; cursor:pointer;
                    ">📦 合并下载</button>
                    <button id="btn-stop" style="
                        flex:1; padding:10px; border-radius:10px; border:none;
                        background: linear-gradient(120deg, #ef4444, #dc2626);
                        color:white; font-weight:bold; cursor:pointer; display:none;
                    ">⏹️ 停止</button>
                </div>

                <div style="
                    margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.1);
                    font-size:11px; color:#64748b; text-align:center; line-height:1.4;
                ">
                    💡 文件名格式: <span style="color:#f472b6; font-weight:500">1##标题.txt</span><br>
                </div>

                <div style="
                    margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.1);
                    font-size:11px; color:#64748b; display: flex; align-items: center; justify-content: center; gap: 6px;
                ">
                    <span>⏱️ 初始化延迟:</span>
                    <input type="number" id="init-delay-input" value="500" min="0" max="10000" step="100" style="
                        width: 60px; padding: 3px 6px; border-radius: 4px; border: 1px solid rgba(96,165,250,0.3);
                        background: rgba(30,30,40,0.8); color: #60a5fa; font-size:11px; text-align: center;
                    ">
                    <span>ms</span>
                    <button id="btn-apply-delay" style="
                        padding: 3px 8px; border-radius: 4px; border: none;
                        background: linear-gradient(120deg, #6366f1, #4f46e5);
                        color: white; font-size:10px; cursor: pointer;
                    ">应用</button>
                </div>
            </div>
            <style>
                @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
                .drag-handle:hover { background: rgba(255,255,255,0.05); }
                #novel-control-panel button:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
                }
                #novel-control-panel button:active { transform: translateY(0); }
            </style>
        `;
        document.body.appendChild(panel);

        const savedPos = GM_getValue(getStateKey(siteConfig.siteKey, 'panel_pos'), null);
        if (savedPos) {
            panel.style.left = savedPos.left + 'px';
            panel.style.top = savedPos.top + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        }

        let isDragging = false;
        let startX, startY, startLeft, startTop;

        const dragHandle = panel.querySelector('.drag-handle');
        dragHandle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            dragHandle.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const newLeft = Math.max(0, startLeft + dx);
            const newTop = Math.max(0, startTop + dy);
            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            dragHandle.style.cursor = 'grab';
            const rect = panel.getBoundingClientRect();
            GM_setValue(getStateKey(siteConfig.siteKey, 'panel_pos'), {
                left: rect.left,
                top: rect.top
            });
        });

        panel.querySelector('#btn-start').onclick = () => {
            GM_setValue(getStateKey(siteConfig.siteKey, 'active'), true);
            GM_deleteValue(getStateKey(siteConfig.siteKey, 'paused'));
            startDownloadFlow(siteConfig);
        };
        panel.querySelector('#btn-merge').onclick = () => {
            GM_setValue(getStateKey(siteConfig.siteKey, 'active'), true);
            GM_deleteValue(getStateKey(siteConfig.siteKey, 'paused'));
            startMergeDownloadFlow(siteConfig);
        };
        panel.querySelector('#btn-stop').onclick = () => stopDownloadFlow(siteConfig);
        let lastResetIndex = currentIndex;
        panel.querySelector('#btn-reset').onclick = () => {
            const input = panel.querySelector('#reset-index-input');
            const newIndex = parseInt(input.value) || 1;
            const validIndex = newIndex < 1 ? 1 : newIndex;
            if (validIndex !== lastResetIndex) {
                lastResetIndex = validIndex;
                input.value = validIndex;
                resetIndex(validIndex);
            }
        };
        panel.querySelector('#reset-index-input').onchange = () => {
            const input = panel.querySelector('#reset-index-input');
            let val = parseInt(input.value) || 1;
            if (val < 1) val = 1;
            if (val !== lastResetIndex) {
                lastResetIndex = val;
                input.value = val;
                resetIndex(val);
            }
        };

        const savedDelay = GM_getValue('custom_init_delay', 500);
        const delayInput = panel.querySelector('#init-delay-input');
        delayInput.value = savedDelay;
        panel.querySelector('#btn-apply-delay').onclick = () => {
            const delay = parseInt(delayInput.value) || 500;
            const validDelay = Math.max(0, Math.min(10000, delay));
            delayInput.value = validDelay;
            GM_setValue('custom_init_delay', validDelay);
            GM_notification(`初始化延迟已设置为 ${validDelay}ms`);
        };

        document.getElementById('current-index').textContent = currentIndex;

        return panel;
    }

    function updatePanelState(state, title = '', index = null) {
        const dot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');
        const currentTitle = document.getElementById('current-title');
        const currentIndexEl = document.getElementById('current-index');
        const inputIndexEl = document.getElementById('reset-index-input');
        const btnStart = document.getElementById('btn-start');
        const btnMerge = document.getElementById('btn-merge');
        const btnStop = document.getElementById('btn-stop');

        if (!dot || !statusText) return;
        if (title) currentTitle.textContent = title.slice(0, 18) + (title.length > 18 ? '...' : '');
        if (index !== null) {
            if (currentIndexEl) currentIndexEl.textContent = index;
            if (inputIndexEl) inputIndexEl.value = index;
        }

        switch(state) {
            case 'idle':
                dot.style.background = '#64748b';
                statusText.textContent = '⏳ 等待中';
                statusText.style.color = '#64748b';
                btnStart.style.display = 'block';
                btnStart.textContent = '▶️ 开始下载';
                btnMerge.style.display = 'block';
                btnStop.style.display = 'none';
                break;
            case 'running':
                dot.style.background = '#10b981';
                statusText.textContent = '🚀 下载中...';
                statusText.style.color = '#34d399';
                btnStart.style.display = 'none';
                btnMerge.style.display = 'none';
                btnStop.style.display = 'block';
                btnStop.disabled = false;
                btnStop.textContent = '⏹️ 停止';
                break;
            case 'merging':
                dot.style.background = '#f59e0b';
                statusText.textContent = '📦 收集中...';
                statusText.style.color = '#fbbf24';
                btnStart.style.display = 'none';
                btnMerge.style.display = 'none';
                btnStop.style.display = 'block';
                btnStop.disabled = false;
                btnStop.textContent = '⏹️ 停止';
                break;
            case 'saving':
                dot.style.background = '#3b82f6';
                statusText.textContent = '💾 保存中...';
                statusText.style.color = '#60a5fa';
                btnStart.style.display = 'none';
                btnMerge.style.display = 'none';
                btnStop.style.display = 'none';
                break;
            case 'paused':
                dot.style.background = '#fbbf24';
                statusText.textContent = '⏸️ 已暂停';
                statusText.style.color = '#fbbf24';
                btnStart.style.display = 'block';
                btnStart.textContent = '▶️ 继续';
                btnMerge.style.display = 'block';
                btnStop.style.display = 'none';
                break;
            case 'stopping':
                dot.style.background = '#f87171';
                statusText.textContent = '🛑 停止中...';
                statusText.style.color = '#f87171';
                btnStart.style.display = 'none';
                btnMerge.style.display = 'none';
                btnStop.style.display = 'block';
                btnStop.disabled = true;
                btnStop.textContent = '⏹️ 停止中...';
                break;
            case 'complete':
                dot.style.background = '#8b5cf6';
                statusText.textContent = '✅ 全部完成!';
                statusText.style.color = '#a78bfa';
                btnStart.style.display = 'block';
                btnStart.textContent = '🔄 重新开始';
                btnMerge.style.display = 'block';
                btnStop.style.display = 'none';
                break;
        }
    }

    // ================== 📥 核心功能 ==================
    function sanitizeFilename(str) {
        return (str || 'chapter')
            .replace(/[/\\?%*:|"<>]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/[#]/g, '_')
            .trim()
            .slice(0, 60);
    }

    function generateFilename(index, rawTitle) {
        const cleanTitle = sanitizeFilename(rawTitle);
        return `${index}##${cleanTitle}.txt`;
    }

    async function downloadCurrentChapter(chapterIndex, siteConfig) {
        const titleEl = document.querySelector(siteConfig.TITLE_SELECTOR);
        const rawTitle = (titleEl?.innerText || 'unnamed').trim();
        const filename = generateFilename(chapterIndex, rawTitle);

        const paragraphs = document.querySelectorAll(siteConfig.CONTENT_SELECTOR);
        if (paragraphs.length === 0) throw new Error('无法找到章节内容');

        const content = Array.from(paragraphs)
            .map(p => p.innerText.trim())
            .filter(t => t)
            .join('\n\n');

        for (let i = 0; i <= siteConfig.MAX_RETRY; i++) {
            try {
                await new Promise((resolve, reject) => {
                    GM_download({
                        url: URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' })),
                        name: filename,
                        onload: resolve,
                        onerror: reject
                    });
                });
                if (siteConfig.SHOW_TOAST) {
                    GM_notification({
                        text: `✅ ${filename}`,
                        timeout: 800,
                        silent: true
                    });
                }
                console.log(`[${scriptInfo.name}] ✅ 保存完成: ${filename}`);
                return { success: true, nextUrl: findNextChapterUrl(siteConfig), title: rawTitle };
            } catch (e) {
                console.warn(`[${scriptInfo.name}] ⚠️ 下载失败 (尝试 ${i+1}):`, e.message);
                if (i === siteConfig.MAX_RETRY) throw e;
                await new Promise(r => setTimeout(r, 1000 * (i + 1)));
            }
        }
    }

    function findNextChapterUrl(siteConfig) {
        const nav = document.querySelector(siteConfig.NAV_SELECTOR);
        if (!nav) return null;

        for (const a of nav.querySelectorAll('a')) {
            if (a.textContent.includes(siteConfig.NEXT_KEYWORD) && a.href && !a.href.includes('#')) {
                return a.href;
            }
        }

        const links = Array.from(nav.querySelectorAll('a')).filter(a =>
            a.href && !a.href.includes('#') && a.href !== window.location.href
        );
        return links.length > 0 ? links[links.length - 1].href : null;
    }

    // ================== 🔢 控制台函数 ==================
    window.resetIndex = (start = 1) => {
        const siteConfig = getCurrentSiteConfig();
        if (typeof start !== 'number' || start < 1) start = 1;
        setCurrentIndex(siteConfig.siteKey, start);
        const idxEl = document.getElementById('current-index');
        const inputEl = document.getElementById('reset-index-input');
        if (idxEl) idxEl.textContent = start;
        if (inputEl) inputEl.value = start;
        console.log(`%c[${scriptInfo.name}] ✅ 序号已重置为 ${start} (${siteConfig.name})`, 'color: #10b981; font-weight:bold');
        GM_notification(`序号已重置为 ${start}`);
    };

    // ================== 🚦 流程控制 ==================
    let isStopping = false;
    let currentTimeout = null;
    let mergeDownloadMode = false;

    function getMergeStorageKey() {
        return 'novel_downloader_merge_content';
    }

    function saveMergeChapter(chapterData) {
        const storageKey = getMergeStorageKey();
        const existing = GM_getValue(storageKey, []);
        existing.push(chapterData);
        GM_setValue(storageKey, existing);
    }

    function getMergeChapters() {
        return GM_getValue(getMergeStorageKey(), []);
    }

    function clearMergeChapters() {
        GM_deleteValue(getMergeStorageKey());
    }

    function getMergeCurrentTitle() {
        return GM_getValue('novel_downloader_merge_title', '');
    }

    function setMergeCurrentTitle(title) {
        GM_setValue('novel_downloader_merge_title', title);
    }

    function sanitizeFilename(str) {
        return (str || 'chapter')
            .replace(/[/\\?%*:|"<>]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/[#]/g, '_')
            .trim()
            .slice(0, 60);
    }

    async function saveMergedNovel() {
        const chapters = getMergeChapters();
        if (chapters.length === 0) return;

        const novelName = sanitizeFilename(getMergeCurrentTitle() || 'merged_novel');
        const filename = `merged_${novelName}.txt`;
        const content = chapters
            .map(chap => `【${chap.title}】\n${chap.content}`)
            .join('\n\n');

        return new Promise((resolve, reject) => {
            GM_download({
                url: URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' })),
                name: filename,
                onload: () => {
                    console.log(`[${scriptInfo.name}] ✅ 合并下载完成: ${filename} (${chapters.length}章)`);
                    GM_notification({ text: `✅ ${filename}`, timeout: 2000 });
                    clearMergeChapters();
                    resolve();
                },
                onerror: reject
            });
        });
    }

    function startDownloadFlow(siteConfig) {
        if (isStopping) return;
        GM_setValue(getStateKey(siteConfig.siteKey, 'active'), true);
        GM_deleteValue(getStateKey(siteConfig.siteKey, 'paused'));
        updatePanelState('running');
        processChapter(siteConfig);
    }

    function startMergeDownloadFlow(siteConfig) {
        if (isStopping) return;
        mergeDownloadMode = true;
        clearMergeChapters();
        GM_setValue(getStateKey(siteConfig.siteKey, 'active'), true);
        GM_deleteValue(getStateKey(siteConfig.siteKey, 'paused'));
        GM_setValue(getStateKey(siteConfig.siteKey, 'merge_mode'), true);
        updatePanelState('merging');
        processMergeChapter(siteConfig);
    }

    async function processMergeChapter(siteConfig) {
        if (isStopping) {
            mergeDownloadMode = false;
            return;
        }

        try {
            const titleEl = document.querySelector(siteConfig.TITLE_SELECTOR);
            const rawTitle = (titleEl?.innerText || 'unnamed').trim();
            setMergeCurrentTitle(rawTitle);

            const paragraphs = document.querySelectorAll(siteConfig.CONTENT_SELECTOR);
            if (paragraphs.length === 0) throw new Error('无法找到章节内容');

            const content = Array.from(paragraphs)
                .map(p => p.innerText.trim())
                .filter(t => t)
                .join('\n\n');

            const currentChapters = getMergeChapters();
            const chapterData = {
                index: currentChapters.length + 1,
                title: rawTitle,
                content: content
            };
            saveMergeChapter(chapterData);

            updatePanelState('merging', rawTitle, currentChapters.length + 1);
            console.log(`[${scriptInfo.name}] 📥 已收集: ${rawTitle} (${currentChapters.length + 1}章)`);

            const nextUrl = findNextChapterUrl(siteConfig);

            if (isStopping) {
                updatePanelState('idle');
                mergeDownloadMode = false;
                return;
            }

            if (!nextUrl) {
                updatePanelState('saving', rawTitle);
                await saveMergedNovel();
                GM_deleteValue(getStateKey(siteConfig.siteKey, 'active'));
                GM_deleteValue(getStateKey(siteConfig.siteKey, 'merge_mode'));
                updatePanelState('complete', rawTitle);
                GM_notification({ text: '🎉 合并下载完成!', timeout: 4000 });
                mergeDownloadMode = false;
                console.log(`[${scriptInfo.name}] 🎉 合并下载完成`);
                return;
            }

            const delay = siteConfig.DELAY_MIN + Math.random() * (siteConfig.DELAY_MAX - siteConfig.DELAY_MIN);
            console.log(`[${scriptInfo.name}] ➡️ ${Math.round(delay)}ms 后跳转到下一章`);

            let countdown = Math.floor(delay / 1000);
            const interval = setInterval(() => {
                if (isStopping || GM_getValue(getStateKey(siteConfig.siteKey, 'paused'))) {
                    clearInterval(interval);
                    return;
                }
                const collected = getMergeChapters().length;
                document.getElementById('status-text').textContent = `📦 收集中 (${countdown}s) ${collected}章`;
                countdown--;
            }, 1000);

            currentTimeout = setTimeout(() => {
                clearInterval(interval);
                if (!isStopping && !GM_getValue(getStateKey(siteConfig.siteKey, 'paused'))) {
                    console.log(`[${scriptInfo.name}] 跳转: ${nextUrl}`);
                    window.location.href = nextUrl;
                }
            }, delay);

        } catch (error) {
            console.error(`[${scriptInfo.name}] ❌ 发生错误:`, error);
            GM_notification({ text: `❌ 错误: ${error.message}`, timeout: 3000 });
            updatePanelState('paused');
            GM_setValue(getStateKey(siteConfig.siteKey, 'paused'), true);
        }
    }

    function stopDownloadFlow(siteConfig) {
        isStopping = true;
        mergeDownloadMode = false;
        updatePanelState('stopping');
        GM_deleteValue(getStateKey(siteConfig.siteKey, 'active'));
        GM_deleteValue(getStateKey(siteConfig.siteKey, 'paused'));
        GM_deleteValue(getStateKey(siteConfig.siteKey, 'merge_mode'));

        if (currentTimeout) clearTimeout(currentTimeout);

        const chapters = getMergeChapters();
        if (chapters.length > 0) {
            saveMergedNovel().then(() => {
                clearMergeChapters();
                setTimeout(() => {
                    isStopping = false;
                    updatePanelState('idle');
                }, 1000);
            });
        } else {
            setTimeout(() => {
                isStopping = false;
                updatePanelState('idle');
            }, 2000);
        }
    }

    async function processChapter(siteConfig) {
        if (isStopping) return;

        try {
            const currentIndex = getCurrentIndex(siteConfig.siteKey);
            updatePanelState('running', '', currentIndex);

            const titleEl = document.querySelector(siteConfig.TITLE_SELECTOR);
            const rawTitle = (titleEl?.innerText || 'unnamed').trim();
            updatePanelState('running', rawTitle, currentIndex);

            const { nextUrl } = await downloadCurrentChapter(currentIndex, siteConfig);

            if (isStopping) {
                updatePanelState('idle');
                return;
            }

            incrementIndex(siteConfig.siteKey);

            if (!nextUrl) {
                GM_deleteValue(getStateKey(siteConfig.siteKey, 'active'));
                updatePanelState('complete', rawTitle);
                GM_notification({ text: '🎉 全部下载完成!', timeout: 4000 });
                console.log(`[${scriptInfo.name}] 🎉 到达最后一章`);
                return;
            }

            const delay = siteConfig.DELAY_MIN + Math.random() * (siteConfig.DELAY_MAX - siteConfig.DELAY_MIN);
            console.log(`[${scriptInfo.name}] ➡️ ${Math.round(delay)}ms 后跳转到下一章: ${nextUrl}`);

            let countdown = Math.floor(delay / 1000);
            const interval = setInterval(() => {
                if (isStopping || GM_getValue(getStateKey(siteConfig.siteKey, 'paused'))) {
                    clearInterval(interval);
                    return;
                }
                document.getElementById('status-text').textContent = `➡️ 跳转中 (${countdown}s)`;
                countdown--;
            }, 1000);

            currentTimeout = setTimeout(() => {
                clearInterval(interval);
                if (!isStopping && !GM_getValue(getStateKey(siteConfig.siteKey, 'paused'))) {
                    console.log(`[${scriptInfo.name}] 跳转: ${nextUrl}`);
                    window.location.href = nextUrl;
                }
            }, delay);

        } catch (error) {
            console.error(`[${scriptInfo.name}] ❌ 发生错误:`, error);
            GM_notification({ text: `❌ 错误: ${error.message}`, timeout: 3000 });
            updatePanelState('paused');
            GM_setValue(getStateKey(siteConfig.siteKey, 'paused'), true);
        }
    }

    // ================== 🌐 控制台控制函数 ==================
    window.startDownload = () => document.getElementById('btn-start')?.click();
    window.stopDownload = () => {
        const siteConfig = getCurrentSiteConfig();
        stopDownloadFlow(siteConfig);
    };
    window.pauseDownload = () => {
        const siteConfig = getCurrentSiteConfig();
        GM_setValue(getStateKey(siteConfig.siteKey, 'paused'), true);
        isStopping = true;
        updatePanelState('paused');
        console.log(`[${scriptInfo.name}] ⏸️ 已暂停`);
    };
    window.resumeDownload = () => {
        const siteConfig = getCurrentSiteConfig();
        GM_deleteValue(getStateKey(siteConfig.siteKey, 'paused'));
        if (GM_getValue(getStateKey(siteConfig.siteKey, 'active'))) {
            isStopping = false;
            startDownloadFlow(siteConfig);
            console.log(`[${scriptInfo.name}] ▶️ 已恢复`);
        }
    };

    // ================== 🚀 初始化 ==================
    function init() {
        const siteConfig = getCurrentSiteConfig();
        const currentIndex = getCurrentIndex(siteConfig.siteKey);
        const stateKey = getStateKey(siteConfig.siteKey, 'active');
        const pauseKey = getStateKey(siteConfig.siteKey, 'paused');
        const mergeKey = getStateKey(siteConfig.siteKey, 'merge_mode');

        createControlPanel(currentIndex, siteConfig);

        const isActive = GM_getValue(stateKey, false);
        const isPaused = GM_getValue(pauseKey, false);
        const isMergeMode = GM_getValue(mergeKey, false);
        const existingChapters = getMergeChapters();

        if (isMergeMode && existingChapters.length > 0) {
            mergeDownloadMode = true;
            updatePanelState('merging', '', existingChapters.length);
            console.log(`[${scriptInfo.name}] 💡 检测到合并下载任务，已收集 ${existingChapters.length} 章，${initDelay}ms 后继续...`);
            setTimeout(() => {
                if (!isStopping) {
                    GM_setValue(mergeKey, true);
                    processMergeChapter(siteConfig);
                }
            }, initDelay);
        } else if (isActive && !isPaused) {
            console.log(`[${scriptInfo.name}] 💡 检测到连续下载模式 (${siteConfig.name}, 序号: ${currentIndex}), ${initDelay}ms 后开始...`);
            updatePanelState('running', '准备中...', currentIndex);
            setTimeout(() => {
                if (!isStopping && GM_getValue(stateKey)) {
                    startDownloadFlow(siteConfig);
                }
            }, initDelay);
        } else if (isPaused) {
            updatePanelState('paused', '', currentIndex);
            console.log(`[${scriptInfo.name}] ⏸️ 暂停状态 (${siteConfig.name}, 序号: ${currentIndex})`);
        } else {
            updatePanelState('idle', '', currentIndex);
            console.log(`%c📖 ${scriptInfo.name} 准备就绪 (${siteConfig.name})`, 'color: #3b82f6; font-weight: bold; font-size: 14px;');
            console.log('%cℹ️  点击右下角 [开始下载] 或 [合并下载] 按钮', 'color: #60a5fa;');
        }
    }

    const initDelay = GM_getValue('custom_init_delay', 500);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, initDelay));
    } else {
        setTimeout(init, initDelay);
    }
})();
