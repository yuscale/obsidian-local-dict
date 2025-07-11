import TurndownService from "turndown";
import moment from "moment";
import { normalizePath, TFile, App, Editor,MarkdownView, Notice } from "obsidian";
import LocalDictPlugin from "./main"
const turndownService = new TurndownService({ headingStyle: "atx" });

// 你可以使用 moment() 来动态构建文件路径，例如：
export function resolveLogPath(template: string): string {
  return moment().format(template);
}


// 插入对应 Markdown 内容到当前活动编辑器的光标处；
export async function insertAtCursor(app: App, text: string): Promise<boolean> {
  // 获取当前活动文件
  const activeFile = app.workspace.getActiveFile();
  if (!activeFile) {
    new Notice("无法插入：没有活动文件");
    return false;
  }

  // 强制聚焦活动文件（确保 Markdown 编辑器可用）
  await app.workspace.openLinkText(activeFile.path, "", false);

  // 获取 Markdown 编辑器视图
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (!view || !view.editor) {
    new Notice("无法插入：未检测到 Markdown 编辑器");
    return false;
  }

  // 插入文本
  view.editor.replaceSelection(text);
  new Notice("已插入内容到当前文件");
  return true;
}

// 插入对应 Markdown 内容到当前活动编辑器的光标处；fail version
export function insertToActiveEditor(app: App, text: string) {
  const activeLeaf = app.workspace.getActiveViewOfType(MarkdownView);
  const editor = activeLeaf?.editor;

  if (!editor) {
    new Notice("未找到活动编辑器");
    return;
  }

  const cursor = editor.getCursor();
  editor.replaceRange(text, cursor);
}


export async function appendToFile0(
  app: App,
  filePath: string,
  content: string
) {
  const path = normalizePath(filePath);
  console.log("path:", path);
  const existing = app.vault.getAbstractFileByPath(path);
  console.log("existing:", existing);
  if (!existing) {
    // new Notice(`文件 ${path} 不存在`);
    await app.vault.create(path, "")
    new Notice(`新建 ${path} 文件`);
  }
  
  if (existing instanceof TFile) {
    const old = await app.vault.read(existing);
    await app.vault.modify(existing, old + "\n" + content);
    new Notice(`已添加至 ${path} 文件`);
  }
}


/**
 * 将 content 追加到指定 Markdown 文件末尾。
 * 若文件不存在则自动创建。
 */
export async function appendToFile(
  app: App,
  filePath: string,
  content: string
) {
  const path = normalizePath(filePath);
  const { vault } = app;

  let targetFile = vault.getAbstractFileByPath(path) as TFile | null;

  // 若不存在，则递归创建文件夹并创建新文件
  if (!targetFile) {
    const dir = path.substring(0, path.lastIndexOf("/"));
    if (dir && !vault.getAbstractFileByPath(dir)) {
      await vault.createFolder(dir).catch(() => {}); // 忽略已存在报错
    }

    try {
      targetFile = await vault.create(path, content);
      new Notice(`已创建文件：${path}`);
      return; // 已写入内容，无需再追加
    } catch (err) {
      new Notice(`无法创建文件：${path}`);
      console.error(err);
      return;
    }
  }

  // 已存在：读取旧内容并追加
  try {
    const old = await vault.read(targetFile);
    await vault.modify(targetFile, old + "\n" + content);
    new Notice(`已追加内容到：${path}`);
  } catch (err) {
    new Notice(`写入文件失败：${path}`);
    console.error(err);
  }
}



/**
 * HTML 转 Markdown
 */
export function htmlToMarkdown(html: string): string {
  return turndownService.turndown(html);
}

export function htmlToMarkdownFiltered(html: string): string {
  const container = document.createElement("div");
  container.style.position = "fixed"; // 避免页面闪动
  container.style.visibility = "hidden";
  container.style.pointerEvents = "none";
  container.style.zIndex = "-1";

  container.innerHTML = html;
  document.body.appendChild(container);

  function removeHiddenElements(el: HTMLElement) {
    Array.from(el.children).forEach((child) => {
      const style = window.getComputedStyle(child);
      if (style.display === "none") {
        child.remove();
      } else {
        removeHiddenElements(child as HTMLElement);
      }
    });
  }

  removeHiddenElements(container);

  const md = turndownService.turndown(container.innerHTML);

  document.body.removeChild(container);

  return md;
}

// import { htmlToMarkdown } from "./utils"; // 保证已导入你的转换函数

