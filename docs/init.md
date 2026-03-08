# 极简命令行 VLM 桌面端 Agent —— 最终方案

> **定位**：Ink v6 + React 19 终端 UI、纯视觉驱动、跨平台（Windows / macOS / Linux）的最小可用桌面操作 Agent
> **核心闭环**：自然语言指令 → 截图 → VLM 推理 → 键鼠执行 → 截图验证 → 自动循环至完成
> **前端方案**：Ink v6 + React 19（纯 ESM）+ `@inkjs/ui` v2 组件库
> **操作层**：主链路 `@hurdlegroup/robotjs`，Fallback 系统原生命令（`cliclick` / `xdotool` / `nircmd`）
> **精度增强**：网格辅助线 + 区域放大二次定位（ZoomClick 方法）

---

## 一、最小功能集边界

### 保留

| 能力 | 说明 |
|------|------|
| 终端 UI | Ink v6 + React 19 + ink-text-input + ink-spinner + ink-select-input |
| 纯视觉输入 | 仅靠屏幕截图，不依赖 DOM / 应用 API / 元素源码 |
| 核心 PC 操作 | 左键单击、右键单击、键盘输入（含中文）、滚轮滚动、拖拽 |
| 自动多步循环 | VLM 判断任务完成前自动持续执行，一次指令完成多步任务 |
| 操作结果校验 | 每步操作后截图回传 VLM 确认是否成功 |
| 区域放大二次定位 | 粗定位后裁剪目标区域放大重发 VLM，显著提升坐标精度 |
| 通用 VLM 兼容 | 无需微调 |
| 跨平台 | Windows / macOS / Linux，双层操作执行（robotjs + 原生命令 fallback） |

### 砍掉

- 不用 nut.js（**已转付费商业授权 $20-75/月**）
- 不用 OCR 辅助、图像增强等额外处理

---

## 二、技术选型

### 前端：Ink v6 + React 19

| 决策点 | 结论 |
|--------|------|
| Ink 版本 | v6（最新稳定版，已确认支持 React 19，纯 ESM） |
| React 版本 | v19（Ink v6 原生支持，`bun install ink@6 react@19`） |
| 注意事项 | Ink v6 为纯 ESM，`package.json` 需设置 `"type": "module"` |

**Ink v6 提供的核心能力**：

- React 组件化终端 UI（`<Box>`、`<Text>`、`<Spinner>` 等）
- Flexbox 布局（基于 Yoga 引擎）
- 内置 hooks：`useInput`（键盘事件）、`useApp`（应用生命周期）、`useStdin` 等
- 支持 React 19 全部特性（Suspense、hooks 等）
- 已被 Claude Code、Gemini CLI、Shopify CLI 等主流 AI CLI 工具采用

### 键鼠操作：双层架构

#### 主链路：`@hurdlegroup/robotjs`

robotjs 社区活跃维护 fork，免费 MIT，跨平台，API 覆盖鼠标/键盘/滚轮/屏幕尺寸。

> ⚠️ **C++ native 模块，需编译工具链**：
> - Windows：Visual Studio Build Tools（C++ 桌面开发）
> - macOS：`xcode-select --install`
> - Linux：`sudo apt install build-essential libxtst-dev libpng-dev`
>
> 在 CI/CD 或团队分发场景下，编译依赖可能造成摩擦。

#### Fallback：系统原生命令（零编译依赖）

当 robotjs 编译失败或不可用时，自动降级到系统原生命令，通过 `child_process.execSync` 调用：

