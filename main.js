const { Plugin, PluginSettingTab, Setting, Notice, Modal, MarkdownView, ItemView } = require('obsidian');
const { BrowserWindow, screen, Menu, MenuItem } = require('electron').remote;

// 定义支持的AI平台
const SUPPORTED_PLATFORMS = {
    KIMI: {
        key: 'kimi',
        displayName: 'Kimi',
        url: 'https://kimi.moonshot.cn',
        icon: 'bot',
        selectors: {
            input: "[id=\"msh-chateditor\"]",
            button: "[id=\"send-button\"]",
            responseSelector: ".markdown___vuBDJ"
        }
    },
    YUANBAO: {
        key: 'yuanbao',
        displayName: '元宝',
        url: 'https://yuanbao.tencent.com/',
        icon: 'bot',
        selectors: {
            input: ".ql-editor",
            button: "a[class*=\"send-btn\"]",
            responseSelector: ".agent-chat__conv--ai__speech_show"
        }
    },
    DOUBAO: {
        key: 'doubao',
        displayName: '豆包',
        url: 'https://www.doubao.com/',
        icon: 'bot',
        selectors: {
            input: "textarea.semi-input-textarea",
            button: "#flow-end-msg-send",
            responseSelector: "[data-testid='receive_message']"
        }
    },
    CHATGPT: {
        key: 'chatgpt',
        displayName: 'ChatGPT',
        url: 'https://chatgpt.com',
        icon: 'bot',
        selectors: {
            input: "#prompt-textarea",
            button: "button[data-testid=\"send-button\"]",
            responseSelector: ".markdown.prose"
        }
    },
    perplexity: {
        key: 'Perplexity',
        displayName: 'Perplexity',
        url: 'https://www.perplexity.ai/',
        icon: 'bot',
        selectors: {
            input: "textarea.overflow-auto",
            button: "button[aria-label=\"Submit\"]",
            responseSelector: "#response-textarea"
        }
    },
    n: {
        key: 'n',
        displayName: 'n',
        url: 'https://n.cn/',
        icon: 'bot',
        selectors: {
            input: "#composition-input",
            button: "#home_chat_btn",
            responseSelector: "#response-textarea"
        }
    },
    Grok: {
        key: 'Grok',
        displayName: 'Grok',
        url: 'https://x.com/i/grok',
        icon: 'bot',
        selectors: {
            input: "textarea.r-30o5oe",
            button: "button[aria-label=\"问 Grok 问题\"]",
            responseSelector: "#response-textarea"
        }
    },
    chatglm: {
        key: 'chatglm',
        displayName: 'chatglm',
        url: 'https://chatglm.cn/',
        icon: 'bot',
        selectors: {
            input: "textarea.scroll-display-none",
            button: ".enter_icon",
            responseSelector: "#response-textarea"
        }
    },
    metaso: {
        key: 'metaso',
        displayName: 'metaso',
        url: 'https://metaso.cn/',
        icon: 'bot',
        selectors: {
            input: ".search-consult-textarea",
            button: ".send-arrow-button",
            responseSelector: "#response-textarea"
        }
    },
    yiyan: {
        key: 'yiyan',
        displayName: '文心一言',
        url: 'https://yiyan.baidu.com/',
        icon: 'bot',
        selectors: {
            input: ".yc-editor",
            button: "#sendBtn",
            responseSelector: "#response-textarea"
        }
    },
    tongyi: {
        key: 'tongyi',
        displayName: '通义',
        url: 'https://tongyi.aliyun.com/',
        icon: 'bot',
        selectors: {
            input: ".ant-input",
            button: "[class*=\"operateBtn\"]",
            responseSelector: "#response-textarea"
        }
    },
    Gemini: {
        key: 'Gemini',
        displayName: 'Gemini',
        url: 'https://gemini.google.com/',
        icon: 'bot',
        selectors: {
            input: ".text-input-field_textarea-wrapper",
            button: ".send-button",
            responseSelector: "#response-textarea"
        }
    }
};

// 平台映射对象
const PLATFORM_MAPPING = Object.fromEntries(
    Object.values(SUPPORTED_PLATFORMS).map(platform => [platform.displayName, platform.key])
);

// 平台选择器对象
const PLATFORM_SELECTORS = Object.fromEntries(
    Object.values(SUPPORTED_PLATFORMS).map(platform => [platform.key, platform.selectors])
);

// 默认设置
const DEFAULT_SETTINGS = {
    frameCount: 4,
    showPromptInput: false,
    searchMode: "disabled",
    dialogRecord: {
        enabled: true,
        folderPath: "对话记录",
        fileName: "AI对话记录.md",
        template: "## {{datetime}}\n\n### 提问\n{{prompt}}\n\n### 回复\n{{response}}\n\n---\n"
    },
    promptHistorySettings: {
        enabled: true,
        maxHistory: 100,
        autoSave: true,
        showTimestamp: true,
        showPlatform: true,
        useNewStorage: true,  // 是否使用新的存储方式
        newStorageFolder: '.ai-spark-hub',  // 新的存储文件夹
        maxFileSize: 5 * 1024 * 1024  // 单个文件最大大小（5MB）
    },
    promptHistory: []
};

// 定义搜索模式枚举
const SearchMode = {
    DISABLED: 'disabled',
    VAULT_ONLY: 'vault_only',
    SMART_ONLY: 'smart_only',
    COMBINED: 'combined'
};

// 增强搜索类
/**
 * EnhancedSearch 类提供了增强的搜索功能，支持多种搜索模式（禁用、仅Vault、仅智能、组合），
 * 以及精确搜索和模糊搜索。该类集成了Vault搜索和Smart Connections插件搜索，
 * 通过处理和组织搜索结果，提供相关的匹配内容上下文，优化用户在应用中的搜索体验。
 */
class EnhancedSearch {
    constructor(app, settings) {
        this.app = app;
        this.settings = settings;
        this.searchMethods = {
            vault: this.exactSearch.bind(this),
            smart: this.searchWithSmartConnections.bind(this)
        };
    }

    // 第一阶段：精确搜索
    async exactSearch(query, currentFile = null) {
        // 检查搜索模式
        if (this.settings.searchMode === SearchMode.DISABLED || 
            this.settings.searchMode === SearchMode.SMART_ONLY) {
            console.log('Vault search is disabled by search mode setting');
            return null;
        }

        try {
            console.log('开始精确搜索:', query);
            const files = this.app.vault.getMarkdownFiles()
                .filter(file => !currentFile || file.path !== currentFile.path); // 排除当前文件

            const results = [];

            for (const file of files) {
                const content = await this.app.vault.cachedRead(file);
                const metadata = this.app.metadataCache.getFileCache(file);
                
                // 检查标题
                if (file.basename.toLowerCase().includes(query.toLowerCase())) {
                    results.push({ 
                        file, 
                        content, 
                        metadata, 
                        matchType: 'title',
                        matchPosition: 0,
                        matchLength: query.length
                    });
                    continue;
                }
                
                // 检查内容
                const contentMatch = this.findBestMatch(content, query);
                if (contentMatch) {
                    results.push({ 
                        file, 
                        content, 
                        metadata, 
                        matchType: 'content',
                        matchPosition: contentMatch.position,
                        matchLength: contentMatch.length
                    });
                    continue;
                }
                
                // 检查标签
                if (metadata?.tags?.some(tag => 
                    tag.tag.toLowerCase().includes(query.toLowerCase()))) {
                    results.push({ 
                        file, 
                        content, 
                        metadata, 
                        matchType: 'tag',
                        matchPosition: 0,
                        matchLength: 0
                    });
                }
            }

            return this.processResults(results, query, '精确');
        } catch (error) {
            console.error('精确搜索出错:', error);
            return null;
        }
    }

    // 查找最佳匹配位置
    findBestMatch(content, query) {
        const lowercaseContent = content.toLowerCase();
        const lowercaseQuery = query.toLowerCase();
        const position = lowercaseContent.indexOf(lowercaseQuery);
        
        if (position === -1) return null;
        
        // 找到段落的开始和结束
        let paragraphStart = content.lastIndexOf('\n\n', position);
        paragraphStart = paragraphStart === -1 ? 0 : paragraphStart + 2;
        
        let paragraphEnd = content.indexOf('\n\n', position);
        paragraphEnd = paragraphEnd === -1 ? content.length : paragraphEnd;
        
        return {
            position: paragraphStart,
            length: paragraphEnd - paragraphStart
        };
    }

    // 获取匹配内容的上下文
    getContentContext(content, position, length) {
        const contextLength = this.settings.contextLength;
        const start = Math.max(0, position - contextLength);
        const end = Math.min(content.length, position + length + contextLength);
        
        let context = content.slice(start, end).trim();
        
        // 尝试在句子边界处截断
        if (start > 0) {
            const firstPeriod = context.indexOf('。');
            if (firstPeriod !== -1 && firstPeriod < contextLength / 2) {
                context = context.slice(firstPeriod + 1);
            }
            context = '...' + context;
        }
        
        if (end < content.length) {
            const lastPeriod = context.lastIndexOf('。');
            if (lastPeriod !== -1 && lastPeriod > context.length - contextLength / 2) {
                context = context.slice(0, lastPeriod + 1);
            }
            context += '...';
        }
        
        return context;
    }

    // 组合搜索方法
    async searchInContext(text, options = {}) {
        // 获取当前活动文件
        const activeFile = this.app.workspace.getActiveFile();

        // 如果搜索被禁用，直接返回空结果
        if (this.settings.searchMode === SearchMode.DISABLED) {
            console.log('搜索功能已禁用');
            return {
                vault: null,
                smart: [],
                combined: []
            };
        }

        try {
            const searchResults = {
                vault: null,
                smart: [],
                combined: []
            };

            // 根据搜索模式执行相应的搜索
            if (this.settings.searchMode === SearchMode.VAULT_ONLY || 
                this.settings.searchMode === SearchMode.COMBINED) {
                searchResults.vault = await this.searchMethods.vault(text, activeFile);
            }

            if (this.settings.searchMode === SearchMode.SMART_ONLY || 
                this.settings.searchMode === SearchMode.COMBINED) {
                searchResults.smart = await this.searchMethods.smart(text, options.limit || 5, activeFile);
            }

            // 只在组合模式下合并结果
            if (this.settings.searchMode === SearchMode.COMBINED) {
                searchResults.combined = [
                    ...(searchResults.vault?.results || []), 
                    ...searchResults.smart
                ]
                .filter(result => !activeFile || 
                    (result.path !== activeFile.path && // 检查路径
                     result.file?.path !== activeFile.path)) // 检查文件对象
                .sort((a, b) => b.score - a.score)
                .slice(0, options.limit || 10);
            }

            return searchResults;
        } catch (error) {
            console.error("Search error:", error);
            return {
                vault: null,
                smart: [],
                combined: [],
                error: error.message
            };
        }
    }

    // 第二阶段：模糊搜索
    async fuzzySearch(query) {
        try {
            console.log('开始模糊搜索:', query);
            const keywords = this.extractKeywords(query);
            console.log('提取的关键词:', keywords);
            
            const files = this.app.vault.getMarkdownFiles();
            const results = [];

            for (const file of files) {
                const content = await this.app.vault.cachedRead(file);
                const metadata = this.app.metadataCache.getFileCache(file);
                let matched = false;

                // 对每个关键词进行检查
                for (const keyword of keywords) {
                    // 检查标题
                    if (file.basename.toLowerCase().includes(keyword.toLowerCase())) {
                        results.push({ 
                            file, 
                            content, 
                            metadata, 
                            matchType: 'title',
                            matchPosition: 0,
                            matchLength: keyword.length
                        });
                        matched = true;
                        break;
                    }
                    
                    // 检查内容
                    const contentMatch = this.findBestMatch(content, keyword);
                    if (contentMatch) {
                        results.push({ 
                            file, 
                            content, 
                            metadata, 
                            matchType: 'content',
                            matchPosition: contentMatch.position,
                            matchLength: contentMatch.length
                        });
                        matched = true;
                        break;
                    }
                    
                    // 检查标签
                    if (metadata?.tags?.some(tag => 
                        tag.tag.toLowerCase().includes(keyword.toLowerCase()))) {
                        results.push({ 
                            file, 
                            content, 
                            metadata, 
                            matchType: 'tag',
                            matchPosition: 0,
                            matchLength: 0
                        });
                        matched = true;
                        break;
                    }
                }
            }

            return this.processResults(results, query, '模糊');
        } catch (error) {
            console.error('模糊搜索出错:', error);
            return null;
        }
    }

