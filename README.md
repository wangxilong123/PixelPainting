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

应用外壳是左侧固定宽度导航（素材、合集、制作像素图、个人中心、关卡模式）加一条右上角常驻顶栏（全局主题切换），640px 以下导航折成底部标签栏、顶栏左侧补出品牌名；涂色页不占导航，把整屏让给画布。

- `/` 素材库。搜索名称或标签，卡片每行 4 幅（1024px 以下 2 幅、560px 以下 1 幅），每页 12 幅，点卡片进入自由涂色。预设素材排在前面，之后接所有者从制作页发布的自制作品（按发布时间倒序），发布作品左上角带「我的」徽标，和预设共用同一套搜索与分页。
- `/paint/:artworkId` 自由涂色。和关卡共用一个游戏页，但没有解锁顺序，顶栏可以关计时；进度按素材 ID 单独记录，不影响关卡解锁。
- `/levels` 横向轮播选关。滚轮、左右方向键或轮播下方的 ‹ › 按钮切换关卡，回车进入；按钮中间是当前位置（第 n / N 关），卡片居中时顶部统计条跟着更新。滚轮横向到头后会把纵向滚动还给页面，不会把页面困在轮播里。分类 chips 只筛选轮播内容，能不能进按全局顺序判断：前置关卡全部通关才解锁，已通关的关卡即使前置进度被清零也照样能重玩（`isLevelEnterable` = 已解锁或已通关），这类卡片显示「已完成」而不是锁标。
- `/game/:levelId` 涂色。左键填色，右键拖拽平移，滚轮缩放，某个颜色涂完后自动切到调色板里的下一个颜色。顶栏「设置」抽屉里可以开关音效、调色板剩余格数和沉浸模式，末尾是主题切换按钮。
- `/collections` 合集列表。按主题策展的素材分组，每个合集占一整行（左封面、右名称/标签/成员预览），搜索名称或标签实时筛选，点行进入详情。顶部「新建合集」可自定义合集：从预设素材和「我的作品」里点选成员（点选顺序即展示顺序，首幅作封面），支持搜索、按来源筛选、前移/后移/移除/清空调序；用户合集排在预设前面、按创建时间倒序，封面右上角带「我的」徽标，卡片右上角两步删除、删后可撤销。预设合集只读，不显示编辑/删除。
- `/collections/:collectionId` 合集详情。复用素材卡片网格、搜索与分页，按合集内 `artworkIds` 顺序展示成员，可在合集内再搜索；用户作品成员用其缩略图、预设成员用 `PixelPreview`。用户合集标题旁带「我的」徽标，头部有编辑（原地改名/调成员，保留 ID 与创建时间）和两步删除（删后页面切到「合集已删除」并给撤销条）；未知 ID 显示「未找到这个合集」并给返回链接。
- `/studio` 制作像素图。上传一张图片，浏览器本地把它降采样、量化成可涂色的像素作品，原图与生成数据存进 IndexedDB；顶部是已制作数量与「添加图片」按钮，下方作品墙用瀑布流排布（最短列优先砌砖，列数同素材库 4/2/1，高矮不一的卡片紧凑排列、不按行最高对齐）、搜索与分页，点卡片进入自由涂色，卡片右上角「上传至素材库」按钮把作品发布到素材库（再点撤回，发布态高亮主色），旁边下载按钮把作品导出为 PNG/JPG/WebP（倍率/背景/质量可调，见「制作像素图」），再旁边两步删除、删后可撤销。
- `/profile` 个人中心。顶部三张成绩卡片：完成作品数、已涂色像素总数、关卡进度（已通关/总关数）。数字全部从现有存档派生，不另设计数器字段：完成作品数按 `isLevelCleared` 判定（重玩后 `painted` 归零但 `bestResult` 还在，作品照样算完成过），已涂色像素按当前已涂上的可交互格累加（未完成的作品也计入像素，但不进作品集），空格不算。下方作品集只收已完成的作品，按完成时间倒序，卡片带来源徽标（关卡/素材/我的作品）和完成时间，点卡片回关卡页或自由涂色页，关卡条目一律写「重玩关卡」并直接进关卡页，不做选关页兜底。支持按名称或标签搜索、每页 12 幅分页。同一幅图的关卡进度与自由涂色进度按 `source` 各算一份（完成作品数照两份累加）；因素材复用关卡的像素数据，作品集按图像内容（宽高 + 调色板 + `cells`）去重，同一幅图只留最近完成的一条，徽标与完成时间跟着该条走，完成时间取最近一次完成（`completedAt`，重玩清零后回退 `bestResult.completedAt`）。

