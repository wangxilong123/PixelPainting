# 像素涂色

按数字填色的像素画小游戏。Vue 3 + TypeScript + Vite，画布部分用原生 Canvas 2D，不依赖渲染框架。

## 开发

```bash
npm install
npm run dev        # http://localhost:5173
npm run test:unit  # Vitest + jsdom
npm run build      # vue-tsc 类型检查 + vite build
```

## 页面

- `/` 关卡模式期间重定向到 `/levels`，首页素材库落地后再改回素材页。
- `/levels` 横向轮播选关。滚轮或左右方向键切换关卡，回车进入，卡片居中时顶部统计条跟着更新。分类 chips 只筛选轮播内容，解锁判断始终按全局顺序。
- `/game/:levelId` 涂色。左键填色，右键拖拽平移，滚轮缩放，某个颜色涂完后自动切到调色板里的下一个颜色。顶栏「设置」抽屉里可以开关音效、调色板剩余格数和沉浸模式。

进度和设置都存在 localStorage，键名分别是 `pixel-painting:v1:progress` 和 `pixel-painting:v1:settings`。沉浸状态不写入存档，刷新后一定回到普通模式。

## 关卡数据结构

关卡文件在 `src/data/levels/`，每关一个模块，汇总在 `src/data/levels/index.ts`。类型定义见 `src/models/level.ts`：

| 字段 | 说明 |
| --- | --- |
| `id` | 全局唯一，路由参数用它 |
| `title` | 中文关名 |
| `category` | 分类注册表 ID，见 `src/data/categories.ts`，未知值归入「其他」 |
| `difficulty` | `1` 简单、`2` 普通、`3` 进阶 |
| `width` / `height` | 格子数 |
| `palette` | `{ id, hex, name }` 列表，`id` 从 1 连续递增 |
| `cells` | 行优先的颜色编号数组，长度等于 `width * height`，`0` 表示不参与涂色的空格 |
| `order` | 可选，解锁顺序，升序排列，没有 `order` 的关卡按注册顺序排在后面 |
| `thumbnail` | 可选，缩略图地址，缺省时用 `PixelPreview` 的 CSS 网格预览 |
| `tags` / `source` | 可选，标签和来源（`preset` 或 `user`） |

新增分类只改 `src/data/categories.ts`，不用动类型。

## 添加关卡

`scripts/convert-level.mjs` 把 PNG 转成关卡模块。图片要求：

- PNG，宽高都不超过 64 格
- 背景透明，四个角必须是透明像素
- 边缘硬切，不能有抗锯齿留下的半透明像素
- 颜色数没有上限，超过 12 色会打印一行提示，由你决定要不要减色后重投

```bash
node scripts/convert-level.mjs 橘猫.png --title 橘猫 --category animal --difficulty 1 --order 4
```

可选参数：`--id`（默认取文件名）、`--tags a,b`、`--name '#RRGGBB=橘色'`（可重复，给指定颜色起名）、`--max-colors <n>`（超限时直接报错而不是提示）、`--out <目录>`（默认 `src/data/levels`）、`--dry-run`（只打印生成内容不写文件）。

任何一项校验失败都会打印原因并以非零码退出。成功后脚本写入关卡文件并重建 `index.ts`，颜色编号按像素数量从多到少排，数量相同按十六进制升序，同一张图每次生成的编号一致。

## 目录

```
src/canvas/       Canvas 控制器，不依赖 Vue
src/components/   卡片、轮播、调色板、画布、结算弹窗
src/composables/  进度与设置的共享状态
src/data/         分类注册表和关卡数据
src/models/       Level 与进度类型
src/pages/        首页、选关页、游戏页
src/services/     关卡查询、进度判定、图片转关卡、音效
scripts/          PNG 转关卡脚本
```
