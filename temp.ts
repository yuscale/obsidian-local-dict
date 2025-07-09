/**
 * File: e:\OBplugin\.obsidian\plugins\obsidian-dict-plugin\temp.ts
 * Project: e:\OBplugin\.obsidian\plugins\obsidian-dict-plugin
 * Created Date: 2025-07-07 18:07:03 Monday
 * Author: Scale Yu
 * E-mail: yuscale@126.com
 * -------------------
 * Last Modified: 2025-07-08 02:23:31 Tuesday
 * Modified By: Scale Yu
 * -------------------
 * HISTORY:
 * Date      	By	Comments
 * ----------	---	----------------------------------------------------------
 * 
 * ----------	---	----------------------------------------------------------
 * 
 */


async queryWord(word: string, depth = 0) {
  if (!this.view || depth > 2) return;

  try {
    const res = await fetch(
      `${this.settings.apiBaseUrl}/${encodeURIComponent(word)}`
    );
    let html = removeStyleTags(await res.text());

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // ✅ 标签替换规则
    const rules = parseReplaceRules(this.settings.replaceRulesText);
    replaceTagClassByRules(doc, rules);

    // ✅ 插入 GoldenDict 查询链接（变为 h3 粗体）
    injectGoldenDictLinkAllAsBlock(doc);

    const plugin = this; // 捕获当前 plugin 实例以便内部调用

    // ✅ 替换查询链接为粗体 strong 标签，添加点击事件
    doc.querySelectorAll("a[href^='/api/query/WM/']").forEach((el) => {
      const a = el as HTMLAnchorElement;
      const href = a.getAttribute("href");
      if (!href) return;

      const match = href.match(/\/api\/query\/WM\/(.+)$/);
      if (!match) return;

      const word = decodeURIComponent(match[1]).trim();
      if (!word) return;

      console.log("[LocalDict] 捕获链接词:", word);

      const strong = doc.createElement("strong");
      strong.textContent = word;
      strong.style.cursor = "pointer";
      strong.style.color = "#3a6df0";
      strong.classList.add("local-dict-word-link");

      strong.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("[LocalDict] 点击触发查询：", word);
        plugin.queryWord(word, 0); // ⚠️ 必须使用 plugin 而不是 this
      });

      a.replaceWith(strong); // 替换 <a> 元素
    });

    // ✅ 准备包裹元素
    const wrap = document.createElement("div");
    wrap.className = "local-dict-html";

    // ✅ 使用 appendChild 防止 innerHTML 丢失事件绑定
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
            console.log("[LocalDict] 自动展开:", newWord);
            this.queryWord(newWord, depth + 1);
            return;
          }
        }
      }
    }

    // ✅ 设置内容（最后一步）
    this.view.setContent(wrap.innerHTML, word);

  } catch (e) {
    new Notice("查询失败：" + e);
    if (this.view?.checkServiceStatus) this.view.checkServiceStatus();
  }
}













async copySummary() {
  const rules = parseMarkdownReplaceRules(
    this.plugin.settings.markdownReplaceRulesSummary
  );

  if (!this.currentWord) return;

  // 生成简略 HTML
  const wrapper = document.createElement("div");
  wrapper.innerHTML = this.rawHTML;
  applySimplifiedView(wrapper);

  // 转换为 Markdown
  const md = htmlToMarkdownFiltered(wrapper.innerHTML);
  const processed = postProcessMarkdown(md, rules);

  const text = formatMarkdownOutput(
    this.currentWord,
    processed,
    this.plugin.settings.copySummaryPrefix,
    this.plugin.settings.copySummarySuffix
  );

  await navigator.clipboard.writeText(text);
  new Notice("复制 *简略* 内容到剪贴板");
}


async copyAll() {
  const rules = parseMarkdownReplaceRules(
    this.plugin.settings.markdownReplaceRulesAll
  );

  if (!this.currentWord) return;

  const md = htmlToMarkdownFiltered(this.rawHTML);
  const processed = postProcessMarkdown(md, rules);

  const text = formatMarkdownOutput(
    this.currentWord,
    processed,
    this.plugin.settings.copyAllPrefix,
    this.plugin.settings.copyAllSuffix
  );

  await navigator.clipboard.writeText(text);
  new Notice("复制 *全部* 内容到剪贴板");
}








  // Markdown 复制输出前后缀说明
  // Markdown 复制输出前后缀说明

