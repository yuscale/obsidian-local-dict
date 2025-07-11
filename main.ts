import {
  Menu,
  MarkdownView,
  App,
  Plugin,
  ItemView,
  WorkspaceLeaf,
  Notice,
  PluginSettingTab,
  Setting,
  TextAreaComponent,
  TFile,
  Editor,
  EditorPosition,
} from "obsidian";
const { exec } = require("child_process");
import moment from "moment";


import {
  insertAtCursor,
  replaceInternalLinks,
  bindClickAndDoubleClickWithSetting,
  appendToFile,
  applySimplifiedView,
  formatMarkdownOutput,
  htmlToMarkdown,
  htmlToMarkdownFiltered,
  injectGoldenDictLinkAllAsBlock,
  parseMarkdownReplaceRules,
  parseReplaceRules,bindClickAndDoubleClick,
  postProcessMarkdown,
  postProcessMarkdownCopyAll,
  postProcessMarkdownCopySummary,
  removeStyleTags,
  replaceTagClassByRules,
  renderTemplate,
  resolveLogPath,
  insertToActiveEditor,
} from "./utils";

const VIEW_TYPE_WORD = "local-dict-viewer";
// const SERVICE_EXE_PATH = "E:\\GoldenDict\\WebDict\\SilverDict\\env\\python.exe";
// const SERVICE_START_SCRIPT = "E:\\GoldenDict\\WebDict\\SilverDict\\Silver Dict CMD.lnk";

interface LocalDictPluginSettings {
  replaceRulesText: string;
  serviceExePath: string;
  serviceStartScript: string;
  apiBaseUrl: string;
  markdownReplaceRulesAll: string;
  markdownReplaceRulesSummary: string;
  copySummaryPrefix: string;
  copySummarySuffix: string;
  copyAllPrefix: string;
  copyAllSuffix: string;

  simplifiedGlobalHideSelectors: string;
  simplifiedHideSelectors: string;
  simplifiedShowInHiddenSelectors: string;

  // history: string[]; // ✅ 添加历史记录字段
  history: { word: string; time: string }[];
  maxHistory: number; // ✅ 添加最大历史记录字段
  currentHistoryIndex: number;

  copyAllLogPath?: string;
  copySummaryLogPath?: string;
  contextMenuLogPath?: string;
  doubleClickDelay?: number; // 单位: 毫秒
}

const DEFAULT_SETTINGS: LocalDictPluginSettings = {
  // serviceExePath: "D:\\Tools\\SilverDict\\env\\python.exe",
  // serviceStartScript: "D:\\Tools\\SilverDict\\Start SilverDict server.bat",
  // apiBaseUrl: "http://localhost:2628/api/query/Default%20Group/{word}",

  serviceExePath: "E:\\GoldenDict\\WebDict\\SilverDict\\env\\python.exe",
  serviceStartScript:
    "E:\\GoldenDict\\WebDict\\SilverDict\\Silver Dict CMD.lnk",
  apiBaseUrl: "http://localhost:2628/api/query/MW/{word}",

  replaceRulesText: "h2.dre,h4.dre\nh2.ure,h4.ure",
  markdownReplaceRulesSummary:
    "/[ \\t]+\\n/g,\\n\n/\\n{2,}/g,\\n\n/## 韦泊英汉快查词典\\n/,\n/^### /g,#### \n/\\n+$/,\\n\\n\n/\\*\\*\\n([^\\n])/g, ** $1\n/\\*\\*([0-9a-z^ ]{1,2}) \\*\\*/g,**$1**",
  markdownReplaceRulesAll:
    "/[ \\t]+\\n/g,\\n\n/\\n{2,}/g,\\n\n/## 韦泊英汉快查词典\\n/,\n/^### /g,#### \n/\\n+$/,\\n\\n\n/\\*\\*\\n([^\\n])/g, ** $1\n/\\*\\*([0-9a-z^ ]{1,2}) \\*\\*/g,**$1**",

  copySummaryPrefix: "\n## {{word}}\n",
  copySummarySuffix: "\n",
  copyAllPrefix: "\n## {{word}}\n",
  copyAllSuffix: "\n",

  simplifiedGlobalHideSelectors: "",
  simplifiedHideSelectors:
    ".bc\n.def_text\n.sd\n//例句\n.vis_w\n.un_text\n//名词 noncount\n.sense .sgram\n.sense .wsgram\n// 派生词\n.uro_line .gram\n",
  simplifiedShowInHiddenSelectors:
    ".un_text,.mw_zh\n.uro .vis_w, .vis",
  history: [],
  maxHistory: 500,
  currentHistoryIndex: -1,

  copyAllLogPath: "",
  copySummaryLogPath: "",
  contextMenuLogPath: "",
  doubleClickDelay: 300, // 默认300ms
};

export default class LocalDictPlugin extends Plugin {
  lastSelectedText: string | undefined = undefined;
  view: WordView | null = null;
  settings!: LocalDictPluginSettings;

  getCurrentWord(): string | null {
    return this.view?.currentWord || "";
  }
  async loadSettings() {
    //  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    const raw = await this.loadData();
    //   console.log("🧪 加载的设置为：", raw); // 👈 加这个
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
  }

  // 这段代码会判断：
  // 当前激活的 leaf 是否存在；
  // 它的视图是否是你定义的 LocalDictView（右栏的词典视图）；
  // 这样就能有效避免你切换到其他视图时仍然触发双击查询。
  //判断右栏 view 是否已挂载到 DOM，并且处于显示状态。
  isViewActive(): boolean {
    const view = this.view;
    if (!view) return false;

    const el = view.containerEl;
    // 判断是否挂载在 DOM 上且在页面中可见（不是 display: none）
    return el.isConnected && !!el.offsetParent;
  }

