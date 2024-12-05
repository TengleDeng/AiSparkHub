const { Plugin, PluginSettingTab, Setting } = require('obsidian');
const { BrowserWindow, screen, Menu, MenuItem } = require('electron').remote;

class MultiAIDialog extends Plugin {
    async onload() {
        console.log('Loading MultiAIDialog plugin');
        
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        // 添加ribbon图标
        this.addRibbonIcon('bot', '多AI对话', () => {
            this.openMultiAIView();
        });

        this.addSettingTab(new MultiAISettingTab(this.app, this));
        
        // 保存主窗口引用
        this.mainWindow = null;

        // 修改命令注册方式
        this.addCommand({
            id: 'send-to-all-ai',
            name: '发送到所有AI',
            // 使用 editorCheckCallback 替代 editorCallback
            editorCheckCallback: (checking, editor, view) => {
                // 检查是否在markdown视图中
                const canRun = view.getViewType() === 'markdown';
                
                if (checking) {
                    return canRun;
                }

                if (canRun) {
                    console.log('Command triggered via hotkey');
                    this.sendToAllAI();
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

        console.log('MultiAIDialog plugin loaded');
    }

    async openMultiAIView() {
        try {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.show();
                return;
            }

            const frames = Object.values(this.settings.frames);
            
            if (frames.length === 0) {
                new Notice('请先在设置中配置AI网页');
                return;
            }

            // 创建主窗口
            this.mainWindow = new BrowserWindow({
                width: 1200,
                height: 800,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    webviewTag: true
                }
            });

            // 加载HTML内容
            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            margin: 0;
                            display: flex;
                            flex-direction: column;
                            height: 100vh;
                            background-color: var(--background-primary);
                            color: var(--text-normal);
                        }
                        
                        .frames-container {
                            flex: 1;
                            display: grid;
                            grid-template-columns: repeat(${frames.length}, 1fr);
                            gap: 10px;
                            padding: 10px;
                            overflow: auto;
                            min-height: 0; /* 确保内容可以正确滚动 */
                        }
                        
                        .frame-wrapper {
                            height: 100%;
                            border: 1px solid var(--background-modifier-border);
                            border-radius: 4px;
                            overflow: hidden;
                        }
                        
                        .frame-container {
                            width: 100%;
                            height: 100%;
                            border: none;
                        }

                        .prompt-container {
                            height: 100px;
                            min-height: 100px; /* 最小高度 */
                            padding: 10px;
                            background: var(--background-secondary);
                            border-top: 1px solid var(--background-modifier-border);
                            display: flex;
                            gap: 10px;
                            resize: vertical; /* 允许垂直调整大小 */
                            overflow: hidden; /* 防止调整大小时出现滚动条 */
                        }
                        
                        #prompt-input {
                            flex: 1;
                            resize: none;
                            padding: 8px;
                            border-radius: 4px;
                            background: var(--background-primary);
                            color: var(--text-normal);
                            border: 1px solid var(--background-modifier-border);
                            font-family: inherit;
                        }
                        
                        #send-button {
                            padding: 0 20px;
                            border-radius: 4px;
                            background: var(--interactive-accent);
                            color: var(--text-on-accent);
                            cursor: pointer;
                            border: none;
                            font-size: 14px;
                            font-weight: 500;
                        }
                        
                        #send-button:hover {
                            background: var(--interactive-accent-hover);
                        }
                    </style>
                </head>
                <body>
                    <div class="frames-container">
                        ${frames.map((frame, index) => `
                            <div class="frame-wrapper">
                                <webview 
                                    class="frame-container" 
                                    src="${frame.url}"
                                    nodeintegration
                                    webpreferences="contextIsolation=false"
                                ></webview>
                            </div>
                        `).join('')}
                    </div>
                    <div class="prompt-container">
                        <textarea id="prompt-input" placeholder="输入提示词...按 Ctrl+Enter 发送"></textarea>
                        <button id="send-button">发送到所有AI</button>
                    </div>
                    <script>
                        // 获取DOM元素
                        const promptInput = document.getElementById('prompt-input');
                        const sendButton = document.getElementById('send-button');
                        
