# 像素涂色

按数字填色的像素画小游戏。Vue 3 + TypeScript + Vite，画布部分用原生 Canvas 2D，不依赖渲染框架。

## 开发

```bash
npm install
npm run dev        # http://localhost:5173
npm run test:unit  # Vitest，src 下跑 jsdom，scripts 下跑 node
npm run build      # vue-tsc 类型检查 + vite build
```

## 页面

- `/` 关卡模式期间重定向到 `/levels`，首页素材库落地后再改回素材页。
- `/levels` 横向轮播选关。滚轮或左右方向键切换关卡，回车进入，卡片居中时顶部统计条跟着更新。分类 chips 只筛选轮播内容，解锁判断始终按全局顺序。
- `/game/:levelId` 涂色。左键填色，右键拖拽平移，滚轮缩放，某个颜色涂完后自动切到调色板里的下一个颜色。顶栏「设置」抽屉里可以开关音效、调色板剩余格数和沉浸模式。

分块关卡（`parts` 是 2×2 或 3×3）在画布下方多一块选块面板：宽屏是按分块数排布的方块按钮，每块显示已填/可交互格数，640px 以下折成「上一块 / 下一块」步进条。一次只画一块，块外的格子既不绘制也不响应点击，但格子编号和 `cells` 下标始终按整图算。换块时视口回到该块的适配位置，玩家的缩放平移不跨块保留；解锁、完成判定和提示次数都按整图算。提示优先在当前块里找选中色的未涂格，当前块没有就跳到有格子的块并同步切块。

进度和设置都存在 localStorage，键名分别是 `pixel-painting:v1:progress` 和 `pixel-painting:v1:settings`。沉浸状态不写入存档，刷新后一定回到普通模式。存档里的 `partIndex` 是玩家最后停留的块，重转关卡改了分块数导致块号越界时只丢这个字段，已涂进度照旧读出来。

## 关卡数据结构

关卡文件在 `src/data/levels/`，每关一个模块，汇总在 `src/data/levels/index.ts`。类型定义见 `src/models/level.ts`：

| 字段 | 说明 |
| --- | --- |
| `id` | 全局唯一，路由参数用它 |
| `title` | 中文关名 |
| `category` | 分类注册表 ID，见 `src/data/categories.ts`，未知值归入「其他」 |
| `difficulty` | `1` 简单、`2` 普通、`3` 进阶 |
| `width` / `height` | 格子数 |
| `palette` | `{ id, hex, name }` 列表，`id` 从 1 连续递增，`name` 只留在数据里，界面上显示编号 |
| `cells` | 行优先的颜色编号数组，长度等于 `width * height`，`0` 表示不参与涂色的空格 |
| `parts` | 可选，`{ cols, rows }` 分块涂色。只认 2×2 和 3×3，其他值运行时回退成整图一块。宽高按 `Math.floor` 均分、余数给前面的块，128 宽切三块是 43、43、42 |
| `order` | 可选，解锁顺序，升序排列，没有 `order` 的关卡按注册顺序排在后面 |
| `thumbnail` | 可选，缩略图地址，缺省时用 `PixelPreview` 的 CSS 网格预览。格子数上千的关卡必须带上，否则卡片会建同样数量的 span |
| `tags` / `source` | 可选，标签和来源（`preset` 或 `user`） |

新增分类只改 `src/data/categories.ts`，不用动类型。

## 添加关卡

投放素材的格式规范、宽度怎么选、分块怎么切都在 `docs/assets/level-inbox/README.md`（`docs/` 只在本地、不入版本库），下面只写命令。

### 清理原图

`scripts/convert-level.mjs` 不替你降采样。插画原图（非整数倍网格、几十种近似色、背景不透明）先过 `scripts/prepare-artwork.mjs` 清成硬边格子图：

```bash
node scripts/prepare-artwork.mjs 企鹅.png --width 128
```

从边框众数色泛洪抠背景，再按格取非背景像素的众数色降采样。可选参数：`--out <png>`（默认原图目录下 `<名字>-<格数>.png`）、`--bg-tolerance <n>`（三通道绝对差之和的容差，默认 24）、`--bg-ratio <0..1>`（格子里背景占比达到这个值就整格透明，默认 0.5）。主体顶到原图角落时会打印提醒——那样输出图的四角不透明，转换脚本会拒收，得让主体离边框远一点。

### 转成关卡

```bash
node scripts/convert-level.mjs 橘猫.png --title 橘猫 --category animal --difficulty 1 --order 4
```

图片要求：

- PNG，宽高都不超过 128 格；超过 64 格必须带 `--parts`，否则整幅一屏放不下
- 背景透明，四个角必须是透明像素
- 边缘硬切，不能有抗锯齿留下的半透明像素
- 颜色数没有上限，超过 12 色会打印一行提示，由你决定要不要减色后重投

可选参数：`--id`（默认取文件名）、`--order <序号>`、`--tags a,b`、`--name '#RRGGBB=橘色'`（可重复，给指定颜色起名）、`--parts <2|3>`（n×n 分块，带上时自动产出一格一像素的整图缩略图）、`--merge-distance <n>`（三通道绝对差之和不超过这个值的颜色并到先出现的代表色上，默认 0 不合并）、`--thumbnail <透明底PNG>`（显式指定缩略图，优先于 `--parts` 的自动产出）、`--max-colors <n>`（超限时直接报错而不是提示）、`--out <目录>`（默认 `src/data/levels`）、`--dry-run`（只打印生成内容不写文件）。

任何一项校验失败都会打印原因并以非零码退出。成功后脚本写入关卡文件并重建 `index.ts`，颜色编号按像素数量从多到少排，数量相同按十六进制升序，同一张图每次生成的编号一致。两个脚本各自带一份 `*.spec.mjs`，`npm run test:unit` 会一起跑。

## 目录

```
src/canvas/       Canvas 控制器和视口计算，不依赖 Vue
src/components/   卡片、轮播、调色板、画布、选块面板、结算弹窗
src/composables/  进度与设置的共享状态
src/data/         分类注册表和关卡数据
src/models/       Level 与进度类型
src/pages/        首页、选关页、游戏页
src/services/     关卡查询、进度判定、分块几何、图片转关卡、音效
scripts/          投放图清理脚本和 PNG 转关卡脚本
```