containerEl.createEl("h3", { text: "Markdown 复制输出前后缀" });

containerEl.createEl("p", {
  text: "复制输出前后自动插入内容，可使用 moment 格式，如 YYYY-MM-DD。",
});

// 复制简略 copySummary 前后缀设置
new Setting(containerEl)
  .setName("复制简略 - 添加前缀与后缀")
  .addText((text) =>
    text
      .setPlaceholder("如：## {{word}} - {{date}}")
      .setValue(this.plugin.settings.copySummaryPrefix)
      .onChange(async (value) => {
        this.plugin.settings.copySummaryPrefix = value;
        await this.plugin.saveData(this.plugin.settings);
      })
  )
  .addText((text) =>
    text
      .setPlaceholder("如：-- End --")
      .setValue(this.plugin.settings.copySummarySuffix)
      .onChange(async (value) => {
        this.plugin.settings.copySummarySuffix = value;
        await this.plugin.saveData(this.plugin.settings);
      })
  );

// 复制全部 copyAll 前后缀设置
new Setting(containerEl)
  .setName("复制全部 - 添加前缀与后缀")
  .addText((text) =>
    text
      .setPlaceholder("如：## {{word}} - {{date}}")
      .setValue(this.plugin.settings.copyAllPrefix)
      .onChange(async (value) => {
        this.plugin.settings.copyAllPrefix = value;
        await this.plugin.saveData(this.plugin.settings);
      })
  )
  .addText((text) =>
    text
      .setPlaceholder("如：-- End --")
      .setValue(this.plugin.settings.copyAllSuffix)
      .onChange(async (value) => {
        this.plugin.settings.copyAllSuffix = value;
        await this.plugin.saveData(this.plugin.settings);
      })
  );

    // Markdown 复制输出前后缀说明
  // Markdown 复制输出前后缀说明
  










  
class WordView extends ItemView {
  // …原有字段…
  historyContainer!: HTMLElement;

  async onOpen() {
    this.contentEl.empty();

    const container = this.contentEl.createDiv("local-dict-container");

    // ——— 工具栏 ———
    const toolbar = container.createDiv("local-dict-toolbar");
    // … 复制、切换、搜索 按钮 …
    // ✅ 新增：历史按钮
    const showHistoryBtn = toolbar.createEl("button", { text: "📜历史" });
    showHistoryBtn.onclick = () => {
      this.renderHistory();
      this.historyContainer.style.display = "block";
    };

    // ——— 搜索栏、内容区 … ———
    // … 保持你已有 code …

    // ——— 历史面板（浮动） ———
    this.historyContainer = container.createDiv("local-dict-history");
    Object.assign(this.historyContainer.style, {
      position: "absolute",
      top: "40px",
      right: "20px",
      zIndex: "999",
      background: "var(--background-modifier-card)",
      border: "1px solid var(--divider-color)",
      padding: "8px",
      boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
      display: "none",
      maxHeight: "200px",
      overflowY: "auto",
      minWidth: "120px",
    });
  }

  /** 渲染历史列表 */
  renderHistory() {
    const history = this.plugin.settings.history.slice().reverse();
    this.historyContainer.empty();
    if (history.length === 0) {
      this.historyContainer.createEl("div", { text: "暂无历史记录" });
      return;
    }
    history.forEach(({ word, time }) => {
      const item = this.historyContainer.createDiv("history-item");
      // 主词
      const wEl = item.createSpan({ text: word });
      wEl.style.cursor = "pointer";
      wEl.onclick = () => {
        this.plugin.queryWord(word, 0);
        this.historyContainer.style.display = "none";
      };
      // 时间
      item.createSpan({ text: ` — ${time}` }).addClass("history-time");
    });
  }

  // …其余方法保持不变…
}