/**
 * 清理 HTML 中所有 <style> 标签及其内容
 * todo 清理 nextentry 的 href
 */
export function removeStyleTags(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  doc.querySelectorAll("style").forEach((style) => style.remove());

  //   // 将 <h2 class="dre"> 替换为 <h4 class="dre">
  //   doc.querySelectorAll("h2.dre").forEach((h2) => {
  //     const h4 = document.createElement("h4");
  //     h4.className = h2.className;
  //     h4.innerHTML = h2.innerHTML;
  //     h2.replaceWith(h4);
  //   });

  //   // 将 <h2 class="ure"> 替换为 <h4 class="ure">
  //   doc.querySelectorAll("h2.ure").forEach((h2) => {
  //     const h4 = document.createElement("h4");
  //     h4.className = h2.className;
  //     h4.innerHTML = h2.innerHTML;
  //     h2.replaceWith(h4);
  //   });

  // 移除所有指向 /api/cache/... 的样式表链接
  doc.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const href = link.getAttribute("href");
    if (href?.startsWith("/api/cache/")) {
      link.remove();
    }
  });


  return doc.body.innerHTML;
}

/**
 * 处理 Markdown 格式：去除行尾空格，限制多空行
 */
// export function postProcessMarkdown(md: string): string {
//   return md
//     .replace(/[ \t]+\n/g, "\n") // 去除行尾空格
//     .replace(/\n{3,}/g, "\n\n") // 避免多个空行
//     .trim();
// }




export function postProcessMarkdown(md: string, rules: [RegExp, string][]): string {
  for (const [pattern, replacement] of rules) {
    // 输出 [pattern, replacement] 备查
    // console.log([pattern, replacement]);
    md = md.replace(pattern, replacement);
  }
  return md;
}


export function parseMarkdownReplaceRules0(input: string): [RegExp, string][] {
  return input
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("//"))
    .map(line => {
      const parts = line.split(",");

      // 至少要两个参数：pattern 和 replacement
      if (parts.length < 2) return null;

      const pattern = parts[0];
      const replacement = parts[1];
      const flags = parts[2]?.trim() || ""; // flags 是可选的

      try {
        const regex = new RegExp(pattern, flags);
        return [regex, replacement];
      } catch (e) {
        console.warn("无效正则：", pattern, e);
        return null;
      }
    })
    .filter((r): r is [RegExp, string] => r !== null);
}


export function parseMarkdownReplaceRules(input: string): [RegExp, string][] {
  const result: [RegExp, string][] = [];

  for (const line of input.split("\n")) {
      // const trimmed = line.trim();
    const trimmed = line;

    // 忽略空行和注释
    if (!trimmed || trimmed.startsWith("//")) continue;

    // 正则部分必须以 `/` 开始
    if (!trimmed.startsWith("/")) continue;

    const match = trimmed.match(/^\/(.+)\/([gim]*)\s*,(.*)$/);

    if (match) {
      const pattern = match[1];
      const flags = match[2];
      let replacement = match[3] ?? "";

      // 处理转义字符串
        replacement = replacement
        .replace(/\\\\/g, "\\")  // 必须先处理反斜杠本身
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r")
        .replace(/\\,/g, ",");  // 支持逗号转义（避免歧义）


      try {
        result.push([new RegExp(pattern, flags), replacement]);
      } catch (e) {
        console.warn(`正则表达式无效: ${line}`);
      }
    } else {
      console.warn(`无效格式: ${line}`);
    }
  }

  return result;
}



/**
 * 处理 copyAll 时的 Markdown
 */
