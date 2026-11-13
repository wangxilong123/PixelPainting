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

应用外壳是左侧固定宽度导航（素材、合集、制作像素图、个人中心、关卡模式），640px 以下折成底部标签栏；涂色页不占导航，把整屏让给画布。

- `/` 素材库。搜索名称或标签，卡片每行 4 幅（1024px 以下 2 幅、560px 以下 1 幅），每页 12 幅，点卡片进入自由涂色。
- `/paint/:artworkId` 自由涂色。和关卡共用一个游戏页，但没有解锁顺序，顶栏可以关计时；进度按素材 ID 单独记录，不影响关卡解锁。
- `/levels` 横向轮播选关。滚轮、左右方向键或轮播下方的 ‹ › 按钮切换关卡，回车进入；按钮中间是当前位置（第 n / N 关），卡片居中时顶部统计条跟着更新。滚轮横向到头后会把纵向滚动还给页面，不会把页面困在轮播里。分类 chips 只筛选轮播内容，解锁判断始终按全局顺序。
- `/game/:levelId` 涂色。左键填色，右键拖拽平移，滚轮缩放，某个颜色涂完后自动切到调色板里的下一个颜色。顶栏「设置」抽屉里可以开关音效、调色板剩余格数和沉浸模式。
- `/collections` 合集列表。按主题策展的素材分组，每个合集占一整行（左封面、右名称/标签/成员预览），搜索名称或标签实时筛选，点行进入详情。
- `/collections/:collectionId` 合集详情。复用素材卡片网格、搜索与分页，按合集内 `artworkIds` 顺序展示成员，可在合集内再搜索；未知 ID 显示「未找到这个合集」并给返回链接。
- `/studio` 制作像素图。上传一张图片，浏览器本地把它降采样、量化成可涂色的像素作品，原图与生成数据存进 IndexedDB；顶部是已制作数量与「添加图片」按钮，下方复用素材网格、搜索与分页，点卡片进入自由涂色，卡片右上角两步删除、删后可撤销。
- `/profile` 占位页，板块建设中。

分块关卡（`parts` 是 2×2 或 3×3）走引导式流程：进关先给整图预览——整幅画平铺上色（涂过的格子显示成品色），叠分块边界，完成的块打勾、下一块描亮边标块号，预览只看不涂，滚轮留给页面滚动。点「开始涂色」（有进度则是「继续涂色」）从第一个未完成的块开始，整图与分块之间用 480ms 缓动缩放过渡（系统开了减弱动态效果就直接切换）。一次只涂一块：块外的格子既不绘制也不响应点击，调色板只摆当前块还有剩余格子的颜色（数量为 0 的直接不显示，涂完一个颜色它的色块就实时撤掉），剩余格数和自动换色只数当前块，提示也只在当前块里找选中色的未涂格；非分块关卡保持整幅调色板、涂完的颜色禁用不隐藏。涂满一块自动回到整图预览，点「下一块」进入下一个未完成的块；最后一块涂满时结算弹窗盖在预览上。格子编号和 `cells` 下标始终按整图算，换块时视口回到该块的适配位置，玩家的缩放平移不跨块保留；解锁、完成判定和提示次数都按整图算。

进度和设置都存在 localStorage，键名分别是 `pixel-painting:v2:progress` 和 `pixel-painting:v1:settings`。进度存档是 `{ currentId, records }`，每条记录带 `source`（`level` / `artwork` / `user`）区分玩法；旧 v1 存档只在 v2 缺席时读一次并迁移写回 v2（丢弃已废弃的 `stars`，重命名关卡的旧键搬到新键），v1 原文不动。沉浸状态不写入存档，刷新后一定回到普通模式。存档里的 `partIndex` 记录玩家当前在涂的块，提示按它限定范围；重进关卡总是先回整图预览，从第一个未完成的块继续。重转关卡改了分块数导致块号越界时只丢这个字段，已涂进度照旧读出来。用户制作的像素图（原图 + 生成数据）另存 IndexedDB（库名 `pixel-painting-studio`），不占 localStorage 配额；存储不可用时降级为仅本次会话可用，并在制作页顶部给出提示。

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

## 合集数据结构

合集汇总在 `src/data/collections.ts`，类型见 `src/models/collection.ts`：

| 字段 | 说明 |
| --- | --- |
| `id` | 全局唯一，路由参数用它 |
| `title` | 中文合集名 |
| `tags` | 标签列表，列表页搜索匹配名称和标签 |
| `cover` | 封面图地址，复用内含素材的缩略图；留空时回退到首幅素材的 `PixelPreview` |
| `artworkIds` | 内含素材 ID，详情页按这个顺序展示 |