分块关卡（`parts` 是 2×2 或 3×3）走引导式流程：进关先给整图预览——整幅画平铺上色（涂过的格子显示成品色），叠分块边界，完成的块打勾、下一块描亮边标块号，预览只看不涂，滚轮留给页面滚动。点「开始涂色」（有进度则是「继续涂色」）从第一个未完成的块开始，整图与分块之间用 480ms 缓动缩放过渡（系统开了减弱动态效果就直接切换）。一次只涂一块：块外的格子既不绘制也不响应点击，调色板只摆当前块还有剩余格子的颜色（数量为 0 的直接不显示，涂完一个颜色它的色块就实时撤掉），剩余格数和自动换色只数当前块，提示也只在当前块里找选中色的未涂格；非分块关卡保持整幅调色板、涂完的颜色禁用不隐藏。涂满一块自动回到整图预览，点「下一块」进入下一个未完成的块；最后一块涂满时结算弹窗盖在预览上。格子编号和 `cells` 下标始终按整图算，换块时视口回到该块的适配位置，玩家的缩放平移不跨块保留；解锁、完成判定和提示次数都按整图算。

进度和设置都存在 localStorage，键名分别是 `pixel-painting:v2:progress` 和 `pixel-painting:v1:settings`；自定义合集存 `pixel-painting:v1:collections`（纯元数据数组，不含图像 Blob，所以走 localStorage 而非 IndexedDB）；发布到素材库的作品存 `pixel-painting:v1:published`（`{ id, publishedAt }` 数组，只记引用不复制图像，图像仍在 IndexedDB 的作品记录里）。进度存档是 `{ currentId, records }`，每条记录带 `source`（`level` / `artwork` / `user`）区分玩法；旧 v1 存档只在 v2 缺席时读一次并迁移写回 v2（丢弃已废弃的 `stars`，重命名关卡的旧键搬到新键），v1 原文不动。沉浸状态不写入存档，刷新后一定回到普通模式。存档里的 `partIndex` 记录玩家当前在涂的块，提示按它限定范围；重进关卡总是先回整图预览，从第一个未完成的块继续。重转关卡改了分块数导致块号越界时只丢这个字段，已涂进度照旧读出来。用户制作的像素图（原图 + 生成数据）另存 IndexedDB（库名 `pixel-painting-studio`），不占 localStorage 配额；存储不可用时降级为仅本次会话可用，并在制作页与个人中心顶部给出提示。

## 主题

深色和浅色两套主题，右上角随时切换，首访跟随系统。