export function postProcessMarkdownCopyAll(md: string): string {
  return (
    md
      .replace(/[ \t]+\n/g, "\n") // 去除行尾空格
      .replace(/\n{2,}/g, "\n") // 避免多个空行
      .replace(/## 韦泊英汉快查词典\n/, "") // 去除开头词典名称
      .replace(/\*\*\n/g, "** ") // 去除编号后换行
      // 降低后续标题等级
      .replace(/\n### /g, "\n#### ")
      // 最后添加一行空行
      .replace(/\n+$/, "\n")
  );
}

/**
 * 处理 copySummary Markdown
 */
export function postProcessMarkdownCopySummary(md: string): string {
  return (
    md
      .replace(/[ \t]+\n/g, "\n") // 去除行尾空格
      .replace(/\n{2,}/g, "\n") // 避免多个空行
      .replace(/## 韦泊英汉快查词典\n/, "") // 去除开头词典名称
      .replace(/\*\*\n/g, "** ") // 去除编号后换行
      // 降低后续标题等级
      .replace(/\n### /g, "\n#### ")
      // 最后添加一行空行
      .replace(/\n+$/, "\n\n")
  );
}

/**
 * 按照指定 css 规则简化 HTML，去除 display:none 元素
 */
export function simplifyHtmlWithCss(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // 移除指定选择器的元素
  const selectors = [
    ".hidden_text",
    ".vis_w",
    ".def_labels",
    ".snote",
    ".un_text",
  ];
  selectors.forEach((sel) => {
    doc.querySelectorAll(sel).forEach((el) => el.remove());
  });

  // 移除.sblocks之后的所有.dros兄弟节点
  doc.querySelectorAll(".sblocks").forEach((el) => {
    let next = el.nextElementSibling;
    while (next) {
      if (next.classList.contains("dros")) {
        const toRemove = next;
        next = next.nextElementSibling;
        toRemove.remove();
      } else {
        next = next.nextElementSibling;
      }
    }
  });

  // 处理 .uro_def 元素：保留其中的 .mw_zh，其他移除；没有则整体删除
  doc.querySelectorAll(".uro_def").forEach((el) => {
    const mwZhs = Array.from(el.querySelectorAll(".mw_zh"));
    if (mwZhs.length > 0) {
      // 构建一个新的元素包裹所有 mw_zh（保留结构）
      const wrapper = doc.createElement("div");
      mwZhs.forEach((zh) => {
        wrapper.appendChild(zh.cloneNode(true));
      });
      el.replaceWith(wrapper); // 替换整个 uro_def 元素
    } else {
      el.remove();
    }
  });

  //   // 移除.mw_zh~.un_text内所有.mw_zh元素
  //   doc.querySelectorAll(".mw_zh").forEach(el => {
  //     const parent = el.closest(".un_text");
  //     if (parent) {
  //       parent.querySelectorAll(".mw_zh").forEach(child => child.remove());
  //     }
  //   });

  return doc.body.innerHTML;
}

/** 解析字符串规则列表，例如：
 * h2.dre,h3.dre
 * h2,div
 * .oldclass,.newclass
 * h2.,
 * ,div
 */
export function parseReplaceRules(text: string): string[] {
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.includes(","));
}

/** 执行标签/类替换规则
 * 规则格式:
 *  fromStr,toStr
 *  
 * 其中fromStr和toStr可为：
 *  - tagName 如 "h2"
 *  - className 如 ".oldclass"
 *  - tag.class 如 "h2.dre"
 *  - 空串表示任意
 */
export function replaceTagClassByRules(
  root: Document | HTMLElement,
  rules: string[]
) {
  for (const rule of rules) {
    let [fromStr, toStr] = rule.split(",").map(s => s.trim());

    // 解析 fromStr
    let fromTag: string | null = null;
    let fromClass: string | null = null;
    if (fromStr === "") {
      fromTag = null; // 任意
      fromClass = null;
    } else if (fromStr.startsWith(".")) {
      // 纯class选择器
      fromTag = null;
      fromClass = fromStr.slice(1).split(".").join(" "); // 多class用空格分隔
    } else {
      const dotIndex = fromStr.indexOf(".");
      if (dotIndex === -1) {
        // 只有tag
        fromTag = fromStr;
        fromClass = null;
      } else {
        fromTag = fromStr.slice(0, dotIndex);
        fromClass = fromStr.slice(dotIndex + 1).split(".").join(" ");
      }
    }

    // 解析 toStr
    let toTag: string | null = null;
    let toClass: string | null = null;
    if (toStr === "") {
      toTag = null;
      toClass = null;
    } else if (toStr.startsWith(".")) {
      toTag = null;
      toClass = toStr.slice(1).split(".").join(" ");
    } else {
      const dotIndex = toStr.indexOf(".");
      if (dotIndex === -1) {
        toTag = toStr;
        toClass = null;
      } else {
        toTag = toStr.slice(0, dotIndex);
        toClass = toStr.slice(dotIndex + 1).split(".").join(" ");
      }
    }

    // 构造选择器
    let selector = "";
    if (fromTag && fromClass) {
      // 多class选择器用点连接
      selector = fromTag + "." + fromClass.split(" ").join(".");
    } else if (fromTag) {
      selector = fromTag;
    } else if (fromClass) {
      selector = "." + fromClass.split(" ").join(".");
    } else {
      selector = "*";
    }

    root.querySelectorAll(selector).forEach(el => {
      // 过滤tag
      if (fromTag && el.tagName.toLowerCase() !== fromTag.toLowerCase()) return;
      // 过滤class全部匹配
      if (fromClass) {
        const classes = fromClass.split(" ");
        if (!classes.every(c => el.classList.contains(c))) return;
      }

      // 创建新元素
      let newEl: HTMLElement;
      if (toTag) {
        newEl = document.createElement(toTag);
      } else {
        newEl = document.createElement(el.tagName.toLowerCase());
      }

      // 设置class
      if (toClass) {
        newEl.className = toClass;
      } else if (fromClass) {
        newEl.className = el.className;
      }

      newEl.innerHTML = el.innerHTML;
      el.replaceWith(newEl);
    });
  }
}



export function injectGoldenDictLinkAllAsBlock(doc: Document | HTMLElement) {
  const spans = doc.querySelectorAll("span.hw_txt.gfont");

  spans.forEach((span) => {
    const childNodes = Array.from(span.childNodes);
    let wordText = "";

    // 提取文本内容
    for (const node of childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        wordText += node.textContent?.trim() || "";
      }
    }

    if (!wordText) return;

    // 创建链接元素
    const linkEl = document.createElement("a");
    linkEl.href = `goldendict://${encodeURIComponent(wordText)}`;
    linkEl.textContent = wordText;
    linkEl.style.fontWeight = "bold";
    linkEl.title = `在 GoldenDict 打开 ${wordText}`;

    // 创建新的 h3 元素，保留原来的 class
    const h3 = document.createElement("h3");
    h3.className = span.className;
    h3.appendChild(linkEl);

    // 如果原 span 中有 <sup class="homograph">，也一并附加到 h3 前面
    for (const node of childNodes) {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).tagName === "SUP" &&
        (node as Element).classList.contains("homograph")
      ) {
        h3.insertBefore(node, h3.firstChild);
      }
    }

    // 替换原 span
    span.replaceWith(h3);
  });
}



