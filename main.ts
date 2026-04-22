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
  View
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
  parseReplaceRules,
  bindClickAndDoubleClick,
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
  rightClickAppendToFilePrefix: string;
  rightClickAppendToFileSuffix: string;

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
  rightClickAppendToFilePrefix: "",
  rightClickAppendToFileSuffix: "",

  simplifiedGlobalHideSelectors: "",
  simplifiedHideSelectors:
    ".bc\n.def_text\n.sd\n//例句\n.vis_w\n.un_text\n//名词 noncount\n.sense .sgram\n.sense .wsgram\n// 派生词\n.uro_line .gram\n",
  simplifiedShowInHiddenSelectors: ".un_text,.mw_zh\n.uro .vis_w, .vis",
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
  private lastQueryTime ;
  private lastClipboard = "";
  private allowQuery = false;
  private allowQueryUntil = 0;
  private word_copied = "";
  // 在你的类中定义一个变量记录状态
  private observer: MutationObserver | undefined;

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

    this.app.workspace.onLayoutReady(() => this.activateLocalDictView());

    // ⬇️ 一行搞定：开启 PDF 双击取词
    this.enablePdfLookup();

    this.addCommand({
      id: "open-local-dict-view",
      name: "Open Local Dict Viewer",
      callback: () => this.activateLocalDictView(),
    });

    this.addCommand({
      id: "navigate-back",
      name: "Local Dict: Navigate Back",
      callback: () => this.navigateBack(),
    });

    this.addCommand({
      id: "navigate-forward",
      name: "Local Dict: Navigate Forward",
      callback: () => this.navigateForward(),
    });

    this.addCommand({
      id: "toggle-history-panel",
      name: "Local Dict: Toggle History Panel",
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
      name: "Local Dict: Copy All to Clipboard",
      callback: () => {
        this.view?.copyAll();
      },
    });

    this.addCommand({
      id: "copy-summary",
      name: "Local Dict: Copy Summary to Clipboard",
      callback: () => {
        this.view?.copySummary();
      },
    });

    this.addCommand({
      id: "toggle-simplified-mode",
      name: "Local Dict: Toggle Simplified View",
      callback: () => {
        if (!this.view) return;
        this.view.toggleSimplified();
        this.view.updateToggleButton?.(); // If you expose updateToggleButton
      },
    });

    this.addCommand({
      id: "insert-selected-text",
      name: "Local Dict: Insert Selected Text at Cursor",
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
      id: "append-selected-text",
      name: "Local Dict: Append Selected Text to Collection File",
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
          const resolved = renderTemplate(path, {
            word: this.getCurrentWord() ?? "",
          });
          await appendToFile(this.app, resolved, text + "\n");
          new Notice(`已追加内容到： ${resolved}`);
        }
      },
    });

    this.addCommand({
      id: "copy-selected-text",
      name: "Local Dict: Copy Selected Text to Clipboard",
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
      name: "Local Dict: Copy All and Append to Log File (Double Click)",
      callback: () => this.view?.handleCopyAllToFile?.(),
    });

    this.addCommand({
      id: "copy-summary-to-log-file",
      name: "Local Dict: Copy Summary and Append to Log File (Double Click)",
      callback: () => this.view?.handleCopySummaryToFile?.(),
    });

    this.addCommand({
      id: "query-current-selected-word",
      name: "Local Dict: Query Current Selected Word",
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
      name: "Local Dict: Insert Copied All Content at Cursor (Right Click)",
      callback: () => this.view?.handleInsertCopyAllToCursor?.(),
    });

    this.addCommand({
      id: "insert-copy-summary-at-cursor",
      name: "Local Dict: Insert Copied Summary at Cursor (Right Click)",
      callback: () => this.view?.handleInsertCopySummaryToCursor?.(),
    });

    //  mark 双击触发。单词的输入点
    this.registerDomEvent(
      document.body,
      "dblclick",
      async (evt: MouseEvent) => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;
        if (!(evt.target as HTMLElement).closest(".cm-content")) return;

        const word = selection
          .toString()
          .replace(
            /[!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~，。！？、；：「」『』（）《》〈〉【】——……￥·～]/g,
            " ",
          ) //去除没用的符号
          .trim();
        // if (word) this.queryWord(word, 0, true);

        if (evt.ctrlKey) {
          // console.log("ctrl key pressed ");
          await this.activateLocalDictView(); // ⬅️ 展开右栏
          // this.switchToLocalDictTab(); // ⬅️ 切换标签
          this.queryWord(word, 0, true); // ⬅️ 查词
        } else {
          // console.log("no ctrl key pressed ");
          if (!this.isViewActive()) return; // ✅ 新增：屏蔽未激活时的双击
          this.queryWord(word, 0, true);
        }
      },
    );

    // this.observeWebViewer();           // 必须使用 Ctrl + C 复制的流程  这0.26
    // this.startClipboardWatcher();      // 必须使用 Ctrl + C 复制的流程  这0.26

    /*     // 监听 Obsidian 布局变化，这样新打开的 webview 也能被捕获
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        // 给 100ms 缓冲，让该销毁的销毁干净
        setTimeout(() => this.initWebviewListener(), 100);
      }),
    );

    // 初始执行一次
    this.app.workspace.onLayoutReady(() => {
      this.initWebviewListener();
    }); */

    this.copyFromWebviewer();
  } // // onload end

  initWebviewListener0() {
    // 1. 缩小范围：只在活动的叶子节点（Leaf）中寻找，避免扫描到后台已关闭但未清理的残余
    const activeView = this.app.workspace.getActiveViewOfType(View);
    if (!activeView) return;

    const webviews = activeView.containerEl.querySelectorAll("webview");
    if (webviews.length === 0) return;

    // 1. 获取所有 webview，而不仅仅是第一个
    // const webviews = document.querySelectorAll("webview");

    if (webviews.length === 0) return;

    webviews.forEach((el: any) => {
      // 1. 核心防御：检查 webview 是否已经销毁
      // 如果 webview 正在关闭过程中，访问它会直接崩溃
      try {
        if (el.isDestroyed && el.isDestroyed()) return;
      } catch (e) {
        return; // 捕获“Object has been destroyed”异常
      }

      // 2. 防止重复绑定监听器（通过自定义标记）
      if (el.dataset.obsidianBound) return;
      el.dataset.obsidianBound = "true";

      // 3. 使用安全的消息监听
      const handleConsoleMessage = (e: any) => {
        // 每次处理消息前再次检查元素是否存在
        if (!el || !el.parentNode) {
          el.removeEventListener("console-message", handleConsoleMessage);
          return;
        }

        const msg = e.message;
        if (msg.startsWith("OBSIDIAN_PAYLOAD:")) {
          const word = msg.replace("OBSIDIAN_PAYLOAD:", "");
          this.word_copied = word;

          // 建议使用 try-catch 包裹业务逻辑，防止 viewType 获取失败导致中断
          try {
            const viewType = getActiveViewType(this.app);
            if (viewType === "webviewer") {
              this.queryWord(this.word_copied);
            }
          } catch (err) {
            console.log("视图状态异常，跳过查询");
          }
        }
      };

      el.addEventListener("console-message", handleConsoleMessage);

      // 4. 注入双击脚本
      const inject = () => {
        // 注入前最后一次检查
        try {
          if (el.isDestroyed()) return;
          el.executeJavaScript(`
                    if (!window.hasObsidianListener) {
                        document.addEventListener('dblclick', () => {
                            const text = window.getSelection().toString().trim();
                            if (text) console.log("OBSIDIAN_PAYLOAD:" + text);
                        });
                        window.hasObsidianListener = true;
                    }
                `);
        } catch (e) {
          console.log("Webview 在注入前已关闭");
        }
      };

      if (el.isLoading()) {
        el.addEventListener("dom-ready", inject, { once: true });
      } else {
        inject();
      }
    });
  }

  initWebviewListener00() {
    // 1. 缩小范围：只在活动的叶子节点（Leaf）中寻找，避免扫描到后台已关闭但未清理的残余
    const activeView = this.app.workspace.getActiveViewOfType(View);
    if (!activeView) return;

    const webviews = activeView.containerEl.querySelectorAll("webview");
    if (webviews.length === 0) return;

    webviews.forEach((el: any) => {
      // 2. 检查 Webview 是否真的“活着”
      // 增加对 parentNode 的检查，确保它还在当前的 DOM 树上
      if (!el || !el.parentNode || !document.body.contains(el)) {
        return;
      }

      try {
        // 如果已经被标记为销毁，直接跳过
        if (typeof el.isDestroyed === "function" && el.isDestroyed()) return;
      } catch (e) {
        return; // 捕获“Object has been destroyed”
      }

      // 3. 防止重复绑定
      if (el.dataset.obsidianBound === "true") return;

      // 4. 执行绑定逻辑
      try {
        console.log("【Obsidian】正在绑定存活的 webview...");

        // 绑定消息监听
        el.addEventListener("console-message", (e: any) => {
          const msg = e.message;
          if (msg.startsWith("OBSIDIAN_PAYLOAD:")) {
            const word = msg.replace("OBSIDIAN_PAYLOAD:", "");
            this.word_copied = word;
            this.queryWord(this.word_copied);
          }
        });

        // 定义注入函数
        const inject = () => {
          try {
            // 在真正执行 JS 注入前做最后一次存活检查
            if (el && !el.isDestroyed()) {
              el.executeJavaScript(`
                            if (!window.hasObsidianListener) {
                                document.addEventListener('dblclick', () => {
                                    const text = window.getSelection().toString().trim();
                                    if (text) console.log("OBSIDIAN_PAYLOAD:" + text);
                                });
                                window.hasObsidianListener = true;
                            }
                        `);
              el.dataset.obsidianBound = "true"; // 只有成功注入指令才标记
            }
          } catch (e) {
            // 忽略此处报错，因为这说明 Webview 瞬间被关闭了
          }
        };

        if (el.isLoading()) {
          el.addEventListener("dom-ready", inject, { once: true });
        } else {
          inject();
        }
      } catch (err) {
        console.log("【Obsidian】绑定过程出错，可能元素已失效");
      }
    });
  }

  initWebviewListener000() {
    // 增加延迟，避开侧边栏打开时的 DOM 剧烈变动期
    setTimeout(() => {
      const activeView = this.app.workspace.getActiveViewOfType(View);
      if (!activeView) {
        console.log("【Obsidian】未发现活动视图，跳过。");
        return;
      }

      // 尝试从当前活动视图或全局寻找 webview
      const webviews = document.querySelectorAll("webview");

      webviews.forEach((el: any) => {
        // 存活检查
        try {
          if (!el || !el.parentNode || (el.isDestroyed && el.isDestroyed()))
            return;
        } catch (e) {
          return;
        }

        // 检查是否已经绑定
        if (el.dataset.obsidianBound === "true") {
          // console.log("【Obsidian】Webview 已绑定，跳过。");
          return;
        }

        console.log("【Obsidian】正在为 Webview 绑定监听器并尝试注入...");

        // 1. 绑定日志捕获（这是通信的关键）
        el.addEventListener("console-message", (e: any) => {
          const msg = e.message;
          // 增加一个简单的日志，看看 webview 里面到底发出来没
          if (msg.includes("OBSIDIAN_PAYLOAD")) {
            console.log("【Obsidian】监听到 Payload 原始信息:", msg);
          }

          if (msg.startsWith("OBSIDIAN_PAYLOAD:")) {
            const word = msg.replace("OBSIDIAN_PAYLOAD:", "");
            this.word_copied = word;

            console.log("【Obsidian】即将执行查询程序，单词:", word);
            // 执行查询（这里可能会触发侧边栏）
            this.queryWord(this.word_copied);
          }
        });

        // 2. 注入双击逻辑
        const injectLogic = () => {
          try {
            if (el.isDestroyed()) return;

            // 标记为已绑定，防止 layout-change 再次进入
            el.dataset.obsidianBound = "true";

            el.executeJavaScript(
              `
                        (function() {
                            // 即使页面刷新，也要确保逻辑存在
                            document.removeEventListener('dblclick', window._obsidianHandler);
                            window._obsidianHandler = () => {
                                const text = window.getSelection().toString().trim();
                                if (text) {
                                    console.log("OBSIDIAN_PAYLOAD:" + text);
                                }
                            };
                            document.addEventListener('dblclick', window._obsidianHandler);
                            window.hasObsidianListener = true;
                            console.log("【Webview内】双击监听已就绪，尝试双击一个词。");
                        })();
                    `,
            )
              .then(() => {
                console.log("【Obsidian】注入脚本指令发送成功。");
              })
              .catch((err) => {
                console.error("【Obsidian】注入脚本失败:", err);
                el.dataset.obsidianBound = "false"; // 失败了就允许下次重试
              });
          } catch (e) {
            console.log("【Obsidian】注入时 Webview 已消失");
          }
        };

        // 3. 确保在正确的时机注入
        if (el.isLoading()) {
          console.log("【Obsidian】Webview 还在加载，等待 dom-ready...");
          el.addEventListener("dom-ready", injectLogic, { once: true });
        } else {
          injectLogic();
        }
      });
    }, 200); // 200ms 的缓冲足以避开大部分侧边栏引起的布局抖动
  }

  copyFromWebviewer() {
    // 如果已经有观察器在运行，先停掉，防止多重绑定
    if (this.observer) this.observer.disconnect();

    this.observer = new MutationObserver((mutations) => {
      const webviews = document.querySelectorAll("webview");
      webviews.forEach((el: any) => {
        // 存活及绑定检查
        try {
          if (!el || !el.parentNode || (el.isDestroyed && el.isDestroyed()))
            return;
          if (el.dataset.obsidianBound === "true") return;
        } catch (e) {
          return;
        }

        this.setupSpecificWebview(el);
      });
    });

    // 开始观察整个文档的 DOM 变动
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // 初始执行一次，处理当前已存在的 webview
    const existing = document.querySelectorAll("webview");
    existing.forEach((el) => this.setupSpecificWebview(el));
  }

  setupSpecificWebview0(el: any) {
    el.dataset.obsidianBound = "true";
    console.log("【Obsidian】发现活跃 Webview，正在绑定...");

    // 1. 监听消息
    el.addEventListener("console-message", (e: any) => {
      const msg = e.message;
      if (msg.startsWith("OBSIDIAN_PAYLOAD:")) {
        const word = msg.replace("OBSIDIAN_PAYLOAD:", "");
        this.word_copied = word;
        console.log("【Obsidian】收到单词:", word);
        this.queryWord(word);
      }
    });

    // 2. 注入逻辑的闭包
    const doInject = () => {
      try {
        if (el.isDestroyed()) return;
        el.executeJavaScript(
          `
                (function() {
                    console.log("【Webview内】开始尝试绑定双击...");
                    document.removeEventListener('dblclick', window._obsidianHandler);
                    window._obsidianHandler = () => {
                        const text = window.getSelection().toString().trim();
                        if (text) console.log("OBSIDIAN_PAYLOAD:" + text);
                    };
                    document.addEventListener('dblclick', window._obsidianHandler);
                    console.log("【Webview内】双击监听已就绪");
                })();
            `,
        )
          .then(() => console.log("【Obsidian】脚本注入指令已送达"))
          .catch((err) => {
            el.dataset.obsidianBound = "false";
            console.error("【Obsidian】注入失败:", err);
          });
      } catch (e) {
        el.dataset.obsidianBound = "false";
      }
    };

    // 3. 核心：处理加载状态
    if (el.isLoading()) {
      // 如果正在加载，必须等加载完
      el.addEventListener(
        "dom-ready",
        () => {
          // 稍微延迟，确保渲染进程上下文已稳固
          setTimeout(doInject, 300);
        },
        { once: true },
      );
    } else {
      // 如果已经加载完了，直接注入
      doInject();
    }
  }

  setupSpecificWebview00(el: any) {
    // 1. 基础消息监听（这个可以立即绑定，通常不会报错）
    if (!el.dataset.obsidianBound) {
      el.addEventListener("console-message", (e: any) => {
        const msg = e.message;
        if (msg.startsWith("OBSIDIAN_PAYLOAD:")) {
          const word = msg.replace("OBSIDIAN_PAYLOAD:", "");
          this.word_copied = word;
          this.queryWord(word);
        }
      });
    }

    // 2. 定义一个顽固的注入函数
    const tryInject = (retries = 5) => {
      if (retries <= 0) {
        console.error("【Obsidian】多次尝试注入失败，放弃。");
        return;
      }

      try {
        // 检查：必须在 DOM 中且没有被销毁
        if (!el || !el.parentNode || (el.isDestroyed && el.isDestroyed()))
          return;

        el.executeJavaScript(
          `
                (function() {
                    document.removeEventListener('dblclick', window._obsidianHandler);
                    window._obsidianHandler = () => {
                        const text = window.getSelection().toString().trim();
                        if (text) console.log("OBSIDIAN_PAYLOAD:" + text);
                    };
                    document.addEventListener('dblclick', window._obsidianHandler);
                    console.log("【Webview内】注入成功");
                })();
            `,
        )
          .then(() => {
            el.dataset.obsidianBound = "true";
            console.log("【Obsidian】脚本注入成功");
          })
          .catch((err) => {
            // 如果报错提示 "must be attached to the DOM"，延迟重试
            console.warn(
              `【Obsidian】注入环境未就绪，剩余重试次数: ${retries - 1}`,
            );
            setTimeout(() => tryInject(retries - 1), 500);
          });
      } catch (e) {
        // 如果 executeJavaScript 直接抛出同步异常
        setTimeout(() => tryInject(retries - 1), 500);
      }
    };

    // 3. 决定何时启动注入
    if (el.isLoading()) {
      el.addEventListener("dom-ready", () => tryInject(), { once: true });
    } else {
      // 哪怕没在加载，也给 300ms 缓冲，避开该死的 "not attached" 报错
      setTimeout(() => tryInject(), 300);
    }
  }

  setupSpecificWebview(el: any) {
    // 1. 严格的可见性与归属检查
    const isVisible = el.offsetWidth > 0 && el.offsetHeight > 0;
    if (!isVisible || !document.body.contains(el)) return;

    // 2. 状态锁
    if (
      el.dataset.obsidianBound === "true" ||
      el.dataset.obsidianBinding === "true"
    )
      return;
    el.dataset.obsidianBinding = "true";

    console.log("【Local-dict】发现活跃 Webview，准备接入...");

    // 3. 消息监听 (无论注入是否成功，先挂载监听)
    if (!el._hasCMLite) {
      // 防止重复添加原生监听
      el.addEventListener("console-message", (e: any) => {
        const msg = e.message;
        if (msg.startsWith("OBSIDIAN_PAYLOAD:")) {
          const word = msg.replace("OBSIDIAN_PAYLOAD:", "");
          this.word_copied = word;

          if (Date.now() - this.lastQueryTime < 500) return;
          this.lastQueryTime = Date.now();
          this.queryWord(word);

        }
      });
      el._hasCMLite = true;
    }

    // 4. 递归重试函数 (柔性注入)
    const secureInject = (attempt = 1) => {
      // 检查环境是否依然存活
      if (!el || !el.parentNode || (el.isDestroyed && el.isDestroyed())) {
        el.dataset.obsidianBinding = "false";
        return;
      }

      el.executeJavaScript(
        `
            (function() {
                if (window._obsidianHandler) return "EXIST";
                window._obsidianHandler = () => {
                    const text = window.getSelection().toString().trim();
                    if (text) console.log("OBSIDIAN_PAYLOAD:" + text);
                };
                document.addEventListener('dblclick', window._obsidianHandler);
                return "OK";
            })();
        `,
      )
        .then((res) => {
          el.dataset.obsidianBound = "true";
          el.dataset.obsidianBinding = "false";
          console.log(`【Local-dict】注入成功 (尝试次数: ${attempt})`);
        })
        .catch((err) => {
          // 如果报错包含 "must be attached"，说明 Electron 还没准备好
          if (
            err.message.includes("attached") ||
            err.message.includes("emitted")
          ) {
            if (attempt < 10) {
              // 最多尝试 10 次，覆盖约 5 秒的时长
              setTimeout(() => secureInject(attempt + 1), 500);
            } else {
              el.dataset.obsidianBinding = "false";
              console.warn(
                "【Local-dict】Webview 挂载超时，请尝试重新切换该视图",
              );
            }
          } else {
            el.dataset.obsidianBinding = "false";
            console.error("【Local-dict】注入发生非环境错误:", err);
          }
        });
    };

    // 5. 延迟启动：给 Obsidian 侧边栏动画留出时间
    // 侧边栏展开通常有 200-300ms 动画，Electron 在动画期间可能无法初始化 webview
    setTimeout(() => secureInject(), 500);
  }

  copyFromWebviewer0() {
    const webview = document.querySelector("webview") as any;
    const injectionScript = `
    (function() {
        document.addEventListener('dblclick', () => {

        // 获取当前选中的文本内容
            const selectedText = window.getSelection().toString().trim();
            
            if (selectedText.length > 0) {
                // 在网页内部执行复制命令
                document.execCommand('copy');
                
                // 可选：在 webview 内部控制台打印一下确认，或者发送回主机
                console.log('已尝试复制单词: ' + selectedText);
                
                // 如果你想把这个词传回 Obsidian 变量，可以使用 sendToHost
                window.sendToHost('word_copied', selectedText);
            }
        });
    })();
    `;
    if (webview instanceof HTMLElement) {
      webview.addEventListener("dom-ready", () => {
        // webview.executeJavaScript(injectionScript);
      });
    }
    console.log("word_copied: " + this.word_copied);
  }

  copyFromWebviewer00() {
    const webview = document.querySelector("webview") as any;
    if (!webview) return;

    const injectionScript = `
    (function() {
        // 移除旧监听器防止重复绑定（如果该函数会被多次调用）
        document.removeEventListener('dblclick', window._obsidianDblClickHandler);
        
        window._obsidianDblClickHandler = () => {
            const selectedText = window.getSelection().toString().trim();
            if (selectedText.length > 0) {
                document.execCommand('copy');
                // 发送给宿主 (Obsidian)
                window.sendToHost('word_copied_event', selectedText);
            }
        };
        
        document.addEventListener('dblclick', window._obsidianDblClickHandler);
        console.log('注入成功：双击监听已就绪');
    })();
    `;

    // 1. 监听来自 webview 内部的消息
    webview.addEventListener("ipc-message", (event: any) => {
      if (event.channel === "word_copied_event") {
        const copiedText = event.args[0];
        this.word_copied = copiedText; // 成功存入变量
        console.log("Obsidian 收到已复制内容: " + this.word_copied);

        // 如果你想在 Obsidian 界面给个反馈
        new Notice("已存入变量: " + copiedText);
      }
    });

    // 2. 注入脚本
    // 如果 webview 已经加载好了，直接注入；否则等 dom-ready
    const runInjection = () => {
      webview
        .executeJavaScript(injectionScript)
        .then(() => console.log("脚本注入指令已发送"));
    };

    if (webview.isLoading()) {
      // 检查是否正在加载
      webview.addEventListener("dom-ready", runInjection, { once: true });
    } else {
      runInjection();
    }
  }

  // ------------
  copyFromWebviewer000() {
    const webview = document.querySelector("webview") as any;

    // 检查点 1: 元素是否存在
    if (!webview) {
      console.error("【Obsidian】找不到 webview 元素！可能视图未打开。");
      return;
    }
    console.log("【Obsidian】成功锁定 webview 元素");

    // 检查点 3: 注入逻辑
    const inject = () => {
      console.log("【Obsidian】正在尝试注入脚本...");
      webview
        .executeJavaScript(
          `
          document.addEventListener('dblclick', () => {
              const text = window.getSelection().toString().trim();
              if (text) {
                  // 故意发一个特定格式的 log
                  console.log("OBSIDIAN_PAYLOAD:" + text);
              }
            });
          `,
        )
        .then(() => {
          console.log("【Obsidian】executeJavaScript 指令已成功发出");
        })
        .catch((err) => {
          console.error("【Obsidian】注入脚本失败:", err);
        });
    };

    // 2. Obsidian 外部代码
    webview.addEventListener("console-message", (e: any) => {
      const msg = e.message;
      if (msg.startsWith("OBSIDIAN_PAYLOAD:")) {
        this.word_copied = msg.replace("OBSIDIAN_PAYLOAD:", "");
        console.log("通过 Log 劫持获取到:", this.word_copied);
      }
    });

    // 关键：如果 webview 还没加载完，inject 是没用的
    if (webview.isLoading()) {
      webview.addEventListener("dom-ready", inject, { once: true });
    } else {
      inject();
    }
  }

  copyFromWebviewer9() {
    const webview = document.querySelector("webview") as any;

    if (!webview) {
      console.error("【Obsidian】找不到 webview 元素");
      return;
    }

    // --- 核心修改：在监听器内部执行查询 ---
    webview.addEventListener("console-message", (e: any) => {
      const msg = e.message;
      if (msg.startsWith("OBSIDIAN_PAYLOAD:")) {
        const word = msg.replace("OBSIDIAN_PAYLOAD:", "");
        this.word_copied = word;

        console.log("【Obsidian】捕获到单词:", this.word_copied);

        // 1. 获取当前视图类型进行二次确认
        const viewType = getActiveViewType(this.app);
        console.log("【Obsidian】触发环境视图类型:", viewType);

        // 2. 执行查询逻辑
        if (viewType === "webviewer") {
          console.log(
            "【Obsidian】确认处于 Webviewer，开始查询:",
            this.word_copied,
          );
          this.queryWord(this.word_copied);
        }
      }
    });

    const inject = () => {
      webview.executeJavaScript(`
            // 增加一个防抖或检查，确保不会重复绑定
            if (!window.hasObsidianListener) {
                document.addEventListener('dblclick', () => {
                    const text = window.getSelection().toString().trim();
                    if (text) {
                        console.log("OBSIDIAN_PAYLOAD:" + text);
                    }
                });
                window.hasObsidianListener = true;
            }
        `);
    };

    if (webview.isLoading()) {
      webview.addEventListener("dom-ready", inject, { once: true });
    } else {
      inject();
    }
  }

  observeWebViewer() {
    document.addEventListener("selectionchange", () => {
      const text = window.getSelection()?.toString()?.trim();

      if (!text) return;

      this.allowQueryUntil = Date.now() + 800;

      // console.log("allowQueryUntil set to:", this.allowQueryUntil);
    });
  }

  observeWebViewer0() {
    const observer = new MutationObserver(() => {
      const container = document.querySelector(".webviewer-content");

      if (!container) return;

      if ((container as any)._bound) return;
      (container as any)._bound = true;

      console.log("FOUND WEB VIEWER");

      container.addEventListener("pointerup", () => {
        this.allowQueryUntil = Date.now() + 800;
        console.log("allowQueryUntil set to:", this.allowQueryUntil);
      });
      console.log("pointerup event bound to webviewer-content");
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private observeWebViewer1() {
    console.log("observeWebViewer started");

    const observer = new MutationObserver(() => {
      const all = document.querySelectorAll("*");

      console.log("DOM check:", all.length);

      const container = document.querySelector(".webviewer-content");

      console.log("webviewer-content:", container);

      if (!container) return;

      console.log("FOUND WEBVIEWER");

      (container as any)._bound = true;

      container.addEventListener("copy", () => {
        console.log("WebViewer bound");
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  startClipboardWatcher() {
    setInterval(async () => {
      try {
        const viewType = getActiveViewType(this.app);
        // console.log("ACTIVE VIEW:", getActiveViewType(this.app));
        const text = await navigator.clipboard.readText();

        if (!text || text === this.lastClipboard) return;

        this.lastClipboard = text;

        const cleaned = text
          .replace(
            /[!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~，。！？、；：「」『』（）《》〈〉【】——……￥·～]/g,
            " ",
          )
          .trim();
        if (!cleaned) return;
        // console.log("CLIPBOARD:", cleaned);

        // note 限定在 web viewer 才进行复制查询单词。
        // 双击查询未成功。其内容获取不到。
        if (viewType === "webviewer") {
          this.queryWord(cleaned);
        }
      } catch (e) {
        // ignore
      }
    }, 500);
  }

  /* -------------------------------------------------------------------------- */
  /*  核心整合逻辑
   *  - 使 PDF.js textLayer 可选中
   *  - 实现 Ctrl+双击 / 普通双击 的取词逻辑
   *  放入你的 Plugin 子类（假设名为 LocalDictPlugin）中：
   *    1. 在 onload() 里调用 this.enablePdfLookup();
   *    2. 其余辅助方法（activateLocalDictView, queryWord 等）沿用你已有实现。
   * -------------------------------------------------------------------------- */

  private enablePdfLookup() {
    this.registerDomEvent(
      document.body,
      "dblclick",
      async (evt: MouseEvent) => {
        const target = evt.target as HTMLElement;

        // 只在 PDF 的文字层中响应
        if (!target.closest(".textLayer")) return;

        let word = "";

        // 1. 优先尝试获取用户手动选中的词
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
          word = sel.toString().trim();
        }

        // 2. 如果未能获取选中词（如双击失败），尝试手动提取
        if (!word) {
          const range =
            document.caretRangeFromPoint?.(evt.clientX, evt.clientY) ??
            (document as any).caretPositionFromPoint?.(
              evt.clientX,
              evt.clientY,
            );

          if (range) {
            const node = (range as any).startContainer;
            if (node?.textContent) {
              const offset = (range as any).startOffset;
              word = this.extractWordAround(node.textContent, offset);
            }
          }
        }

        // 3. 清洗提取到的内容，去除符号
        word = word.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
        if (!word) return;

        // 4. Ctrl + 双击：强制打开面板 + 查词
        if (evt.ctrlKey) {
          await this.activateLocalDictView();
          this.queryWord(word, 0, true);
          return;
        }

        // 5. 普通双击，仅当面板已展开时才查词
        if (this.isViewActive()) {
          this.queryWord(word, 0, true);
        }
      },
    );
  }

  // ⬇️ 辅助函数：从 offset 处提取完整单词
  extractWordAround(text: string, offset: number): string {
    const isWordChar = (ch: string) => /\p{L}|\p{N}/u.test(ch);
    let start = offset;
    let end = offset;

    while (start > 0 && isWordChar(text[start - 1])) start--;
    while (end < text.length && isWordChar(text[end])) end++;

    return text.slice(start, end);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_WORD);
    this.observer?.disconnect();
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

  async activateLocalDictView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_WORD);
    if (leaves.length > 0) {
      // 已经存在，直接激活
      await this.app.workspace.revealLeaf(leaves[0]);
      this.view = leaves[0].view as WordView;
      return;
    }

    // 获取或创建右侧栏 leaf
    const leaf = this.app.workspace.getRightLeaf(true); // ← 用 true 保证一定能获取到
    if (!leaf) {
      console.warn("无法获取右侧栏 leaf");
      return;
    }

    // 设置 viewState，显示你的视图
    await leaf.setViewState({
      type: VIEW_TYPE_WORD,
      active: true,
    });

    // 激活它
    await this.app.workspace.revealLeaf(leaf);

    // 获取视图实例
    this.view = leaf.view instanceof WordView ? leaf.view : null;
    console.log("展开右栏");
  }

  async queryWord(word: string, depth = 0, record = true) {
    // 开始查询时可设定 loading UI
    this.view?.setContent(
      `<p style="text-align:center;
                color:var(--text-muted);margin-top:1.em;">🔍 正在查询：${word}</p>`,
      word,
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
      const firstLine = html.split("\n")[0].trim(); //"<p>Entry noncount not found. Suggestions:</p>"

      // 未找到词条且不含有内部链接
      if (!html.includes(query) && firstLine.includes("not found")) {
        new Notice("未找到词条：" + word);

        // console.log("[LocalDict] 未找到词条：", html);
        // ✅ 显示空结果区域
        const placeholder = document.createElement("div");
        placeholder.textContent = firstLine.slice(3, -17);
        placeholder.style.color = "var(--text-faint)";
        placeholder.style.padding = "10px";
        await this.view.setContent(placeholder, word);

        return; // ⛔ 不更新历史
      }

      // ✅ 移除 style 标签
      const doc = new DOMParser().parseFromString(
        removeStyleTags(html),
        "text/html",
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

  /** 更新历史：去重＋附带时间戳（忽略大小写） */
  async updateHistory(word: string, updateIndex = true) {
    if (!word) return;
    const trimmed = word.trim();
    if (!trimmed) return;

    const trimmedLower = trimmed.toLowerCase(); // ← 统一小写比较

    // 如果当前已经是这个词（忽略大小写）就跳过
    if (
      this.settings.history.length > 0 &&
      this.settings.history[
        this.settings.history.length - 1
      ].word.toLowerCase() === trimmedLower
    )
      return;

    // 如果当前不是最后一个词，说明用户后退了再查新词，应当清除“前进”记录
    if (this.settings.currentHistoryIndex < this.settings.history.length - 1) {
      this.settings.history = this.settings.history.slice(
        0,
        this.settings.currentHistoryIndex + 1,
      );
    }

    // 格式化时间为 "YYYYMMDD HHMMSS"
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const formattedTime =
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())} ` +
      `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    // 删除已有的相同词项（忽略大小写，避免重复）
    this.settings.history = this.settings.history.filter(
      (h) => h.word.toLowerCase() !== trimmedLower,
    );

    // 添加新项
    this.settings.history.push({ word: trimmed, time: formattedTime });

    // 限制最大数量
    const max = Math.min(this.settings.maxHistory ?? 500, 500);
    if (this.settings.history.length > max) {
      this.settings.history.splice(0, this.settings.history.length - max); // 删除多余最旧的
    }

    // 更新当前索引
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
    return "Local Dict Viewer";
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
      }),
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

    this.contentEl.classList.add("local-dict-container");
    const container = this.contentEl;
    // const container = this.contentEl.createDiv("local-dict-container");

    container.style.overflow = "hidden";
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
      "单击复制，双击追加到收集文件，右键插入光标处",
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
      () => this.handleCopySummaryToFile(), // 双击保存到文件（如果启用）
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
    // this.contentElInner.style.height = "100%";
    this.contentElInner.style.overflowY = "auto";
    this.contentElInner.style.position = "relative"; // ✅ 确保浮动面板的定位是基于父容器，而不是整个页面。

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
          }),
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
            const success = await insertAtCursor(
              this.plugin.app,
              "\n" + selectedText + "\n",
            );
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
            const resolved = renderTemplate(path, {
              word: this.currentWord ?? "",
            });

            await appendToFile(
              this.plugin.app,
              resolved,
              this.perseRCContent(selectedText) + "\n",
            );
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
    // 创建历史记录面板，与 html 并列显示
    this.historyContainer = container.createDiv("local-dict-history");
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

  // mark
  perseRCContent(selectedText) {
    const text = formatMarkdownOutput(
      this.currentWord,
      selectedText,
      this.plugin.settings.rightClickAppendToFilePrefix,
      this.plugin.settings.rightClickAppendToFileSuffix,
    );
    return text;
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
            this.plugin.settings.currentHistoryIndex - 1,
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
    // console.log("Here is the current word: " + this.currentWord);
    // this.inputEl.setText(this.currentWord);
    // this.inputEl.setAttr("text", this.currentWord);
    this.inputEl.value = this.currentWord;
  }

  //   toggleSimplified() {
  //     this.simplified = !this.simplified;

  //     const wrapper = document.createElement("div");
  //     wrapper.innerHTML = this.rawHTML;

  //     applySimplifiedView(wrapper, this.simplified, this.plugin.settings);
  //     this.contentElInner.innerHTML = wrapper.innerHTML;
  //   }

  checkServiceStatus0() {
    exec("wmic process get ExecutablePath", (err: any, stdout: string) => {
      const running = stdout
        .split("\n")
        .map((line) => line.trim())
        .some(
          (path) =>
            path.toLowerCase() ===
            this.plugin.settings.serviceExePath.toLowerCase(),
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

  updateUI(isRunning: boolean) {
    if (isRunning) {
      this.inputEl.placeholder = "输入单词";
      this.searchBtn.setText("搜索");
      this.searchBtn.style.border = "";
      this.searchBtn.style.color = "";

      this.searchBtn.onclick = () => {
        const word = this.inputEl.value.trim();
        if (word) this.plugin.queryWord(word, 0);
      };
    } else {
      this.inputEl.placeholder = "未检测到 SilverDict，请先启动";
      this.searchBtn.setText("开启服务");
      this.searchBtn.style.border = "1px solid red";
      this.searchBtn.style.color = "red";

      this.searchBtn.onclick = async () => {
        this.checkServiceStatusAndStart();
        new Notice("已尝试启动服务");

        // ⬇️ 启动后延迟再检测一次
        setTimeout(() => this.checkServiceStatus(), 2000);
      };
    }
  }

  checkServiceStatus() {
    exec("tasklist", (err: any, stdout: string) => {
      if (err) {
        console.error("检查服务失败", err);
        this.updateUI(false);
        return;
      }

      const exeName = this.plugin.settings.serviceExePath
        .split("\\")
        .pop()
        ?.toLowerCase();

      const running = stdout.toLowerCase().includes(exeName ?? "");

      this.updateUI(running);
    });
  }

  checkServiceStatusAndStart() {
    exec("tasklist", (err: any, stdout: string) => {
      if (err) {
        new Notice("检测服务状态失败");
        return;
      }

      const exeName = this.plugin.settings.serviceExePath
        .split("\\")
        .pop()
        ?.toLowerCase();

      const running = stdout.toLowerCase().includes(exeName ?? "");

      if (running) {
        new Notice("服务已在运行，无需重复启动");
        this.updateUI(true);
        return;
      }

      // ✅ 没运行才启动
      exec(`"${this.plugin.settings.serviceStartScript}"`);
      new Notice("已尝试启动服务");

      // ⬇️ 延迟检测（关键）
      setTimeout(() => this.checkServiceStatus(), 2000);
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
      this.plugin.settings.markdownReplaceRulesAll,
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
      this.plugin.settings.copyAllSuffix,
    );

    if (returnText) {
      return text; // ✅ 若请求返回文本，则仅返回，不复制
    }

    await navigator.clipboard.writeText(text);
    new Notice("复制 *全部* 内容到剪贴板");
  }
  async copySummary(returnText = false): Promise<string | void> {
    const rules = parseMarkdownReplaceRules(
      this.plugin.settings.markdownReplaceRulesSummary,
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
      this.plugin.settings.copySummarySuffix,
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
      new Notice("未设置复制全部的保存文件路径");
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
      new Notice("未设置复制简略的保存文件路径");
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
          }),
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
          }),
      );

    new Setting(containerEl)
      .setName("词典服务查询 URL")
      .setDesc(
        buildMultilineDesc([
          "本地查询接口 API 的 URL，`{word}` 为要查寻的单词。",
          "例如：http://localhost:2628/api/query/Default Group/{word}",
          "现确认在浏览器内能正常使用。",
        ]),
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
          }),
      );

    containerEl.createEl("h4", { text: "词典数据收集设置" });

    new Setting(containerEl).setDesc(
      buildMultilineDesc([
        "若填写路径，则每次点击时会将相应的内容时添加到相应此文件。若为空则不收集。",
        "支持 moment 格式化字符串。",
        "`Collected/{{YYYY-MM-DD}}.md` ➜ 将内容追加到在 Collected 文件夹中的当天日期文件中。",
        "`Collected/{{word}}.md` ➜ 在 Collected 文件夹中生成以当前单词为文件名的笔记。",
      ]),
    );

    new Setting(containerEl)
      .setName("收集*复制全部*输出内容的文件路径")
      .setDesc("")
      .addText((text) => {
        text
          .setPlaceholder("如 logs/all-{{YYYYMMDD}}.txt")
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
          .setPlaceholder("如 logs/summary-{{YYYYMMDD}}.txt")
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
          .setPlaceholder("如 logs/context-{{YYYYMMDD}}.txt")
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
    containerEl.createEl("p", {
      text: "之后在显示时按照下方的隐藏规则进行显示。",
    });
    containerEl.createEl("p", {
      text: "本节中所提及的选择器为有效的 CSS 选择器即可。",
    });

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
        ]),
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
        ]),
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
        ]),
      )
      .addTextArea((text) => {
        text
          .setPlaceholder(
            `示例：\n.entry，.ure\n.example, span.note\n.highlight`,
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
        ]),
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
        ]),
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
      suffixKey: StringKeys<LocalDictPluginSettings>,
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
      "copySummarySuffix",
    );

    // ✅ 全部内容设置（前缀 + 后缀）
    buildRow.call(
      this,
      containerEl,
      "复制全部内容 - 前缀",
      "copyAllPrefix",
      "复制全部内容 - 后缀",
      "copyAllSuffix",
    );

    // ✅ 自定义“细”分隔线（替代 <hr>）
    const divid2 = containerEl.createEl("div");
    divid2.style.borderTop = "1px solid var(--background-modifier-border)";
    divid2.style.margin = "1em 0";

    // ✅ 右键收集文件设置（前缀 + 后缀）
    buildRow.call(
      this,
      containerEl,
      "追加到收集文件 - 前缀",
      "rightClickAppendToFilePrefix",
      "追加到收集文件 - 后缀",
      "rightClickAppendToFileSuffix",
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
        (entry) => `${entry.word}, ${entry.time}`,
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

function getActiveViewType(app: App): string | null {
  const view = app.workspace.getActiveViewOfType(ItemView);
  return view?.getViewType?.() ?? null;
}