- 令牌全在 `src/styles/tokens.css`：`:root` 是深色（冷夜蓝底 + 琥珀主色），`:root[data-theme="light"]` 只覆盖颜色，浅色是暖纸中性色 + 深琥珀主色（主色要当文字用，所以比深色的 `#ffcc66` 深到 `#925600`）。尺寸、间距、字号、圆角两套共用，切主题不动布局。组件只认语义名，新补的 `--color-on-primary`/`--color-on-danger`、`--color-primary-soft`/`-faint`/`-hover`、`--color-danger-soft`/`--color-success-soft`、`--color-scrim`/`-soft`/`-strong`、`--color-badge-scrim`、`--shadow-overlay`、`--glow-primary`(`-strong`) 把原先写死在组件里的 rgba 收了回来，换配色只改这一个文件。滚动条也跟着走（轨道背景色、滑块边框色、悬停加深）。
- 切换按钮 `ThemeToggle.vue` 在两处：外壳新增的常驻顶栏 `.app-topbar`（`position: sticky`，高度旋钮 `--topbar-height` 默认 3.25rem，640px 以下左侧补出品牌名，因为那时侧栏折成了底部标签栏）右端，以及涂色页自己的顶栏末尾。按钮显示**当前**状态（深色/浅色 + 月亮/太阳图标），`aria-label` 与 `title` 写**相反**动作（「切换到浅色主题」）。
- 状态在 `src/composables/useTheme.ts`，模块级共享一个 ref，页面上多颗按钮同步。首次访问读 `prefers-color-scheme`，不写盘；手动切过才存 localStorage `pixel-painting:v1:theme`（纯文本 `dark`/`light`，不是 JSON），存了别的值退回系统。`index.html` 头部内联脚本在首屏绘制前按同一套规则定 `data-theme`，浅色偏好的所有者不会看到一帧深色底——键名和判定规则两边必须一致。`matchMedia` 不存在（Node/jsdom）时按深色兜底。
- 画布不吃 CSS，颜色由 `src/canvas/canvasTheme.ts` 一次 `getComputedStyle` 读齐 12 个 `--canvas-*`，读不到就退回深色原值（jsdom、样式没加载时照样画得出来）。控制器只在 `documentElement.dataset.theme` 变了才重读，不每帧算样式；`PixelCanvas.vue` 与上传预览各 `watch(theme)` 重绘，分块边界线走 `readThemeColor('--canvas-part-line', …)`。空格淡色、提示/错涂闪烁、整图预览的完成勾与下一块亮边都改用透明度混色，两套主题下都不糊。
- 浅色实测对比度（对纸面 `#fbf7f0`）：正文 14.3:1、辅助文字 6.3:1、主色 5.5:1、危险 5.3:1；最紧的一档是选中态琥珀淡底上的辅助文字 4.8:1，全部过 WCAG AA 的 4.5。灯箱说明原本直接压在暖墨遮罩上会被吃掉，垫了一层 `--color-badge-scrim` 纸片。

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
| `cover` | 封面图地址，复用内含素材的缩略图；留空时回退到首幅成员的缩略图，首幅也没有缩略图（小图预设）才用 `PixelPreview`。用户合集 `cover` 恒为空，封面取首幅成员缩略图——上传的大图若走 `PixelPreview` 会缩成亚像素格点、视觉上等于没封面 |
| `artworkIds` | 内含素材 ID，详情页按这个顺序展示 |

注册表加载时校验 ID 不重复、引用的素材都存在，违反直接抛错。新增预设合集只改 `src/data/collections.ts`，不用动组件。查询走 `src/services/artworkService.ts` 的 `searchCollections`（空词返回全部，按名称或标签匹配）和 `getCollectionById`（返回 `{ collection, artworks }`，未知 ID 返回 `undefined`）。

自定义合集是 `UserCollection = Collection & { createdAt, updatedAt }`，存 localStorage（`src/services/collectionStorage.ts`），注册进 `artworkService` 的另一张响应式表（`shallowReactive` Map），与预设表互不导入、无循环依赖。`searchCollections` 把用户合集排在预设前面（用户合集按 `createdAt` 倒序、同时间按 ID 升序），`getCollectionById` 先查预设再查用户表，成员按 `artworkIds` 顺序解析、引用已不存在的作品（如被删的用户作品）自动跳过。存储层模块加载即 `loadUserCollections()` 灌表（深链直达详情页也能认得），列表/详情页 setup 再同步一次；写入用 `useLocalStorage`，磁盘写失败时降级为内存暂存、读取仍返回暂存值。

- `saveUserCollection({ id?, title, tags, artworkIds })`：标题去空白非空且 ≤40 字，成员去重后至少一幅且每幅都能解析，标签去空白去重最多 6 个；带 `id` 是编辑（保留 ID 与 `createdAt`、刷新 `updatedAt`，目标不存在抛错），不带是新建（生成 `col-user-<时间戳36>-<计数36>-<随机4>` 形式 ID）。校验失败抛中文错误、不落盘。
- `deleteUserCollection(id)` 返回被删记录供撤销，`restoreUserCollection(record)` 原样写回（保留时间戳）。`CollectionEditor.vue` 是新建/编辑共用对话框（尺寸旋钮 `--editor-width` 56rem、`--editor-picker-height` 20rem），打开时和打开期间注册表变化时都会剔掉已删作品的悬空 ID——计数、序号、前移/后移/移除全按解析后的列表走，保存时顺带把悬空 ID 落盘清掉；列表页与详情页的两步删除（3s 确认窗口）和撤销条（6s）各自管理定时器、卸载时清理。

## 制作像素图

`/studio` 让所有者在浏览器本地把上传的图片变成可涂色的像素作品，和投放关卡走同一条转换路径（服务层 `src/services/imageToLevel.ts`，Node 脚本与页面共用）。