/**
 * 使用模板格式化 Markdown 输出。
 * 支持转义字符：\n, \t, \\, \,
 * @param word 当前查询单词
 * @param markdown Markdown 内容（已处理好）
 * @param prefixTpl 前缀模板（支持 {{word}} 和任意 moment 格式）
 * @param suffixTpl 后缀模板（支持 {{word}} 和任意 moment 格式）
 */
export function formatMarkdownOutput(
  word: string,
  markdown: string,
  prefixTpl: string,
  suffixTpl: string
): string {
  const render = (tpl: string) => {
    const replaced = tpl.replace(/\{\{(.*?)\}\}/g, (_, token) => {
      token = token.trim();
      if (token === "word") return word;
      try {
        return moment().format(token); // 例如 {{YYYY-MM-DD}}、{{HH:mm}} 等
      } catch (e) {
        return `{{${token}}}`; // 保留原样，避免崩溃
      }
    });

    // 处理转义字符：\n \t \\ \,
    return replaced
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\\\/g, "\\")
      .replace(/\\,/g, ",");
  };

  const prefix = render(prefixTpl);
  const suffix = render(suffixTpl);

  return [prefix, markdown, suffix].filter(Boolean).join("\n");
}


/**
 * 使用模板格式化 Markdown 输出。
 * @param word 当前查询单词
 * @param markdown Markdown 内容（已处理好）
 * @param prefixTpl 前缀模板（支持 {{word}} 和任意 moment 格式）
 * @param suffixTpl 后缀模板（支持 {{word}} 和任意 moment 格式）
 */
export function formatMarkdownOutput0(
  word: string,
  markdown: string,
  prefixTpl: string,
  suffixTpl: string
): string {
  const render = (tpl: string) => // todo   /t/n
    tpl.replace(/\{\{(.*?)\}\}/g, (_, token) => {
      token = token.trim();
      if (token === "word") return word;
      try {
        return moment().format(token); // 如 {{YYYY-MM-DD}}、{{HH:mm:ss}} 等
      } catch (e) {
        return `{{${token}}}`; // 保留原样，防止崩溃
      }
    });

  const prefix = render(prefixTpl);
  const suffix = render(suffixTpl);

  return [prefix, markdown, suffix].filter(Boolean).join("\n");
}







