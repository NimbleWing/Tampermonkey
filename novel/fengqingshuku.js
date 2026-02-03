// ==UserScript==
// @name         📚 小说章节下载器（带智能序号）
// @namespace    https://github.com/yourname/novel-downloader
// @version      1.0.0
// @description  点击一次「开始下载」→ 自动生成 1##标题.txt 格式文件 → 自动跳转下一章 → 序号连续递增（方便后续合并）
// @author       AI Assistant
// @match        *://*/read-*.html
// @grant        GM_download
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @icon         https://cdn-icons-png.flaticon.com/512/2966/2966221.png
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ================== ⚙️ 配置区 ==================
    const CONFIG = {
        TITLE_SELECTOR: '.chapter_title',
        CONTENT_SELECTOR: '.chapter_con p',
        NAV_SELECTOR: '.prev_next',
        NEXT_KEYWORD: '下一章',
        DELAY_MIN: 2500,
        DELAY_MAX: 4000,
        MAX_RETRY: 3,
        SHOW_TOAST: true
    };

    // 持久化存储键名
    const STATE_KEY = 'novel_downloader_active';
    const PAUSE_KEY = 'novel_downloader_paused';
    const INDEX_KEY = 'novel_downloader_chapter_index'; // 核心：章节序号存储

    // ================== 🎨 智能控制面板（新增序号显示）==================
    function createControlPanel(currentIndex = 1, autoStart = false) {
        if (document.getElementById('novel-control-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'novel-control-panel';
        panel.innerHTML = `
            <div style="
                position: fixed; bottom: 20px; right: 20px;
                background: rgba(30,30,40,0.95); color: white; border-radius: 16px;
                padding: 18px; box-shadow: 0 6px 30px rgba(0,0,0,0.5);
                z-index: 2147483647; font-family: 'Segoe UI', system-ui;
                min-width: 260px; border: 1px solid rgba(255,255,255,0.1);
            ">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <div style="
                        width: 12px; height: 12px; border-radius: 50%;
                        background: #64748b;
                        animation: pulse 2s infinite;
                    " id="status-dot"></div>
                    <strong style="font-size: 16px; background: linear-gradient(90deg, #60a5fa, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                        📖 小说下载器
                    </strong>
                </div>

                <div style="font-size:13px; color:#94a3b8; margin: 6px 0; line-height: 1.5;">
                    <div>📌 序号: <span id="current-index" style="color:#f472b6; font-weight:bold; font-size:14px">${currentIndex}</span></div>
                    <div>章节: <span id="current-title" style="color:#cbd5e1; font-weight:500">-</span></div>
                    <div>状态: <span id="status-text" style="color:#64748b">⏳ 等待中</span></div>
                </div>

                <div style="display: flex; gap: 8px; margin-top: 10px">
                    <button id="btn-start" style="
                        flex:1; padding:10px; border-radius:10px; border:none;
                        background: linear-gradient(120deg, #3b82f6, #2563eb);
                        color:white; font-weight:bold; cursor:pointer; box-shadow: 0 2px 8px rgba(59,130,246,0.4);
                                        ">▶️ 开始下载</button>
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
                    🔄 控制: <span style="color:#60a5fa">resetIndex(1)</span> (控制台执行)
                </div>
            </div>
            <style>
                @keyframes pulse {
                    0% { opacity: 0.6; transform: scale(0.95); }
                    50% { opacity: 1; transform: scale(1); }
                    100% { opacity: 0.6; transform: scale(0.95); }
                }
                #novel-control-panel button:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
                    transition: all 0.2s;
                }
                #novel-control-panel button:active {
                    transform: translateY(0);
                }
            </style>
        `;
        document.body.appendChild(panel);

        // 绑定事件
        panel.querySelector('#btn-start').onclick = () => {
            GM_setValue(STATE_KEY, true);
            GM_deleteValue(PAUSE_KEY);
            // 重置序号逻辑移至 resetIndex 函数，此处仅启动流程
            startDownloadFlow();
        };
        panel.querySelector('#btn-stop').onclick = stopDownloadFlow;

        // 初始化序号显示
        document.getElementById('current-index').textContent = currentIndex;

        return panel;
    }

    function updatePanelState(state, title = '', index = null) {
        const dot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');
        const currentTitle = document.getElementById('current-title');
        const currentIndexEl = document.getElementById('current-index');
        const btnStart = document.getElementById('btn-start');
        const btnStop = document.getElementById('btn-stop');

        if (!dot || !statusText) return;
        if (title) currentTitle.textContent = title.slice(0, 18) + (title.length > 18 ? '...' : '');
        if (index !== null && currentIndexEl) currentIndexEl.textContent = index;

        switch(state) {
            case 'idle':
                dot.style.background = '#64748b';
                statusText.textContent = '⏳ 等待中';
                statusText.style.color = '#64748b';
                btnStart.style.display = 'block';
                btnStart.textContent = '▶️ 开始下载';
                btnStop.style.display = 'none';
                break;
            case 'running':
                dot.style.background = '#10b981';
                statusText.textContent = '🚀 下载中...';
                statusText.style.color = '#34d399';
                btnStart.style.display = 'none';
                btnStop.style.display = 'block';
                btnStop.disabled = false;
                btnStop.textContent = '⏹️ 停止';
                break;
            case 'paused':
                dot.style.background = '#fbbf24';
                statusText.textContent = '⏸️ 已暂停';
                statusText.style.color = '#fbbf24';
                btnStart.style.display = 'block';
                btnStart.textContent = '▶️ 继续';
                btnStop.style.display = 'none';
                break;
            case 'stopping':
                dot.style.background = '#f87171';
                statusText.textContent = '🛑 停止中...';
                statusText.style.color = '#f87171';
                btnStart.style.display = 'none';
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
                btnStop.style.display = 'none';
                break;
        }
    }

    // ================== 📥 核心功能 (文件名带序号) ==================
    function sanitizeFilename(str) {
        return (str || 'chapter')
            .replace(/[/\\?%*:|"<>]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/[#]/g, '_') // 标题内的 # 移除 (防止文件名冲突)
            .trim()
            .slice(0, 60); // 标题长度限制
    }

    // 文件名生成: "3##05_朋友见面.txt"
    function generateFilename(index, rawTitle) {
        const cleanTitle = sanitizeFilename(rawTitle);
        return `${index}##${cleanTitle}.txt`;
    }

    async function downloadCurrentChapter(chapterIndex) {
        const titleEl = document.querySelector(CONFIG.TITLE_SELECTOR);
        const rawTitle = (titleEl?.innerText || 'unnamed').trim();
        const safeTitle = sanitizeFilename(rawTitle);

        // 文件名生成 (核心!)
        const filename = generateFilename(chapterIndex, rawTitle);

        const paragraphs = document.querySelectorAll(CONFIG.CONTENT_SELECTOR);
        if (paragraphs.length === 0) throw new Error('无法找到章节内容');

        const content = Array.from(paragraphs)
            .map(p => p.innerText.trim())
            .filter(t => t)
            .join('\n\n');

        // 下载执行
        for (let i = 0; i <= CONFIG.MAX_RETRY; i++) {
            try {
                await new Promise((resolve, reject) => {
                    GM_download({
                        url: URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' })),
                        name: filename,
                        onload: resolve,
                        onerror: reject
                    });
                });
                if (CONFIG.SHOW_TOAST) {
                    GM_notification({
                        text: `✅ ${filename}`,
                        timeout: 800,
                        silent: true
                    });
                }
                console.log(`[NovelDownloader] ✅ 保存完成: ${filename}`);
                return { success: true, nextUrl: findNextChapterUrl(), title: rawTitle };
            } catch (e) {
                console.warn(`[NovelDownloader] ⚠️ 下载失败 (尝试 ${i+1}):`, e.message);
                if (i === CONFIG.MAX_RETRY) throw e;
                await new Promise(r => setTimeout(r, 1000 * (i + 1)));
            }
        }
    }

    function findNextChapterUrl() {
        const nav = document.querySelector(CONFIG.NAV_SELECTOR);
        if (!nav) return null;

        for (const a of nav.querySelectorAll('a')) {
            if (a.textContent.includes(CONFIG.NEXT_KEYWORD) && a.href && !a.href.includes('#')) {
                return a.href;
            }
        }

        const links = Array.from(nav.querySelectorAll('a')).filter(a =>
            a.href && !a.href.includes('#') && a.href !== window.location.href
        );
        return links.length > 0 ? links[links.length - 1].href : null;
    }

    // ================== 🔢 序号管理 (核心) ==================
    function getCurrentIndex() {
        return GM_getValue(INDEX_KEY, 1); // 默认值 1
    }

    function incrementIndex() {
        const newIndex = getCurrentIndex() + 1;
        GM_setValue(INDEX_KEY, newIndex);
        return newIndex;
    }

    // 控制台可执行的序号重置函数
    window.resetIndex = (start = 1) => {
        if (typeof start !== 'number' || start < 1) start = 1;
        GM_setValue(INDEX_KEY, start);
        const idxEl = document.getElementById('current-index');
        if (idxEl) idxEl.textContent = start;
        console.log(`%c[NovelDownloader] ✅ 序号已重置为 ${start}`, 'color: #10b981; font-weight:bold');
        GM_notification(`序号已重置为 ${start}`);
    };

    // ================== 🚦 流程控制 ==================
    let isStopping = false;
    let currentTimeout = null;

    function startDownloadFlow() {
        if (isStopping) return;
        GM_setValue(STATE_KEY, true);
        GM_deleteValue(PAUSE_KEY);
        updatePanelState('running');
        processChapter();
    }

    function stopDownloadFlow() {
        isStopping = true;
        updatePanelState('stopping');
        GM_deleteValue(STATE_KEY);
        GM_deleteValue(PAUSE_KEY);

        if (currentTimeout) clearTimeout(currentTimeout);
        setTimeout(() => {
            if (isStopping) updatePanelState('idle');
        }, 2000);
    }

        async function processChapter() {
            if (isStopping) return;

            try {
                // 获取当前序号 (用于本章节)
                const currentIndex = getCurrentIndex();
                updatePanelState('running', '', currentIndex);

                // 获取标题
                const titleEl = document.querySelector(CONFIG.TITLE_SELECTOR);
                const rawTitle = (titleEl?.innerText || 'unnamed').trim();
                updatePanelState('running', rawTitle, currentIndex);

                // 使用当前序号下载
            const { nextUrl } = await downloadCurrentChapter(currentIndex);

            if (isStopping) {
                updatePanelState('idle');
                return;
            }

                // 序号增加 (为下一章做准备)
                incrementIndex();

                // 最后一章处理
                if (!nextUrl) {
                    GM_deleteValue(STATE_KEY);
                    updatePanelState('complete', rawTitle);
                    GM_notification({ text: '🎉 全部下载完成!', timeout: 4000 });
                    console.log('[NovelDownloader] 🎉 到达最后一章');
                    return;
                }

                // 随机延迟
                const delay = CONFIG.DELAY_MIN + Math.random() * (CONFIG.DELAY_MAX - CONFIG.DELAY_MIN);
                console.log(`[NovelDownloader] ➡️ ${Math.round(delay)}ms 后跳转到下一章: ${nextUrl}`);

                // 倒计时更新
            let countdown = Math.floor(delay / 1000);
            const interval = setInterval(() => {
                if (isStopping || GM_getValue(PAUSE_KEY)) {
                    clearInterval(interval);
                    return;
                }
                document.getElementById('status-text').textContent = `➡️ 跳转中 (${countdown}s)`;
                countdown--;
            }, 1000);

            // 跳转执行
            currentTimeout = setTimeout(() => {
                clearInterval(interval);
                if (!isStopping && !GM_getValue(PAUSE_KEY)) {
                    console.log(`[NovelDownloader] 跳转: ${nextUrl}`);
                    window.location.href = nextUrl;
                }
            }, delay);

        } catch (error) {
            console.error('[NovelDownloader] ❌ 发生错误:', error);
            GM_notification({ text: `❌ 错误: ${error.message}`, timeout: 3000 });
            updatePanelState('paused');
            GM_setValue(PAUSE_KEY, true);
        }
    }

    // ================== 🌐 控制台控制函数 ==================
    window.startDownload = () => document.getElementById('btn-start')?.click();
    window.stopDownload = stopDownloadFlow;
    window.pauseDownload = () => {
        GM_setValue(PAUSE_KEY, true);
        isStopping = true;
        updatePanelState('paused');
        console.log('[NovelDownloader] ⏸️ 已暂停');
    };
    window.resumeDownload = () => {
        GM_deleteValue(PAUSE_KEY);
        if (GM_getValue(STATE_KEY)) {
            isStopping = false;
            startDownloadFlow();
            console.log('[NovelDownloader] ▶️ 已恢复');
        }
    };
    // resetIndex 函数已在上面定义

    // ================== 🚀 初始化 (核心: 序号状态管理) ==================
    function init() {
        // 状态确认
        const isActive = GM_getValue(STATE_KEY, false);
        const isPaused = GM_getValue(PAUSE_KEY, false);
        const currentIndex = getCurrentIndex(); // 获取当前序号

        createControlPanel(currentIndex);

        // 自动启动逻辑
        if (isActive && !isPaused) {
            console.log(`[NovelDownloader] 💡 检测到连续下载模式 (当前序号: ${currentIndex}), 300ms 后开始...`);
            updatePanelState('running', '准备中...', currentIndex);

            setTimeout(() => {
                if (!isStopping && GM_getValue(STATE_KEY)) {
                    startDownloadFlow();
                }
            }, 300);
        } else if (isPaused) {
            updatePanelState('paused', '', currentIndex);
            console.log(`[NovelDownloader] ⏸️ 暂停状态 (当前序号: ${currentIndex})`);
        } else {
            updatePanelState('idle', '', currentIndex);
            console.log('%c📚 小说下载器准备就绪', 'color: #3b82f6; font-weight: bold; font-size: 14px;');
            console.log('%cℹ️  点击右下角 [开始下载] 按钮', 'color: #60a5fa;');
            console.log('%c🔧 高级: 在控制台执行 resetIndex(1) 重置序号', 'color: #f472b6;');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();