- `src/services/imageSource.ts` 解码上传：`createImageBitmap` 读图（最长边超 4096 先缩），画到离屏 canvas 取 `ImageData`，非图片或解码失败给中文报错。
- `imageToLevel` 新增两个可调上限：`maxWidth` 目标格数上限（按格取众数色降采样，透明格保留为空格，目标宽不小于原宽时原样返回）、`colorCap` 颜色数上限（截断时先跳过与已保留色曼哈顿距离 ≤60 的近似色再取前 N，避免照片大面积背景的几十种近似灰/暗色耗光名额、把主体鲜艳色挤成黑白；被裁掉的颜色按 RGB 曼哈顿距离并入最近的保留色，自定义色名保留、默认色重新编号）。颜色排序仍是数量降序、同数量按十六进制升序。
- `src/components/UploadDialog.vue` 上传对话框：选图/拖入后实时预览（一格一像素硬边 + 分块边界 + 棋盘格透明底），左侧预览框放大到 `--upload-preview-col`（默认 26rem，画布内禀按最长边缩到 `PREVIEW_RENDER_SIZE` 640px 再由 CSS 填满、`image-rendering: pixelated` 放大不糊），预览框右上角「查看大图」按钮开灯箱（z-index 60 盖在对话框上，棋盘格底 + `object-fit: contain`，点背景/关闭按钮/Esc 关灯箱但不关对话框），可调标题、标签（逗号分隔最多 6 个）、格数上限（16–256，默认 64，滑杆旁数字框可手动输入、无上下微调按钮，越界夹回、非法回退当前值）、颜色上限（2–64，默认 24）、分块（自动/不分块/2×2/3×3）。超过 64 宽必须分块，「不分块」禁用、自动档切 3×3；参数变动 120ms 防抖重算。保存时生成一格一像素缩略图。
- `src/services/artworkStorage.ts` 存储：IndexedDB 库 `pixel-painting-studio`、表 `artworks`，记录 `{ id, artwork, original, createdAt }`（原图 Blob + 生成数据）。写入即注册进 `artworkService` 的响应式表（`shallowReactive` Map），列表/单查都会顺带注册；`main.ts` 启动先 `listUserArtworks()` 暖表再挂载，保证存档解析认得用户作品。读取按最新在前。IndexedDB 不可用或中途读写失败时降级为共用内存表、仅本次会话可用，`storageNotice` 给制作页顶部提示；校验失败仍抛错。删除只删作品，对应涂色进度留给存档解析下次加载时自行丢弃；若该作品已发布到素材库，删除时顺带下架（`unpublishArtwork`），素材库不再显示它。
- 涂色进度按 `source: 'user'` 记录，与关卡、预设素材隔离；`GamePage` 进 `/paint/:artworkId` 时若注册表没有就 `getUserArtwork` 按需暖表，用户作品的返回目标是制作页。撤销删除会把原图与生成数据一起重新写回（`undoItem` 用 `shallowRef` 存原始对象，避免响应式代理无法被 IndexedDB 结构化克隆）。
- `src/services/materialPublish.ts` 发布到素材库：`publishArtwork(id)` 只接受用户作品（预设或未知 ID 抛中文错误），把 `{ id, publishedAt }` 写进 localStorage 并注册进 `artworkService` 的第三张响应式表（`shallowReactive` Map，存发布时间）；`unpublishArtwork(id)` 撤回（保留源作品）。这是引用而非复制——素材库直接解析作品 ID 拿图像，删源即自动下架。`searchArtworks` 把发布作品按 `publishedAt` 倒序接在预设后面，解析不到的悬空 ID（源已删）自动跳过。模块加载即 `loadPublishedMaterials()` 灌表，`main.ts` 侧效导入它，深链直达素材库也认得；磁盘数据损坏/重复时按校验过滤。注册表放服务层、持久化放存储层，`materialPublish → artworkService`、`artworkStorage → materialPublish` 单向无环。
- `src/composables/useMasonry.ts` 作品墙瀑布流：`StudioPage` 的 `.artwork-grid` 不再用 CSS grid（行高被该行最高卡片撑开、矮卡片下留大片空白），改由 `useMasonry` 把卡片绝对定位、按「最短列优先」砌砖——前几幅横向铺满顶部，之后每幅塞进当前最矮的列，容器高度取最高列。列数跟随素材库断点（>1024 四列、561–1024 两列、≤560 一列），间距读设计令牌 `--space-4`；挂载、条目变化、窗口缩放、子元素尺寸变化（缩略图加载后卡片长高）都触发重排。纯函数 `computeMasonryLayout` 脱离 DOM 可单测。
- `src/components/ExportDialog.vue` + `src/services/artworkExport.ts` 下载导出：制作页卡片右上角和上传对话框预览的「下载像素图」按钮都开同一个导出对话框（z-index 70 盖在上传对话框上，Esc 只关最上层，上传对话框的 Esc 监听在导出打开时让位）。导出只依赖作品的像素数据（宽高 + 调色板 + `cells`），预设素材、用户作品、上传实时预览（`Level`）共用一条渲染路径：离屏 canvas 按整数倍率（1–16，默认 8）放大、`imageSmoothingEnabled=false` 保持像素硬边，再 `toBlob` 编码触发下载。格式 PNG/JPG/WebP，JPG 不支持透明、选透明底时自动铺白；背景可选透明/白/黑/自定义取色，有损格式（JPG/WebP）另给质量滑杆（0.5–1，默认 0.92）。左侧实时预览（同步 `toDataURL`）显示输出尺寸与约文件大小，下载后给精确字节数提示；文件名取标题去掉文件系统非法字符、夹到 40 字、空标题回退「像素图」。尺寸旋钮 `--export-width` 46rem、`--export-preview-col` 18rem。

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