export function applySimplifiedView(
  container: HTMLElement,
  simplified: boolean,
  settings: {
    simplifiedGlobalHideSelectors: string;
    simplifiedHideSelectors: string;
    simplifiedShowInHiddenSelectors: string; // ✅ 变成规则行
  }
) {
  applyGlobalHide(container, settings.simplifiedGlobalHideSelectors);

  if (simplified) {
    // applySimplifiedHide(container, settings.simplifiedHideSelectors);
    applySimplifiedHide(container, settings.simplifiedHideSelectors, settings.simplifiedShowInHiddenSelectors);

    applySimplifiedShowInHidden(container,settings.simplifiedHideSelectors, settings.simplifiedShowInHiddenSelectors);
  }
}


// 始终隐藏元素
function applyGlobalHide(container: HTMLElement, selectorsText: string) {
  const selectors = selectorsText.split("\n").map(s => s.trim()).filter(Boolean);
  selectors.forEach(selector => {
    container.querySelectorAll(selector).forEach(el => {
      (el as HTMLElement).style.display = "none";
    });
  });
}

// 简略模式隐藏元素
// mark 有了新了新版本 带有三个参数
function applySimplifiedHide0(container: HTMLElement, selectorsText: string) {
  const selectors = selectorsText.split("\n").map(s => s.trim()).filter(Boolean);
  selectors.forEach(selector => {
    container.querySelectorAll(selector).forEach(el => {
      (el as HTMLElement).style.display = "none";
    });
  });
}



interface SimplifiedShowRule {
  parentSelector: string;
  childSelector: string;
}

function parseSimplifiedShowRules(rulesStr: string): SimplifiedShowRule[] {
  return rulesStr
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.includes(">"))
    .map(line => {
      const [parentSelector, childSelector] = line.split(">").map(s => s.trim());
      return { parentSelector, childSelector };
    });
}

/**
 * 简略模式隐藏元素，同时保留内部需要显示的子元素。
 */
export function applySimplifiedHide(
  container: HTMLElement,
  hideSelectorsText: string,
  showInHiddenText?: string
) {
  const hideSelectors = hideSelectorsText
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const showRules = showInHiddenText
    ? parseSimplifiedShowRules(showInHiddenText)
    : [];

  for (const selector of hideSelectors) {
    const elements = Array.from(
      container.querySelectorAll<HTMLElement>(selector)
    );

    for (const el of elements) {
      // 检查该元素是否匹配任何显示规则
      const matchingRules = showRules.filter((rule) =>
        el.matches(rule.parentSelector)
      );

      if (matchingRules.length > 0) {
        // 有显示子规则，不隐藏自己，但隐藏其他子元素
        Array.from(el.children).forEach((child) => {
          const shouldKeep = matchingRules.some((rule) =>
            child.matches(rule.childSelector)
          );
          if (!shouldKeep) (child as HTMLElement).style.display = "none";
        });
      } else {
        // 无需保留子元素，直接隐藏整个元素
        el.style.display = "none";
      }
    }
  }
}


/**
 * 在“简略模式”里，从已被隐藏的父元素中重新显示指定子元素。
 *
 * @param container    根节点
 * @param hideRulesStr 多行 hide‑selectors（仅用来判断哪些父元素已隐藏）
 * @param showRulesStr 多行 show‑selectors；每行格式可以是：
 *                     1) `parent > child`
 *                     2) 只有一个选择器，视为 parent===child，都恢复显示
 *
 * 说明：
 * 1. 该函数假设 applySimplifiedHide 已经执行过 —— 父元素可能被设为 display:none。
 * 2. 逻辑：逐行读取 showRules，定位父元素 → 寻找要保留的子元素 → 把它们重新显示，
 *    同时**保持未命中的兄弟节点继续隐藏**。
 */
