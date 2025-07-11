---
File: e:\OBplugin\.obsidian\plugins\obsidian-local-dict\readme.md
Project: e:\OBplugin\.obsidian\plugins\obsidian-local-dict
Created Date: 2025-07-09 08:59:39 Wednesday
Author: Scale Yu
E-mail: yuscale@126.com

Last Modified: 2025-07-12 00:58:06 Saturday
Modified By: Scale Yu
---



# Local Dictionary 插件使用说明

## 🌟 插件简介

本插件为 Obsidian 提供一个**本地词典面板视图**，可以通过多种方式快速查词。

> **✅ 双击主编辑器中的英文单词即可自动查询，非常便捷！**


本Obsidian 插件，用于查询本地词典 API，支持查询接口如 SilverDict 或其他本地词典服务（需提供 Web API 接口）。并以**结构清晰、可交互**的形式在右侧面板展示查询结果，支持“复制全部 / 复制简略”、“历史记录”、“前进/后退”等多项功能。适合有查词习惯的用户，尤其配合本地词典服务（如 Goldendict HTTP API）使用。至于在线的网络词典服务，由于CORS权限问题，暂不支持。

---

## 🛠️ 开发与编译

### ✅ 安装依赖（首次执行）：

确保你已安装 [Node.js](https://nodejs.org/) 与 npm。

在插件根目录下执行：

```bash
npm install
```

其中包含以下主要依赖（部分为 `--save-dev`）：

```bash
npm install --save-dev typescript rollup rollup-plugin-terser
npm install --save-dev @rollup/plugin-typescript @types/node
npm install --save-dev obsidian
```
确保你安装了 Obsidian 插件 API 的类型定义，并配置了正确的 `tsconfig.json` 和 `manifest.json` 文件。可参照本库内附带的文件。

### ✅ 构建插件

执行以下命令编译 TypeScript 源码：

```bash
npm run build
```


开发调试时：

```bash
npm run dev
```
---

## 🔍 调试与开发提示

- 在开发过程中，运行 `pnpm run dev` 可进入监听模式自动打包；
- **如果打包卡住或报错，使用 `Ctrl + C` 可以中断进程，确认后再重新开始！**
- 打包完成后，需在 Obsidian 中点击“重新加载插件”；
- 若插件失效，请确认控制台中是否有错误信息（开发者工具）。

---




## 🚀 安装使用

1. 将生成的文件复制到你的 Obsidian 插件目录中：

```
.obsidian/plugins/obsidian-local-dict/
├── main.js
├── manifest.json
└── styles.css
```

2. 启用插件：

- 打开 Obsidian → 设置 → 第三方插件 → 启用本插件（Local Dict）。

3. 打开词典视图：

- 你可以使用命令面板 `Ctrl+P` → 搜索“Open Local Dict Viewer”，或在设置中绑定快捷键（详见下文命令说明）。

---

---

## 🧰 服务依赖配置指南（简要）

本插件的查询服务依赖于由SilverDict 提供的 HTTP 服务，适合与本插件搭配使用。后续有其他能提供http服务的查询软件，插件也应该能够支持。

### ✅ 下载 SilverDict

你可以从 GitHub 获取最新版本的 SilverDict：

1. 打开 GitHub 项目主页：<https://github.com/CatMuse/SilverDict>
2. 点击 Releases，下载最新的 SilverDict-win64.zip；
3. 解压到任意目录，例如：`D:\Tools\SilverDict\`。

### ✅ 准备词典文件

1. 准备好 `.ifo / .idx / .dict(.dz)` 格式的 StarDict 字典；
2. 将所有字典文件放入一个目录（如 `D:\Tools\SilverDict\dicts\`）；
3. 若 `.dict.dz` 存在，建议解压为 `.dict` 提高性能。

### ✅ 启动 SilverDict

参照 SilverDict 官方文档中部分，启动服务：

>[!caution]
>**这时人工添加的，ai还没能自动这个方法，对当前的 [v1.2.2](https://github.com/Crissium/SilverDict/releases/tag/v1.2.2) 版本有效果。**
>SilverDict 启动脚本默认使用 `start.bat` 批处理文件。
>但是现有版本所生成的文件有错误，需要进行如下修改。
> > [来源](https://github.com/Crissium/SilverDict/issues/19#issue-2710425031)，略微修改。
> > on windows , the official setup.bat is :
> > "D:\Tools\SilverDict\env\python.exe" -Xutf8 "D:\Tools\SilverDict\program\server\server.py 0.0.0.0:2628"
> > but , the runnable version is :
> > "D:\Tools\SilverDict\env\python.exe" -Xutf8 "D:\Tools\SilverDict\program\server\server.py" "0.0.0.0:2628"
> > 原始文件的双引号位置缺失，导致启动失败。

### ✅ 测试接口是否正常

在浏览器中访问：

[测试链接](http://localhost:2628/api/query/Default%20Group/welcome)

如成功返回 HTML 查询结果，则说明服务正常运行。

### ✅ 配置插件参数

在 Obsidian 的 Local Dictionary 插件的设置界面中填写：

| 设置项          | 示例配置                                               |
| ------------ | -------------------------------------------------- |
| **API 基础地址** | `http://localhost:2628/api/query/Default%20Group/{word}`              |
| **启动服务脚本路径** | `D:\Tools\SilverDict\Start SilverDict server.bat`              |
| **可执行文件路径**  | `D:\Tools\SilverDict\env\python.exe` *(用于检测是否已启动)* |




## 🚀 亮点功能

- ✅ **双击主编辑器中的英文单词** 会自动唤起词典查询功能（需开启服务端程序如 [SilverDict](https://github.com/CatMuse/SilverDict)）
* ✅ **自动查词循环（变形还原）** 插件支持智能自动处理复数，动词变形（受词典文件限制，少部分不能实现）
- ✅ 支持“显示全部 / 显示简略”两种视图模式
- ✅ 支持“复制全部 / 复制简略”到剪贴板
- ✅ 支持快速将**全部/简略**内容保存到预订文件
- ✅ 本插件通过在常规按钮上支持 双击 与 右键菜单，极大地扩展了功能
- ✅ 显示历史查询记录，支持前进 / 后退浏览
- ✅ Markdown 后处理：转换 HTML、去除 display:none 元素、前后缀添加等
- ✅ 自定义隐藏选择器，控制哪些元素在简略模式下显示或隐藏，实现所见即所复制
- ✅ 插件设置中可查看并导出历史记录

---

## 🧠 使用技巧

- **双击查词** 是本插件最核心、最方便的功能！只需双击任意英文单词，即可快速展开查询。
- 可在设置中设置自定义后处理规则，将 HTML 转换为精简的 Markdown 格式，适用于 Obsidian 笔记记录。
- 使用“复制简略”和“复制全部”功能 + 规则，快速粘贴标准化内容。
- 两个按钮支持快捷操作，方便将内容输出或保存。
- 历史记录支持前进 / 后退，可当作临时单词栈使用。
- 开启浮动记录面板后，失去焦点或再次点击 📜 可关闭。
- 在词典显示区域中，支持右键快捷菜单。
- 设置中查看的历史列表字段是只读的，但可以复制。
- `导出历史记录`：每行一个词，可用于单词复习
- `切换显示状态`：支持全部 / 简略视图切换按钮，实时反映状态

---

## 💡 核心功能

### 🔍 查询方式

- ✅ **双击主编辑器中的英文单词**（推荐！）
- 🔘 在右栏词典视图中手动输入并点击“搜索”按钮
- 📜 点击历史记录中的词条再次触发查询
- ⬅️➡️ 使用“前进 / 后退”按钮在已查词条中切换
- 🔍 词典内容区域右键菜单，查询当前所选词汇

### 🔄 模式切换：

- 点击“显示全部 / 显示简略”按钮，切换显示模式
- 简略模式下隐藏不重要内容、display:none 元素等

### 📑 查询内容展示

- 支持**“全部 / 简略”**视图切换（保留关键内容）
- 插件自动处理 HTML 标签、过滤不必要样式
- 支持点击查询结果中的其他词条
- 词典显示区域右键菜单支持以下操作：
    - 复制选中内容；
    - 查询所选择词汇；
    - 将选中内容插入到当前文件光标处；
    - 将选中内容追加到配置的收集文件路径。

### 📋 复制功能

- ✅ 复制全部内容（含所有结构）
- ✅ 复制简略内容（排除部分信息）
- ✅ 可自定义复制前缀、后缀、Markdown 替换规则等
- ✅ 高级交互：双击与右键。复制全部 和 复制简略 按钮支持多种快捷操作
   - 单击：复制内容到剪贴板；
   - 双击：将内容追加到配置路径（支持 moment 路径格式）；
   - 右键：将内容插入到当前光标处。

### 🕘 历史记录

- 点击📜按钮显示历史查询记录（浮动面板）
- 点击历史词条可重新查询
- 双击词条右侧时间戳可删除该记录
- 使用左右箭头进行前进 / 后退历史导航

---

## ⚙️ 插件设置说明

> 插件设置面板在 Obsidian → 设置 → 插件 → Local Dictionary。

### 🧠 基础配置

| 设置项                      | 说明 |
| ---------------- | -------------------- |
| SilverDict服务进程路径     | 用于检测 SilverDict 是否已运行的 Python 进程路径，例如：`C:\Python38\python.exe`。<br>Path to the `python.exe` used to detect whether SilverDict is already running.|
| 启动服务脚本路径         | 点击“开启服务”按钮时会执行的脚本路径，推荐使用 `.bat` 或 `.lnk` 文件启动 SilverDict。<br>Path to the script executed when starting the service manually.|
| 词典服务查询 URL           | 查询词典的接口地址，需包含 `{word}` 占位符，例如：<br>`http://localhost:2628/api/query/Default Group/{word}`<br>用于向 SilverDict 或其他本地服务发送查询请求。空格将自动替换为 `%20`，但 `{word}` 不应被编码。<br>The local dictionary query API URL. Must contain `{word}` as placeholder. Spaces will be encoded to `%20`. `{word}` will be replaced at runtime with the word to look up. |

- {word} 是必须的占位符，插件会在查询时将其替换为实际单词（经过 encodeURIComponent 编码）；
- 支持包含空格（将被自动转为 %20）；
- 在设置 URL 后，插件会在失去焦点时自动验证其有效性（替换 {word} 为 example 后检查）。

### 🖱️ 双击响应延迟设置（Click vs Double Click）

为更好地区分按钮的“单击”和“双击”行为，本插件提供了**双击事件响应延迟（毫秒）**的可调节设置。

| 设置项  | 说明 |
| --------------------- | ------------------------------------ |
| 双击识别延迟（毫秒）<br>Double-click delay (ms) | 设置区分“单击 / 双击”的最大间隔时间，单位为毫秒，默认为 `300`。 |
例如：若你点击太快被识别为双击，可将其调高；若双击响应太慢，可适当调低。

💡 该设置会影响：

- “复制全部”按钮的双击行为：复制全部内容并追加到文件；
- “复制简略”按钮的双击行为：复制简略内容并追加到文件；
- 所有通过 bindClickAndDoubleClick 工具函数绑定的交互组件。

### 🗂 收集文件路径配置

以下路径用于将词典内容追加收集到指定的 Markdown 文件中：


| 设置项      | 说明                                |
| -------- | --------------------------------- |
| 复制全部收集路径 | 双击“复制全部”按钮后，将完整内容追加到该路径所指的文件。     |
| 复制简略收集路径 | 双击“复制简略”按钮后，将简略内容追加到该路径所指的文件。     |
| 词典区右键收集路径   | 在词典区域右键选中部分文本后，可将选中内容追加到该路径所指的文件。 |



支持在路径中使用模板占位符，如 `{{YYYY-MM-DD}}` 或 `{{word}}`，会在执行操作时动态替换为对应内容。

> 📌 使用规则：
>
> - 使用 `{{...}}` 包裹的内容为模板；
> - 支持 [moment.js](https://momentjs.com/docs/#/displaying/format/) 时间格式（如 `{{YYYY-MM-DD}}`）；
> - 支持 `{{word}}` 占位符，代表当前查询的单词；
> - 可在文件夹路径、文件名中使用；
> - 不支持跨操作系统的非法路径符号（如 `:`、`*`、`?` 等）。

- `Collected/{{YYYY-MM-DD}}.md` ➜ 自动将内容追加到当天日期文件中
- `Notes/{{YYYY-MM}}/Words-{{DD}}.md`

#### 📌 示例

##### 示例 1：按日期分类记录

```text
dict-log/{{YYYY-MM-DD}}.md
```

将内容追加到 `dict-log/2025-07-11.md` 文件中。

##### 示例 2：每个单词一个文件

```text
dict-by-word/{{word}}.md
```

查询 `example` 单词时写入 `dict-by-word/example.md`。

##### 示例 3：日期+单词组合文件

```text
logs/{{YYYY-MM-DD}}-{{word}}.md
```

查询 `time` 单词时写入 `logs/2025-07-11-time.md`。

---

#### ⛏ 特殊字符转义规则

- `\\` → `\`
- `\n` → 换行
- `\t` → 制表符
- `\,` → 逗号（`,`）

这些规则也可用于前缀/后缀模板中。

---

#### 🚫 注意

- 模板解析失败时将保留原样；
- 建议先使用简单路径进行测试。



### 🧹 元素处理配置

在“简略视图”下的展示行为，可通过设置选择器来隐藏不必要的部分，并在隐藏的部分中保留特定元素。 用于控制词典 HTML 显示时，可以通过以下三项设置，自定义在“简略模式”下隐藏或保留的内容。每项支持多行，每行一条规则。

| 设置项 | 说明 |
|--------|------|
| `全局隐藏元素选择器`  | 所有模式下都要隐藏的元素（每行一个 CSS 选择器） |
| `简略模式下隐藏选择器`  | 在简略模式下隐藏的元素（每行一个 CSS 选择器） |
| `简略模式下仍然保持显示的隐藏元素的子元素选择器`  | 如果父元素被隐藏，但希望保留某些子元素，可以使用规则格式： `父选择器 > 子选择器`（每行一条规则）

---

#### 🟥 全局隐藏选择器（所有模式下都隐藏）

**设置项名称：**

- 每行写一个 CSS 选择器，表示要隐藏的 HTML 元素；
- 这些元素在“全部视图”和“简略视图”中都会隐藏。

**示例：**

```txt
.ad-banner
.hidden-text
span.metadata
```

这些设置会隐藏页面中所有广告横幅（`.ad-banner`）、隐藏文字（`.hidden-text`）和元数据（`span.metadata`）元素。

---

#### 🟦 简略模式隐藏选择器（简略模式下隐藏）

**设置项名称：**

- 每行写一个 CSS 选择器；
- **仅在简略模式下**会被隐藏；
- 如果同时设置了“保留子元素”规则，其中的子元素可能被重新显示。

**示例：**

```txt
.z.b
a b
.comment .meta
.section-title .note
```

含义解释：

- `.z.b` → **同时包含类名 `z` 和 `b` 的元素**（等价于 `.z.b`，表示 `<div class="z b">`，不是 `.z` 下的 `.b`）
- `a b` → **所有 `a` 元素中的后代 `b` 元素**
- `.comment .meta` → **所有类名为 `comment` 的元素中的类名为 `meta` 的元素**
- `.section-title .note` → **在 `.section-title` 内部的 `.note` 元素**

这些元素将在“简略模式”下隐藏。

---


#### ✅ 简略模式下仍然保持显示的隐藏元素的子元素选择器

每行一条规则，格式为：

```
父选择器 , 子选择器
```

（注意中间是英文逗号`,`，允许有空格）

- 表示：即使父元素被隐藏，依然保留其中指定的子元素；
- 子元素将被从隐藏的父元素中“拽出”并重新显示。

**示例：**

```txt
.uro_def , .mw_zh
.un_text , .mw_zh
.snote   , span.note-tag
```

**解释：**

1. `.uro_def , .mw_zh`：隐藏整个 `.uro_def` 结构，但保留其中的 `.mw_zh`（中文解释）部分；
2. `.un_text , .mw_zh`：同理，对 `.un_text` 元素中的中文释义做保留；
3. `.snote , span.note-tag`：保留笔记注释中的关键词标签。

---

简略模式下隐藏与保留的规则可以用更复杂的选择器，例如带空格的后代选择器、带点号的类名（如 `.z.b`），容易混淆，以下提供说明和典型示例：

```txt
.z.b , .b
a b , em
.comment .meta , span.highlight
.section-title .note , .important
```

含义解释：

- `.z.b , .b` → **原本整个 `.z.b` 会被隐藏，但它内部的 `.b` 元素将被重新显示出来**
- `a b , em` → **在 `a` 元素下的 `b` 元素中，保留其中的 `<em>` 元素**
- `.comment .meta , span.highlight` → **在 `.comment .meta` 被隐藏的情况下，显示其中的 `.highlight` 元素**
- `.section-title .note , .important` → **保留 `.note` 中的 `.important` 子元素**

⚠️ 请注意：

- 必须使用 `>` 表示“父子”关系，不能省略。
- 所有保留规则会基于“将隐藏元素中重新显示部分子元素”的逻辑工作。
- 使用多个空格（如 `a  b`）或误写选择器（如 `.z b` 与 `.z.b` 混淆）会导致不符合预期，请小心使用。

---


通过这三项设置配合使用，你可以自由控制哪些内容在“简略模式”中显示或隐藏，使页面更清爽、重点更明确。

> 💡 **提示：**  
> 简略模式只在你主动切换为“简略视图”时生效，不影响原始页面结构。
> 每行一个选择器或规则。
> 子元素保留规则格式为：`父选择器 > 子选择器`。
> 所有选择器需符合标准 CSS 语法，建议使用 `.class`、`#id`、或 `tag.class` 等形式。


### 📝 Markdown 后处理配置

| 设置项 | 说明 |
|--------|------|
| 替换规则（复制全部） | 将复制内容替换为 Markdown，支持正则表达式（每行一条） |
| 替换规则（复制简略） | 与上类似，适用于简略视图 |
| 复制前缀 / 后缀（全部 / 简略） | 可分别为两种复制模式设置添加的前缀与后缀 |


#### 📌 示例
假设你设置：

前缀 = "# {{word}} 查词于 {{YYYY-MM-DD}}\\n---"

后缀 = "\\n来源：本地词典\\n"

查询 example，Markdown 内容为 **some content**，生成结果将为：

```md
# example 查词于 2025-07-11
---
**some content**
来源：本地词典
```


### 🕘 查询历史记录

- ✅ 所有查询自动记录在历史中
- ✅ 记录时间格式为 `20250703 120303`
- ✅ 历史记录支持前进 / 后退、删除、导出、清空等操作
- ✅ 可在设置面板中查看、复制（逗号分隔）、导出（每行一项）
- ✅ 一键导出历史记录（每行一个，逗号分隔）


---

## 📋 可用命令（Command Palette）

| 命令 ID             | 说明（中文）<br>Description (English)                               |
| ------------------------ | --------------------------------- |
| `open-local-dict-view`                 | 打开本地词典右栏视图（默认无快捷键，可手动添加）<br>Open the right sidebar dictionary view (no shortcut by default, can be customized) |
| `local-dict-toggle-view-mode`          | 切换词典显示模式（全部 / 简略）<br>Toggle view mode: Full / Simplified                                                       |
| `local-dict-copy-all`                  | 复制当前词条的全部内容<br>Copy all content of the current entry                                                           |
| `local-dict-copy-summary`              | 复制当前词条的简略内容<br>Copy simplified summary of the current entry                                                    |
| `local-dict-navigate-back`             | 回到前一个历史查询词条<br>Navigate back to the previous queried word                                                      |
| `local-dict-navigate-forward`          | 前进到下一个历史查询词条<br>Navigate forward to the next queried word                                                      |
| `local-dict-show-history`              | 显示或隐藏浮动历史记录面板<br>Toggle floating history record panel                                                          |
| `local-dict-export-history`            | 导出历史查询记录为 Markdown<br>Export query history as Markdown                                                         |
| `local-dict-clear-history`             | 清空历史记录（需确认）<br>Clear all history records (confirmation required)                                               |
| `copy-all-to-clipboard-and-append`     | 复制全部并追加到收集文件（对应按钮的双击）<br>Copy all and append to collection file (double-click button)                          |
| `copy-summary-to-clipboard-and-append` | 复制简略并追加到收集文件（对应按钮的双击）<br>Copy summary and append to collection file (double-click button)                      |
| `insert-copy-all-to-cursor`            | 将“复制全部”内容插入当前光标位置（对应按钮右键）<br>Insert "copy all" content at current cursor (right-click button)                  |
| `insert-copy-summary-to-cursor`        | 将“复制简略”内容插入当前光标位置（对应按钮右键）<br>Insert "copy summary" content at current cursor (right-click button)              |
| `requery-current-word` | 查询当前所选词汇（右键菜单）br/>Query the current selected word |
| `insert-selection-to-cursor`           | 将词典中选中的文本插入当前光标处（右键菜单）<br>Insert selected text from dictionary at cursor (context menu)                        |
| `append-selection-to-collection`       | 将词典中选中的文本追加到收集文件（右键菜单）<br>Append selected dictionary text to collection file (context menu)                    |





> 💡 默认无快捷键，建议在「设置 → 快捷键」中绑定常用功能。

---


## 📄 TODO（开发中功能）

- [ ] 历史记录搜索功能
- [ ] 自动识别中文并跳过
- [ ] 多词查询合并展示
- [ ] Obsidian 编辑器内直接替换选中词语（增强双击功能）

---

## 🔚 结语

感谢使用本地词典插件！

本插件为学习与个人使用设计，未包含任何外部追踪代码，所有查询与记录均保存在本地环境中。

如需改进建议或二次开发，请保留作者注释，欢迎反馈与贡献！
如有建议、bug 或想法，欢迎前往项目主页提交 Issue 或 PR 🎉

---

## ❓ Q&A（常见问题与解答）

### Q1: 为什么我双击单词没有触发查词？
>
> 💬 **原因**：默认情况下，插件只在“词典视图”处于激活和可见状态时才会响应双击。

**解决方法：**

- 确保你已经打开了右栏的词典视图（Local Dict）；
- 插件内部通过判断 `view.containerEl.isConnected && !!view.containerEl.offsetParent` 来确认视图是否在页面中显示；
- 如果关闭了右栏或切换到其他插件视图，双击事件会自动失效以避免误触。

---

### Q2: 为什么右键“插入到当前文件”功能提示失败？
>
> 💬 **原因**：Obsidian 插件只能向**当前 Markdown 编辑器中插入内容**，当光标不在编辑器或焦点丢失时会失败。

**解决方法：**

- 确保你光标已聚焦在 Obsidian 的编辑器中；
- 插件使用 `this.app.workspace.getActiveViewOfType(MarkdownView)` 方式定位当前编辑器；
- 某些 UI 操作（如右键）会临时让焦点失效，建议使用命令面板或快捷键增强体验。

---

### Q3: 命令和按钮功能重复，如何理解双击与右键的区别？

| 操作方式 | 对应事件        | 插件行为说明                                 |
|----------|------------------|----------------------------------------------|
| 单击按钮 | `onclick`        | 拷贝内容到剪贴板                              |
| 双击按钮 | `ondblclick`     | 拷贝内容 + 追加到收集文件（路径可设）        |
| 右键按钮 | `oncontextmenu`  | 拷贝内容 + 插入到当前编辑器光标处            |

> ✅ 这些功能都通过插件设置和命令面板支持，确保不同使用习惯都可满足。

---

![[Q&A.md]]