                        // 发送消息函数
                        function sendMessage() {
                            const text = promptInput.value.trim();
                            if (text) {
                                // 直接使用ipcRenderer发送消息到主进程
                                const { ipcRenderer } = require('electron');
                                ipcRenderer.send('send-to-all', text);
                                // 清空输入框
                                promptInput.value = '';
                            }
                        }
                        
                        // 添加事件监听
                        sendButton.addEventListener('click', sendMessage);
                        
                        // 添加快捷键支持
                        promptInput.addEventListener('keydown', (e) => {
                            if (e.ctrlKey && e.key === 'Enter') {
                                e.preventDefault();
                                sendMessage();
                            }
                        });
                    </script>
                </body>
                </html>
            `;
            await this.mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

            // 添加IPC消息监听
            this.mainWindow.webContents.on('ipc-message', async (event, channel, ...args) => {
                if (channel === 'send-to-all') {
                    const text = args[0];
                    await this.sendToAllAI(text);
                }
            });

            // 窗口关闭时清理引用
            this.mainWindow.on('closed', () => {
                this.mainWindow = null;
            });

        } catch (error) {
            console.error('Error opening multi AI view:', error);
            new Notice('打开多AI对话窗口失败');
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.close();
        }
    }

    // 添加发送到所有AI的方法
    async sendToAllAI(text) {
        try {
            console.log('Starting sendToAllAI...');

            // 获取当前编辑器内容
            const activeView = this.app.workspace.activeLeaf?.view;
            if (!activeView || activeView.getViewType() !== 'markdown') {
                console.log('No active markdown view found');
                new Notice('请先打开一个笔记');
                return;
            }

            // 获取编辑器
            const editor = activeView.editor;
            if (!editor) {
                console.log('No editor found');
                new Notice('无法获取编辑器');
                return;
            }

            const selectedText = editor.getSelection();
            const textToSend = text || selectedText || editor.getValue();
            
            // 保存提问记录
            await this.saveDialogRecord(textToSend);

            // 清空编辑器内容
            if (selectedText) {
                // 如果是选中的文本，只清空选中部分
                editor.replaceSelection('');
            } else {
                // 如果是整个文档，清空所有内容
                editor.setValue('');
            }

            console.log('Text to send:', textToSend);

            if (!textToSend.trim()) {
                console.log('No text to send');
                new Notice('没有要发送的内容');
                return;
            }

            if (!this.mainWindow || this.mainWindow.isDestroyed()) {
                console.log('No main window available');
                new Notice('请先打开AI对话窗口');
                return;
            }

            // 检查frames和selectors
            const frames = this.settings.frames.slice(0, this.settings.frameCount);
            console.log('Current frames:', frames); // 添加日志

            // 转义文本中的特殊字符
            const escapedText = textToSend.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
            
            // 为每个frame生成独立的注入脚本
            const scripts = frames.map(frame => {
                const frameIndex = frames.indexOf(frame);
                console.log(`Generating script for ${frame.displayName} (index: ${frameIndex})`);
                
                // 根据域名选择不同的处理方案
                if (frame.url.includes('doubao.com')) {
                    // 豆包的处理方案
                    return `
                        (async function() {
                            try {
                                console.log('Starting script for 豆包');
                                const webviews = document.querySelectorAll('webview');
                                const webview = webviews[${frameIndex}];
                                
                                if (!webview) {
                                    console.error('豆包: Webview not found');
                                    return false;
                                }

                                const result = await webview.executeJavaScript(\`
                                    (function() {
                                        try {
                                            var textarea = document.querySelector('textarea.semi-input-textarea');
                                            if (textarea) {
                                                textarea.focus();
                                                var nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
                                                nativeTextareaValueSetter.call(textarea, \\\`${escapedText}\\\`);
                                                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                                                
                                                var sendButton = document.querySelector('#flow-end-msg-send');
                                                if (sendButton) {
                                                    setTimeout(function() {
                                                        sendButton.click();
                                                    }, 500);
                                                    return { success: true, sent: true };
                                                }
                                                return { success: true, sent: false };
                                            }
                                            return { success: false, error: '未找到输入框' };
                                        } catch (error) {
                                            return { success: false, error: error.message };
                                        }
                                    })();
                                \`);
                                return result.success;
                            } catch (error) {
                                console.error('豆包: Error executing script:', error);
                                return false;
                            }
                        })();
                    `;
                } 
                else if (frame.url.includes('moonshot.cn')) {
                    // Kimi的处理方案
                    return `
                        (async function() {
                            try {
                                console.log('Starting script for Kimi');
                                const webviews = document.querySelectorAll('webview');
                                const webview = webviews[${frameIndex}];
                                
                                if (!webview) {
                                    console.error('Kimi: Webview not found');
                                    return false;
                                }

                                const result = await webview.executeJavaScript(\`
                                    (function() {
                                        try {
                                            var editor = document.querySelector('[data-testid="msh-chatinput-editor"]');
                                            if (editor) {
                                                console.log('Kimi: Found editor');
                                                editor.focus();
                                                
                                                // 使用原来成功的文本注入方式
                                                const clipboardData = new DataTransfer();
                                                clipboardData.setData('text/plain', \\\`${escapedText}\\\`);
                                                const pasteEvent = new ClipboardEvent('paste', {
                                                    bubbles: true,
                                                    clipboardData: clipboardData
                                                });
                                                editor.dispatchEvent(pasteEvent);
                                                
                                                // 等待文本注入完成后点击发送按钮
                                                setTimeout(function() {
                                                    console.log('Kimi: Looking for send button');
                                                    const sendButton = document.querySelector('[data-testid="msh-chatinput-send-button"]');
                                                    if (sendButton) {
                                                        console.log('Kimi: Found send button, clicking...');
                                                        sendButton.click();
                                                        return { success: true, sent: true };
                                                    } else {
                                                        console.log('Kimi: Send button not found');
                                                        return { success: true, sent: false };
                                                    }
                                                }, 500);
                                                
                                                return { success: true };
                                            }
                                            return { success: false, error: '未找到输入框' };
                                        } catch (error) {
                                            console.error('Kimi: Error in script:', error);
                                            return { success: false, error: error.message };
                                        }
                                    })();
                                \`);
                                
                                console.log('Kimi: Script result:', result);
                                return result.success;
                            } catch (error) {
                                console.error('Kimi: Error executing script:', error);
                                return false;
                            }
                        })();
                    `;
                }
                else if (frame.url.includes('yuanbao.tencent.com')) {
                    // 元宝的处理方案
                    return `
                        (async function() {
                            try {
                                console.log('Starting script for 元宝');
                                const webviews = document.querySelectorAll('webview');
                                const webview = webviews[${frameIndex}];
                                
                                if (!webview) {
                                    console.error('元宝: Webview not found');
                                    return false;
                                }

                                const result = await webview.executeJavaScript(\`
                                    (function() {
                                        try {
                                            var editor = document.querySelector('.ql-editor[contenteditable="true"]');
                                            if (editor) {
                                                editor.focus();
                                                // 清空现有内容
                                                editor.innerHTML = '';
                                                
                                                // 创建文本节点并插入
                                                const textNode = document.createTextNode(\\\`${escapedText}\\\`);
                                                editor.appendChild(textNode);
                                                
                                                // 触发必要的事件
                                                editor.dispatchEvent(new Event('input', { bubbles: true }));
                                                editor.dispatchEvent(new Event('change', { bubbles: true }));
                                                
                                                // 查找并点击发送按钮
                                                setTimeout(function() {
                                                    const sendButton = document.querySelector('a[class^="style__send-btn"]');
                                                    if (sendButton) {
                                                        sendButton.click();
                                                        return { success: true, sent: true };
                                                    }
                                                    return { success: true, sent: false };
                                                }, 500);
                                                
                                                return { success: true };
                                            }
                                            return { success: false, error: '未找到输入框' };
                                        } catch (error) {
                                            return { success: false, error: error.message };
                                        }
                                    })();
                                \`);
                                return result.success;
                            } catch (error) {
                                console.error('元宝: Error executing script:', error);
                                return false;
                            }
                        })();
                    `;
                }
                else if (frame.url.includes('chatgpt.com')) {
                    // ChatGPT的处理方案
                    return `
                        (async function() {
                            try {
                                console.log('Starting script for ChatGPT');
                                const webviews = document.querySelectorAll('webview');
                                const webview = webviews[${frameIndex}];
                                
                                if (!webview) {
                                    console.error('ChatGPT: Webview not found');
                                    return false;
                                }

                                const result = await webview.executeJavaScript(\`
                                    (function() {
                                        try {
                                            var editor = document.querySelector('#prompt-textarea');
                                            if (editor) {
                                                console.log('ChatGPT: Found editor');
                                                editor.focus();
                                                
                                                // 清空现有内容
                                                editor.innerHTML = '';
                                                
                                                // 插入文本
                                                editor.innerHTML = \\\`${escapedText}\\\`;
                                                
                                                // 触发必要的事件
                                                editor.dispatchEvent(new Event('input', { bubbles: true }));
                                                editor.dispatchEvent(new Event('change', { bubbles: true }));
                                                
                                                // 等待文本注入完成后点击发送按钮
                                                setTimeout(function() {
                                                    console.log('ChatGPT: Looking for send button');
                                                    const sendButton = document.querySelector('button[data-testid="send-button"]');
                                                    if (sendButton) {
                                                        console.log('ChatGPT: Found send button, clicking...');
                                                        sendButton.click();
                                                        return { success: true, sent: true };
                                                    } else {
                                                        console.log('ChatGPT: Send button not found');
                                                        return { success: true, sent: false };
                                                    }
                                                }, 500);
                                                
                                                return { success: true };
                                            }
                                            return { success: false, error: '未找到输入框' };
                                        } catch (error) {
                                            console.error('ChatGPT: Error in script:', error);
                                            return { success: false, error: error.message };
                                        }
                                    })();
                                \`);
                                
                                console.log('ChatGPT: Script result:', result);
                                return result.success;
                            } catch (error) {
                                console.error('ChatGPT: Error executing script:', error);
                                return false;
                            }
                        })();
                    `;
                }
                // ... 可以继续添加其他AI平台的专门处理方案
            });

            // 执行所有脚本
            const results = await Promise.all(scripts.map(script => 
                this.mainWindow.webContents.executeJavaScript(script)
            ));

            console.log('Script execution results:', results);
            new Notice('已发送到所有AI');

            // 15秒后获取回复
            setTimeout(async () => {
                const responses = [];
                for (let i = 0; i < frames.length; i++) {
                    const frame = frames[i];
                    console.log(`Checking response for ${frame.displayName}:`, frame.selectors.aiResponse);
                    
                    if (frame.selectors.aiResponse) {
                        try {
                            const responseScript = `
                                (async function() {
                                    try {
                                        console.log('Getting response for ${frame.displayName}');
                                        const webviews = document.querySelectorAll('webview');
                                        const webview = webviews[${i}];
                                        
                                        if (!webview) {
                                            console.error('${frame.displayName}: Webview not found');
                                            return { error: 'Webview not found' };
                                        }

                                        const result = await webview.executeJavaScript(\`
                                            (function() {
                                                try {
                                                    console.log('${frame.displayName}: Looking for response element');
                                                    let responseElement = null;
                                                    let text = '';

                                                    // 根据不同平台使用不同的选择策略
                                                    if (window.location.href.includes('doubao.com')) {
                                                        // 豆包的回复获取逻辑
                                                        const elements = document.querySelectorAll('[data-testid="receive_message"]');
                                                        if (elements.length > 0) {
                                                            responseElement = elements[elements.length - 1];
                                                        }
                                                    } 
                                                    else if (window.location.href.includes('chatgpt.com')) {
                                                        // ChatGPT的回复获取逻辑
                                                        const elements = document.querySelectorAll('.markdown.prose');
                                                        if (elements.length > 0) {
                                                            responseElement = elements[elements.length - 1];
                                                        }
                                                    }
                                                    else if (window.location.href.includes('moonshot.cn')) {
                                                        // Kimi的回复获取逻辑
                                                        const elements = document.querySelectorAll('.markdown___vuBDJ');
                                                        if (elements.length > 0) {
                                                            responseElement = elements[elements.length - 1];
                                                        }
                                                    }
                                                    else if (window.location.href.includes('yuanbao.tencent.com')) {
                                                        // 元宝的回复获取逻辑
                                                        const elements = Array.from(document.querySelectorAll('.agent-chat__conv--ai__speech_show'))
                                                            .filter(el => el.offsetParent !== null);
                                                        if (elements.length > 0) {
                                                            responseElement = elements[elements.length - 1];
                                                        }
                                                    }

                                                    // 统一的响应处理
                                                    if (responseElement) {
                                                        try {
                                                            text = responseElement.innerText || responseElement.textContent || '';
                                                            console.log('${frame.displayName}: Found response element');
                                                            if (text) {
                                                                console.log('${frame.displayName}: Got response text:', text.substring(0, 50) + '...');
                                                                return { response: text };
                                                            }
                                                        } catch (e) {
                                                            console.error('${frame.displayName}: Error getting text:', e);
                                                        }
                                                    }

                                                    console.log('${frame.displayName}: No valid response found');
                                                    return { response: '' };
                                                } catch (error) {
                                                    console.error('${frame.displayName}: Error in response script:', error);
                                                    return { error: error.message };
                                                }
                                            })()
                                        \`);
                                        
                                        console.log('${frame.displayName}: Script result:', result);
                                        return result;  
                                    } catch (error) {
                                        console.error('${frame.displayName}: Outer script error:', error);
                                        return { error: error.message };
                                    }
                                })()
                            `;

                            const result = await this.mainWindow.webContents.executeJavaScript(responseScript);
                            console.log(`${frame.displayName} result:`, result);
                            
                            if (result && result.response) {  
                                responses.push({
                                    from: frame.displayName,
                                    text: result.response
                                });
                                console.log(`Added response from ${frame.displayName}`);
                            } else {
                                console.log(`No response from ${frame.displayName}:`, result.error || 'Unknown reason');
                            }
                        } catch (error) {
                            console.error(`Error getting response from ${frame.displayName}:`, error);
                        }
                    } else {
                        console.log(`No aiResponse selector configured for ${frame.displayName}`);
                    }
                }

                // 保存回复
                if (responses.length > 0) {
                    console.log('Saving responses:', responses);
                    await this.saveDialogRecord(textToSend, responses);
                    new Notice('已保存AI回复');
                } else {
                    console.log('No responses to save');
                    new Notice('没有获取到AI回复');
                }
            }, 15000);

        } catch (error) {
            console.error('Error in sendToAllAI:', error);
            new Notice('发送失败');
        }
    }

    // 添加测试选择器的方法
    async testSelector(frameIndex, selectorType) {
        try {
            // 1. 检查窗口状态
            if (!this.mainWindow || this.mainWindow.isDestroyed()) {
                await this.openMultiAIView();
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // 2. 检查选择器
            const frame = this.settings.frames[frameIndex];
            const selector = frame.selectors[selectorType];
            if (!selector) {
                new Notice('选择器未设置');
                return;
            }

            // 3. 生成测试脚本
            const script = `
                (async function() {
                    try {
                        console.log('Starting selector test');
                        const webviews = document.querySelectorAll('webview');
                        const webview = webviews[${frameIndex}];
                        
                        if (!webview) {
                            console.error('Webview not found');
                            return false;
                        }

                        const result = await webview.executeJavaScript(\`
                            (function() {
                                try {
                                    var elements = document.querySelectorAll('${selector}');
                                    if (elements.length > 0) {
                                        elements.forEach(function(el) {
                                            el.style.outline = '2px solid red';
                                            setTimeout(function() {
                                                el.style.outline = '';
                                            }, 2000);
                                        });
                                        return true;
                                    }
                                    return false;
                                } catch (e) {
                                    console.error('Test error:', e);
                                    return false;
                                }
                            })()
                        \`);

                        return result;
                    } catch (e) {
                        console.error('Script error:', e);
                        return false;
                    }
                })()
            `;

            // 4. 执行脚本并等待结果
            const result = await this.mainWindow.webContents.executeJavaScript(script);
            
            // 5. 显示结果
            new Notice(result ? 
                `选择器测试成功：找到匹配元素` : 
                `选择器测试失败：未找到匹配元素`
            );

        } catch (error) {
            console.error('选择器测试错误:', error);
            new Notice(`测试失败：${error.message}`);
        }
    }

    // 添加保存对话记录的方法
    async saveDialogRecord(prompt, responses = []) {
        if (!this.settings.recordSettings.enabled) {
            return;
        }

        try {
            const { folderPath, fileName, template } = this.settings.recordSettings;
            
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
                `**${r.from}**:\n${r.text}\n`
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
}

class MultiAISettingTab extends PluginSettingTab {
    display() {
        const {containerEl} = this;
        containerEl.empty();

        containerEl.createEl('h2', {text: '多AI对话设置'});

        // 窗口数量设置
        new Setting(containerEl)
            .setName('窗口数量')
            .setDesc('同时打开的AI对话窗口数量')
            .addDropdown(dropdown => dropdown
                .addOption('1', '1个窗口')
                .addOption('2', '2个窗口')
                .addOption('3', '3个窗口')
                .addOption('4', '4个窗口')
                .setValue(String(this.plugin.settings.frameCount))
                .onChange(async (value) => {
                    this.plugin.settings.frameCount = parseInt(value);
                    await this.plugin.saveSettings();
                }));

        // AI网页设置
        containerEl.createEl('h3', {text: 'AI网页设置'});

        // 创可排序的frames容器
        const framesContainer = containerEl.createDiv('frames-container');
        framesContainer.style.cssText = 'display: flex; flex-direction: column; gap: 20px;';

        this.plugin.settings.frames.forEach((frame, index) => {
            // 为每个frame创建一个容器
            const frameContainer = framesContainer.createDiv('frame-settings');
            frameContainer.style.cssText = 'border: 1px solid var(--background-modifier-border); padding: 10px; border-radius: 5px;';

            // 添加标题和移动按钮
            const header = frameContainer.createDiv('frame-header');
            header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;';
            
            header.createEl('h4', {text: `AI ${index + 1}: ${frame.displayName}`});
            
            const buttonContainer = header.createDiv('button-container');
            buttonContainer.style.cssText = 'display: flex; gap: 5px;';

            // 上移按钮
            if (index > 0) {
                const upButton = buttonContainer.createEl('button', {text: '↑'});
                upButton.onclick = async () => {
                    const frames = this.plugin.settings.frames;
                    [frames[index], frames[index - 1]] = [frames[index - 1], frames[index]];
                    await this.plugin.saveSettings();
                    this.display();
                };
            }

            // 下移按钮
            if (index < this.plugin.settings.frames.length - 1) {
                const downButton = buttonContainer.createEl('button', {text: '↓'});
                downButton.onclick = async () => {
                    const frames = this.plugin.settings.frames;
                    [frames[index], frames[index + 1]] = [frames[index + 1], frames[index]];
                    await this.plugin.saveSettings();
                    this.display();
                };
            }

            // 基本置
            new Setting(frameContainer)
                .setName('基本信息')
                .addText(text => text
                    .setPlaceholder('网页名称')
                    .setValue(frame.displayName)
                    .onChange(async (value) => {
                        frame.displayName = value;
                        await this.plugin.saveSettings();
                    }))
                .addText(text => text
                    .setPlaceholder('网页地址')
                    .setValue(frame.url)
                    .onChange(async (value) => {
                        frame.url = value;
                        await this.plugin.saveSettings();
                    }));

            // 确保 selectors 对象存在
            frame.selectors = frame.selectors || {
                input: '',
                inputType: 'textarea',
                send: '',
                sendType: 'click',
                userMessage: '',
                aiResponse: ''
            };

            // 输入框选择器设置
            new Setting(frameContainer)
                .setName('输入框设置')
                .addText(text => text
                    .setPlaceholder('输入框CSS选择器')
                    .setValue(frame.selectors.input)
                    .onChange(async (value) => {
                        frame.selectors.input = value;
                        await this.plugin.saveSettings();
                    }))
                .addDropdown(dropdown => dropdown
                    .addOption('textarea', 'Textarea')
                    .addOption('contenteditable', 'Contenteditable')
                    .setValue(frame.selectors.inputType)
                    .onChange(async (value) => {
                        frame.selectors.inputType = value;
                        await this.plugin.saveSettings();
                    }))
                .addButton(button => button
                    .setButtonText('测试')
                    .onClick(() => this.plugin.testSelector(index, 'input')));

            // 发送按钮选择器设置
            new Setting(frameContainer)
                .setName('发送方式设置')
                .addText(text => text
                    .setPlaceholder('发送按钮CSS选择器')
                    .setValue(frame.selectors.send)
                    .onChange(async (value) => {
                        frame.selectors.send = value;
                        await this.plugin.saveSettings();
                    }))
                .addDropdown(dropdown => dropdown
                    .addOption('click', '点击按钮')
                    .addOption('enter', '回车发送')
                    .setValue(frame.selectors.sendType)
                    .onChange(async (value) => {
                        frame.selectors.sendType = value;
                        await this.plugin.saveSettings();
                    }))
                .addButton(button => button
                    .setButtonText('测试')
                    .onClick(() => this.plugin.testSelector(index, 'send')));

            // 用户消息选择器设置
            new Setting(frameContainer)
                .setName('用户消息选择器')
                .setDesc('用于定位用户发送的消息')
                .addText(text => text
                    .setPlaceholder('CSS选择器')
                    .setValue(frame.selectors.userMessage)
                    .onChange(async (value) => {
                        frame.selectors.userMessage = value;
                        await this.plugin.saveSettings();
                    }))
                .addButton(button => button
                    .setButtonText('测试')
                    .onClick(() => this.plugin.testSelector(index, 'userMessage')));

            // AI回复选择器设置
            new Setting(frameContainer)
                .setName('AI回复选择器')
                .setDesc('用于定位AI的回复消息')
                .addText(text => text
                    .setPlaceholder('CSS选择器')
                    .setValue(frame.selectors.aiResponse)
                    .onChange(async (value) => {
                        frame.selectors.aiResponse = value;
                        await this.plugin.saveSettings();
                    }))
                .addButton(button => button
                    .setButtonText('测试')
                    .onClick(() => this.plugin.testSelector(index, 'aiResponse')));
        });

        // 添加记录设置部分
        containerEl.createEl('h3', {text: '对话记录设置'});
        
        new Setting(containerEl)
            .setName('启用对话记录')
            .setDesc('保存所有对话到指定笔记中')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.recordSettings.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.recordSettings.enabled = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('保存目录')
            .setDesc('对话记录保存的目录路径')
            .addText(text => text
                .setPlaceholder('例如: AI对话记录')
                .setValue(this.plugin.settings.recordSettings.folderPath)
                .onChange(async (value) => {
                    this.plugin.settings.recordSettings.folderPath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('文件名')
            .setDesc('对话记录文件名')
            .addText(text => text
                .setPlaceholder('例如: AI对话记录.md')
                .setValue(this.plugin.settings.recordSettings.fileName)
                .onChange(async (value) => {
                    this.plugin.settings.recordSettings.fileName = value;
                    await this.plugin.saveSettings();
                }));
    }
}

const DEFAULT_SETTINGS = {
    frameCount: 1,
    recordSettings: {
        enabled: true,
        folderPath: "AI对话记录",  // 默认保存目录
        fileName: "AI对话记录.md",  // 默认文件名
        template: "## {{datetime}}\n\n### 提问\n{{prompt}}\n\n### 回复\n{{response}}\n\n---\n"  // 记录模板
    },
    frames: [
        {
            url: 'https://chat.openai.com',
            displayName: 'ChatGPT',
            icon: 'bot',
            selectors: {
                input: '#prompt-textarea',
                inputType: 'contenteditable',
                send: 'button[data-testid="send-button"]',
                sendType: 'click',
                userMessage: '.whitespace-pre-wrap',
                aiResponse: '.markdown.prose.w-full.break-words.dark\\:prose-invert.light'
            }
        },
        {
            url: 'https://kimi.moonshot.cn',
            displayName: 'Kimi',
            icon: 'bot',
            selectors: {
                input: '[data-testid="msh-chatinput-editor"]',
                inputType: 'contenteditable',
                send: 'send-button',
                sendType: 'click',
                userMessage: '.MuiTypography-root.MuiTypography-text.css-p94avn',
                aiResponse: '.markdown___vuBDJ'
            }
        },
        {
            url: 'https://doubao.com',
            displayName: '豆包',
            icon: 'bot',
            selectors: {
                input: 'textarea.semi-input-textarea',
                inputType: 'textarea',
                send: '#flow-end-msg-send',
                sendType: 'click',
                userMessage: '[data-testid="send_message"]',
                aiResponse: '[data-testid="receive_message"]'
            }
        },
        {
            url: 'https://yuanbao.tencent.com/',
            displayName: '元宝',
            icon: 'bot',
            selectors: {
                input: '.ql-editor[contenteditable="true"]',
                inputType: 'contenteditable',
                send: '',
                sendType: 'click',
                userMessage: '.hyc-content-text',
                aiResponse: '.agent-chat__conv--ai__speech_show'
            }
        }
    ]
};

module.exports = MultiAIDialog; 