注册表加载时校验 ID 不重复、引用的素材都存在，违反直接抛错。新增合集只改 `src/data/collections.ts`，不用动组件。查询走 `src/services/artworkService.ts` 的 `searchCollections`（空词返回全部，按名称或标签匹配）和 `getCollectionById`（返回 `{ collection, artworks }`，未知 ID 返回 `undefined`）。

## 制作像素图

`/studio` 让所有者在浏览器本地把上传的图片变成可涂色的像素作品，和投放关卡走同一条转换路径（服务层 `src/services/imageToLevel.ts`，Node 脚本与页面共用）。

- `src/services/imageSource.ts` 解码上传：`createImageBitmap` 读图（最长边超 4096 先缩），画到离屏 canvas 取 `ImageData`，非图片或解码失败给中文报错。
- `imageToLevel` 新增两个可调上限：`maxWidth` 目标格数上限（按格取众数色降采样，透明格保留为空格，目标宽不小于原宽时原样返回）、`colorCap` 颜色数上限（截断时先跳过与已保留色曼哈顿距离 ≤60 的近似色再取前 N，避免照片大面积背景的几十种近似灰/暗色耗光名额、把主体鲜艳色挤成黑白；被裁掉的颜色按 RGB 曼哈顿距离并入最近的保留色，自定义色名保留、默认色重新编号）。颜色排序仍是数量降序、同数量按十六进制升序。
- `src/components/UploadDialog.vue` 上传对话框：选图/拖入后实时预览（一格一像素硬边 + 分块边界 + 棋盘格透明底），左侧预览框放大到 `--upload-preview-col`（默认 26rem，画布内禀按最长边缩到 `PREVIEW_RENDER_SIZE` 640px 再由 CSS 填满、`image-rendering: pixelated` 放大不糊），预览框右上角「查看大图」按钮开灯箱（z-index 60 盖在对话框上，棋盘格底 + `object-fit: contain`，点背景/关闭按钮/Esc 关灯箱但不关对话框），可调标题、标签（逗号分隔最多 6 个）、格数上限（16–256，默认 64，滑杆旁数字框可手动输入、无上下微调按钮，越界夹回、非法回退当前值）、颜色上限（2–64，默认 24）、分块（自动/不分块/2×2/3×3）。超过 64 宽必须分块，「不分块」禁用、自动档切 3×3；参数变动 120ms 防抖重算。保存时生成一格一像素缩略图。
- `src/services/artworkStorage.ts` 存储：IndexedDB 库 `pixel-painting-studio`、表 `artworks`，记录 `{ id, artwork, original, createdAt }`（原图 Blob + 生成数据）。写入即注册进 `artworkService` 的响应式表（`shallowReactive` Map），列表/单查都会顺带注册；`main.ts` 启动先 `listUserArtworks()` 暖表再挂载，保证存档解析认得用户作品。读取按最新在前。IndexedDB 不可用或中途读写失败时降级为共用内存表、仅本次会话可用，`storageNotice` 给制作页顶部提示；校验失败仍抛错。删除只删作品，对应涂色进度留给存档解析下次加载时自行丢弃。
- 涂色进度按 `source: 'user'` 记录，与关卡、预设素材隔离；`GamePage` 进 `/paint/:artworkId` 时若注册表没有就 `getUserArtwork` 按需暖表，用户作品的返回目标是制作页。撤销删除会把原图与生成数据一起重新写回（`undoItem` 用 `shallowRef` 存原始对象，避免响应式代理无法被 IndexedDB 结构化克隆）。

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
src/components/   外壳导航、素材卡片、合集卡片、上传对话框、搜索框、分页器、轮播、调色板、画布、结算弹窗、像素风图标
src/composables/  进度与设置的共享状态
src/data/         分类注册表、关卡数据、素材注册表（素材与预设关卡共享像素数据，ID 独立）和合集注册表
src/models/       PixelArtwork、Level、Collection 与进度类型
src/pages/        素材页、合集列表/详情页、制作页、选关页、游戏页（关卡/自由涂色/用户作品共用）、占位页
src/services/     关卡与素材查询、进度判定与存档迁移、分块几何、图片转关卡、图片解码、用户作品存储（IndexedDB）、音效
scripts/          投放图清理脚本和 PNG 转关卡脚本
```