  async onload() {
    this.registerView(VIEW_TYPE_WORD, (leaf) => {
      this.view = new WordView(leaf, this);
      return this.view;
    });

    // 设置面板
    await this.loadSettings();

    // 添加设置面板
    this.addSettingTab(new LocalDictSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => this.activateView());

    this.addCommand({
      id: "open-local-dict-view",
      name: "Open Local Dict Viewer",
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: "navigate-back",
      name: "📘 Local Dict: Navigate Back",
      callback: () => this.navigateBack(),
    });

    this.addCommand({
      id: "navigate-forward",
      name: "📘 Local Dict: Navigate Forward",
      callback: () => this.navigateForward(),
    });

    this.addCommand({
      id: "toggle-history-panel",
      name: "📘 Local Dict: Toggle History Panel",
      callback: () => {
        const view = this.view;
        if (view?.historyContainer) {
          const container = view.historyContainer;
          container.style.display =
            container.style.display === "none" ? "block" : "none";
          if (container.style.display === "block") view.renderHistory();
        }
      },
    });

    this.addCommand({
      id: "copy-all",
      name: "📘 Local Dict: Copy All to Clipboard",
      callback: () => {
        this.view?.copyAll();
      },
    });

    this.addCommand({
      id: "copy-summary",
      name: "📘 Local Dict: Copy Summary to Clipboard",
      callback: () => {
        this.view?.copySummary();
      },
    });

    this.addCommand({
      id: "toggle-simplified-mode",
      name: "📘 Local Dict: Toggle Simplified View",
      callback: () => {
        if (!this.view) return;
        this.view.toggleSimplified();
        this.view.updateToggleButton?.(); // If you expose updateToggleButton
      },
    });

    this.addCommand({
      id: "insert-last-selected-text",
      name: "📘 Local Dict: Insert Last Selected Text at Cursor",
      callback: async () => {
        const text = this.lastSelectedText?.trim();
        if (!text) {
          new Notice("No selected text to insert");
          return;
        }

        const success = await insertAtCursor(this.app, text);
        if (!success) {
          new Notice("Failed to insert: No active markdown editor or cursor");
        }
      },
    });

    this.addCommand({
      id: "append-last-selected-text",
      name: "📘 Local Dict: Append Last Selected Text to Collection File",
      callback: async () => {
        const text = this.lastSelectedText?.trim();
        if (!text) {
          new Notice("No selected text to append");
          return;
        }

        const path = this.settings.contextMenuLogPath?.trim();

        if (!path) {
          new Notice("Collection file path not set");
          return;
        } else {    
          const resolved = renderTemplate(path, { word: this.getCurrentWord()?? "", });
          await appendToFile(this.app, resolved, text + "\n");
          new Notice(`已追加内容到： ${resolved}`);
        }
      },
    });

    this.addCommand({
      id: "copy-last-selected-text",
      name: "📘 Local Dict: Copy Last Selected Text to Clipboard",
      callback: async () => {
        const text = this.lastSelectedText?.trim();
        if (!text) {
          new Notice("No selected text to copy");
          return;
        }

        await navigator.clipboard.writeText(text);
        new Notice("Copied to clipboard");
      },
    });

    this.addCommand({
      id: "copy-all-to-log-file",
      name: "📘 Local Dict: Copy All and Append to Log File (Double Click)",
      callback: () => this.view?.handleCopyAllToFile?.(),
    });

    this.addCommand({
      id: "copy-summary-to-log-file",
      name: "📘 Local Dict: Copy Summary and Append to Log File (Double Click)",
      callback: () => this.view?.handleCopySummaryToFile?.(),
    });

    this.addCommand({
      id: "requery-current-word",
      name: "🔁 Local Dict: Re-query Current Word",
      callback: () => {
        if (this.view?.currentWord) {
          this.queryWord(this.view.currentWord, 0);
        } else {
          new Notice("当前无词可查询");
        }
      },
    });

    this.addCommand({
      id: "insert-copy-all-at-cursor",
      name: "📘 Local Dict: Insert Copied All Content at Cursor (Right Click)",
      callback: () => this.view?.handleInsertCopyAllToCursor?.(),
    });

    this.addCommand({
      id: "insert-copy-summary-at-cursor",
      name: "📘 Local Dict: Insert Copied Summary at Cursor (Right Click)",
      callback: () => this.view?.handleInsertCopySummaryToCursor?.(),
    });

    //  mark 双击触发。单词的输入点
    this.registerDomEvent(document.body, "dblclick", (evt: MouseEvent) => {
      if (!this.isViewActive()) return; // ✅ 新增：屏蔽未激活时的双击

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      if (!(evt.target as HTMLElement).closest(".cm-content")) return;

      const word = selection
        .toString()
        .replace(/[,*()#@!^$&*()\[\]{}，。；“”‘’！~～_]/g, " ") //去除没用的符号
        .trim();
      if (word) this.queryWord(word, 0, true);
    });
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_WORD);
  }

  navigateBack() {
    if (this.settings.history.length === 0) return;
    if (this.settings.currentHistoryIndex <= 0) {
      new Notice("已到最早的历史记录");
      return;
    }
    this.settings.currentHistoryIndex--;
    const item = this.settings.history[this.settings.currentHistoryIndex];
    if (item?.word) {
      this.queryWord(item.word, 0, false); // ⛔ 不更新历史记录
    }
  }

  navigateForward() {
    if (this.settings.history.length === 0) return;
    if (this.settings.currentHistoryIndex >= this.settings.history.length - 1) {
      new Notice("已到最新的历史记录");
      return;
    }
    this.settings.currentHistoryIndex++;
    const item = this.settings.history[this.settings.currentHistoryIndex];
    if (item?.word) {
      this.queryWord(item.word, 0, false); // ⛔ 不更新历史记录
    }
  }

  async activateView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_WORD);
    if (leaves.length > 0) {
      await leaves[0].setViewState({ type: VIEW_TYPE_WORD, active: true });
      this.view = this.app.workspace.getActiveViewOfType(WordView) ?? null;
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;

    await leaf.setViewState({ type: VIEW_TYPE_WORD, active: true });
    this.view = this.app.workspace.getActiveViewOfType(WordView) ?? null;
  }

  async queryWord(word: string, depth = 0, record = true) {
    // 开始查询时可设定 loading UI
    this.view?.setContent(
      `<p style="text-align:center;
                color:var(--text-muted);margin-top:1.em;">🔍 正在查询：${word}</p>`,
      word
    );

    if (!this.view || depth > 2) return;

    try {
      const baseRaw = this.settings.apiBaseUrl || "";

      const base = baseRaw.trim().replace(/ /g, "%20"); // 替换所有空格为 %20
      const queryUrl = base.replace("{word}", encodeURIComponent(word));

      const res = await fetch(queryUrl);
      const html = await res.text();
      // console.log("[LocalDict] 查询结果：", html.split("\n"));

      // ✅ 判断是否是“未找到词条”提示

      const url = new URL(this.settings.apiBaseUrl);
      // url.pathname 会得到 "/api/query/WM"
      // 然后我们可以通过 split('/') 得到一个数组，并从中选择需要的部分
      const pathParts = url.pathname.split("/"); // 得到 ["", "api", "query", "WM"]
      // 提取 "api" 和 "query"
      const query = `${pathParts[1]}/${pathParts[2]}`;
      const queryGP = `${pathParts[1]}/${pathParts[2]}/${pathParts[3]}`;
      const firstLine = html.split("\n")[0].trim(); //"<p>Entry noncount not found. Suggestions:</p>"

      // 未找到词条且不含有内部链接
      if (!html.includes(query) && firstLine.includes("not found")) {
        new Notice("未找到词条：" + word);

        // console.log("[LocalDict] 未找到词条：", html);
        // ✅ 显示空结果区域
        const placeholder = document.createElement("div");
        placeholder.textContent = firstLine;
        placeholder.style.color = "var(--text-faint)";
        placeholder.style.padding = "10px";
        await this.view.setContent(placeholder, word);

        return; // ⛔ 不更新历史
      }

      // ✅ 移除 style 标签
      const doc = new DOMParser().parseFromString(
        removeStyleTags(html),
        "text/html"
      );

      // ✅ 标签替换规则
      const rules = parseReplaceRules(this.settings.replaceRulesText);
      replaceTagClassByRules(doc, rules);

      // ✅ 插入 GoldenDict 查询链接（变为 h3 粗体）
      injectGoldenDictLinkAllAsBlock(doc);

      // ✅ 替换查询链接为粗体 strong 标签（不再绑定事件，这部分保留用于结构替换）
      replaceInternalLinks(doc, this.settings.apiBaseUrl);


      // ✅ 准备包裹元素
      const wrap = document.createElement("div");
      wrap.className = "local-dict-html-content";
      while (doc.body.firstChild) {
        wrap.appendChild(doc.body.firstChild);
      }

      // ✅ 查询 articleBlock 中的 strong 是否触发自动展开
      const articleBlock = wrap.querySelector("div.article-block");
      if (articleBlock) {
        const children = Array.from(articleBlock.children).slice(0, 3);
        for (const el of children) {
          if (el.tagName.toLowerCase() === "strong") {
            const wordAttr = el.textContent?.trim();
            const newWord = wordAttr;
            if (newWord && newWord !== word) {
              // console.log("[LocalDict] 自动展开:", newWord);
              await this.queryWord(newWord, depth + 1);
              return;
            }
          }
        }
      }

      // ✅ 设置内容（最后一步）
      await this.view.setContent(wrap, word);
      // ✅ 添加历史记录
      if (record) {
        await this.updateHistory(word);
      }

      // ✅ 滚动到顶部
      this.view.contentElInner?.scrollTo({ top: 0, behavior: "auto" });

      // ✅ 重新绑定点击事件（NEW）
      this.bindStrongLinkClicks();
    } catch (e) {
      new Notice("查询失败：" + e);
      if (this.view?.checkServiceStatus) this.view.checkServiceStatus();

      // // ✅ 清空界面并显示空白内容
      // const empty = document.createElement("div");
      // empty.innerHTML = `<p style="color: var(--text-muted); text-align: center; margin-top: 1em;">❌ 查询失败，可能未启动词典服务</p>`;
      // // this.view?.setContent(empty, word); // 👈 传入当前单词以保留上下文
      // // ✅ 显示空界面，避免历史记录错位渲染到 searchbar
      // this.view?.setContent("", "");
      // ✅ 显示空结果（确保结果容器不为空）
      const error = document.createElement("div");
      error.textContent = "查询失败：" + (e as Error).message;
      error.style.color = "var(--text-error)";
      error.style.padding = "10px";
      await this.view?.setContent(error, word);
    }
  }