    // 关键词提取
    extractKeywords(query) {
        // 移除停用词
        const stopWords = ['的', '了', '和', '与', 'the', 'is', 'are', 'in'];
        const words = query.split(/\s+/);
        return words.filter(word => 
            word.length > 1 && !stopWords.includes(word.toLowerCase())
        );
    }

    // 检查是否为纯文本内容
    isTextContent(content) {
        // 检查是否包含常见的二进制文件标记
        const binarySignatures = [
            '\u0000', // null字节
            '\ufffd', // Unicode替换字符
            '�',      // 乱码字符
        ];
        
        // 如果内容为空或不是字符串，返回false
        if (!content || typeof content !== 'string') {
            return false;
        }

        // 检查是否包含二进制标记
        for (const signature of binarySignatures) {
            if (content.includes(signature)) {
                return false;
            }
        }

        // 检查是否包含过多的不可打印字符
        const nonPrintableCount = (content.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length;
        if (nonPrintableCount > content.length * 0.1) { // 如果不可打印字符超过10%
            return false;
        }

        return true;
    }

    // 清理和格式化文本内容
    cleanTextContent(content) {
        if (!content || typeof content !== 'string') {
            return '';
        }

        // 移除多余的空白字符
        content = content.replace(/\s+/g, ' ').trim();
        
        // 移除可能的控制字符
        content = content.replace(/[\x00-\x1F\x7F]/g, '');
        
        // 移除过长的重复字符
        content = content.replace(/(.)\1{10,}/g, '$1$1$1');

        return content;
    }

    // 处理搜索结果
    processResults(results, query, searchType) {
        if (!results || results.length === 0) return null;

        // 按相关性排序
        results.sort((a, b) => {
            // 标题匹配优先
            if (a.matchType === 'title') return -1;
            if (b.matchType === 'title') return 1;
            // 标签次之
            if (a.matchType === 'tag') return -1;
            if (b.matchType === 'tag') return 1;
            return 0;
        });

        // 限制结果数量
        results = results.slice(0, this.settings.maxResults);

        let combinedContent = '';
        
        // 组织结果
        for (const result of results) {
            // 检查文件名是否为纯文本
            if (!this.isTextContent(result.file.basename)) {
                continue;
            }

            combinedContent += `\n## ${result.file.basename}\n`;

            // 添加标签信息
            if (result.metadata?.tags) {
                const validTags = result.metadata.tags
                    .filter(tag => this.isTextContent(tag.tag))
                    .map(tag => tag.tag);
                if (validTags.length > 0) {
                    combinedContent += `标签: ${validTags.join(', ')}\n`;
                }
            }

            // 添加匹配内容
            if (result.content && this.isTextContent(result.content)) {
                const cleanContent = this.cleanTextContent(result.content);
                const context = this.getContentContext(
                    cleanContent, 
                    result.matchPosition,
                    result.matchLength
                );
                if (context) {
                    combinedContent += `${context}\n`;
                }
            }
        }

        return {
            title: `找到 ${results.length} 个${searchType}匹配结果`,
            content: this.cleanTextContent(combinedContent).slice(0, this.settings.maxTotalLength)
        };
    }

    // Smart Connections 搜索方法
    async searchWithSmartConnections(query, limit = 5, currentFile = null) {
        // 检查搜索模式
        if (this.settings.searchMode === SearchMode.DISABLED || 
            this.settings.searchMode === SearchMode.VAULT_ONLY) {
            console.log('Smart search is disabled by search mode setting');
            return [];
        }

        try {
            const plugin = this.app.plugins.plugins['smart-connections'];
            if (!plugin || !plugin.env?.smart_sources) {
                console.log('Smart Connections plugin not available');
                return [];
            }

            const results = await plugin.env.smart_sources.lookup({
                hypotheticals: [query],
                filter: {
                    limit: limit
                }
            });

            console.log('Smart Connections raw results:', results);

            const filteredResults = results
                .filter(result => this.isTextContent(result.item?.content) && 
                    (!currentFile || result.key !== currentFile.path)) // 排除当前文件
                .map(result => ({
                    path: result.key,
                    score: result.score,
                    content: this.cleanTextContent(result.item?.content || ''),
                    type: 'smart-connection'
                }));

            console.log('Smart Connections filtered results:', filteredResults);
            return filteredResults;
        } catch (error) {
            console.error("Smart Connections search error:", error);
            return [];
        }
    }
}

/**
 * MultiAIDialog 插件集成了多个AI对话平台（如ChatGPT、Kimi、豆包、元宝等），
 * 通过创建多个AI对话窗口，允许用户同时与多个AI进行对话。插件提供
 * 配置选项，允许用户设置搜索模式、对话记录保存、AI窗口数量和具体AI平台配置。
 * 通过命令注册和图标交互，用户可以方便地发送信息到所有启用的AI平台，并管理
 * 对话记录。
 */

class MultiAIDialog extends Plugin {
    async onload() {
        console.log('Loading MultiAIDialog plugin');
        
        // 加载设置
        await this.loadSettings();

        // 加载必要的库
        await this.loadChartLibraries();

        // 添加ribbon图标
        this.addRibbonIcon('bot', '智汇堂AiSparkHub', () => {
            this.openAIWorkspace();
        });

        this.addSettingTab(new MultiAIDialogSettingTab(this.app, this));
        
        // 保存主窗口引用
        this.mainWindow = null;

        // 修改命令注册方式
        this.addCommand({
            id: 'send-to-all-ai',
            name: '发送到所有AI',
            editorCheckCallback: async (checking, editor, view) => {
                const canRun = view.getViewType() === 'markdown';
                if (checking) return canRun;
                if (canRun) {
                    console.log('Command triggered via hotkey');
                    
                    // 获取文本内容
                    const selectedText = editor.getSelection();
                    const text = selectedText || editor.getValue();
                    
                    // 检查文本是否为空
                    if (!text.trim()) {
                        new Notice('请输入要发送的内容');
                        return false;
                    }
                    
                    console.log('Sending text:', text); // 输出发送的文本
                    
                    // 执行发送并获取结果
                    const results = await this.sendToAllAI(text);
                    
                    // 检查脚本执行结果
                    const scriptSuccess = results && results.some(result => 
                        result && result.status !== 'error' && !result.error
                    );
                    
                    // 如果发送成功，清空编辑器内容
                    if (scriptSuccess) {
                        if (selectedText) {
                            editor.replaceSelection('');
                        } else {
                            editor.setValue('');
                        }
                    }
                    
                    return true;
                }
                return false;
            },
            hotkeys: [
                {
                    modifiers: ['Ctrl'],
                    key: 'Enter'
                }
            ]
        });

        // 初始化提示词历史
        this.promptHistory = new PromptHistoryData(this);

        // 注册提示词历史视图
        this.registerView(
            "prompt-history-view",
            (leaf) => new PromptHistoryView(leaf, this)
        );

        // 添加快捷键注册
        this.registerDomEvent(document, 'keydown', (e) => {
            if (e.ctrlKey && e.key.toLowerCase() === 'p' && this.mainWindow) {
                e.preventDefault();
                e.stopPropagation();
                this.mainWindow.webContents.send('toggle-central-prompt');
            }
        });

        console.log('MultiAIDialog plugin loaded');
    }

    async loadChartLibraries() {
        try {
            // 加载 Chart.js
            if (!window.Chart) {
                await this.loadScript('https://cdn.jsdelivr.net/npm/chart.js@3.7.0/dist/chart.min.js');
            }
            
            // 加载 D3.js
            if (!window.d3) {
                await this.loadScript('https://d3js.org/d3.v7.min.js');
            }
            
            // 加载 D3-Cloud
            if (!window.d3.layout?.cloud) {
                await this.loadScript('https://cdn.jsdelivr.net/gh/jasondavies/d3-cloud/build/d3.layout.cloud.js');
            }
            
            console.log('图表库加载成功');
        } catch (error) {
            console.error('加载图表库失败:', error);
            new Notice('加载图表库失败，部分功能可能无法使用');
        }
    }

    loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async loadSettings() {
        const data = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data || {});
        
        // 确保必要的设置存在
        if (!this.settings.dialogRecord) {
            this.settings.dialogRecord = DEFAULT_SETTINGS.dialogRecord;
        }
        
        if (!this.settings.promptHistorySettings) {
            this.settings.promptHistorySettings = DEFAULT_SETTINGS.promptHistorySettings;
        }

        if (!this.settings.promptHistory) {
            this.settings.promptHistory = [];
        }
        
        console.log('Loaded settings:', this.settings);
        await this.saveSettings();
    }

    async saveSettings() {
        try {
            await this.saveData(this.settings);
            
            // 更新所有提示词历史视图
            this.app.workspace.getLeavesOfType("prompt-history-view").forEach(leaf => {
                if (leaf.view instanceof PromptHistoryView) {
                    leaf.view.updateDisplay();
                }
            });
        } catch (error) {
            console.error('保存设置时出错:', error);
            new Notice('保存设置时出错');
        }
    }

    async openAIWorkspace() {
        const mainWindowExists = this.mainWindow !== null && !this.mainWindow.isDestroyed();
        const historyLeaves = this.app.workspace.getLeavesOfType("prompt-history-view");
        
        if (!mainWindowExists) {
            await this.openMultiAIView();
        }
        
        if (historyLeaves.length === 0) {
            await this.activateView();
        } else {
            this.app.workspace.revealLeaf(historyLeaves[0]);
        }
    }

    async openMultiAIView() {
        const enabledFrames = this.settings.frames.filter(frame => frame.enabled);
        const urls = enabledFrames.map(frame => frame.url);
        await this.openMultiAIViewWithUrls(urls);
    }