export function applySimplifiedShowInHidden(
  container: HTMLElement,
  hideRulesStr: string,
  showRulesStr: string
) {
  const showRules = showRulesStr
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"));

  // —— Step‑1：把 showRules 解析成 { parentSel, childSel } 列表 ——
  interface Rule { parent: string; child: string; }
  const parsed: Rule[] = [];

  for (const raw of showRules) {
    const segs = raw.split(">").map((s) => s.trim()).filter(Boolean);
    if (segs.length === 0) continue;

    if (segs.length === 1) {
      // 只有一个选择器：parent===child；后面逻辑里直接对 parent 恢复显示
      parsed.push({ parent: segs[0], child: segs[0] });
    } else {
      parsed.push({
        parent: segs.slice(0, -1).join(" > "),
        child: segs[segs.length - 1],
      });
    }
  }

  // —— Step‑2：遍历规则，逐个恢复显示指定子元素 ——
  parsed.forEach(({ parent, child }) => {
    // ① 找到所有符合 parent 选择器的节点
    Array.from(container.querySelectorAll(parent)).forEach((p) => {
      const parentEl = p as HTMLElement;

      // ② parent 以及其祖先可能被隐藏，先让祖先链显示（保持只是“被选中的链”）
      let cur: HTMLElement | null = parentEl;
      while (cur) {
        if (cur.style.display === "none") cur.style.display = "";
        // 到 container 顶就停
        if (cur === container) break;
        cur = cur.parentElement;
      }

      // ③ 显示匹配 childSel 的元素，其他兄弟继续保持隐藏
      Array.from(parentEl.querySelectorAll(child)).forEach((c) => {
        (c as HTMLElement).style.display = "";
      });
    });
  });
}





// 简略模式保留隐藏元素中指定的子元素 
// todo  子子孙孙都要考虑到，最好是用递归
/**
 * 在简略模式中，让部分原本被隐藏的子元素重新显示。
 * @param container 根容器
 * @param rulesStr 多行规则，每行格式为 `父选择器 > 子选择器`（支持子孙选择器）
 */
export function applySimplifiedShowInHidden0(container: HTMLElement, rulesStr: string) {
  const rules = rulesStr
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("//")); // 跳过空行和注释行

  for (const rule of rules) {
    const [parentSel, childSel] = rule.split(">").map(s => s.trim());
    if (!parentSel || !childSel) continue;

    container.querySelectorAll(parentSel).forEach(parent => {
      const children = parent.querySelectorAll(childSel);
      children.forEach(child => {
        (child as HTMLElement).style.display = "";
      });
    });
  }
}


/**
 * 在已执行 applySimplifiedHide 之后调用
 * @param container 根容器
 * @param hideSelectorsStr settings.simplifiedHideSelectors（多行选择器，全部需要隐藏）
 * @param showRulesStr     settings.simplifiedShowInHiddenSelectors（多行规则：parent > child）
 */
export function applySimplifiedShowInHidden_1(
  container: HTMLElement,
  hideSelectorsStr: string,
  showRulesStr: string
) {
  // ① 解析 “需要隐藏” 的选择器数组
  const hideSelectors = hideSelectorsStr
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//")); // 跳过空行 / 注释

  // ② 解析 “保留规则” parent > child
  const rules = showRulesStr
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"));

  for (const rule of rules) {
    const [parentSel, childSel] = rule.split(">").map((s) => s.trim());
    if (!parentSel || !childSel) continue;

    // 找到所有 parent
    const parents = container.querySelectorAll<HTMLElement>(parentSel);

    parents.forEach((parent) => {
      /* -----------------------------------------------------------
         A. 先在「parent 内部」把 hideSelectors 指定的所有元素隐藏
         （即使它们之前已隐藏，也再次确保）
      ----------------------------------------------------------- */
      hideSelectors.forEach((hideSel) => {
        parent.querySelectorAll<HTMLElement>(hideSel).forEach((el) => {
          el.style.display = "none";
        });
      });

      /* -----------------------------------------------------------
         B. 再把 childSel 指定的元素重新显示
      ----------------------------------------------------------- */
      parent.querySelectorAll<HTMLElement>(childSel).forEach((child) => {
        child.style.display = "";
      });

      // ⚠️ 仅保证 parent 本身可见，**不**修改更高层祖先
      parent.style.display = "";
    });
  }
}



// ：手动实现 click vs dblclick 识别
// 这是目前最可靠的方式，适用于任何插件 UI（按钮、词条、面板等）：
export function bindClickAndDoubleClick(
  el: HTMLElement,
  onClick: () => void,
  onDoubleClick: () => void,
  timeout : number
) {
  let timer: number | null = null;

  el.addEventListener("click", () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      onDoubleClick();
    } else {
      timer = window.setTimeout(() => {
        timer = null;
        onClick();
      }, timeout);
    }
  });
}

// 为了统一传入设置中的值
export function bindClickAndDoubleClickWithSetting(
  el: HTMLElement,
  plugin: LocalDictPlugin,
  onClick: () => void,
  onDoubleClick: () => void
) {
  const delay = plugin.settings.doubleClickDelay || 300;
  bindClickAndDoubleClick(el, onClick, onDoubleClick, delay);
}