  // 新方法（用于绑定点击事件）
  bindStrongLinkClicks() {
    document.querySelectorAll(".local-dict-word-link").forEach((el) => {
      const strong = el as HTMLElement;
      const word = strong.textContent?.trim();
      if (!word) return;

      strong.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        // console.log("[LocalDict] 点击触发查询：", word);
        await this.queryWord(word, 0);
      };
    });
  }

  /** 更新历史：去重＋附带时间戳 */
  async updateHistory(word: string, updateIndex = true) {
    if (!word) return;
    const trimmed = word.trim();
    if (!trimmed) return;

    // 如果当前已经是这个词，就跳过
    if (
      this.settings.history.length > 0 &&
      this.settings.history[this.settings.history.length - 1].word === trimmed
    )
      return;

    // 👉 如果当前不是最后一个词，说明用户后退了再查新词，应当清除“前进”记录
    if (this.settings.currentHistoryIndex < this.settings.history.length - 1) {
      this.settings.history = this.settings.history.slice(
        0,
        this.settings.currentHistoryIndex + 1
      );
    }

    // ✅ 格式化时间为 "20250703 120303"
    const now = new Date();
    const formatNumber = (n: number) => n.toString().padStart(2, "0");
    const formattedTime =
      `${now.getFullYear()}${formatNumber(now.getMonth() + 1)}${formatNumber(
        now.getDate()
      )} ` +
      `${formatNumber(now.getHours())}${formatNumber(
        now.getMinutes()
      )}${formatNumber(now.getSeconds())}`;

    // 删除已有的相同词项（避免重复）
    this.settings.history = this.settings.history.filter(
      (h) => h.word !== trimmed
    );

    // ✅ 添加新项
    this.settings.history.push({ word: trimmed, time: formattedTime });

    // ✅ 限制最大数量
    const max = Math.min(this.settings.maxHistory ?? 500, 500);
    if (this.settings.history.length > max) {
      this.settings.history.splice(0, this.settings.history.length - max); // 删除多余最旧的
    }

    // ✅ 更新当前索引
    if (updateIndex) {
      this.settings.currentHistoryIndex = this.settings.history.length - 1;
    }

    await this.saveSettings();
  }
}

class WordView extends ItemView {
  contentElInner!: HTMLElement;
  toggleBtn!: HTMLButtonElement;
  inputEl!: HTMLInputElement;
  searchBtn!: HTMLButtonElement;
  historyContainer!: HTMLElement;
  resultContainer!: HTMLDivElement;

  public currentWord = "";
  rawHTML = "";
  simplified = false;
  plugin: LocalDictPlugin;

  lastEditorState: {
    file: TFile | null;
    editor: Editor | null;
    cursor: EditorPosition | null;
  } = { file: null, editor: null, cursor: null };

  constructor(leaf: WorkspaceLeaf, plugin: LocalDictPlugin) {
    super(leaf);
    this.plugin = plugin;
  }



  getViewType() {
    return VIEW_TYPE_WORD;
  }

  getDisplayText() {
    return "本地词典";
  }

  getIcon() {
    return "anvil";
  }

  // 将 updateToggleButton() 定义为 WordView 的实例方法

  updateToggleButton() {
    if (!this.toggleBtn) return;

    this.toggleBtn.innerHTML = `
      <span class="${this.simplified ? "inactive" : "active"}">全部</span>
      <span class="${this.simplified ? "active" : "inactive"}">简略</span>
    `;
  }