    async openMultiAIViewWithUrls(urls) {
        try {
            if (!urls || urls.length === 0) {
                console.log('No URLs provided');
                return;
            }

            console.log('Opening MultiAI view with URLs:', urls);
            
            // 如果主窗口已存在且未销毁
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                console.log('Updating existing window with new URLs');
                // 更新现有窗口的 webviews
                await this.mainWindow.webContents.executeJavaScript(`
                    (function() {
                        try {
                            const container = document.querySelector('.frames-container');
                            if (!container) {
                                console.error('Frames container not found');
                                return false;
                            }
                            
                            // 清空现有的 webviews
                            container.innerHTML = '';
                            
                            // 创建新的 webviews
                            ${urls.map((url, index) => `
                                const webview${index} = document.createElement('webview');
                                webview${index}.src = '${url}';
                                webview${index}.setAttribute('data-frame-index', '${index}');
                                webview${index}.setAttribute('webpreferences', 'contextIsolation=false');
                                webview${index}.setAttribute('allowpopups', '');
                                container.appendChild(webview${index});
                            `).join('\n')}
                            
                            // 更新网格布局
                            container.style.flexDirection = 'row';
                            container.style.overflowX = 'auto';
                            container.style.overflowY = 'hidden';
                            container.style.whiteSpace = 'nowrap';
                            return true;
                        } catch (error) {
                            console.error('Error updating webviews:', error);
                            return false;
                        }
                    })()
                `);
                
                // 聚焦窗口
                this.mainWindow.focus();
            } else {
                // 创建新窗口
                await this.ensureMainWindow(urls);
            }
            
            if (this.mainWindow) {
                this.mainWindow.focus();
            }
        } catch (error) {
            console.error('Error in openMultiAIViewWithUrls:', error);
            new Notice('打开窗口时发生错误');
        }
    }

    async ensureMainWindow(urls) {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
            const { width, height } = screen.getPrimaryDisplay().workAreaSize;
            this.mainWindow = new BrowserWindow({
                width: Math.floor(width * 0.8),
                height: Math.floor(height * 0.8),
                title: "智燃笔记-AiSparkHub",
                autoHideMenuBar: true,
                frame: true,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    webviewTag: true
                }
            });

            // 设置窗口菜单为null
            this.mainWindow.setMenu(null);

            // 生成HTML内容
            const htmlContent = this.generateMainWindowHtml(urls);
            
            // 加载HTML内容
            this.mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

            // 添加IPC消息监听
            this.mainWindow.webContents.on('ipc-message', async (event, channel, ...args) => {
                if (channel === 'send-to-all-ai') {
                    console.log('Received send-to-all request:', args[0]);
                    try {
                        const results = await this.sendToAllAI(args[0]);
                        event.sender.send('send-to-all-ai-response', { success: true, results });
                    } catch (error) {
                        console.error('Error in send-to-all-ai:', error);
                        event.sender.send('send-to-all-ai-response', { success: false, error: error.message });
                    }
                } else if (channel === 'get-enabled-frames') {
                    // 获取启用的AI平台列表
                    const enabledFrames = this.settings.frames
                        .filter(frame => frame.enabled)
                        .map(frame => ({
                            name: frame.displayName, 
                            url: frame.url
                        }));
                    event.sender.send('get-enabled-frames-response', { frames: enabledFrames });
                } else if (channel === 'switch-frame-url') {
                    // 切换当前webview的URL
                    const { frameIndex, url } = args[0];
                    event.sender.send('switch-frame-url-response', { success: true });
                } else if (channel === 'add-frame') {
                    // 在指定位置添加新的webview
                    const { frameIndex, url } = args[0];
                    event.sender.send('add-frame-response', { success: true });
                }
            });

            // 添加窗口关闭事件处理
            this.mainWindow.on('closed', () => {
                this.mainWindow = null;
            });

            // 添加开发者工具快捷键
            this.mainWindow.webContents.on('before-input-event', (event, input) => {
                if (input.control && input.key.toLowerCase() === 'i') {
                    this.mainWindow.webContents.toggleDevTools();
                    event.preventDefault();
                }
            });
        }
        return this.mainWindow;
    }

    generateMainWindowHtml(urls) {
        console.log('Generating main window HTML with settings:', this.settings);
        const showPromptInput = this.settings.showPromptInput;
        
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>智燃笔记-AiSparkHub</title>
                <style>
                    body {
                        margin: 0;
                        padding: 0;
                        display: flex;
                        flex-direction: column;
                        height: 100vh;
                        overflow: hidden;
                        background-color: var(--background-primary);
                        color: var(--text-normal);
                    }

                    .frames-container {
                        flex: 1;
                        display: flex;
                        flex-direction: row;
                        height: calc(100vh - 30px);
                        overflow-x: auto;
                        overflow-y: hidden;
                        white-space: nowrap;
                    }

                    .webview-container {
                        flex: 1;
                        min-width: 0;
                        display: flex;
                        flex-direction: column;
                        border-right: 1px solid #ccc;
                    }
                    
                    .central-prompt-container {
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        width: 80%;
                        height: 60%;
                        background-color: white;
                        border: 1px solid var(--background-modifier-border);
                        border-radius: 8px;
                        padding: 20px;
                        display: none;
                        flex-direction: column;
                        gap: 10px;
                        z-index: 2000;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    }

                    .central-prompt-input {
                        flex: 1;
                        resize: none;
                        border: 1px solid var(--background-modifier-border);
                        border-radius: 4px;
                        background-color: var(--background-secondary);
                        color: var(--text-normal);
                        font-size: 16px;
                        padding: 12px;
                        outline: none;
                    }

                    .central-prompt-buttons {
                        display: flex;
                        justify-content: flex-end;
                        gap: 10px;
                    }

                    .central-prompt-button {
                        padding: 8px 16px;
                        border-radius: 4px;
                        border: none;
                        cursor: pointer;
                        font-size: 14px;
                        transition: all 0.2s ease;
                    }

                    .central-prompt-send {
                        background-color: var(--interactive-accent);
                        color: var(--text-on-accent);
                    }

                    .central-prompt-cancel {
                        background-color: var(--background-modifier-error);
                        color: white;
                    }

                    .central-prompt-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background-color: rgba(0, 0, 0, 0.5);
                        display: none;
                        z-index: 1999;
                    }

                    .prompt-container {
                        position: fixed;
                        bottom: 0;
                        left: 0;
                        right: 0;
                        background-color: transparent;
                        padding: 10px;
                        transform: translateY(calc(100% - 30px));
                        transition: transform 0.3s ease;
                        height: 200px;
                        z-index: 1000;
                        display: flex;
                        flex-direction: column;
                    }

                    .prompt-container:hover,
                    .prompt-container.dragging {
                        transform: translateY(0);
                    }

                    .resize-handle {
                        position: relative;
                        height: 20px;
                        background: transparent;
                        cursor: ns-resize;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                        color: var(--text-muted);
                        user-select: none;
                    }

                    .prompt-input-wrapper {
                        display: flex;
                        gap: 10px;
                        margin-top: 5px;
                        flex: 1;
                        background-color: white;
                        border: 1px solid var(--background-modifier-border);
                        border-radius: 4px;
                        padding: 10px;
                        border-radius: 4px;
                        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
                    }

                    .prompt-input {
                        flex: 1;
                        resize: none;
                        border: none;
                        background-color: transparent;
                        color: var(--text-normal);
                        padding: 8px;
                        font-size: 14px;
                        min-width: 0;
                    }

                    .button-container {
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        gap: 5px;
                        width: 100px;
                        height: 100%;
                    }

                    .send-button {
                        padding: 8px 16px;
                        background-color: #f0f0f0;
                        color: var(--text-normal);
                        border: 1px solid #e0e0e0;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                        transition: all 0.2s ease;
                        white-space: nowrap;
                        width: 100%;
                    }

                    .send-button:hover {
                        background-color: #e0e0e0;
                        border-color: #d0d0d0;
                    }

                    .clear-button {
                        padding: 8px 16px;
                        background-color: #e53935;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                        transition: background-color 0.2s;
                        white-space: nowrap;
                        width: 100%;
                    }

                    .clear-button:hover {
                        background-color: #c62828;
                    }

                    webview {
                        width: 100%;
                        height: 100%;
                        border: 1px solid var(--background-modifier-border);
                        background: white;
                    }

                    .webview-container {
                        position: relative;
                        width: 100%;
                        height: 100%;
                        display: flex;
                        flex-direction: column;
                    }

                    .webview-toolbar-area {
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        height: 15px;
                        z-index: 100;
                    }

                    .webview-toolbar {
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        height: 15px;
                        background-color: rgba(255, 255, 255, 0.95);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 4px;
                        opacity: 0;
                        transition: opacity 0.2s ease;
                    }

                    .webview-toolbar-area:hover .webview-toolbar {
                        opacity: 1;
                    }

                    .toolbar-button {
                        padding: 4px 8px;
                        background: transparent;
                        border: none;
                        cursor: pointer;
                        font-size: 16px;
                        color: var(--text-muted);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-width: 24px;
                        height: 24px;
                        border-radius: 4px;
                        transition: all 0.2s ease;
                    }

                    .toolbar-button:hover {
                        background-color: var(--background-modifier-hover);
                        color: var(--text-normal);
                    }

                    .toolbar-button.danger:hover {
                        background-color: #e53935;
                        color: white;
                    }

                    .toolbar-button:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                        pointer-events: none;
                    }

                    .toolbar-button.disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                        pointer-events: none;
                    }
                    
                    .success-notice, .error-notice {
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        padding: 10px 20px;
                        border-radius: 4px;
                        animation: fadeInOut 2s ease-in-out;
                        z-index: 1000;
                    }

                    .success-notice {
                        background-color: #4CAF50;
                        color: white;
                    }

                    .error-notice {
                        background-color: #f44336;
                        color: white;
                    }
                    
                    .dropdown-menu {
                        display: none;
                        position: absolute;
                        top: 100%;
                        left: 20%;
                        transform: translateX(-50%);
                        background-color: #ffffff;
                        min-width: 160px;
                        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                        z-index: 1000;
                        border-radius: 6px;
                        border: 1px solid #e0e0e0;
                        padding: 4px 0;
                        margin-top: 4px;
                    }

                    .dropdown-menu.show {
                        display: block;
                    }

                    .dropdown-item {
                        color: #333333;
                        padding: 8px 16px;
                        text-decoration: none;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        cursor: pointer;
                        font-size: 14px;
                        line-height: 1.5;
                        transition: background-color 0.2s ease;
                    }

                    .dropdown-item:hover {
                        background-color: #f5f5f5;
                    }

                    .dropdown-item-text {
                        flex: 1;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        margin-right: 8px;
                    }

                    .add-button {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        background-color: #e8e8e8;
                        color: #666;
                        font-size: 14px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .add-button:hover {
                        background-color: #d0d0d0;
                        color: #333;
                    }
                    
                    @keyframes fadeInOut {
                        0% { opacity: 0; transform: translateY(-20px); }
                        10% { opacity: 1; transform: translateY(0); }
                        90% { opacity: 1; transform: translateY(0); }
                        100% { opacity: 0; transform: translateY(-20px); }
                    }
                </style>
            </head>
            <body>
                <div class="frames-container">
                    ${urls.map((url, index) => `
                        <div class="webview-container" data-frame-index="${index}" style="order: ${index}">
                            <div class="webview-toolbar-area">
                                <div class="webview-toolbar">
                                    <button class="toolbar-button ai-select" title="选择AI平台">🔽</button>
                                    <button class="toolbar-button move-left" title="向左移动">⬅️</button>
                                    <button class="toolbar-button move-right" title="向右移动">➡️</button>
                                    <button class="toolbar-button save-chat" title="保存对话">💾</button>
                                    <button class="toolbar-button refresh" title="刷新">🔄</button>
                                    <button class="toolbar-button maximize" title="最大化">🔍</button>
                                    <button class="toolbar-button danger close" title="关闭">❌</button>
                                </div>
                            </div>
                            <webview src="${url}" 
                                    data-frame-index="${index}"
                                    webpreferences="contextIsolation=false"
                                    allowpopups>
                            </webview>
                        </div>
                    `).join('')}
                </div>
                <div class="central-prompt-container" style="display: none;">
                    <div class="central-prompt-overlay"></div>
                    <div class="central-prompt-content">
                        <textarea class="central-prompt-input" placeholder="输入提示词..."></textarea>
                        <div class="central-prompt-buttons">
                            <button class="central-prompt-send">发送到所有</button>
                            <button class="central-prompt-cancel">取消</button>
                        </div>
                    </div>
                </div>
                <div class="prompt-container">
                    <div class="resize-handle">
                        <span></span>
                    </div>
                    <div class="prompt-input-wrapper">
                        <textarea class="prompt-input" placeholder="输入提示词...按 Ctrl+Enter 发送"></textarea>
                        <div class="button-container">
                            <button class="send-button" onclick="window.sendToAll()">发送到所有</button>
                            <button class="clear-button" onclick="window.clearPrompt()">清空</button>
                        </div>
                    </div>
                </div>

                <script>
                    let isDragging = false;
                    let startY = 0;
                    let startHeight = 0;
                    const promptContainer = document.querySelector('.prompt-container');
                    const framesContainer = document.querySelector('.frames-container');
                    const resizeHandle = document.querySelector('.resize-handle');
                    
                    // 工具栏功能实现
                    document.querySelectorAll('.webview-container').forEach(container => {
                        const toolbar = container.querySelector('.webview-toolbar');
                        const webview = container.querySelector('webview');
                        const index = parseInt(container.dataset.frameIndex);

                        

                        // 向左移动
                        toolbar.querySelector('.move-left').addEventListener('click', () => {
                            const currentIndex = parseInt(container.dataset.frameIndex);
                            if (currentIndex > 0) {
                                const currentContainer = container;
                                const targetContainer = document.querySelector(\`.webview-container[data-frame-index="\${currentIndex - 1}"]\`);
                                
                                if (targetContainer) {
                                    // 交换frame-index
                                    const tempIndex = currentContainer.dataset.frameIndex;
                                    currentContainer.dataset.frameIndex = targetContainer.dataset.frameIndex;
                                    targetContainer.dataset.frameIndex = tempIndex;
                                    
                                    // 使用order属性交换位置
                                    const currentOrder = currentContainer.style.order || currentIndex;
                                    const targetOrder = targetContainer.style.order || (currentIndex - 1);
                                    currentContainer.style.order = targetOrder;
                                    targetContainer.style.order = currentOrder;
                                    
                                    // 更新按钮状态
                                    updateMoveButtons();
                                }
                            }
                        });

                        // 向右移动
                        toolbar.querySelector('.move-right').addEventListener('click', () => {
                            const currentIndex = parseInt(container.dataset.frameIndex);
                            const totalFrames = document.querySelectorAll('.webview-container').length;
                            if (currentIndex < totalFrames - 1) {
                                const currentContainer = container;
                                const targetContainer = document.querySelector(\`.webview-container[data-frame-index="\${currentIndex + 1}"]\`);
                                
                                if (targetContainer) {
                                    // 交换frame-index
                                    const tempIndex = currentContainer.dataset.frameIndex;
                                    currentContainer.dataset.frameIndex = targetContainer.dataset.frameIndex;
                                    targetContainer.dataset.frameIndex = tempIndex;
                                    
                                    // 使用order属性交换位置
                                    const currentOrder = currentContainer.style.order || currentIndex;
                                    const targetOrder = targetContainer.style.order || (currentIndex + 1);
                                    currentContainer.style.order = targetOrder;
                                    targetContainer.style.order = currentOrder;
                                    
                                    // 更新按钮状态
                                    updateMoveButtons();
                                }
                            }
                        });

                        // 刷新
                        toolbar.querySelector('.refresh').addEventListener('click', () => {
                            webview.reload();
                        });

                        // 最大化/还原
                        let isMaximized = false;
                        const maximizeButton = toolbar.querySelector('.maximize');
                        maximizeButton.addEventListener('click', () => {
                            if (isMaximized) {
                                // 还原到原始大小
                                container.style.position = '';
                                container.style.zIndex = '';
                                container.style.top = '';
                                container.style.left = '';
                                container.style.width = '';
                                container.style.height = '';
                                container.style.gridColumn = '';
                                maximizeButton.textContent = '🔍';
                                maximizeButton.title = '最大化';
                            } else {
                                // 最大化到整个窗口
                                container.style.position = 'fixed';
                                container.style.zIndex = '1000';
                                container.style.top = '0';
                                container.style.left = '0';
                                container.style.width = '100%';
                                container.style.height = '100%';
                                container.style.gridColumn = '1 / -1';
                                maximizeButton.textContent = '🪟';
                                maximizeButton.title = '还原';
                            }
                            isMaximized = !isMaximized;
                        });

                        // ESC键监听
                        document.addEventListener('keydown', (e) => {
                            if (e.key === 'Escape' && isMaximized) {
                                // 还原到原始大小
                                container.style.position = '';
                                container.style.zIndex = '';
                                container.style.top = '';
                                container.style.left = '';
                                container.style.width = '';
                                container.style.height = '';
                                container.style.gridColumn = '';
                                maximizeButton.textContent = '🔍';
                                maximizeButton.title = '最大化';
                                isMaximized = false;
                            }
                        });

                        // 关闭按钮
                        toolbar.querySelector('.close').addEventListener('click', (e) => {
                            e.stopPropagation();
                            const totalFrames = document.querySelectorAll('.webview-container').length;
                            if (totalFrames > 1) {
                                // 移除当前容器
                                container.remove();
        
                                // 重新计算剩余容器的宽度
                                const remainingContainers = document.querySelectorAll('.webview-container');
                                const width = 100 / remainingContainers.length;
                                remainingContainers.forEach(cont => {
                                    cont.style.flex = '1 0 ' + width + '%';
                                    cont.style.maxWidth = width + '%';
                                });
        
                                // 更新所有容器的索引
                                remainingContainers.forEach((cont, idx) => {
                                    cont.setAttribute('data-index', idx);
                                });
        
                                // 更新移动按钮状态
                                this.updateMoveButtons();
                            }
                        });

                      // AI平台选择
                      const aiSelectButton = toolbar.querySelector('.ai-select');
                      aiSelectButton.addEventListener('click', async (e) => {
                          try {
                              const { ipcRenderer } = require('electron');
        
                              // 获取启用的AI平台列表
                              const response = await new Promise((resolve) => {
                                  ipcRenderer.once('get-enabled-frames-response', (event, data) => {
                                      resolve(data);
                                  });
                                  ipcRenderer.send('get-enabled-frames');
                              });

                              // 创建下拉菜单
                              const dropdown = document.createElement('div');
                              dropdown.className = 'dropdown-menu show';

                              response.frames.forEach(frame => {
                                  const item = document.createElement('div');
                                  item.className = 'dropdown-item';

                                  // 创建文本元素
                                  const textSpan = document.createElement('span');
                                  textSpan.className = 'dropdown-item-text';
                                  textSpan.textContent = frame.name;

                                  // 创建添加按钮
                                  const addButton = document.createElement('span');
                                  addButton.className = 'add-button';
                                  addButton.textContent = '+';

                                  // 添加到菜单项
                                  item.appendChild(textSpan);
                                  item.appendChild(addButton);

                                  dropdown.appendChild(item);

                                  // 文本点击事件：在当前webview中切换URL
                                  textSpan.addEventListener('click', async () => {
                                      // 切换当前webview的URL
                                      await new Promise((resolve) => {
                                          ipcRenderer.once('switch-frame-url-response', (event, data) => {
                                              if (data.success) {
                                                  webview.src = frame.url;
                                              }
                                              resolve();
                                          });
                                          ipcRenderer.send('switch-frame-url', { frameIndex: index, url: frame.url });
                                      });

                                      // 移除下拉菜单
                                      dropdown.remove();
                                  });

                                  // 添加按钮点击事件：在右侧添加新webview
                                  addButton.addEventListener('click', async (e) => {
                                      e.stopPropagation();
                                      // 在指定位置添加新的webview
                                      await new Promise((resolve) => {
                                          ipcRenderer.once('add-frame-response', (event, data) => {
                                              if (data.success) {
                                                  // 创建新的webview容器
                                                  const newContainer = container.cloneNode(true);
                                                  const newWebview = newContainer.querySelector('webview');
                                                  newWebview.src = frame.url;

                                                  // 更新frame索引
                                                  const newIndex = index + 1;
                                                  newContainer.dataset.frameIndex = newIndex;

                                                  // 插入到当前容器后面
                                                  container.parentNode.insertBefore(newContainer, container.nextSibling);

                                                  // 重新初始化新容器的事件监听
                                                  initializeContainer(newContainer);

                                                  // 更新移动按钮状态
                                                  updateMoveButtons();

                                                  // 更新所有容器的宽度
                                                  const containers = document.querySelectorAll('.webview-container');
                                                  const totalWidth = 100;
                                                  const width = totalWidth / containers.length;
                                                  containers.forEach(cont => {
                                                      cont.style.flex = '1 0 ' + width + '%';
                                                      cont.style.maxWidth = width + '%';
                                                  });
                                              }
                                              resolve();
                                          });
                                          ipcRenderer.send('add-frame', { frameIndex: index, url: frame.url });
                                      });
                                      dropdown.remove();
                                  });
                              });

                              // 添加下拉菜单到DOM
                              toolbar.appendChild(dropdown);

                              // 点击其他地方关闭下拉菜单
                              const closeDropdown = (event) => {
                                  if (!dropdown.contains(event.target) && !aiSelectButton.contains(event.target)) {
                                      dropdown.remove();
                                      document.removeEventListener('click', closeDropdown);
                                  }
                              };
                              document.addEventListener('click', closeDropdown);

                              e.stopPropagation();
                          } catch (error) {
                              console.error('Error in AI platform selection:', error);
                          }
                      });

                    });

                    // 初始化按钮状态
                    function updateMoveButtons() {
                        document.querySelectorAll('.webview-container').forEach(container => {
                            const toolbar = container.querySelector('.webview-toolbar');
                            const leftButton = toolbar.querySelector('.move-left');
                            const rightButton = toolbar.querySelector('.move-right');
                            const currentIndex = parseInt(container.dataset.frameIndex);
                            const totalFrames = document.querySelectorAll('.webview-container').length;

                            // 禁用最左侧webview的左移按钮
                            if (currentIndex === 0) {
                                leftButton.classList.add('disabled');
                            } else {
                                leftButton.classList.remove('disabled');
                            }

                            // 禁用最右侧webview的右移按钮
                            if (currentIndex === totalFrames - 1) {
                                rightButton.classList.add('disabled');
                            } else {
                                rightButton.classList.remove('disabled');
                            }
                        });
                    }

                    updateMoveButtons();

                    // 发送到所有窗口的函数
                    window.sendToAll = async () => {
                        const promptInput = document.querySelector('.prompt-input');
                        const text = promptInput.value.trim();
                        if (!text) return;

                        try {
                            const { ipcRenderer } = require('electron');
                            const results = await new Promise((resolve, reject) => {
                                ipcRenderer.once('send-to-all-ai-response', (event, response) => {
                                    if (response.success) {
                                        resolve(response.results);
                                    } else {
                                        reject(response.error);
                                    }
                                });
                                ipcRenderer.send('send-to-all-ai', text);
                            });

                            const scriptSuccess = results && results.some(result =>
                                result && result.status !== 'error' && !result.error
                            );

                            if (scriptSuccess) {
                                promptInput.value = '';
                                const notice = document.createElement('div');
                                notice.className = 'success-notice';
                                notice.textContent = '发送成功';
                                document.body.appendChild(notice);
                                setTimeout(() => notice.remove(), 2000);
                            } else {
                                const notice = document.createElement('div');
                                notice.className = 'error-notice';
                                notice.textContent = '发送失败，请重试';
                                document.body.appendChild(notice);
                                setTimeout(() => notice.remove(), 2000);
                            }
                        } catch (error) {
                            console.error('发送失败:', error);
                            const notice = document.createElement('div');
                            notice.className = 'error-notice';
                            notice.textContent = '发送失败：' + error.message;
                            document.body.appendChild(notice);
                            setTimeout(() => notice.remove(), 2000);
                        }
                    };

                    // 添加快捷键支持
                    document.querySelector('.prompt-input').addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            window.sendToAll();
                            e.preventDefault();
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }

    async searchBeforeSend(text) {
        // 如果搜索功能被禁用，直接返回原文
        if (this.settings.searchMode === SearchMode.DISABLED) {
            console.log('搜索功能已禁用，使用原文');
            return text;
        }

        new Notice('正在搜索相关内容...');
        const searchTimeout = 3000;
        const searchPromise = this.searchInVault(text);

        try {
            const searchResult = await Promise.race([
                searchPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Search timeout')), searchTimeout)
                )
            ]);

            if (searchResult) {
                console.log('处理搜索结果:', searchResult.title);
                const enrichedText = `问题：${text}\n\n相关内容：\n标题：${searchResult.title}\n内容：${searchResult.content}\n\n请根据以上相关内容回答问题。如果相关内容不足或者内容被截断，可以基于你的知识补充回答。`;
                new Notice('已找到相关内容');
                return enrichedText;
            } else {
                console.log('未找到搜索结果，使用原文');
                return text;
            }
        } catch (error) {
            if (error.message === 'Search timeout') {
                console.log('搜索超时，使用原始文本发送');
                new Notice('搜索超时，使用原始文本');
            } else {
                console.error('搜索出错:', error);
                new Notice('搜索出错，使用原始文本');
            }

            return text;
        }
    }

    // 在MultiAIDialog类中更新searchInVault方法
    async searchInVault(query) {
        try {
            const search = new EnhancedSearch(this.app, this.settings);
            const currentFile = this.app.workspace.getActiveFile();

            // 使用 searchInContext 方法来遵循搜索模式设置
            const searchResults = await search.searchInContext(query, {
                limit: this.settings.maxResults || 5
            });

            console.log('Search results:', {
                mode: this.settings.searchMode,
                vault: searchResults.vault,
                smart: searchResults.smart,
                combined: searchResults.combined
            });

            // 根据搜索模式返回适当的结果
            switch (this.settings.searchMode) {
                case SearchMode.DISABLED:
                    console.log('搜索功能已禁用');
                    new Notice('搜索功能已禁用');
                    return null;

                case SearchMode.VAULT_ONLY:
                    if (!searchResults.vault) {
                        console.log('未找到Vault搜索结果');
                        new Notice('未找到相关内容');
                        return null;
                    }
                    return searchResults.vault;

                case SearchMode.SMART_ONLY:
                    console.log('Smart search results length:', searchResults.smart?.length);
                    if (!searchResults.smart || searchResults.smart.length === 0) {
                        console.log('未找到Smart搜索结果');
                        new Notice('未找到相关内容');
                        return null;
                    }
                    const smartResult = {
                        title: `找到 ${searchResults.smart.length} 个智能搜索匹配结果`,
                        content: searchResults.smart.map(result =>
                            `\n## ${result.path}\n${result.content}`
                        ).join('\n')
                    };
                    console.log('Smart search formatted result:', smartResult);
                    return smartResult;

                case SearchMode.COMBINED:
                    let combinedContent = '';

                    if (searchResults.vault?.content) {
                        combinedContent += '\n### 关键词搜索结果：\n' + searchResults.vault.content;
                    }

                    if (searchResults.smart && searchResults.smart.length > 0) {
                        combinedContent += '\n### 智能语义搜索结果：\n' +
                            searchResults.smart.map(result =>
                                `\n## ${result.path}\n${result.content}`
                            ).join('\n');
                    }

                    if (!combinedContent) {
                        console.log('未找到任何搜索结果');
                        new Notice('未找到相关内容');
                        return null;
                    }

                    return {
                        title: '组合搜索结果',
                        content: combinedContent
                    };

                default:
                    console.warn('未知的搜索模式:', this.settings.searchMode);
                    new Notice('未知的搜索模式');
                    return null;
            }
        } catch (error) {
            console.error('搜索过程出错:', error);
            new Notice('搜索过程出错');
            return null;
        }
    }

    async validateWindowState() {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
            console.log('No main window available');
            new Notice('请先打开AI对话窗口');
            return false;
        }
        return true;
    }

    async sendToAllAI(text) {
        try {
            console.log('Starting sendToAllAI...');

            // 1. Prepare and validate text（removed to when ctrl+enter）

            // 2. Validate window state
            console.log('2. Validating window state...');
            if (!this.validateWindowState()) {
                console.log('Window state validation failed');
                return;
            }
            console.log('Window state valid');

            // 3. Search and enrich text
            console.log('3. Searching for relevant content...');
            const enrichedText = await this.searchBeforeSend(text);
            console.log('Search completed, enriched text:', enrichedText);

            // 5. Get webviews information
            console.log('5. Checking webviews...');
            const webviewDetails = await this.mainWindow.webContents.executeJavaScript(`
                (function() {
                    try {
                        const webviews = document.querySelectorAll('webview');
                        console.log('Total webviews found:', webviews.length);

                        return Array.from(webviews).map(wv => ({
                            url: wv.src || 'no-src',
                            isConnected: wv.isConnected
                        }));
                    } catch (error) {
                        console.error('Error in webview check:', error);
                        return [];
                    }
                })()
            `);

            console.log('Webview details:', JSON.stringify(webviewDetails, null, 2));

            // 6. Send to all detected webviews in parallel
            console.log('6. Starting to send messages to platforms in parallel...');
            const sendPromises = webviewDetails.map(async (webview) => {
                try {
                    // 根据 URL 找到对应的平台配置
                    const platform = Object.values(SUPPORTED_PLATFORMS).find(p =>
                        webview.url.includes(p.url)
                    );

                    if (!platform) {
                        console.log(`No platform config found for URL: ${webview.url}`);
                        return null;
                    }

                    console.log(`Found platform ${platform.displayName} for URL: ${webview.url}`);
                    return await this.sendToAI(this.mainWindow, platform.key, enrichedText, webview.url);
                } catch (error) {
                    console.error(`Error processing webview:`, error);
                    return {
                        platform: webview.url,
                        status: 'error',
                        error: error.message
                    };
                }
            });

            // Wait for all send operations to complete
            const results = await Promise.all(sendPromises);

            // Log results and check if any succeeded
            let hasSuccessfulSend = false;
            results.forEach(result => {
                if (result === true) {
                    hasSuccessfulSend = true;
                    console.log(`Send result:`, result);
                }
            });

            if (!hasSuccessfulSend) {
                new Notice('发送消息失败，请重试');
                return results;
            }

            // 7. 记录提示词
            console.log('7. Recording prompt...');
            if (this.settings.promptHistorySettings.enabled) {
                // 获取当前所有webview的URL
                const webviews = await this.mainWindow.webContents.executeJavaScript(`
                    (function() {
                        try {
                            return Array.from(document.querySelectorAll('webview')).map(wv => ({
                                url: wv.getURL()
                            }));
                        } catch (error) {
                            console.error('Error getting webview details:', error);
                            return [];
                        }
                    })()
                `);
                await this.recordPrompt(text, webviews);
            }

            console.log('8. All operations completed successfully');

            return results;
        } catch (error) {
            console.error('Error in sendToAllAI:', error);
            new Notice('发送消息时出错，请重试');
            return [];
        }
    }

    async sendToAI(mainWindow, platform, message, url) {
        try {
            console.log(`Starting sendToAI for platform: ${platform}`);

            if (!PLATFORM_SELECTORS[platform]) {
                console.error('未知的平台:', platform);
                return false;
            }

            const selectors = PLATFORM_SELECTORS[platform];
            console.log(`Using selectors for ${platform}:`, selectors);

            // 使用视觉相似的字符替换特殊字符
            const safeMessage = message
                .replace(/"/g, '＂')  // 替换双引号为全角双引号
                .replace(/'/g, '＇')  // 替换单引号为全角单引号
                .replace(/`/g, '｀')  // 替换反引号为全角反引号
                .replace(/\\/g, '＼') // 替换反斜杠为全角反斜杠
                .replace(/\n/g, '↵')  // 替换换行为向下箭头
                .replace(/\r/g, '')   // 移除回车符
                .replace(/\$/g, '＄'); // 替换美元符号为全角美元符号

            console.log('处理后的消息:', safeMessage);

            // 在主窗口中执行脚本
            const script = `
                (async function() {
                    try {
                        // 根据 URL 找到对应的 webview
                        const webviews = document.querySelectorAll('webview');
                        console.log('Total webviews found:', webviews.length);

                        const webview = Array.from(webviews).find(wv => wv.src && wv.src.includes('${url}'));
                        if (!webview) {
                            console.error('未找到 webview');
                            return false;
                        }
                        console.log('找到 webview, URL:', webview.src);

                        // 添加控制台消息监听器
                        webview.addEventListener('console-message', (event) => {
                            console.log(\`[${platform} Webview] \${event.message}\`);
                        });

                        // 在 webview 中执行脚本
                        const result = await webview.executeJavaScript(\`
                            (async function() {
                                try {
                                    console.log('Starting script execution for ${platform}');
                                    
                                    // 查找输入框
                                    const input = document.querySelector('${selectors.input}');
                                    console.log('Input selector:', '${selectors.input}');
                                    if (!input) {
                                        console.error('未找到输入框');
                                        return false;
                                    }
                                    console.log('找到输入框:', input.tagName);

                                    // 聚焦和清空输入框
                                    input.focus();
                                    document.execCommand('selectAll', false, null);
                                    document.execCommand('delete', false, null);
                                    console.log('输入框已清空');

                                    await new Promise(resolve => setTimeout(resolve, 100));
                                    // 注入替换后的文本
                                    document.execCommand('insertText', false, "${safeMessage}");
                                    console.log('文本已注入:', input.value);

                                    // 等待文本注入完成
                                    await new Promise(resolve => setTimeout(resolve, 500));

                                    // 尝试查找发送按钮（多种方式）
                                    console.log('Trying to find button with selector:', '${selectors.button}');
                                    let button = document.querySelector('${selectors.button}');

                                    // 统一的点击处理逻辑
                                    const simulateClick = (element) => {
                                        try {
                                            // 使用完整的鼠标事件序列
                                            ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                                                const event = new MouseEvent(eventType, {
                                                    bubbles: true,
                                                    cancelable: true,
                                                    view: window
                                                });
                                                element.dispatchEvent(event);
                                            });
                                            console.log('Mouse event sequence dispatched successfully');
                                            return true;
                                        } catch (error) {
                                            console.error('Failed to simulate click:', error);
                                            return false;
                                        }
                                    };

                                    // 执行点击
                                    if (!simulateClick(button)) {
                                        console.error('Click simulation failed');
                                        return false;
                                    }

                                    console.log('已点击发送按钮');
                                    return true;
                                } catch (error) {
                                    console.error('执行出错:', error);
                                    return false;
                                }
                            })()
                        \`);
                        
                        return result;
                    } catch (error) {
                        console.error('在 webview 中执行脚本时出错:', error);
                        return false;
                    }
                })()
            `;

            console.log('Executing script in main window...');
            const result = await mainWindow.webContents.executeJavaScript(script);
            console.log(`Script execution result for ${platform}:`, result);
            return result;
        } catch (error) {
            console.error('发送消息时出错:', error);
            return false;
        }
    }

    async getAIResponse(mainWindow, platform) {
        try {
            console.log(`Getting response for platform: ${platform}`);

            if (!PLATFORM_SELECTORS[platform]) {
                console.error(`No configuration found for platform: ${platform}`);
                return null;
            }

            const url = SUPPORTED_PLATFORMS[platform].url;
            const selectors = PLATFORM_SELECTORS[platform];
            console.log(`Using selectors for ${platform}:`, selectors);

            // 在主窗口中执行脚本
            const script = `
                (async function() {
                    try {
                        // 根据 URL 找到对应的 webview
                        const webviews = document.querySelectorAll('webview');
                        console.log('Total webviews found:', webviews.length);

                        const webview = Array.from(webviews).find(wv => wv.src && wv.src.includes('${url}'));
                        if (!webview) {
                            console.error('未找到 webview');
                            return null;
                        }
                        console.log('找到 webview, URL:', webview.src);

                        // 在 webview 中执行脚本
                        const response = await webview.executeJavaScript(\`
                            (function() {
                                const responseElement = document.querySelector('${selectors.responseSelector}');
                                return responseElement ? responseElement.innerText || responseElement.textContent : null;
                            })()
                        \`);

                        return response;
                    } catch (error) {
                        console.error('获取响应时出错:', error);
                        return null;
                    }
                })()
            `;

            const response = await mainWindow.webContents.executeJavaScript(script);
            console.log(`Got response from ${platform}:`, response);
            return response;
        } catch (error) {
            console.error('获取响应时出错:', error);
            return null;
        }
    }

    async saveDialogRecord(prompt, responses = []) {
        if (!this.settings.dialogRecord.enabled) {
            return;
        }

        try {
            const { folderPath, fileName, template } = this.settings.dialogRecord;

            // 确保目录存在
            const folderExists = await this.app.vault.adapter.exists(folderPath);
            if (!folderExists) {
                await this.app.vault.createFolder(folderPath);
            }

            const filePath = `${folderPath}/${fileName}`;
            let fileContent = '';

            // 检查文件是否存在
            const fileExists = await this.app.vault.adapter.exists(filePath);
            if (fileExists) {
                const file = this.app.vault.getAbstractFileByPath(filePath);
                fileContent = await this.app.vault.read(file);
            }

            // 生成新记录
            const now = new Date();
            const datetime = now.toLocaleString();
            const responsesText = responses.map(r =>
                `**${r.platform}**:\n${r.response}\n`
            ).join('\n');

            let record = template
                .replace('{{datetime}}', datetime)
                .replace('{{prompt}}', prompt)
                .replace('{{response}}', responsesText || '等待回复...');

            // 在文件末尾添加新记录（如果文件已存在内容，先添加一个换行）
            fileContent = fileContent + (fileContent ? '\n\n' : '') + record;

            // 保存或更新文件
            if (fileExists) {
                const file = this.app.vault.getAbstractFileByPath(filePath);
                await this.app.vault.modify(file, fileContent);
            } else {
                await this.app.vault.create(filePath, fileContent);
            }

            console.log('Dialog record saved successfully');
        } catch (error) {
            console.error('Error saving dialog record:', error);
            new Notice('保存对话记录失败');
        }
    }

    async checkEnabledFramesCount() {
        const enabledCount = this.settings.frames.filter(frame => frame.enabled).length;
        if (enabledCount < this.settings.frameCount) {
            new Notice(`启用的AI数量(${enabledCount})小于窗口数量(${this.settings.frameCount})，已自动调整窗口数量`);
            this.settings.frameCount = enabledCount;
            await this.saveSettings();
        }
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf;
        const leaves = workspace.getLeavesOfType("prompt-history-view");

        if (leaves.length > 0) {
            // 如果视图已经打开，激活它
            leaf = leaves[0];
            workspace.revealLeaf(leaf);
        } else {
            // 在右侧边栏创建新视图
            leaf = workspace.getRightLeaf(false);
            await leaf.setViewState({
                type: "prompt-history-view",
                active: true,
            });
        }
    }

    async insertPromptToEditor(content) {
        if (!content) return;

        try {
            // 获取当前活动编辑器
            let activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            let leaf = this.app.workspace.activeLeaf;

            // 如果没有活动编辑器，创建新笔记
            if (!activeView) {
                const timestamp = new Date().toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                }).replace(/[\/\s:]/g, '');
                const newNoteName = `AI对话记录_${timestamp}.md`;

                // 创建新文件
                const file = await this.app.vault.create(newNoteName, '');
                leaf = this.app.workspace.getLeaf('tab');
                await leaf.openFile(file);
                activeView = leaf.view;
            }

            const editor = activeView.editor;
            if (!editor) {
                new Notice('无法访问编辑器');
                return;
            }

            // 在文档末尾添加内容
            const currentContent = editor.getValue();
            const insertContent = currentContent
                ? `${currentContent}\n\n${content}`
                : content;

            editor.setValue(insertContent);

            // 将光标移到末尾
            const lastLine = editor.lineCount() - 1;
            const lastLineLength = editor.getLine(lastLine).length;
            editor.setCursor(lastLine, lastLineLength);

            // 聚焦编辑器
            editor.focus();
            new Notice('已插入提示词到笔记末尾');
        } catch (error) {
            console.error('插入提示词时出错:', error);
            new Notice('插入提示词失败');
        }
    }

    async savePromptHistory() {
        await this.saveData(this.promptHistory);
    }

    async loadPromptHistory() {
        const data = await this.loadData();
        if (data && data.prompts) {
            this.promptHistory.prompts = data.prompts;
        }
    }

    async recordPrompt(content, webviews) {
        try {
            // 检查是否启用提示词历史
            if (!this.settings.promptHistorySettings.enabled) {
                console.log('提示词历史功能已禁用');
                return;
            }

            // 创建新的提示词记录
            const timestamp = Date.now();
            const newPrompt = {
                id: timestamp.toString(),
                content: content,
                timestamp: timestamp,
                webviews: webviews || [],
                favorite: false
            };

            // 添加到 data.json 中的历史记录
            // if (!this.settings.promptHistory) {
            //    this.settings.promptHistory = [];
            // }
            //this.settings.promptHistory.unshift(newPrompt);

            // 限制历史记录数量
            // const maxHistory = this.settings.promptHistorySettings.maxHistory || 100;
            // if (this.settings.promptHistory.length > maxHistory) {
            //    this.settings.promptHistory = this.settings.promptHistory.slice(0, maxHistory);
            // }

            // 保存到 data.json
            // await this.saveSettings();

            // 如果启用了新存储位置，也保存到新位置
            if (this.settings.promptHistorySettings.useNewStorage) {
                // 确保 newStorageFolder 有值
                if (!this.settings.promptHistorySettings.newStorageFolder) {
                    this.settings.promptHistorySettings.newStorageFolder = '.multi-ai-dialog';
                    await this.saveSettings();
                }

                // 使用 PromptHistoryData 类保存到新位置
                if (!this.promptHistoryData) {
                    this.promptHistoryData = new PromptHistoryData(this);
                }
                await this.promptHistoryData.addPrompt(content, webviews);
            }

            console.log('提示词记录已保存');

            // 获取提示词历史视图并更新
            const leaf = this.app.workspace.getLeavesOfType('prompt-history-view')[0];
            if (leaf && leaf.view) {
                await leaf.view.loadData();
                leaf.view.updateDisplay();
            }
        } catch (error) {
            console.error('记录提示词时出错:', error);
            new Notice('记录提示词时出错');
        }
    }

    async openWebview(url) {
        if (!url) return;
        await this.openMultiAIViewWithUrls([url]);
    }

    async openAllWebviews(webviews) {
        try {
            console.log('Opening multiple webviews from history');
            if (!webviews || webviews.length === 0) return;
            const urls = webviews.map(wv => wv.url).filter(url => url);
            if (urls.length === 0) return;
            await this.openMultiAIViewWithUrls(urls);
        } catch (error) {
            console.error('Error opening all webviews:', error);
            new Notice('打开链接时出错');
        }
    }

    getPlatformFromUrl(url) {
        if (!url) return '';
        const platform = Object.values(SUPPORTED_PLATFORMS).find(p => url.includes(p.url));
        return platform ? platform.key : new URL(url).hostname;
    }
}

/**
 * MultiAIDialogSettingTab 类为 MultiAIDialog 插件提供设置界面，允许用户配置
 * 搜索模式、最大结果数、上下文长度、对话记录设置、AI窗口数量和具体AI平台配置。
 * 通过直观的UI组件，用户可以轻松管理和调整插件的行为和集成的AI平台。
 */

class MultiAIDialogSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: '多AI对话设置' });

        // AI窗口设置
        containerEl.createEl('h3', { text: 'AI窗口设置' });

        new Setting(containerEl)
            .setName('窗口数量')
            .setDesc('同时显示的AI窗口数量')
            .addSlider(slider => slider
                .setLimits(1, Math.max(this.plugin.settings.frames.filter(f => f.enabled).length, 1), 1)
                .setValue(this.plugin.settings.frameCount)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.frameCount = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('显示提示输入')
            .setDesc('是否显示提示输入框')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showPromptInput)
                .onChange(async (value) => {
                    this.plugin.settings.showPromptInput = value;
                    await this.plugin.saveSettings();
                }));

        // 搜索设置部分
        new Setting(containerEl)
            .setName('搜索模式')
            .setDesc('设置搜索模式')
            .addDropdown(dropdown => {
                dropdown
                    .addOption(SearchMode.DISABLED, '禁用搜索')
                    .addOption(SearchMode.VAULT_ONLY, '仅Vault搜索')
                    .addOption(SearchMode.SMART_ONLY, '仅智能搜索')
                    .addOption(SearchMode.COMBINED, '组合搜索')
                    .setValue(this.plugin.settings.searchMode)
                    .onChange(async (value) => {
                        this.plugin.settings.searchMode = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('最大结果数')
            .setDesc('搜索返回的最大结果数')
            .addText(text => text
                .setPlaceholder('3')
                .setValue(this.plugin.settings.maxResults?.toString() || '3')
                .onChange(async (value) => {
                    const numValue = parseInt(value);
                    if (!isNaN(numValue) && numValue > 0) {
                        this.plugin.settings.maxResults = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('上下文长度')
            .setDesc('搜索结果显示的上下文长度')
            .addText(text => text
                .setPlaceholder('150')
                .setValue(this.plugin.settings.contextLength?.toString() || '150')
                .onChange(async (value) => {
                    const numValue = parseInt(value);
                    if (!isNaN(numValue) && numValue > 0) {
                        this.plugin.settings.contextLength = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        // 对话记录设置
        containerEl.createEl('h3', { text: '对话记录设置' });

        new Setting(containerEl)
            .setName('启用对话记录')
            .setDesc('是否保存对话记录')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.dialogRecord.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.dialogRecord.enabled = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('记录保存路径')
            .setDesc('对话记录保存的文件夹路径')
            .addText(text => text
                .setPlaceholder('对话记录')
                .setValue(this.plugin.settings.dialogRecord.folderPath)
                .onChange(async (value) => {
                    this.plugin.settings.dialogRecord.folderPath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('记录文件名')
            .setDesc('对话记录保存的文件名')
            .addText(text => text
                .setPlaceholder('AI对话记录.md')
                .setValue(this.plugin.settings.dialogRecord.fileName)
                .onChange(async (value) => {
                    this.plugin.settings.dialogRecord.fileName = value;
                    await this.plugin.saveSettings();
                }));

        // 提示词历史设置
        containerEl.createEl('h3', { text: '提示词历史记录设置' });

        new Setting(containerEl)
            .setName('启用提示词历史')
            .setDesc('是否记录提示词历史')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.promptHistorySettings.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.promptHistorySettings.enabled = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('使用新的存储位置')
            .setDesc('将提示词历史保存到 vault 根目录下的指定文件夹中')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.promptHistorySettings.useNewStorage)
                .onChange(async (value) => {
                    this.plugin.settings.promptHistorySettings.useNewStorage = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('新存储文件夹')
            .setDesc('存储提示词历史的文件夹路径（相对于 vault 根目录）')
            .addText(text => text
                .setPlaceholder('.multi-ai-dialog')
                .setValue(this.plugin.settings.promptHistorySettings.newStorageFolder)
                .onChange(async (value) => {
                    this.plugin.settings.promptHistorySettings.newStorageFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('单个文件最大大小')
            .setDesc('超过此大小的文件将被分割（单位：MB）')
            .addSlider(slider => slider
                .setLimits(1, 10, 1)
                .setValue(this.plugin.settings.promptHistorySettings.maxFileSize / (1024 * 1024))
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.promptHistorySettings.maxFileSize = value * 1024 * 1024;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('最大历史记录数')
            .setDesc('保存的最大提示词历史记录数量')
            .addSlider(slider => slider
                .setLimits(10, 1000, 10)
                .setValue(this.plugin.settings.promptHistorySettings.maxHistory)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.promptHistorySettings.maxHistory = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('显示时间戳')
            .setDesc('在提示词历史中显示时间戳')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.promptHistorySettings.showTimestamp)
                .onChange(async (value) => {
                    this.plugin.settings.promptHistorySettings.showTimestamp = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('显示平台')
            .setDesc('在提示词历史中显示AI平台')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.promptHistorySettings.showPlatform)
                .onChange(async (value) => {
                    this.plugin.settings.promptHistorySettings.showPlatform = value;
                    await this.plugin.saveSettings();
                }));

        // AI列表设置

        containerEl.createEl('h3', { text: 'AI列表（拖动调整顺序）' });
        const aiListContainer = containerEl.createDiv('ai-list-container');
        const sortableContainer = aiListContainer.createEl('div', { cls: 'sortable-ai-list' });

        // 为每个AI创建一个可拖动的设置项
        this.plugin.settings.frames.forEach((frame, index) => {
            const aiItem = sortableContainer.createEl('div', {
                cls: 'sortable-ai-item',
                attr: { 'data-index': index }
            });

            // 添加拖动手柄
            const dragHandle = aiItem.createEl('div', { cls: 'drag-handle' });
            dragHandle.innerHTML = '⋮⋮';

            // AI信息容器（名称和URL）
            const aiInfoContainer = aiItem.createEl('div', { cls: 'ai-info-container' });
            aiInfoContainer.createEl('span', {
                text: frame.displayName + '：',
                cls: 'ai-name'
            });
            aiInfoContainer.createEl('span', {
                text: frame.url,
                cls: 'ai-url'
            });

            // 开关容器
            const toggleContainer = aiItem.createEl('div', { cls: 'toggle-container' });
            new Setting(toggleContainer)
                .setClass('compact-toggle')
                .addToggle(toggle => toggle
                    .setValue(frame.enabled)
                    .onChange(async (value) => {
                        this.plugin.settings.frames[index].enabled = value;
                        const enabledCount = this.plugin.settings.frames.filter(f => f.enabled).length;
                        if (enabledCount < this.plugin.settings.frameCount) {
                            this.plugin.settings.frameCount = enabledCount;
                        }
                        await this.plugin.saveSettings();
                        this.display(); // 刷新显示以更新滑块的最大值
                    }));
        });

        // 初始化拖拽排序
        this.initializeSortable(sortableContainer);

        // 添加CSS样式
        const styleEl = document.createElement('style');
        styleEl.setAttribute('type', 'text/css');
        styleEl.textContent = `
            .ai-list-container {
                margin-bottom: 30px;
            }
            .sortable-ai-list {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .sortable-ai-item {
                display: flex;
                align-items: center;
                background: var(--background-secondary);
                padding: 6px;
                border-radius: 4px;
                cursor: move;
            }
            .drag-handle {
                cursor: move;
                padding: 0 8px;
                color: var(--text-muted);
            }
            .ai-info-container {
                flex-grow: 1;
                display: flex;
                align-items: center;
                gap: 8px;
                min-width: 0;
            }
            .ai-name {
                font-weight: 500;
                white-space: nowrap;
            }
            .ai-url {
                color: var(--text-muted);
                font-size: 0.9em;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .toggle-container {
                margin-left: auto;
                padding-left: 16px;
            }
            .compact-toggle .setting-item {
                border: none;
                padding: 0;
            }
            .compact-toggle .setting-item-control {
                padding: 0;
            }
        `;
        document.head.appendChild(styleEl);
    }

    // 初始化拖拽排序
    initializeSortable(container) {
        let draggedItem = null;
        let draggedIndex = -1;

        container.addEventListener('dragstart', (e) => {
            draggedItem = e.target.closest('.sortable-ai-item');
            draggedIndex = Array.from(container.children).indexOf(draggedItem);
            draggedItem.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        container.addEventListener('dragend', async (e) => {
            draggedItem.classList.remove('dragging');
            const newIndex = Array.from(container.children).indexOf(draggedItem);

            if (draggedIndex !== newIndex) {
                // 更新设置中的顺序
                const frames = this.plugin.settings.frames;
                const [movedFrame] = frames.splice(draggedIndex, 1);
                frames.splice(newIndex, 0, movedFrame);
                await this.plugin.saveSettings();
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = this.getDragAfterElement(container, e.clientY);
            const draggable = document.querySelector('.dragging');
            if (afterElement) {
                container.insertBefore(draggable, afterElement);
            } else {
                container.appendChild(draggable);
            }
        });

        // 为每个AI项添加拖拽属性
        Array.from(container.children).forEach(child => {
            child.draggable = true;
        });
    }

    // 获取拖拽后的位置
    getDragAfterElement(container, y) {
        const draggableElements = [
            ...container.querySelectorAll('.sortable-ai-item:not(.dragging)')
        ];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
}

// 边栏提示词历史数据模型
class PromptHistoryData {
    constructor(plugin) {
        this.plugin = plugin;
        this.prompts = [];
        console.log('PromptHistoryData constructor called');
        this.loadData();
    }

    async getVaultRoot() {
        // 获取当前文件所在的 vault 根目录
        const adapter = this.plugin.app.vault.adapter;
        return adapter.getBasePath();
    }

    async ensureStorageFolder() {
        try {
            const vaultRoot = await this.getVaultRoot();
            const storageFolder = this.plugin.settings.promptHistorySettings.newStorageFolder || '.multi-ai-dialog';

            // 确保存储文件夹存在
            if (!await this.plugin.app.vault.adapter.exists(storageFolder)) {
                await this.plugin.app.vault.createFolder(storageFolder);
            }

            return storageFolder; // 返回相对路径
        } catch (error) {
            console.error('Error ensuring storage folder:', error);
            throw error;
        }
    }

    getMonthFileName(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `prompts-${year}-${month}.json`;
    }

    async getCurrentMonthFile() {
        try {
            const storageFolder = await this.ensureStorageFolder();
            const fileName = this.getMonthFileName(new Date());
            return `${storageFolder}/${fileName}`;
        } catch (error) {
            console.error('Error getting current month file:', error);
            throw error;
        }
    }

    async loadData() {
        try {
            console.log('Loading prompt history data...');
            // 加载旧数据
            const data = await this.plugin.loadData();
            let allPrompts = [];

            if (this.plugin.settings.promptHistorySettings.useNewStorage) {
                // 加载新存储位置的数据
                const storageFolder = await this.ensureStorageFolder();
                if (await this.plugin.app.vault.adapter.exists(storageFolder)) {
                    const files = await this.plugin.app.vault.adapter.list(storageFolder);

                    for (const file of files.files) {
                        if (file.endsWith('.json')) {
                            try {
                                const content = await this.plugin.app.vault.adapter.read(file);
                                const monthData = JSON.parse(content);
                                if (Array.isArray(monthData)) {
                                    allPrompts = allPrompts.concat(monthData);
                                }
                            } catch (e) {
                                console.error('Error loading file:', file, e);
                            }
                        }
                    }
                }
            }

            // 合并旧数据
            if (data?.promptHistory) {
                allPrompts = allPrompts.concat(data.promptHistory);
            }
            if (data?.prompts) {
                allPrompts = allPrompts.concat(data.prompts);
            }

            // 去重并按时间戳排序
            if (allPrompts.length > 0) {
                this.prompts = Array.from(new Map(
                    allPrompts.map(p => [p.id, {
                        ...p,
                        timestamp: typeof p.timestamp === 'string' ? new Date(p.timestamp).getTime() : p.timestamp
                    }])
                ).values()).sort((a, b) => b.timestamp - a.timestamp);
                console.log('Loaded and processed prompts:', this.prompts.length);
            }
        } catch (error) {
            console.error('Error loading prompt history:', error);
        }
    }

    async saveData() {
        try {
            console.log('Saving prompt history data...');

            if (this.plugin.settings.promptHistorySettings.useNewStorage) {
                const storageFolder = await this.ensureStorageFolder();

                // 按月份分组提示词
                const promptsByMonth = {};
                this.prompts.forEach(prompt => {
                    const date = new Date(prompt.timestamp);
                    const monthKey = this.getMonthFileName(date);
                    if (!promptsByMonth[monthKey]) {
                        promptsByMonth[monthKey] = [];
                    }
                    promptsByMonth[monthKey].push(prompt);
                });

                // 保存每个月的数据到单独的文件
                for (const [monthFile, monthPrompts] of Object.entries(promptsByMonth)) {
                    const filePath = `${storageFolder}/${monthFile}`;
                    try {
                        await this.plugin.app.vault.adapter.write(
                            filePath,
                            JSON.stringify(monthPrompts, null, 2)
                        );
                    } catch (e) {
                        console.error('Error saving file:', filePath, e);
                    }
                }
            }
        } catch (error) {
            console.error('Error saving prompt history:', error);
            throw error;
        }
    }

    splitIntoChunks(prompts) {
        const maxSize = this.plugin.settings.promptHistorySettings.maxFileSize;
        const chunks = [];
        let currentChunk = [];
        let currentSize = 0;

        for (const prompt of prompts) {
            const promptSize = JSON.stringify(prompt).length;
            if (currentSize + promptSize > maxSize && currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = [];
                currentSize = 0;
            }
            currentChunk.push(prompt);
            currentSize += promptSize;
        }

        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    addPrompt(content, webviews) {
        console.log('Adding new prompt:', { content, webviews });
        const prompt = {
            id: Date.now().toString(),
            content,
            timestamp: Date.now(),
            webviews: webviews || [],
            favorite: false
        };
        this.prompts.unshift(prompt);
        this.saveData();
        return prompt;
    }

    removePrompt(id) {
        console.log('Removing prompt:', id);
        const index = this.prompts.findIndex(p => p.id === id);
        if (index !== -1) {
            this.prompts.splice(index, 1);
            this.saveData();
            return true;
        }
        return false;
    }

    toggleFavorite(id) {
        console.log('Toggling favorite for prompt:', id);
        const prompt = this.prompts.find(p => p.id === id);
        if (prompt) {
            prompt.favorite = !prompt.favorite;
            this.saveData();
            return true;
        }
        return false;
    }

    searchPrompts(query) {
        if (!query) return this.prompts;
        const lowerQuery = query.toLowerCase();
        return this.prompts.filter(p =>
            p.content.toLowerCase().includes(lowerQuery)
        );
    }

    getFavorites() {
        return this.prompts.filter(p => p.favorite);
    }

    async updatePrompt(promptId, newContent) {
        await this.loadData();
        const prompt = this.prompts.find(p => p.id === promptId);
        if (prompt) {
            prompt.content = newContent;
            await this.saveData();
            return true;
        }
        return false;
    }
}

// 提示词历史视图
class PromptHistoryView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;  // 存储插件实例
        this.prompts = [];
        this.activeTab = 'history';
        this.sortAscending = false;  // 修改默认排序为最新在前
        this.searchQuery = '';
    }

    getViewType() {
        return "prompt-history-view";
    }

    getDisplayText() {
        return "智汇堂AiSparkHub";
    }
    //侧边栏图标
    getIcon() {
        return "bot";
    }

    async onOpen() {
        await this.loadData();
        this.draw();
    }

    async loadData() {
        try {
            // 使用 PromptHistoryData 类来加载数据
            if (!this.plugin.promptHistoryData) {
                this.plugin.promptHistoryData = new PromptHistoryData(this.plugin);
            }
            await this.plugin.promptHistoryData.loadData();
            this.prompts = this.plugin.promptHistoryData.prompts;
        } catch (error) {
            console.error('Error loading data in PromptHistoryView:', error);
            new Notice('加载提示词历史数据时出错');
        }
    }

    draw() {
        try {
            const container = this.containerEl;
            container.empty();
            container.addClass('prompt-history-container');

            // 创建标签页
            const tabContainer = container.createDiv('prompt-history-tabs');
            const tabs = [
                { id: 'history', text: '历史', icon: 'history' },
                { id: 'favorites', text: '收藏', icon: 'star' },
                { id: 'info', text: '信息', icon: 'info' },
                { id: 'settings', text: '设置', icon: 'gear' }
            ];

            tabs.forEach(tab => {
                const tabEl = tabContainer.createDiv('tab');
                tabEl.setText(tab.text);
                tabEl.classList.toggle('active', this.activeTab === tab.id);
                tabEl.addEventListener('click', () => {
                    this.activeTab = tab.id;
                    this.draw();
                });
            });

            // 内容区域
            const contentContainer = container.createDiv('prompt-history-content');

            // 根据当前标签页显示内容
            switch (this.activeTab) {
                case 'history':
                case 'favorites':
                    this.drawPromptList(contentContainer);
                    break;
                case 'info':
                    this.drawInfoPage(contentContainer);
                    break;
                case 'settings':
                    this.drawSettingsPage(contentContainer);
                    break;
            }
        } catch (error) {
            console.error('Error drawing prompt history view:', error);
            new Notice('绘制提示词历史视图时出错');
        }
    }

    drawPromptList(container) {
        // 搜索和排序栏
        const searchContainer = container.createDiv('search-container');
        const searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: '搜索提示词...',
            value: this.searchQuery || ''
        });

        // 实现搜索功能
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.updateDisplay();
        });

        const sortButton = searchContainer.createEl('button', {
            cls: 'sort-button',
            text: this.sortAscending ? '↓' : '↑'  // 升序时显示向下箭头
        });
        sortButton.addEventListener('click', () => {
            this.sortAscending = !this.sortAscending;
            sortButton.textContent = this.sortAscending ? '↓' : '↑';  // 升序时显示向下箭头
            this.updateDisplay();
        });

        // 提示词列表
        const promptsList = container.createDiv('prompts-list');
        promptsList.style.overflow = 'auto';
        promptsList.style.maxHeight = '100%';
        this.updateDisplay();
    }

    createPromptElement(prompt, container) {
        const promptEl = container.createDiv('prompt-item');

        // 提示词内容
        const contentEl = promptEl.createDiv('prompt-content');
        contentEl.style.display = '-webkit-box';
        contentEl.style.webkitBoxOrient = 'vertical';
        contentEl.style.webkitLineClamp = '3';
        contentEl.style.overflow = 'hidden';
        contentEl.style.textOverflow = 'ellipsis';
        contentEl.setText(prompt.content);

        // 信息栏（时间、WebView按钮、操作按钮）
        const infoEl = promptEl.createDiv('prompt-info');

        // 左侧：时间
        const timeEl = infoEl.createDiv('prompt-time');
        const date = new Date(prompt.timestamp);
        const dateStr = date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const dateDiv = timeEl.createDiv('date');
        dateDiv.setText(dateStr);
        const timeDiv = timeEl.createDiv('time');
        timeDiv.setText(timeStr);

        // 中间：WebView按钮
        const webviewButtons = infoEl.createDiv('webview-buttons');
        if (prompt.webviews && prompt.webviews.length > 0) {
            prompt.webviews.forEach((webview, index) => {
                if (!webview.url) return;

                const button = webviewButtons.createEl('button', {
                    cls: 'webview-button',
                    text: `${index + 1}`,
                    attr: {
                        'data-url': webview.url,
                        'aria-label': webview.url
                    }
                });
                button.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.plugin.openWebview(webview.url);
                });
            });

            // 打开所有按钮
            if (prompt.webviews.length > 1) {
                const openAllBtn = webviewButtons.createEl('button', {
                    cls: 'webview-button open-all',
                    text: '⊕',
                    attr: {
                        'aria-label': '打开所有'
                    }
                });
                openAllBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.plugin.openAllWebviews(prompt.webviews);
                });
            }
        }

        // 右侧：操作按钮
        const actionButtons = infoEl.createDiv('action-buttons');

        // 复制按钮
        const copyBtn = actionButtons.createEl('button', {
            cls: 'action-button copy',
            text: '📋',
            attr: {
                'data-url': '复制'
            }
        });
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(prompt.content);
            new Notice('已复制到剪贴板');
        });

        // 编辑按钮
        const editBtn = actionButtons.createEl('button', {
            cls: 'action-button edit',
            text: '✏️',
            attr: {
                'data-url': '修改'
            }
        });
        editBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const modal = new Modal(this.app);
            modal.titleEl.setText('编辑提示词');

            const contentContainer = modal.contentEl.createEl('div');
            const textArea = contentContainer.createEl('textarea', {
                attr: {
                    rows: '10',
                    style: 'width: 100%; margin-bottom: 10px;'
                }
            });
            textArea.value = prompt.content;

            const buttonContainer = contentContainer.createEl('div', { cls: 'modal-button-container' });

            const cancelButton = buttonContainer.createEl('button', { text: '取消' });
            cancelButton.onclick = () => modal.close();

            const saveButton = buttonContainer.createEl('button', { text: '保存', cls: 'mod-cta' });
            saveButton.onclick = async () => {
                const newPrompt = textArea.value.trim();
                if (newPrompt) {
                    if (!this.plugin.promptHistoryData) {
                        this.plugin.promptHistoryData = new PromptHistoryData(this.plugin);
                    }
                    // 更新提示词内容
                    await this.plugin.promptHistoryData.updatePrompt(prompt.id, newPrompt);
                    // 重新加载数据并更新显示
                    await this.loadData();
                    this.updateDisplay();
                    modal.close();
                }
            };

            modal.open();
        });

        // 收藏按钮
        const favoriteBtn = actionButtons.createEl('button', {
            cls: `action-button favorite ${prompt.favorite ? 'active' : ''}`,
            text: prompt.favorite ? '⭐' : '☆',
            attr: {
                'data-url': '收藏'
            }
        });
        favoriteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!this.plugin.promptHistoryData) {
                this.plugin.promptHistoryData = new PromptHistoryData(this.plugin);
            }
            await this.plugin.promptHistoryData.toggleFavorite(prompt.id);
            await this.loadData();
            this.updateDisplay();
        });
        // 删除按钮
        const deleteBtn = actionButtons.createEl('button', {
            cls: 'action-button delete',
            text: '🗑️',
            attr: {
                'data-url': '删除'
            }
        });
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const modal = new Modal(this.app);
            modal.titleEl.setText('确认删除');
            modal.contentEl.setText('确定要删除这条记录吗？');

            const buttonContainer = modal.contentEl.createEl('div', { cls: 'modal-button-container' });

            const cancelButton = buttonContainer.createEl('button', { text: '取消' });
            cancelButton.onclick = () => modal.close();

            const confirmButton = buttonContainer.createEl('button', { text: '确定', cls: 'mod-warning' });
            confirmButton.onclick = async () => {
                if (!this.plugin.promptHistoryData) {
                    this.plugin.promptHistoryData = new PromptHistoryData(this.plugin);
                }
                await this.plugin.promptHistoryData.removePrompt(prompt.id);
                await this.loadData();
                this.updateDisplay();
                modal.close();
            };

            modal.open();
        });

    }

    async updateDisplay() {
        const container = this.containerEl.querySelector('.prompts-list');
        if (!container) return;

        try {
            container.empty();
            let displayPrompts = [...this.prompts];

            // 根据标签页筛选
            if (this.activeTab === 'favorites') {
                displayPrompts = displayPrompts.filter(p => p.favorite);
            }

            // 搜索过滤
            if (this.searchQuery) {
                const lowerQuery = this.searchQuery.toLowerCase();
                displayPrompts = displayPrompts.filter(prompt =>
                    prompt.content.toLowerCase().includes(lowerQuery)
                );
            }

            // 排序
            displayPrompts.sort((a, b) => {
                const order = this.sortAscending ? 1 : -1;
                return (a.timestamp - b.timestamp) * order;
            });

            // 创建提示词元素
            if (displayPrompts.length === 0) {
                container.createDiv('no-prompts').setText(
                    this.activeTab === 'favorites' ? '没有收藏的提示词' : '没有找到提示词'
                );
                return;
            }

            displayPrompts.forEach(prompt => {
                this.createPromptElement(prompt, container);
            });
        } catch (error) {
            console.error('Error updating display:', error);
            new Notice('更新显示时出错');
        }
    }

    drawInfoPage(container) {
        try {
            const stats = this.calculateCounts();

            const infoContainer = container.createDiv('info-container');

            // 基本统计
            const statsSection = infoContainer.createDiv('info-section');
            statsSection.createEl('h2', { text: '基本统计', cls: 'section-title' });

            const statsGrid = statsSection.createDiv('stats-grid');
            const statsData = [
                { label: '今日', value: stats.today },
                { label: '本周', value: stats.thisWeek },
                { label: '本月', value: stats.thisMonth },
                { label: '总计', value: stats.total }
            ];

            statsData.forEach(stat => {
                const statItem = statsGrid.createDiv('stat-item');
                statItem.createDiv('stat-number').setText(stat.value.toString());
                statItem.createDiv('stat-label').setText(stat.label);
            });

            // 使用趋势
            const trendsSection = infoContainer.createDiv('info-section');
            trendsSection.createEl('h2', { text: '使用趋势', cls: 'section-title' });

            // 创建切换按钮
            const periodControls = trendsSection.createDiv('trend-controls');
            const periods = ['日', '周', '月'];
            let activePeriod = '日';

            periods.forEach(period => {
                const btn = periodControls.createEl('button', {
                    cls: `trend-btn ${period === activePeriod ? 'active' : ''}`,
                    text: period
                });
                btn.addEventListener('click', () => {
                    periodControls.findAll('.trend-btn').forEach(t => t.removeClass('active'));
                    btn.addClass('active');
                    activePeriod = period;
                    this.drawTrendChart(period);
                });
            });

            const chartContainer = trendsSection.createDiv('chart-container');
            chartContainer.createEl('canvas', { attr: { id: 'trendChart' } });

            // 词云
            const wordcloudSection = infoContainer.createDiv('info-section');
            const wordcloudHeader = wordcloudSection.createDiv('section-header');
            wordcloudHeader.createEl('h2', { text: '历史对话词云', cls: 'section-title' });
            const refreshBtn = wordcloudHeader.createEl('button', {
                cls: 'refresh-btn',
                attr: {
                    'aria-label': '刷新词云'
                }
            });
            refreshBtn.innerHTML = '🔄';

            refreshBtn.addEventListener('click', () => {
                this.refreshWordCloud();
            });

            const wordcloudContainer = wordcloudSection.createDiv('wordcloud-container');
            wordcloudContainer.createDiv({ attr: { id: 'wordCloudChart' } });

            // 初始化图表
            this.drawTrendChart(activePeriod);
            this.drawWordCloud();

        } catch (error) {
            console.error('绘制信息页面时出错:', error);
            container.empty();
            container.createEl('div', {
                text: '加载信息页面时出错: ' + error.message,
                cls: 'error-message'
            });
        }
    }

    drawTrendChart(period = '日') {
        try {
            const canvas = document.getElementById('trendChart');
            if (!canvas) {
                console.error('找不到趋势图画布');
                return;
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                console.error('无法获取画布上下文');
                return;
            }

            // 确保 Chart.js 已加载
            if (typeof Chart === 'undefined') {
                console.error('Chart.js 未加载');
                return;
            }

            const data = this.getTrendData(period);

            // 销毁旧图表
            if (this.trendChart instanceof Chart) {
                this.trendChart.destroy();
            }

            // 创建新图表
            this.trendChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: '对话数量',
                        data: data.values,
                        borderColor: 'rgb(75, 192, 192)',
                        tension: 0.1,
                        fill: true,
                        backgroundColor: 'rgba(75, 192, 192, 0.1)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: `${period}对话趋势`
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                maxRotation: 0,
                                autoSkip: true,
                                maxTicksLimit: 10
                            }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('绘制趋势图时出错:', error);
            new Notice('绘制趋势图时出错');
        }
    }

    async drawWordCloud() {
        try {
            const container = document.getElementById('wordCloudChart');
            if (!container) {
                console.error('找不到词云容器');
                return;
            }

            // 确保 D3 已加载
            if (!window.d3) {
                console.error('D3.js 未加载');
                await this.plugin.loadChartLibraries();
                if (!window.d3) {
                    throw new Error('无法加载 D3.js');
                }
            }

            // 清除旧的词云
            d3.select(container).selectAll("*").remove();

            const data = this.generateWordCloudData();
            if (!data || data.length === 0) {
                console.log('没有足够的数据生成词云');
                return;
            }

            console.log('开始生成词云...');

            // 设置词云尺寸
            const width = container.offsetWidth || 600;
            const height = container.offsetHeight || 400;

            console.log('词云容器尺寸:', width, height);

            // 创建SVG容器
            const svg = d3.select(container)
                .append("svg")
                .attr("width", width)
                .attr("height", height);

            // 创建词云组
            const group = svg.append("g")
                .attr("transform", `translate(${width/2},${height/2})`);

            // 创建颜色比例尺
            const color = d3.scaleOrdinal()
                .range(["#66c2a5","#fc8d62","#8da0cb","#e78ac3","#a6d854"]);

            // 转换数据格式
            const words = data.map(d => ({
                text: d[0],
                size: Math.sqrt(d[1]) * 10 + 10
            }));

            console.log('词云数据:', words);

            // 创建词云布局
            const layout = d3.layout.cloud()
                .size([width, height])
                .words(words)
                .padding(5)
                .rotate(() => 0) // 暂时不旋转
                .fontSize(d => d.size)
                .on("end", draw);

            // 开始布局计算
            layout.start();

            // 绘制词云
            function draw(words) {
                console.log('开始绘制词云...');
                group.selectAll("text")
                    .data(words)
                    .enter()
                    .append("text")
                    .style("font-size", d => `${d.size}px`)
                    .style("font-family", "Impact")
                    .style("fill", (d, i) => color(i))
                    .attr("text-anchor", "middle")
                    .attr("transform", d => `translate(${d.x},${d.y})`)
                    .text(d => d.text)
                    .style("cursor", "pointer")
                    .on("mouseover", function(event, d) {
                        d3.select(this)
                            .transition()
                            .duration(200)
                            .style("font-size", `${d.size * 1.2}px`)
                            .style("opacity", 0.8);
                    })
                    .on("mouseout", function(event, d) {
                        d3.select(this)
                            .transition()
                            .duration(200)
                            .style("font-size", `${d.size}px`)
                            .style("opacity", 1);
                    });
                console.log('词云绘制完成');
            }

        } catch (error) {
            console.error('绘制词云时出错:', error);
            new Notice('绘制词云时出错');
        }
    }

    refreshWordCloud() {
        this.drawWordCloud();
    }

    getTrendData(period = '日') {
        const now = new Date();
        const data = {
            labels: [],
            values: []
        };

        switch(period) {
            case '日':
                // 最近24小时
                for (let i = 23; i >= 0; i--) {
                    const time = new Date(now.getTime() - i * 60 * 60 * 1000);
                    data.labels.push(time.getHours() + ':00');
                    data.values.push(this.getCountForHour(time));
                }
                break;
            case '周':
                // 最近7天
                for (let i = 6; i >= 0; i--) {
                    const time = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                    data.labels.push(['周日','周一','周二','周三','周四','周五','周六'][time.getDay()]);
                    data.values.push(this.getCountForDay(time));
                }
                break;
            case '月':
                // 最近30天
                for (let i = 29; i >= 0; i--) {
                    const time = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                    data.labels.push((time.getMonth() + 1) + '/' + time.getDate());
                    data.values.push(this.getCountForDay(time));
                }
                break;
        }

        return data;
    }

    getCountForHour(time) {
        return this.prompts.filter(p => {
            const promptTime = new Date(p.timestamp);
            return promptTime.getFullYear() === time.getFullYear() &&
                   promptTime.getMonth() === time.getMonth() &&
                   promptTime.getDate() === time.getDate() &&
                   promptTime.getHours() === time.getHours();
        }).length;
    }

    getCountForDay(time) {
        return this.prompts.filter(p => {
            const promptTime = new Date(p.timestamp);
            return promptTime.getFullYear() === time.getFullYear() &&
                   promptTime.getMonth() === time.getMonth() &&
                   promptTime.getDate() === time.getDate();
        }).length;
    }

    drawSettingsPage(contentContainer) {
        try {
            // 清空当前容器
            contentContainer.empty();

            // 创建一个可滚动的容器
            const settingsContainer = contentContainer.createDiv({
                cls: 'settings-container'
            });

            // 创建一个新的设置标签页实例
            const settingTab = new MultiAIDialogSettingTab(this.app, this.plugin);

            // 设置容器作为设置标签页的容器
            settingTab.containerEl = settingsContainer;

            // 显示设置内容
            settingTab.display();

        } catch (error) {
            console.error('加载设置页面时出错:', error);
            contentContainer.empty();
            contentContainer.createEl('div', {
                text: '加载设置页面时出错: ' + error.message,
                cls: 'setting-error'
            });
        }
    }

    calculateCounts() {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const thisWeek = new Date(now.getTime() - now.getDay() * 24 * 60 * 60 * 1000);
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        return {
            total: this.prompts.length,
            today: this.prompts.filter(p => new Date(p.timestamp) >= today).length,
            thisWeek: this.prompts.filter(p => new Date(p.timestamp) >= thisWeek).length,
            thisMonth: this.prompts.filter(p => new Date(p.timestamp) >= thisMonth).length,
            favorites: this.prompts.filter(p => p.favorite).length
        };
    }

    generateWordCloudData() {
        try {
            if (!Array.isArray(this.prompts)) {
                console.error('prompts 不是数组');
                return [];
            }

            const wordCount = {};
            const stopWords = new Set(['的', '了', '和', '是', '在', '我', '有', '就', '不', '也', '都', '这', '要', '你', '会', '着', '好', '吗', '能', '说']);

            this.prompts.forEach(prompt => {
                if (!prompt || !prompt.content) return;

                const words = prompt.content
                    .toLowerCase()
                    // 匹配中文、英文、数字
                    .match(/[\u4e00-\u9fa5]+|[a-z]+|[0-9]+/g) || [];
                
                words.forEach(word => {
                    // 过滤掉停用词、数字和短词
                    if (!stopWords.has(word) && !/^\d+$/.test(word) && word.length > 1) {
                        wordCount[word] = (wordCount[word] || 0) + 1;
                    }
                });
            });
            
            // 转换为数组并排序
            const sortedWords = Object.entries(wordCount)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 100); // 限制最多100个词

            console.log('生成词云数据:', sortedWords.length, '个词');
            return sortedWords;

        } catch (error) {
            console.error('生成词云数据时出错:', error);
            return [];
        }
    }
}

module.exports = MultiAIDialog;