## 图标

图标是投放式的：把 SVG 丢进 `src/assets/icons/<图标键>.svg` 就会被 `import.meta.glob` 收进来，文件名必须等于 `src/components/icons.ts` 里的键（`materials`、`collections`、`studio`、`profile`、`levels`、`search`、`check`、`lock` 等），中文名或别的名字匹配不上、会被静默忽略。目前 29 个键都有正式文件：24 个是所有者上传（原件按上传者给的名字留在 `docs/assets/icons/`，不入库），`reset-view`（十字准星）、`clock-off`（斜杠时钟）、`download`（下箭头 + 托盘）、`sun`（实心日轮 + 八道光芒）与 `moon`（月牙）是自绘补位，同样走 1024 网格。

`src/components/iconSvg.ts` 运行时归一化：取文件自己的 `viewBox`（上传件是 `0 0 1024 1024`），把所有 `fill`/`stroke` 压成 `currentColor`（`none` 保留），剥掉 `script`、`style`、`foreignObject`、动画节点和 `on*` 事件属性，然后内联进 `PixelIcon`。没有对应文件的键回退到 `icons.ts` 的 16×16 像素路径并带 `crispEdges`；有文件的走平滑矢量、不加 `crispEdges`。组件和调用点只认键名，换图不用改代码。

六个板块图标（`materials`/`collections`/`studio`/`profile`/`levels`/`search`）另做光学尺寸归一化：上传件自带留白不均（着墨占画布 67%–100%），同样 20px 并排看会大小不齐。`iconSvg.ts` 里有一张实测着墨 bbox 表，把这六个键的 `viewBox` 裁到图案边缘，`PixelIcon` 再按 `tokens.css` 的 `--icon-ink-ratio`（默认 0.85，即着墨占图标盒 85%、长边对齐）统一缩放；布局盒仍是调用点给的尺寸，其余图标与占位路径不受影响。换这六个文件要重测 bbox；新文件 `viewBox` 不再是 `0 0 1024 1024` 时自动退回原图。

## 目录

```
src/assets/       投放式 SVG 图标，文件名即图标键
src/canvas/       Canvas 控制器、视口计算和画布配色读取，不依赖 Vue
src/components/   外壳导航、主题切换、素材卡片、合集卡片、合集编辑器、上传对话框、导出对话框、搜索框、分页器、轮播、调色板、画布、结算弹窗、图标表与 SVG 归一化
src/composables/  进度、设置与主题的共享状态
src/data/         分类注册表、关卡数据、素材注册表（素材与预设关卡共享像素数据，ID 独立）和合集注册表
src/models/       PixelArtwork、Level、Collection / UserCollection 与进度类型
src/pages/        素材页、合集列表/详情页、制作页、个人中心页、选关页、游戏页（关卡/自由涂色/用户作品共用）
src/services/     关卡与素材查询、进度判定与存档迁移、成绩统计与作品集、分块几何、图片转关卡、图片解码、用户作品存储（IndexedDB）、自定义合集存储（localStorage）、发布到素材库（localStorage）、像素图导出（PNG/JPG/WebP）、音效
src/styles/       主题与尺寸令牌（tokens.css）、全局样式与外壳布局（global.css）
scripts/          投放图清理脚本和 PNG 转关卡脚本
```