  setupEditorTracking() {
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("editor-menu", (menu, editor, view) => {
        const file = view.file;
        if (file && editor) {
          this.lastEditorState = {
            file,
            editor,
            cursor: editor.getCursor(),
          };
        }
      })
    );
  }

  // 插入光标处（兼容右键）
  async insertAtCursor0(text: string) {
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);

    if (!view) {
      new Notice("无法插入：未检测到 Markdown 编辑器");
      return;
    }

    const editor = view.editor;
    if (!editor) {
      new Notice("无法插入：未找到编辑器");
      return;
    }

    // const cursor = editor.getCursor();
    editor.replaceSelection(text);
    new Notice("已插入内容");
    return true;
  }

  toggleSimplified() {
    this.simplified = !this.simplified;
    this.updateToggleButton(); // ✅ 在这里自动更新
    this.setContent(this.rawHTML, this.currentWord); // ✅ 统一使用 setContent 渲染
  }

  async onOpen() {
    this.contentEl.empty();
    this.setupEditorTracking(); //监听器会在你右键打开编辑器菜单时，提前保存下当前的编辑器和光标位置

    const container = this.contentEl.createDiv("local-dict-container");
    container.style.position = "relative"; // ✅ 确保浮动面板的定位是基于父容器，而不是整个页面。
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.height = "100%";

    const toolbar = container.createDiv("local-dict-toolbar");

    // ✅ 创建“复制全部”“复制简略”
    const copyAll = toolbar.createEl("button", { text: "复制全部" });
    const copySummary = toolbar.createEl("button", { text: "复制简略" });

    copyAll.setAttr("title", "单击复制，双击追加到收集文件，右键插入光标处");
    copySummary.setAttr(
      "title",
      "单击复制，双击追加到收集文件，右键插入光标处"
    );

    // copyAll   copySummary.onclick = () => this.copyAll();
    // copySummary.onclick = () => this.copySummary();

    bindClickAndDoubleClickWithSetting(
      copyAll,
      this.plugin,
      () => this.copyAll(), // 单击复制到剪贴板
      () => this.handleCopyAllToFile(), // 双击保存到文件（如果启用）
    );

    bindClickAndDoubleClickWithSetting(
      copySummary,
      this.plugin,
      () => this.copySummary(), // 单击复制到剪贴板
      () => this.handleCopySummaryToFile() // 双击保存到文件（如果启用）
    );

    copyAll.oncontextmenu = async (e) => {
      e.preventDefault();

      setTimeout(async () => {
        const md = await this.copyAll(true);
        const success = await insertAtCursor(this.app, md + "\n");

        if (!success) {
          new Notice("无法插入：未检测到 Markdown 编辑器");
        }
      }, 0);
    };

    copySummary.oncontextmenu = async (e) => {
      e.preventDefault();

      setTimeout(async () => {
        const md = await this.copySummary(true);
        const success = await insertAtCursor(this.app, md + "\n");

        if (!success) {
          new Notice("无法插入：未检测到 Markdown 编辑器");
        }
      }, 0);
    };

    // const toggleModeBtn = toolbar.createEl("button", {
    //   cls: "local-dict-toggle-btn",
    // });

    // 暴露 updateToggleButton() 方法，
    // 使插件类（LocalDictPlugin）也能调用 WordView 中定义的 updateToggleButton()
    this.toggleBtn = toolbar.createEl("button", {
      cls: "local-dict-toggle-btn",
    });

    this.toggleBtn.onclick = () => {
      this.toggleSimplified();
    };

    // ✅ 搜索栏
    const searchBar = container.createDiv("local-dict-search-bar");

    // 历史导航按钮（后退、前进、历史面板）
    // const navWrapper = searchBar.createDiv("local-dict-nav-wrapper");
    const navWrapper = searchBar.createEl("button", {
      cls: "local-dict-nav-wrapper",
    });

    const backBtn = navWrapper.createEl("button", { cls: "back-btn" });
    const showHistoryBtn = navWrapper.createEl("button", {
      cls: "history-btn local-dict-toggle-history",
      text: "📜",
    });
    const forwardBtn = navWrapper.createEl("button", { cls: "forward-btn" });

    // 添加点击事件（控制前进/后退）：
    backBtn.onclick = () => {
      this.plugin.navigateBack();
    };
    forwardBtn.onclick = () => {
      this.plugin.navigateForward();
    };

    this.inputEl = searchBar.createEl("input", {
      type: "text",
      placeholder: "输入单词",
    });


    this.searchBtn = searchBar.createEl("button", { text: "搜索" });

    const doSearch = () => {
      const word = this.inputEl.value.trim();
      if (word) this.plugin.queryWord(word, 0);
    };

    this.searchBtn.onclick = doSearch;
    this.inputEl.onkeydown = (e) => {
      if (e.key === "Enter") doSearch();
    };

    // ✅ 创建主 HTML 区域----
    this.contentElInner = container.createDiv("local-dict-html");
    this.contentElInner.style.display = "flex";
    this.contentElInner.style.flexDirection = "column";
    this.contentElInner.style.height = "100%";
    this.contentElInner.style.overflowY = "auto";

    // 自己生成的右键菜单
    this.contentElInner.addEventListener("contextmenu", (e: MouseEvent) => {
      e.preventDefault(); // 阻止默认菜单
      const selectedText = window.getSelection()?.toString().trim();
      if (!selectedText) {
        // new Notice("未选中任何内容");
        return;
      }
      this.plugin.lastSelectedText = selectedText; // ✅ 记录选中内容

      const menu = new Menu();

      menu.addItem((item) =>
        item
          .setTitle("查询所选单词")
          .setIcon("lucide-search-check")
          .onClick(() => {
            this.plugin.queryWord(selectedText, 0, true);
            this.inputEl.textContent = this.currentWord;
          })
      );

      // ✅ 第一项：复制选中文本（原始功能）
      menu.addItem((item) => {
        item
          .setTitle("复制选中文本")
          .setIcon("copy")
          .onClick(async () => {
            await navigator.clipboard.writeText(selectedText);
            // new Notice("已复制选中文本");
          });
      });

      menu.addItem((item) => {
        item
          .setTitle("插入选中文本到光标处")
          .setIcon("pencil")
          .onClick(async () => {
            const success = await insertAtCursor(this.plugin.app, selectedText);
            if (!success) {
              new Notice("插入失败：未检测到活动 Markdown 编辑器");
            }
          });
      });

      menu.addItem((item) => {
        item
          .setTitle("追加选中文本到收集文件")
          .setIcon("file-plus")
          .onClick(async () => {
            const path = this.plugin.settings.contextMenuLogPath?.trim();
            if (!path) {
              new Notice("未设置收集文件路径");
              return;
            }
          const resolved = renderTemplate(path, {word: this.currentWord ?? ""});

            await appendToFile(this.plugin.app, resolved, selectedText + "\n");
            new Notice(`已追加内容到：：${resolved}`);
          });
      });

      menu.showAtMouseEvent(e);
    });

    // ✅ 结果区域（真正的查询结果内容区）
    this.resultContainer = this.contentElInner.createDiv("local-dict-result");
    this.resultContainer.style.flex = "1";
    this.resultContainer.style.overflowY = "auto";
    this.resultContainer.style.display = "flex";
    this.resultContainer.style.flexDirection = "column";
    this.resultContainer.style.height = "100%"; // 使其竖向占据父容器剩余空间
    this.resultContainer.style.overflowY = "auto"; // 允许垂直滚动
    this.resultContainer.createEl("div", { text: "等待输入查询中..." });

    // ——— 历史面板（浮动） ———
    // 创建历史记录面板，始终显示在 html 内部
    this.historyContainer = this.contentElInner.createDiv("local-dict-history");
    this.historyContainer.style.display = "none"; // 默认隐藏

    showHistoryBtn.onclick = () => {
      if (this.historyContainer.style.display === "block") {
        this.historyContainer.style.display = "none"; // ✅ 再次点击关闭
      } else {
        requestAnimationFrame(() => {
          this.renderHistory();
          this.historyContainer.style.display = "block";
        });
      }
    };

    // 实现“失去焦点自动隐藏”
    // 建议使用 Obsidian 提供的事件注册方法：
    this.registerDomEvent(document, "click", (e: MouseEvent) => {
      // 你的 document.addEventListener("click", …) 是在 onOpen() 中注册的，⚠️ 每次打开面板都会注册一次，会导致事件重复。
      // document.addEventListener("click", (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      const isInsideHistory = target.closest(".local-dict-history");
      const isToggleBtn = target.closest(".local-dict-toggle-history");

      if (!isInsideHistory && !isToggleBtn) {
        this.historyContainer.style.display = "none";
      }
    });

    this.checkServiceStatus();
    setInterval(() => this.checkServiceStatus(), 30000);

    this.updateToggleButton(); // 初始化

    // 在左键点击主编辑器时记录状态
    // 如果你仍希望使用缓存方案（为了保险），
    this.registerDomEvent(document, "click", () => {
      const editor = this.app.workspace.activeEditor?.editor;
      const file = this.app.workspace.getActiveFile();

      if (editor && file) {
        this.lastEditorState = {
          file,
          editor,
          cursor: editor.getCursor(),
        };
      }
    });
  }

  /** 渲染历史列表 */
  renderHistory() {
    const history = this.plugin.settings.history.slice().reverse(); // 最新的在最上面
    const rawHistory = this.plugin.settings.history;
    const reversed = rawHistory.slice().reverse();
    const currentIndex = this.plugin.settings.currentHistoryIndex;
    const highlightWord =
      currentIndex >= 0 && currentIndex < rawHistory.length
        ? rawHistory[currentIndex].word
        : "";

    this.historyContainer.empty();

    if (history.length === 0) {
      this.historyContainer.createEl("div", { text: "暂无历史记录" });
      return;
    }

    history.forEach(({ word, time }, i) => {
      const actualIndex = history.length - 1 - i; // 由于你 reversed()
      const item = this.historyContainer.createDiv("history-item");

      if (actualIndex === this.plugin.settings.currentHistoryIndex) {
        item.classList.add("current-history-item");
      }

      // 左边：单词
      const wEl = item.createSpan({ text: word });
      wEl.classList.add("history-word");
      wEl.style.cursor = "pointer";
      wEl.title = "点击查看单词释义";

      wEl.onclick = () => {
        const rawHistory = this.plugin.settings.history;
        const index = rawHistory.findIndex((h) => h.word === word);
        if (index !== -1) {
          this.plugin.settings.currentHistoryIndex = index; // ✅ 同步 settings.currentHistoryIndex
        }
        this.plugin.queryWord(word, 0, false); // ✅ 禁止更新历史记录
        this.historyContainer.style.display = "none";
      };

      // 右边：时间
      const timeEl = item.createSpan({ text: time });
      timeEl.classList.add("history-time");

      //   单击选择
      timeEl.onclick = () => {
        const rawHistory = this.plugin.settings.history;
        const index = rawHistory.findIndex((h) => h.word === word);
        if (index !== -1) {
          this.plugin.settings.currentHistoryIndex = index; // ✅ 同步 settings.currentHistoryIndex
        }
        this.plugin.queryWord(word, 0, false); // ✅ 禁止更新历史记录
        this.historyContainer.style.display = "none";
      };

      timeEl.title = "右击删除此项";

      // ✅ 右击：删除当前项（保留面板）
      timeEl.oncontextmenu = async () => {
        const history = this.plugin.settings.history;
        const indexToRemove = history.findIndex((h) => h.word === word);

        if (indexToRemove === -1) return;

        // 移除该项
        history.splice(indexToRemove, 1);

        // 更新 settings.currentHistoryIndex
        if (this.plugin.settings.currentHistoryIndex > indexToRemove) {
          this.plugin.settings.currentHistoryIndex--; // 当前指针在删除项之后，往前移动一位
        } else if (this.plugin.settings.currentHistoryIndex === indexToRemove) {
          // 正好删除了当前项 → 设为前一项，若无则 -1
          this.plugin.settings.currentHistoryIndex = Math.max(
            0,
            this.plugin.settings.currentHistoryIndex - 1
          );
          if (history.length === 0)
            this.plugin.settings.currentHistoryIndex = -1;
        }

        await this.plugin.saveSettings();
        this.renderHistory();
      };
    });
  }

  async setContent(content: string | HTMLElement, word: string) {
    this.currentWord = word;

    if (typeof content === "string") {
      this.rawHTML = content;
    } else {
      this.rawHTML = content.outerHTML;
    }

    this.resultContainer.empty();

    const wrapper = document.createElement("div");

    if (typeof content === "string") {
      wrapper.innerHTML = content;
    } else {
      wrapper.appendChild(content.cloneNode(true));
    }

    applySimplifiedView(wrapper, this.simplified, this.plugin.settings);
    this.resultContainer.appendChild(wrapper);

    // ✅ 滚动到顶部
    // this.contentElInner.scrollTo({ top: 0, behavior: "auto" });
    this.contentEl.scrollTo({ top: 0, behavior: "auto" });

    // 最后更新输入框内文字
    console.log("Here is the current word: "+this.currentWord);
    // this.inputEl.setText(this.currentWord);
    // this.inputEl.setAttr("text", this.currentWord);
    this.inputEl.value= this.currentWord
  }

  //   toggleSimplified() {
  //     this.simplified = !this.simplified;

  //     const wrapper = document.createElement("div");
  //     wrapper.innerHTML = this.rawHTML;

  //     applySimplifiedView(wrapper, this.simplified, this.plugin.settings);
  //     this.contentElInner.innerHTML = wrapper.innerHTML;
  //   }

  checkServiceStatus() {
    exec("wmic process get ExecutablePath", (err: any, stdout: string) => {
      const running = stdout
        .split("\n")
        .map((line) => line.trim())
        .some(
          (path) =>
            path.toLowerCase() ===
            this.plugin.settings.serviceExePath.toLowerCase()
        );

      if (running) {
        this.inputEl.placeholder = "输入单词";
        this.searchBtn.setText("搜索");
        this.searchBtn.style.border = "";
        this.searchBtn.style.color = "";
        this.searchBtn.onclick = () => {
          const word = this.inputEl.value.trim();
          if (word) this.plugin.queryWord(word, 0);
        };
      } else {
        this.inputEl.placeholder = "未检测到SilverDict，请先启动";
        this.searchBtn.setText("开启服务");
        this.searchBtn.style.border = "1px solid red";
        this.searchBtn.style.color = "red";
        this.searchBtn.onclick = () => {
          exec(`"${this.plugin.settings.serviceStartScript}"`);
          this.inputEl.placeholder = "输入单词";
          this.searchBtn.setText("搜索");
          this.searchBtn.style.border = "";
          this.searchBtn.style.color = "";
          new Notice("已尝试启动服务");
        };
      }
    });
  }

  async onClose() {
    this.contentEl.empty();
  }

  setWord(word: string) {
    this.plugin.queryWord(word, 0);
  }

  navigateHistory(direction: number) {
    const history = this.plugin.settings.history;
    const len = history.length;

    if (len === 0) return;

    if (this.plugin.settings.currentHistoryIndex === -1) {
      // 若首次设置，从最后一个词开始
      this.plugin.settings.currentHistoryIndex = len - 1;
    } else {
      this.plugin.settings.currentHistoryIndex += direction;
      if (this.plugin.settings.currentHistoryIndex < 0) {
        this.plugin.settings.currentHistoryIndex = 0;
      } else if (this.plugin.settings.currentHistoryIndex >= len) {
        this.plugin.settings.currentHistoryIndex = len - 1;
      }
    }

    const { word } = history[this.plugin.settings.currentHistoryIndex];
    this.plugin.queryWord(word, 0);
  }

  async copyAll(returnText = false): Promise<string | void> {
    const rules = parseMarkdownReplaceRules(
      this.plugin.settings.markdownReplaceRulesAll
    );
    if (!this.currentWord) {
      new Notice("请先查询单词");
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.innerHTML = this.rawHTML;

    applySimplifiedView(wrapper, false, this.plugin.settings); // 全部模式也保留全局隐藏

    const md = htmlToMarkdownFiltered(wrapper.innerHTML);
    const processed = postProcessMarkdown(md, rules);

    const text = formatMarkdownOutput(
      this.currentWord,
      processed,
      this.plugin.settings.copyAllPrefix,
      this.plugin.settings.copyAllSuffix
    );

    if (returnText) {
      return text; // ✅ 若请求返回文本，则仅返回，不复制
    }

    await navigator.clipboard.writeText(text);
    new Notice("复制 *全部* 内容到剪贴板");
  }
  async copySummary(returnText = false): Promise<string | void> {
    const rules = parseMarkdownReplaceRules(
      this.plugin.settings.markdownReplaceRulesSummary
    );

    if (!this.currentWord) {
      new Notice("请先查询单词");
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.innerHTML = this.rawHTML;

    applySimplifiedView(wrapper, true, this.plugin.settings);

    const md = htmlToMarkdownFiltered(wrapper.innerHTML);
    const processed = postProcessMarkdown(md, rules);

    const text = formatMarkdownOutput(
      this.currentWord,
      processed,
      this.plugin.settings.copySummaryPrefix,
      this.plugin.settings.copySummarySuffix
    );

    if (returnText) {
      return text; // ✅ 若请求返回文本，则仅返回，不复制
    }

    await navigator.clipboard.writeText(text);
    new Notice("复制 *简略* 内容到剪贴板");
  }

  async handleCopyAllToFile() {
    const md = await this.copyAll(true); // 返回 markdown 内容
    const path = this.plugin.settings.copyAllLogPath?.trim();
    if (!path) {
      new Notice("未设置复制全部的插入文件路径");
      return;
    }
    if (this.currentWord) {
      // const resolved = moment().format(path);
          const resolved = renderTemplate(path, {
            word: this.currentWord ?? "",
          });

      await appendToFile(this.plugin.app, resolved, md + "\n");
    } else {
      new Notice("请先查询单词");
    }
  }

  async handleCopySummaryToFile() {
    const md = await this.copySummary(true); // 返回 markdown 内容
    const path = this.plugin.settings.copySummaryLogPath?.trim();
    if (!path) {
      new Notice("未设置复制简略的插入文件路径");
      return;
    }
    if (this.currentWord) {
      // const resolved = moment().format(path);
          const resolved = renderTemplate(path, {
            word: this.currentWord ?? "",
          });

      await appendToFile(this.plugin.app, resolved, md + "\n");
    } else {
      new Notice("请先查询单词");
    }
  }

  // 🔧 插入复制全部内容到光标处
  async handleInsertCopyAllToCursor() {
    const md = await this.copyAll(true); // 返回 Markdown 字符串
    if (!md) return;

    const success = insertAtCursor(this.plugin.app, md);
    if (!success) new Notice("无法插入：未检测到活动的文档编辑界面");
  }

  // 🔧 插入复制简略内容到光标处
  async handleInsertCopySummaryToCursor() {
    const md = await this.copySummary(true); // 返回 Markdown 字符串
    if (!md) return;

    const success = insertAtCursor(this.plugin.app, md);
    if (!success) new Notice("无法插入：未检测到活动的文档编辑界面");
  }
}

// import { PluginSettingTab, Setting } from "obsidian";
  // v这会提取出所有值是 string 的 key。
type StringKeys<T> = {
    [K in keyof T]: T[K] extends string ? K : never;
    }[keyof T];

class LocalDictSettingTab extends PluginSettingTab {
  plugin: LocalDictPlugin;

  constructor(app: App, plugin: LocalDictPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }



  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h4", { text: "SilverDict 服务设置" });

    // 通用样式设置封装
    const applyTextAreaStyle = (el: HTMLTextAreaElement) => {
      el.style.width = "100%";
      el.style.height = "140px";
      el.style.fontFamily = "monospace";
      el.style.whiteSpace = "pre";
      el.style.overflowX = "auto";
      el.wrap = "off";
    };

    // 多行说明文本工具函数
    const buildMultilineDesc = (lines: string[]): DocumentFragment => {
      const frag = document.createDocumentFragment();
      lines.forEach((line, i) => {
        frag.appendChild(document.createTextNode(line));
        if (i < lines.length - 1)
          frag.appendChild(document.createElement("br"));
      });
      return frag;
    };

    // 服务路径设置
    new Setting(containerEl)
      .setName("SilverDict 服务进程路径")
      .setDesc("检测服务时需要比较的 python.exe 进程路径。")
      .addText((text) =>
        text
          .setPlaceholder("进程路径")
          .setValue(this.plugin.settings.serviceExePath)
          .onChange(async (value) => {
            this.plugin.settings.serviceExePath = value.trim();
            await this.plugin.saveData(this.plugin.settings);
          })
      );

    new Setting(containerEl)
      .setName("启动服务脚本路径")
      .setDesc("点击“开启服务”时执行的脚本路径，可以为.bat或.lnk文件。")
      .addText((text) =>
        text
          .setPlaceholder("启动脚本路径")
          .setValue(this.plugin.settings.serviceStartScript)
          .onChange(async (value) => {
            this.plugin.settings.serviceStartScript = value.trim();
            await this.plugin.saveData(this.plugin.settings);
          })
      );

      new Setting(containerEl)
        .setName("词典服务查询 URL")
        .setDesc(
          buildMultilineDesc([
            "本地查询接口 API 的 URL，`{word}` 为要查寻的单词。",
            "例如：http://localhost:2628/api/query/Default Group/{word}",
            "现确认在浏览器内能正常使用。",
          ])
        )
        .addText((text) => {
          text
            .setPlaceholder("API 基础 URL")
            .setValue(this.plugin.settings.apiBaseUrl)
            .onChange(async (value) => {
              let cleaned = value.trim();
              if (cleaned.endsWith("/")) {
                cleaned = cleaned.slice(0, -1);
              }

              // ⚠️ 不进行 encodeURI，以保留 {word} 原样
              this.plugin.settings.apiBaseUrl = cleaned;
              await this.plugin.saveData(this.plugin.settings);
            });

          // 在失去焦点时进行简单校验和提醒
          text.inputEl.addEventListener("blur", () => {
            const url = text.inputEl.value;
            if (!url.includes("{word}")) {
              new Notice("URL 中缺少 {word} 占位符，查询将失败");
              return;
            }
            try {
              // 临时将 {word} 替换为 example 进行测试
              new URL(url.replace("{word}", "example"));
              // OK
            } catch (e) {
              new Notice("无效的 API URL，请检查格式是否正确");
            }
          });
        });
    






    containerEl.createEl("h4", { text: "双击识别时间间隔" });

    new Setting(containerEl)
      // .setName("双击识别时间间隔（ms） / Double-click delay")
      .setDesc("识别双击事件的时间间隔，单位为毫秒。默认值为 300。")
      .addText((text) =>
        text
          .setPlaceholder("300")
          .setValue(String(this.plugin.settings.doubleClickDelay || 300))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.doubleClickDelay = num;
              await this.plugin.saveSettings();
            }
          })
      );

    containerEl.createEl("h4", { text: "词典数据收集设置" });

    new Setting(containerEl).setDesc(
      buildMultilineDesc([
        "若填写路径，则每次点击时会将相应的内容时添加到相应此文件。若为空则不收集。",
        "支持 moment 格式化字符串。",
        "`Collected/{{YYYY-MM-DD}}.md` ➜ 将内容追加到在 Collected 文件夹中的当天日期文件中。",
        "`Collected/{{word}}.md` ➜ 在 Collected 文件夹中生成以当前单词为文件名的笔记。",
      ])
    );

    new Setting(containerEl)
      .setName("收集*复制全部*输出内容的文件路径")
      .setDesc("")
      .addText((text) => {
        text
          .setPlaceholder("如 [logs/all-YYYYMMDD.txt]")
          .setValue(this.plugin.settings.copyAllLogPath || "")
          .onChange(async (value) => {
            this.plugin.settings.copyAllLogPath = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("收集*复制简略*输出内容的文件路径")
      .setDesc("")
      .addText((text) => {
        text
          .setPlaceholder("如 [logs/summary-YYYYMMDD.txt]")
          .setValue(this.plugin.settings.copySummaryLogPath || "")
          .onChange(async (value) => {
            this.plugin.settings.copySummaryLogPath = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("词典显示区右键中收集文件的路径")
      .setDesc("")
      .addText((text) => {
        text
          .setPlaceholder("如 [logs/context-YYYYMMDD.txt]")
          .setValue(this.plugin.settings.contextMenuLogPath || "")
          .onChange(async (value) => {
            this.plugin.settings.contextMenuLogPath = value;
            await this.plugin.saveSettings();
          });
      });

    containerEl.createEl("h4", { text: "词典显示设置" });
    containerEl.createEl("p", {
      text: "词典显示时先按照下面的元素替换规则进行替换，得到初始版本词典内容。",
    });
    containerEl.createEl("p", { text: "之后在显示时按照下方的隐藏规则进行显示。" });
    containerEl.createEl("p", { text: "本节中所提及的选择器为有效的 CSS 选择器即可。" });

    // 标签替换规则说明 + 设置
    new Setting(containerEl)
      .setName("元素替换规则设置")
      .setDesc(
        buildMultilineDesc([
          "元素替换规则说明：",
          "每行一个替换规则，格式为 `源标签.类名,目标标签.类名`。",
          "⚠️ 类名可省略（如 `h2.,h3.abc` 表示替换所有 h2 为带 .abc 的 h3）",
          "⚠️ 若整项为空，表示匹配所有标签或所有类：",
          "  - `div,section` 表示将所有 div 替换为 section",
          "  - `,section.main` 表示将所有元素替换为 section.main",
          "  - `.note,.tip` 表示将所有 .note 类的元素替换为 .tip 类",
          "✅ 示例：",
          "  h2.dre,h3.dre     // 替换 h2.dre 为 h3.dre",
          "  h2.,h3.abc        // 替换所有 h2 为 h3.abc",
          "  ,div              // 替换所有元素为 div",
          "  span.note,p       // 替换 span.note 为 p",
          "  .warn,.notice     // 替换所有 .warn 类元素为 .notice",
        ])
      )
      .addTextArea((text) => {
        text
          .setPlaceholder("如：h2.dre,h3.dre")
          .setValue(this.plugin.settings.replaceRulesText)
          .onChange(async (value) => {
            this.plugin.settings.replaceRulesText = value;
            await this.plugin.saveData(this.plugin.settings);
          });
        // ✅ 设置宽度
        text.inputEl.style.width = "100%"; // 占满父容器
        text.inputEl.style.maxWidth = "600px"; // 限制最大宽度
        text.inputEl.style.boxSizing = "border-box"; // 避免 padding 撑宽
        applyTextAreaStyle(text.inputEl);
      });

    // 词典元素的隐藏 🔽
    new Setting(containerEl)
      .setName("全局都要隐藏的元素的选择器")
      .setDesc(
        buildMultilineDesc([
          "这些元素在显示全部和简略时都会被隐藏。",
          "每行一个 CSS 选择器。",
        ])
      )
      .addTextArea((text) => {
        text
          .setValue(this.plugin.settings.simplifiedGlobalHideSelectors)
          .onChange(async (value) => {
            this.plugin.settings.simplifiedGlobalHideSelectors = value;
            await this.plugin.saveData(this.plugin.settings);
          });

        // ✅ 设置宽度
        text.inputEl.style.width = "100%"; // 占满父容器
        text.inputEl.style.maxWidth = "600px"; // 限制最大宽度
        text.inputEl.style.boxSizing = "border-box"; // 避免 padding 撑宽

        applyTextAreaStyle(text.inputEl);
      });

    new Setting(containerEl)
      .setName("简略模式下要隐藏的元素的选择器")
      .setDesc("仅在简略模式下被隐藏的元素，每行一个 CSS 选择器。")
      .addTextArea((text) => {
        text
          .setValue(this.plugin.settings.simplifiedHideSelectors)
          .onChange(async (value) => {
            this.plugin.settings.simplifiedHideSelectors = value;
            await this.plugin.saveData(this.plugin.settings);
          });
        // ✅ 设置宽度
        text.inputEl.style.width = "100%"; // 占满父容器
        text.inputEl.style.maxWidth = "600px"; // 限制最大宽度
        text.inputEl.style.boxSizing = "border-box"; // 避免 padding 撑宽
        applyTextAreaStyle(text.inputEl);
      });

    new Setting(containerEl)
      .setName("简略模式下仍然保持显示的隐藏元素的子元素选择器")
      .setDesc(
        buildMultilineDesc([
          "从被隐藏的元素中恢复显示特定子元素。",
          "格式：每行一个规则，，使用`,`连接。例如：",
          "1. `.entry, .ure` 表示保留 `.entry` 内的 `.ure` 元素",
          "2. `.example, span.note` 表示保留 `.example` 中的 `span.note`",
          "3. `.highlight` 表示同时为父子选择器，保留该类元素",
        ])
      )
      .addTextArea((text) => {
        text
          .setPlaceholder(
            `示例：\n.entry，.ure\n.example, span.note\n.highlight`
          )
          .setValue(this.plugin.settings.simplifiedShowInHiddenSelectors)
          .onChange(async (value) => {
            this.plugin.settings.simplifiedShowInHiddenSelectors = value;
            await this.plugin.saveData(this.plugin.settings);
          });
        // ✅ 设置宽度
        text.inputEl.style.width = "100%"; // 占满父容器
        text.inputEl.style.maxWidth = "600px"; // 限制最大宽度
        text.inputEl.style.boxSizing = "border-box"; // 避免 padding 撑宽
        applyTextAreaStyle(text.inputEl);
      });

    containerEl.createEl("h4", { text: "Markdown导出后处理" });
    containerEl.createEl("p", {
      text: "Markdown导出后时按照*所见即所得*形式进行，在词典区域显示的都能导出，隐藏的均不导出。",
    });
    containerEl.createEl("p", {
      text: "Markdown导出后，如有格式排版需要修改，可以使用下面的替换规则进行修正。",
    });

    // Markdown 替换规则 - 通用说明 + 两个输入框 🔽
    new Setting(containerEl)
      .setName("Markdown 输出时的替换规则")
      .setDesc(
        buildMultilineDesc([
          "每行一条规则，格式为：/正则/标志,替换内容。",
          "⚠️ 仅支持标志：g、i、m（可省略）。",
          "⚠️ 替换内容中支持 \\n 表示换行，\\t 表示制表符，\\\\ 表示反斜杠，\\, 表示逗号。",
          "⚠️ 以 // 开头的是注释行。",
          "✅ 示例：",
          "/[ \\t]+\\n/g,\\n",
          "/\\n{2,}/g,\\n",
          "/## 韦泊英汉快查词典\\n/,",
          "/\\*\\*\\n/g,** ",
          "/\\n### /g,\\n#### ",
          "/\\n+$/g,\\n\\n",
        ])
      );

    // ✅ 输入框：复制全部
    containerEl.createEl("label", { text: "复制全部时应用的规则：" });
    const allTextArea = new TextAreaComponent(containerEl);
    allTextArea
      .setPlaceholder("/正则/,替换内容")
      .setValue(this.plugin.settings.markdownReplaceRulesAll)
      .onChange(async (value) => {
        this.plugin.settings.markdownReplaceRulesAll = value;
        await this.plugin.saveData(this.plugin.settings);
      });
    applyTextAreaStyle(allTextArea.inputEl);

    // ✅ 输入框：复制简略
    containerEl.createEl("label", { text: "复制简略时应用的规则：" });
    const summaryTextArea = new TextAreaComponent(containerEl);
    summaryTextArea
      .setPlaceholder("/正则/,替换内容")
      .setValue(this.plugin.settings.markdownReplaceRulesSummary)
      .onChange(async (value) => {
        this.plugin.settings.markdownReplaceRulesSummary = value;
        await this.plugin.saveData(this.plugin.settings);
      });
    applyTextAreaStyle(summaryTextArea.inputEl);
    // Markdown 替换规则 - 通用说明 + 两个输入框 🔼

    containerEl.createEl("h4", { text: "Markdown导出后内容添加" });
    containerEl.createEl("p", {
      text: "在此将导出的 Markdown 文本前后添加一些格式内容，方便与其他软件进行交互。",
    });

    //
    // 输出时在前后添加自定义文本，支持moment   🔽

    // ✅ 前缀/后缀模板说明
    new Setting(containerEl)
      .setName("复制内容前后缀模板说明")
      .setDesc(
        buildMultilineDesc([
          "支持模板变量：",
          "- `{{word}}` 表示当前查询词",
          "- 任意 moment.js 时间格式：如 `{{YYYY-MM-DD}}`, `{{HH:mm:ss}}` 等",
          "- 可使用 \\n 表示换行，\\t 表示制表符，\\\\ 表示反斜杠，\\, 表示逗号",
          "示例：",
          "- 前缀：`## {{word}} \\n【查询时间：{{YYYY-MM-DD HH:mm}}】`",
          "- 后缀：`\\n---\\n来自本地词典`",
          "如果不需要前缀或后缀，可以留空。",
        ])
      );

    // ✅ 自定义“细”分隔线（替代 <hr>）
    const divid1 = containerEl.createEl("div");
    divid1.style.borderTop = "1px solid var(--background-modifier-border)";
    divid1.style.margin = "1em 0";

    // ✅ 通用输入框构建函数：支持 label 在上、横向并排、可调节
    const buildRow = (
      parent: HTMLElement,
      prefixName: string,
      prefixKey: StringKeys<LocalDictPluginSettings>,
      suffixName: string,
      suffixKey: StringKeys<LocalDictPluginSettings>
    ) => {
      const row = parent.createDiv({ cls: "local-dict-template-row" });
      row.style.display = "flex";
      row.style.gap = "20px";

      const col1 = row.createDiv({ cls: "local-dict-template-col" });
      col1.style.flex = "1";
      col1.createEl("label", { text: prefixName });
      const prefixInput = col1.createEl("textarea");
      prefixInput.style.width = "100%";
      prefixInput.style.minHeight = "60px";
      prefixInput.style.resize = "vertical";

      prefixInput.value =
        (this.plugin.settings[
          prefixKey as keyof LocalDictPluginSettings
        ] as string) ?? "";
      prefixInput.addEventListener("input", async () => {
        if (typeof prefixKey === "string") {
          (this.plugin.settings as any)[prefixKey] = prefixInput.value;
          await this.plugin.saveData(this.plugin.settings);
        }
      });

      const col2 = row.createDiv({ cls: "local-dict-template-col" });
      col2.style.flex = "1";
      col2.createEl("label", { text: suffixName });
      const suffixInput = col2.createEl("textarea");
      suffixInput.style.width = "100%";
      suffixInput.style.minHeight = "60px";
      suffixInput.style.resize = "vertical";
      suffixInput.value =
        (this.plugin.settings[
          suffixKey as keyof LocalDictPluginSettings
        ] as string) ?? "";
      suffixInput.addEventListener("input", async () => {
        if (typeof suffixKey === "string") {
          (this.plugin.settings as any)[suffixKey] = suffixInput.value;
          await this.plugin.saveData(this.plugin.settings);
        }
      });
    };

    // ✅ 简略内容设置（前缀 + 后缀）
    buildRow.call(
      this,
      containerEl,
      "复制简略内容 - 前缀",
      "copySummaryPrefix",
      "复制简略内容 - 后缀",
      "copySummarySuffix"
    );

    // ✅ 自定义“细”分隔线（替代 <hr>）
    const divid2 = containerEl.createEl("div");
    divid2.style.borderTop = "1px solid var(--background-modifier-border)";
    divid2.style.margin = "1em 0";

    // ✅ 全部内容设置（前缀 + 后缀）
    buildRow.call(
      this,
      containerEl,
      "复制全部内容 - 前缀",
      "copyAllPrefix",
      "复制全部内容 - 后缀",
      "copyAllSuffix"
    );

    // 输出时在前后添加自定义文本，支持moment   🔼

    containerEl.createEl("h4", { text: "历史记录处理" });

    // ✅ 历史记录只读展示 + 清空按钮
    containerEl.createEl("label", { text: "历史记录管理" });

    const historyWords = this.plugin.settings.history
      .map((h) => h.word)
      .join(", ");
    const historyBox = containerEl.createEl("textarea", {
      cls: "local-dict-history-display",
    });
    historyBox.value = historyWords;
    historyBox.readOnly = true;
    historyBox.style.width = "100%";
    historyBox.style.minHeight = "80px";
    historyBox.style.resize = "none";
    historyBox.style.fontFamily = "monospace";
    historyBox.title = "这些是你最近查询的词，可复制，不能编辑";

    const clearBtn = containerEl.createEl("button", {
      text: "🧹 清空历史记录",
    });
    clearBtn.style.marginTop = "8px";
    clearBtn.onclick = async () => {
      if (confirm("确定要清空历史记录吗？此操作不可恢复。")) {
        this.plugin.settings.history = [];
        await this.plugin.saveSettings();
        historyBox.value = ""; // 更新只读框显示
        new Notice("历史记录已清空");
      }
    };

    // ✅ 导出历史记录按钮
    const exportBtn = containerEl.createEl("button", {
      text: "📤 导出历史记录",
    });
    exportBtn.style.marginLeft = "8px";
    exportBtn.onclick = () => {
      const lines = this.plugin.settings.history.map(
        (entry) => `${entry.word}, ${entry.time}`
      );
      const blob = new Blob([lines.join("\n")], {
        type: "text/plain;charset=utf-8",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "local-dict-history.txt";
      a.click();
      URL.revokeObjectURL(url);

      new Notice("历史记录已导出");
    };
    const historyBtnRow = containerEl.createDiv({
      cls: "local-dict-button-row",
    });

    historyBtnRow.style.display = "flex";
    historyBtnRow.style.flexWrap = "nowrap";
    historyBtnRow.style.alignItems = "center";
    historyBtnRow.style.gap = "10px";

    clearBtn.addClass("local-dict-button");
    exportBtn.addClass("local-dict-button");

    historyBtnRow.appendChild(clearBtn);
    historyBtnRow.appendChild(exportBtn);
  } //display(): void
}
 