| 平台 | 工具 | 安装方式 | 鼠标点击命令 | 键盘输入命令 | 滚轮命令 |
|------|------|----------|-------------|-------------|---------|
| **macOS** | `cliclick` | `brew install cliclick` | `cliclick c:100,200` | `cliclick t:"Hello"` | 通过 AppleScript `key code` |
| **Linux** | `xdotool` | `sudo apt install xdotool` | `xdotool mousemove 100 200 click 1` | `xdotool type "Hello"` | `xdotool click 4/5`（4=上，5=下） |
| **Windows** | `nircmd` | 下载 [nirsoft.net/utils/nircmd.html](https://www.nirsoft.net/utils/nircmd.html) 放入 PATH | `nircmd setcursor 100 200` + `nircmd sendmouse left click` | PowerShell `SendKeys` | `nircmd sendmouse wheel X` |

**切换逻辑**：启动时尝试加载 robotjs，`try/catch` 捕获失败后设置 flag，后续所有操作走 fallback 分支。

### 图像处理：`sharp`

承担三重职责（一个库解决三个问题）：

1. **HiDPI 坐标修正**：获取截图物理像素尺寸，resize 到逻辑分辨率
2. **网格辅助线叠加**：SVG composite 叠加坐标参考网格
3. **截图压缩**：5-10MB PNG → 150-300KB JPEG
4. **区域裁剪放大**：二次定位时裁剪目标周围区域并放大

### 全部依赖清单

| 包名 | 用途 | 说明 |
|------|------|------|
| `ink@^6` | 终端 UI 框架 | React 渲染器 |
| `react@^19` | UI 组件模型 | Ink v6 peer dependency |
| `screenshot-desktop` | 屏幕截图 | 跨平台，一行截图 |
| `@hurdlegroup/robotjs` | 键鼠操作 | 跨平台，免费开源 |
| `sharp` | 图像处理 | HiDPI 修正 + 网格 + 压缩 |
| `langchain@1.0.0` | Agent 基本能力 | 兼容 OpenAI 和 Anthropic 格式 API |
| `dotenv` | 环境变量 | 配置管理 |
| `ink-spinner` | 加载动画 | 等待 VLM 响应时的 spinner |
| `ink-text-input` | 文本输入 | 用户指令输入框 |
| `ink-select-input` | 下拉选择 | 1. 模型选择框，支持配置多模型选择使用; 2. AI可以调用 ask question 工具，询问用户问题，用这个组件展示选项让用户选择 |

---

## 三、核心架构

### 系统闭环

```
用户在终端 UI 输入指令
    ↓
┌──→澄清用户诉求
│       ↓
│   捕获屏幕截图
│       ↓
│   图像处理流水线
│   （HiDPI resize → 网格叠加 → JPEG 压缩）
│       ↓
│   传给 VLM 做视觉理解（含对话历史上下文）
│       ↓
│   VLM 输出标准化操作 JSON + is_done 字段
│       ↓
│   多层容错 JSON 解析
│       ↓
│   执行系统键鼠操作（跨平台适配）
│       ↓
│   等待 UI 响应（可配置延时）
│       ↓
│   is_done == false → 继续循环 ──┘
│   is_done == true  → 终端 UI 反馈完成，等待下一条指令
```

### 模块分层

```
┌─────────────────────────────────────────────┐
│              Ink + React 19 UI 层            │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ 指令输入 │ │ 状态面板  │ │ 操作日志流   │  │
│  └────┬────┘ └────┬─────┘ └──────┬───────┘  │
│       │           │              │           │
├───────┴───────────┴──────────────┴───────────┤
│               Agent 核心逻辑层                │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ 任务循环  │ │ VLM 交互  │ │ 对话历史 + 二次管理 │  │
│  └────┬─────┘ └────┬─────┘ └──────────────┘  │
│       │            │                          │
├───────┴────────────┴──────────────────────────┤
│               系统能力层                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ 屏幕捕获  │ │ 图像处理  │ │ 键鼠操作执行（双层）│  │
│  │screenshot │ │  sharp   │ │  robotjs    │  │
│  └──────────┘ └──────────┘ └──────────────┘  │
└─────────────────────────────────────────────┘
```

---

## 四、关键设计详解

### 1. HiDPI / Retina 坐标修正（**三端最大的坑**）

**问题**
- `screenshot-desktop` 截图 = **物理像素**（如 macOS Retina: 3024×1964）
- `robotjs.getScreenSize()` = **逻辑像素**（如 1512×982）
- VLM 看到物理像素的图，输出的坐标基于物理像素；鼠标操作用逻辑像素 → **系统性偏移**

**方案**：
截图（物理像素） → sharp.metadata() 获取实际图片尺寸 → 计算 scaleFactor = 物理宽 / 逻辑宽 → sharp.resize() 缩放到逻辑分辨率 → 再限制最长边 ≤ MAX_IMAGE_DIMENSION（如 1280px） → 叠加网格辅助线 → 转 JPEG 80% 压缩 → 传给 VLM

鼠标操作时 `逻辑宽 × 相对坐标 = 绝对逻辑像素`，坐标体系统一。

**压缩效果**：

| 阶段 | 尺寸 | 体积 |
|------|------|------|
| 原始截图（4K Retina） | 3024×1964 | ~5-10MB |
| resize 到逻辑 + 限制最长边 + JPEG 80% | ~1280×830 | **~150-300KB** |

鼠标操作时直接用 `逻辑宽 × 相对坐标` 计算绝对位置，坐标体系完全统一。

### 2. 网格辅助线提升坐标精度

**背景**：GPT-4o 在裸图 GUI grounding 上准确率仅约 16-22%（ScreenSpot-Pro 基准）。学术界 Set-of-Mark 方法已证明叠加视觉锚点可大幅提升定位精度。

**实现**：用 `sharp` composite 叠加 SVG：
- 竖线 N 列 + 横线 M 行，半透明红色（`rgba(255,0,0,0.25)`）
- 每条线旁标注 0-1 相对坐标值，10px 等宽字体
- 10 列 × 8 行

### 3. 区域放大二次定位（ZoomClick）

这是**投入产出比最高的精度增强方案**。学术依据：

- **ZoomClick**（2025，ICCV 2025 接收）：提出 training-free 的 zoom 方法，在 ScreenSpot-Pro 上将 UI-Venus-72B 推到 73.1% 成功率
- **R-VLM**（ACL 2025 Findings）：两阶段 coarse-to-fine zoom，GUI 导航任务绝对精度提升 3.2-9.7%
- **RegionFocus**（ICCV 2025）：动态 zoom in 相关区域，Qwen2.5-VL-72B 在 ScreenSpot-Pro 上达到 61.6% SOTA

**我们的简化实现**（仅针对 click 操作，不需要训练）：
第一轮 VLM：全屏截图 → 粗定位（如 x:0.52, y:0.31） ↓ 以粗坐标为中心，裁剪周围区域（如 ±15% 范围） ↓ 将裁剪区域放大到与全屏截图相同尺寸 ↓ 第二轮 VLM：放大区域截图 → 精定位（如 x:0.48, y:0.53） ↓ 将精定位坐标映射回全屏坐标系 ↓ 执行最终精确点击

**关键参数**：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `ZOOM_ENABLED` | 是否启用二次定位 | `true` |
| `ZOOM_PADDING` | 裁剪区域大小（粗坐标周围 ±N%） | `0.15`（即 15%） |
| `ZOOM_MIN_SIZE` | 裁剪区域最小占屏比（防止裁太小丢失上下文） | `0.2`（即至少占屏幕 20%） |

**什么时候触发**：仅 `click` 操作触发，`type` 和 `scroll` 不需要精确坐标，跳过二次定位。

**Prompt 差异**：二次定位时的 prompt 告知 VLM「当前看到的是局部放大区域，请在此区域内精确定位目标元素中心」。

### 4. 双层操作执行器

executor.ts ├── 启动时 try { require('@hurdlegroup/robotjs') } │ ├── 成功 → 标记 driver = 'robotjs' │ └── 失败 → 标记 driver = 'native'，根据 process.platform 选择原生工具 │ ├── click(x, y) │ ├── robotjs: moveMouse(x, y) → sleep(100) → mouseClick('left') │ ├── macOS native: exec(cliclick c:${x},${y}) │ ├── Linux native: exec(xdotool mousemove ${x} ${y} click 1) │ └── Windows native: exec(nircmd setcursor ${x} ${y}) → exec(nircmd sendmouse left click) │ ├── type(text) │ ├── ASCII: robotjs.typeString(text) / 原生工具 type 命令 │ └── 非 ASCII（中文等）: 剪贴板中转 → 粘贴快捷键（见下文） │ └── scroll(direction, amount) ├── robotjs: scrollMouse(0, direction === 'down' ? -amount : amount) ├── macOS native: AppleScript scroll event ├── Linux native: exec(xdotool click ${direction === 'down' ? 5 : 4}) × amount 次 └── Windows native: exec(nircmd sendmouse wheel ${direction === 'down' ? -amount * 120 : amount * 120})

启动时在 UI Header 显示当前 driver 类型（`🟢 robotjs` 或 `🟡 native:cliclick`），让用户知道当前执行器状态。

### 5. 中文输入跨平台

`robotjs.typeString()` 仅支持 ASCII，原生命令的 type 也只对 ASCII 可靠。非 ASCII 统一走剪贴板中转：

| 平台 | 写入剪贴板 | 粘贴快捷键 |
|------|-----------|-----------|
| macOS | `pbcopy`（stdin pipe） | Cmd+V |
| Windows | PowerShell `Set-Clipboard` | Ctrl+V |
| Linux | `xclip -selection clipboard` 或 `xsel --clipboard --input` | Ctrl+V |

### 6. VLM Prompt 设计

**System Prompt 核心要素**：

| 要素 | 说明 |
|------|------|
| 角色定义 | 桌面电脑操作助手 |
| 坐标体系 | 0-1 相对值，x 左→右，y 上→下，参考截图上红色网格线 |
| 输出格式 | 文字 + tool call 调用操作电脑的工具 |
| 定位策略 | 先观察目标与网格参考线的相对位置，精准对准视觉中心 |

### 7. 自动多步循环

| 设计点 | 方案 |
|--------|------|
| 循环驱动 | 循环工作直到认为已经结束 |
| 单步失败 | 不终止任务，等待后重新截图重试（拿到最新 UI 状态） |
| 操作延时 | 每步执行后 sleep 可配置时长（默认 2000ms），等待 UI 响应 |
| 状态透出 | 每步的步数、操作描述、坐标等实时渲染到 Ink UI |

### 9. 对话历史上下文

- 保留最近 10 轮的指令 + 操作历史
- 历史中**不重复存储图片**（仅当前步附图），控制 token 消耗，大的工具调用结果和截图存在在本地文件系统，历史中仅存储调用结果的摘要，如果有需要 Agent 再次读取文件即可，你需要设计一个 memory 管理机制
- 上下文达到 70% context window 时，先压缩历史，保留50%最近轮次，之前的总结为摘要
- 每个新任务清空历史（独立上下文）
- VLM 可理解"刚才做了什么"，提高连续操作准确性

## 五、Ink + React 19 UI 设计

### 终端界面布局

```
┌───────────────────────────────────────────────────┐
│  🤖 VLM Desktop Agent                             │
│  Model: gpt-4o  Screen: 1512×982  Driver: 🟢 robotjs │
├───────────────────────────────────────────────────┤
│  📋 Task: 打开浏览器，搜索 hello world              │
│  ⏳ Step 3/20  ⠋ Zooming in for precise click...  │
├───────────────────────────────────────────────────┤
│  [Step 1] ✅ click (756, 491) 点击桌面 Chrome       │
│  [Step 2] ✅ click (421, 52)  点击地址栏             │
│           🔍 zoom: (0.28±0.15) → refined (412, 51)│
│  [Step 3] ⠋ Analyzing screenshot...               │
├───────────────────────────────────────────────────┤
│  👉 输入指令 (exit 退出): _                         │
└───────────────────────────────────────────────────┘
```

### 状态流转

```
IDLE → (用户输入) → RUNNING → STEP_CAPTURE → STEP_VLM → STEP_ZOOM? → STEP_EXECUTE
  ↑                                                                       │
  └──── (is_done=true) ── COMPLETED ←─────────────────────────────────────┘
                                          │
                                    (单步失败) → ERROR → (自动重试) → STEP_CAPTURE
```

## 六、跨平台权限配置

| 平台 | 必须操作 |
|------|----------|
| **macOS** | 系统设置 → 隐私与安全性 → **辅助功能**：添加终端/VS Code ✅ <br/> 系统设置 → 隐私与安全性 → **屏幕录制**：添加终端/VS Code ✅ |
| **Windows** | **以管理员身份运行**终端 或 VS Code |
| **Linux (X11)** | `sudo apt install xdotool xclip libxtst-dev libpng-dev build-essential` <br/> Wayland 需要 XWayland 兼容层或改用 `ydotool` |

平台	工具	安装
macOS	cliclick	brew install cliclick
Linux	xdotool + xclip	sudo apt install xdotool xclip
Windows	nircmd	下载 nirsoft.net/utils/nircmd.html，放入 PATH

## 七、配置项清单（`.env`）

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `OPENAI_API_KEY` | VLM API Key | 必填 |
| `OPENAI_BASE_URL` | API 端点 | `https://api.openai.com/v1` |
| `Anthropic_API_KEY` | VLM API Key | 必填 |
| `Anthropic_BASE_URL` | API 端点 | `https://api.anthropic.com/v1` |
| `VLM_MODEL` | 模型名称 | `gpt-5-4` |
| `ACTION_DELAY` | 每步操作后等待 UI 响应的时间（ms） | `2000` |

---

## 八、避坑指南

| 问题 | 解决方案 |
|------|----------|
| **macOS 点击全部偏移** | HiDPI 未修正。检查日志中 scaleFactor 是否 > 1，确认 resize 流水线生效 |
| **Windows robotjs 编译失败** | 安装 VS Build Tools 或 `npm install -g windows-build-tools` |
| **Linux Wayland 无法操作** | robotjs 基于 X11，Wayland 下需 XWayland 兼容层 |
| **VLM 输出非 JSON** | 3 层容错解析 + GPT-4o 开启 JSON Mode |
| **点击不准** | 增大 `GRID_COLS/ROWS` 加密网格；调高 `MAX_IMAGE_DIMENSION`；prompt 强调"对准视觉中心" |
| **输入文本丢失** | 确保 VLM 在 `type` 前先输出 `click` 聚焦输入框；可在 prompt 加提示 |
| **API 费用过高** | 降低 `MAX_IMAGE_DIMENSION` 到 1024 |
| **中文输入乱码** | 检查剪贴板命令是否可用（macOS: `pbcopy`，Linux: `xclip`），确认 encoding 为 utf-8 |

---

## 十、后续进阶路线

| 优先级 | 方向 | 说明 |
|--------|------|------|
| **P1** | 高危操作拦截 | 检测到"删除/格式化/关机"等关键词时弹 Ink 确认组件，二次确认后执行 |
| **P1** | 区域放大二次定位 | 参考 R-VLM / RegionFocus 论文，第一次定位后裁剪目标区域放大再次定位，精度可提升 30%+ |
| **P2** | 本地开源 VLM | 接入 MiniCPM-V / Qwen2.5-VL 本地模型，完全离线运行 |
| **P2** | 操作录制回放 | 每步截图 + 操作记录持久化，支持导出 / 回放 / 可视化调试 |
| **P3** | 并行任务队列 | 多任务排队执行 |
| **P3** | 插件系统 | 通过 Hook 机制支持自定义操作类型和预处理/后处理逻辑 |
```