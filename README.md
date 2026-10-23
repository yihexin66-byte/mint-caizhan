# Mint 个人财务管家

一个基于 **uni-app x（UTS + Vue 3）** 的个人记账微信小程序，覆盖「记收支 → 分类统计 → 预算提醒 → 月度图表分析」完整闭环。

- 前端：uni-app x（`.uvue` + UTS），HBuilderX 5.26 编译，当前为 VDOM 模式，样式隔离 2.0
- 云端：uniCloud（支付宝云空间），云对象 `mint-core` + 定时器函数 `mint-notify`
- 双端验证：Web/H5（演示模式，内置演示数据）+ 微信小程序（真实云端）
- 视觉：Aurora Glass —— 黑色底 `#060807` + 薄荷/青蓝极光光雾 + 细颗粒 + Liquid Glass 半透明玻璃卡片；薄荷渐变主操作，奶油白图标体系，自定义胶囊避让

---

## 一、功能总览

| 模块 | 说明 |
| --- | --- |
| 总览首页 | 本月结余、收支概览、应收应付卡片、预算提醒横幅、每周支出趋势 |
| 记一笔 | 支出/收入切换、分类九宫格、金额大数字输入、币种选择、日期与备注 |
| 明细 | 按日分组列表、收入/支出/全部筛选、月度切换、单笔点开可改可删 |
| 统计分析 | 分类占比环形图（Canvas 2D）、近 6 个月收支柱状图、结余率/日均支出/最大单笔等洞察 |
| 预算 | 总预算 + 分类预算、使用率进度、接近/超出提醒线、站内提醒横幅 |
| 应收应付 | 往来账本、到期提醒、一键结清；**结清时自动生成关联收支记录（防重复编辑、防双算）** |
| 汇率管理 | 打开页面自动拉取 Frankfurter/ECB 最新汇率（同日缓存），也可手动刷新；更新前逐币种展示涨跌并二次确认，应用后全场重算 |
| 个人资料 | 「我的」页可拍照或从相册选头像、修改昵称（≤16 字）；头像存云存储 fileID 并解析临时 URL，首页问候语与头像即时同步 |
| 设置 | 中英双语切换、基准币种、微信订阅消息开关、个人资料入口 |
| 微信登录 | `wx.login` code → 云对象换 openid → 签发会话 token，数据库禁止客户端直连 |

演示模式（Web）：启动即自动进入演示会话，内置约 17 笔当月流水、5 个月历史、往来与预算样例，用于界面走查与流程演示；数据存于内存，刷新页面即重置。演示模式不请求实时汇率（需登录云端），头像选择仅在本地预览。

---

## 二、目录结构

```
├─ App.uvue / main.uts / pages.json / manifest.json   # 入口与全局配置（中文界面 + 微信端配置）
├─ pages/                # 7 个页面：shell（主壳层）/ login / record-edit / debts /
│                        #   debt-edit / rates / settings
├─ components/           # shell 内四个 Tab 视图：tab-home / tab-records / tab-stats / tab-budgets；
│                        #   app-tabbar / month-switch / tx-row / empty-state / aurora-bg /
│                        #   donut-chart(Canvas 2D) / bar-chart / trend-chart
├─ stores/               # session / prefs / ledger / ui —— 全局响应式状态
├─ services/             # api 分发层（WEB→mock，小程序→云端）+ mock + cloud 实现
├─ constants/            # config（模板 ID 等非敏感配置）/ categories / currencies
├─ utils/                # money（折算/格式化）/ date / stats（统计口径）
├─ i18n/                 # 中英双语词条
├─ static/icons/         # 全套 PNG 图标；品牌方标 logo-light.png（由 _brand/home-logo-256.png 安装）
├─ _brand/               # 品牌资产：app-icon-512 / app-icon-144（小程序头像）、home-logo-256（首页方标）
├─ _qa/                  # 验收脚本与截图（见第七节）
└─ uniCloud-alipay/
   ├─ cloudfunctions/
   │  ├─ mint-core/      # 云对象：登录/资料/实时汇率/快照/CRUD/结清/设置/订阅注册
   │  └─ mint-notify/    # 定时器：预算提醒微信订阅消息推送
   └─ database/          # 6 个集合的 schema + db_init.json（含索引）
```

---

## 三、运行方式

### 1. Web 演示（无需云端，最快）

HBuilderX 中打开项目 → 运行 → 运行到浏览器。首次加载自动登录演示模式，直接体验全部功能。

> 项目带有 `uniCloud-alipay` 目录，未关联云空间时启动日志可能出现
> 「uniCloud本地调试服务启动失败：当前项目未关联uniCloud服务空间」——属提示级信息，不影响 Web 演示。

### 2. 微信小程序（完整链路）

1. **确认 DCloud 应用标识**：`manifest.json` 顶层的 `appid`（`__UNI__` 开头）不能为空，否则关联云空间/运行时会提示「缺少appid」。双击 `manifest.json` → 基础配置 → 点「重新获取」（需登录 DCloud 账号），或从 DCloud 开发者中心已有应用里复制。**注意它不是微信 AppID**——微信 AppID 位于 `mp-weixin.appid`，已配置为 `wx070e2726c50a9368`。
2. **关联云空间**：在 HBuilderX 中右键 `uniCloud-alipay` → 关联云服务空间（使用你已有的空间）。
3. **初始化数据库**：右键 `uniCloud-alipay/database/db_init.json` → 初始化云数据库。将创建 6 个集合与索引：
   `mint-users` / `mint-transactions` / `mint-debts` / `mint-budgets` / `mint-settings` / `mint-alert-log`，
   所有集合均为「禁止客户端直连」，仅云对象可访问。
4. **填写云端配置**（两个函数各一份，均为本地文件，不入库不外传）：
   - `mint-core/config.js`：填 `APP_SECRET`、`SUBSCRIBE_TEMPLATE_ID`
   - `mint-notify/config.js`：填 `APP_SECRET`、`SUBSCRIBE_TEMPLATE_ID`，并按你的模板改 `SUBSCRIBE_DATA_KEYS`
5. **上传云端**：分别右键 `mint-core`、`mint-notify` → 上传部署（`mint-notify` 会带上每天 09:00 的定时触发器）。
6. **填写客户端模板 ID**：`constants/config.uts` → `SUBSCRIBE_TEMPLATE_ID`（非敏感，与云端保持一致；留空时小程序自动隐藏微信订阅能力，仅保留站内提醒）。
7. **运行（仅开发联调）**：运行 → 运行到小程序模拟器 → 微信开发者工具。AppID 已配置为 `wx070e2726c50a9368`。手机在公网使用请直接看下方第 3 小节。
   工程根目录的 `project.config.json` 已配置 `miniprogramRoot: unpackage/dist/dev/mp-weixin/`，也可以在开发者工具里直接导入工程根目录；或导入 `unpackage/dist/dev/mp-weixin/` 本身。源码根目录单独导入会报「未找到 app.json」。
   **注意**：开发包里的云对象固定请求 HBuilderX 的本地调试服务 `127.0.0.1:7000`。因此手动导入的工程只有在 HBuilderX 保持打开、且最近一次「运行到微信开发者工具」启动过该服务时才能登录/读写数据；直接双击打开开发者工具会报 `ERR_CONNECTION_REFUSED`（见第八节）。

### 3. 公网访问（正式包 / 体验版）

开发包只能在「同一台电脑 + HBuilderX 开着」时使用，这是调试机制决定的。要让手机在任意网络下登录使用，必须发行正式包，让客户端直连云空间网关。本仓库的云函数与数据表已上传到 `mint` 空间，正式包也已生成：

| 项目 | 值 |
| --- | --- |
| 云空间 | 支付宝云 `mint`（`env-00jy6ydc58ll`） |
| 云对象 / 云函数 | `mint-core`、`mint-notify`（已上传） |
| 数据表 | 6 个集合及索引（已上传） |
| 正式包目录 | `unpackage/dist/build/mp-weixin` |
| request 合法域名 | `https://env-00jy6ydc58ll.api-hz.cloudbasefunction.cn` |
| uploadFile 合法域名 | `https://u.object.cloudrun.cloudbaseapp.cn` |
| downloadFile 合法域名（可选） | `https://env-00jy6ydc58ll.normal.cloudstatic.cn` |

操作步骤：

1. **配置服务器域名**（只做一次）：微信公众平台 → 开发管理 → 开发设置 → 服务器域名 → 修改。
   - `request 合法域名`：`https://env-00jy6ydc58ll.api-hz.cloudbasefunction.cn`（云对象/云函数网关，必须 HTTPS、不带路径）
   - `uploadFile 合法域名`：`https://u.object.cloudrun.cloudbaseapp.cn`（支付宝云存储上传，头像用；**不是**上面的网关地址）
   - `downloadFile 合法域名`：仅当使用 `uniCloud.downloadFile` 时才需要；当前头像只用 `<image>` 展示临时 URL，可不填。
   保存后约 5–10 分钟生效。域名修改次数有限，一次填全；若开发者工具报 `url not in domain list`，以它提示的域名为准补入对应类型。
2. **导入正式包**：微信开发者工具 → 导入项目 → 目录选 `unpackage/dist/build/mp-weixin`（不是工程根目录），AppID `wx070e2726c50a9368`。根目录的 `project.config.json` 指向开发包，HBuilderX 每次「发行 → 微信小程序」都会把这份配置复制进正式包，所以正式包内的 `miniprogramRoot` 会变回 `unpackage/dist/dev/mp-weixin/`，在正式包目录下自然找不到 `app.json`（表现为「自动预览：未找到 app.json」）。
   发行后务必把 `unpackage/dist/build/mp-weixin/project.config.json` 的 `miniprogramRoot` 改成 `"./"`；开发包 `unpackage/dist/dev/mp-weixin/project.config.json` 同样应为 `"./"`（直接打开该目录时使用），**只有工程根目录的 `project.config.json` 保留** `"unpackage/dist/dev/mp-weixin/"`。改完在开发者工具里关闭并重新打开项目（或重启工具），让配置重新加载。
3. **真机验证**：开发者工具「预览」扫码，或「上传」后在公众平台设为体验版。正式包不请求 `127.0.0.1`，手机用移动网络也能登录、读写数据。
4. **配置用户隐私保护指引**（微信官方授权框的前提）：公众平台 → 账号设置 → 服务内容声明 → 用户隐私保护指引 → 更新。至少声明：
   - 「摄像头」：用于拍摄个人头像
   - 「选中的照片或视频信息 / 相册」：用于从相册选择个人头像
   保存并提交。未配置时，微信不会弹出官方隐私授权框，隐私接口也可能在线上被拦截。
   头像入口有两层授权：
   - **应用内确认（代码自带，必定出现一次）**：首次点「拍照 / 从相册选择」会先弹 Mint 的「允许访问相机和相册」确认框，选「同意并继续」才会打开选择器，选「取消」则提示并停止。结果记录在本地 `mint_media_consent_v1`，同一台设备只问一次。
   - **微信官方隐私框（平台能力，按需出现）**：指引配置生效且该微信用户尚未同意时，应用内确认之后由 `uni.getPrivacySetting` + `wx.requirePrivacyAuthorize` 拉起；微信会记住同意结果，后续不再重复。
   > 微信小程序没有独立的「相册授权」scope：选相册走系统照片选择器，不额外弹相册权限；相机是否再弹系统授权由微信/手机系统决定。微信会记住隐私授权结果，同意后后续选择不再重复弹官方隐私框，这是平台标准行为。真机调试控制台会打印 `[mint privacy] needAuthorization=... contract=...`，可用于判断官方框为何未出现。
5. **小程序头像**：公众平台 → 设置 → 基本设置 → 小程序头像，上传 `_brand/app-icon-512.png`（512×512，包内另附 `app-icon-144.png` 备用）。头像属于平台配置，不随代码包发布。
6. **发布**：公众平台 → 版本管理 → 提交审核 → 发布。首次发布前需补齐类目、隐私协议（按实际用到的能力勾选）、订阅消息（如需微信提醒）。

> 不要把 `127.0.0.1:7000` 暴露到公网（内网穿透等）：它没有鉴权，且只服务本机调试。公网访问的正确形态就是上面的正式包 + 云空间网关。

---

## 四、安全设计（重要）

- `APP_SECRET` 仅存在于云函数 `config.js`，**客户端任何代码、任何配置都不包含**。
- 客户端不直连数据库：6 个集合权限全部关闭；一切读写经由云对象 `mint-core`，并在云端校验 `token`（HMAC 签名 + 有效期）。
- 云对象对金额、币种、日期、分类做白名单校验；同名分类预算做唯一性检查。
- 会话 token 由云对象签发（默认 30 天），`TOKEN_SECRET` 已随机生成，可保持不变。
- 在微信公众平台申请订阅消息模板后，模板 ID 属非敏感信息，需同时填写在 `constants/config.uts`、`mint-core/config.js`、`mint-notify/config.js` 三处。

---

## 五、订阅消息（预算提醒）工作方式

- **站内提醒**：预算使用率 ≥ 提醒线时，首页/预算页出现提醒横幅（纯本地计算，双端一致）。
- **微信提醒**：用户在「预算」页打开开关 → `wx.requestSubscribeMessage` 授权（记录在 `mint-settings.subscription`）→ `mint-notify` 定时器每天 09:00 扫描：
  - 按小程序端相同口径计算本月支出（expense、按用户汇率折算到预算币种）；
  - 使用率 ≥ `alertAt`（默认 80%）且本月未发过 → 发送订阅消息；
  - 去重依赖 `mint-alert-log` 的 `openid + monthKey + budgetId` 唯一索引，每月每预算最多一条；
  - 默认按「一次性模板」处理：发送成功后自动关闭该用户的微信提醒，待其再次授权（长期模板可把 `ONE_OFF_TEMPLATE` 改为 `false`）。
- 模板字段与 `SUBSCRIBE_DATA_KEYS` 的映射：`title(thing) / category(thing) / spent(amount) / limit(amount)`，请按你申请到的模板实际字段修改。
- 调试：`mint-notify` 支持 HBuilderX「上传并运行」手动触发一次。

### 申请与填写（一次性配置）

1. 微信公众平台 → 功能 → 订阅消息 → 开通（若未开通）→ 公共模板库，搜索「预算 / 记账 / 提醒」，选用一条**一次性订阅**模板。个人主体通常只能使用一次性模板；长期模板需符合平台类目要求。
2. 在「我的模板 → 详情」复制模板 ID 和字段键（形如 `thing1`、`amount2`）。模板 ID 非敏感，但只填在本地文件，不要发到公开渠道或对话里。
3. 同一个模板 ID 填三处：
   - `constants/config.uts` → `SUBSCRIBE_TEMPLATE_ID`
   - `uniCloud-alipay/cloudfunctions/mint-core/config.js` → `SUBSCRIBE_TEMPLATE_ID`
   - `uniCloud-alipay/cloudfunctions/mint-notify/config.js` → `SUBSCRIBE_TEMPLATE_ID`
4. 在 `mint-notify/config.js` 中把 `SUBSCRIBE_DATA_KEYS` 的四个键改成模板实际字段键，并填好 `APP_SECRET`（只存在云函数目录，绝不进客户端）。一次性模板保持 `ONE_OFF_TEMPLATE: true`；长期模板改为 `false`。
5. 重新上传 `mint-core` 与 `mint-notify`（HBuilderX 右键上传部署；`mint-notify` 需带触发器），客户端需重新编译，因为 `constants/config.uts` 是编译期常量。
6. 已登录用户如果之前开过提醒，需要在小程序内先关闭再打开一次，重新走 `wx.requestSubscribeMessage` 授权；换模板后旧的授权不适用。

---

## 六、实现说明与取舍

- **状态管理未使用官方 Pinia**：官方 Pinia 暂不支持 UTS，改用 `stores/*.uts` 中带类型的 `reactive` 全局 store（`session / prefs / ledger`），API 风格贴近 Pinia（state + actions），满足「状态管理」要求且全端可编译。
- **接口分发设计**：`services/api.uts` 按条件编译分发到 `mock.uts`（WEB）或 `cloud.uts`（小程序）；页面只调用 api 层，云端接入不污染页面代码。
- **环形图为 Canvas 2D**：`uni.createCanvasContextAsync` + dpr 同步（H5 端 canvas 内部分辨率默认 300×150，需按 `devicePixelRatio` 放大避免椭圆变形；App 端尺寸只读，按条件编译跳过）。
- **Web 演示数据**：仅 `#ifdef WEB` 生效；小程序端登录后为**空账本引导**，不注入任何演示数据。
- **结清联动**：结清生成一笔带 `sourceDebtId` 的收支记录；该记录在明细中可查看但不可编辑/删除（防双算），往来侧保留「已结清」归档。
- **深色 Liquid Glass 系统**：页面底色与窗口底色统一为 `#060807`；卡片使用半透明白色渐变 + 1px 内描边 + 顶部高光 + 深投影，主卡片叠加薄荷径向光晕。**刻意不使用 `backdrop-filter`**：小程序 WebView 支持不稳定，且大面积模糊会拖慢滚动与切页。
- **胶囊避让**：全局 `.status-spacer` 为 `calc(var(--status-bar-height) + 44px)`，正好让出微信右上角胶囊（约状态栏 + 36px）；各页顶栏只保留 2px 内边距，首页顶部动作（铃铛/头像）因此落在胶囊下方。
- **图标明暗双轨**：`ui-*-light.png` 为奶油白线性图标，用于深色玻璃面；原始深色 `ui-*.png` 只保留在薄荷色实底上（保存按钮、币种角标、选中勾）。品牌标使用图形稿中的奶油方标 `logo-light.png`（奶油底 + 薄荷书本/叶片 + 青绿点）替换所有深色页面上的低对比 logo；小程序头像另存于 `_brand/app-icon-512.png`。
- **常驻壳层，切 Tab 不重建页面**：`pages/shell/shell.uvue` 是唯一主页面，极光背景、状态栏占位和玻璃 Tab 栏只渲染一次；首页/明细/统计/预算改为 `components/tab-*.uvue`，切换只改 `stores/ui.uts` 的激活态并 `v-if` 挂载对应视图，不再调用 `redirectTo`/`reLaunch`。实测切 Tab 后 45ms 截图已完整呈现新视图，`.tabbar`、`.status-spacer` 与极光层始终存在，无整屏白帧。
- **资料与头像**：昵称、头像 fileID 存于 `mint-users`，经 `mint-core.updateProfile` 校验 token 后写入；头像上传走 `uniCloud.uploadFile`（客户端无密钥），展示时用 `getTempFileURL` 解析，避免临时 URL 过期。`session.applyProfile` 同步更新问候语、首页头像与本地缓存。
- **实时汇率**：`mint-core.latestRates` 先校验会话 token，再按 Frankfurter dev → Frankfurter legacy → open.er-api 顺序尝试，六个币种报价齐全才算成功，返回 `source / date / rateCny`。客户端以 `mint_rates_check_day` 做同日缓存、`mint_rates_meta` 记录来源与日期；拉取后只弹确认，不自动改表。
- **图表深色适配**：环形图轨道 `rgba(255,255,255,0.08)`；柱状图非高亮柱提高橙色透明度并加纵向渐变；收支趋势柱使用薄荷/橙色渐变，保证黑底可读。
- **Aurora Glass 背景**：`components/aurora-bg.uvue` 为全屏固定层（`z-index: 0`、`pointer-events: none`），薄荷光雾居左上、青蓝居右上、中部淡蓝补光，叠加 96×96 预生成颗粒（`static/textures/grain.png`，构建时内联为 data URI）、顶部 1px 轮廓光与底部暗角。光雾为静态渐变，不跑循环动画、不做滚动视差，避免持续重绘。按页面信息密度分三档：首页/统计/预算 `high`，明细/往来/汇率 `mid`，表单/设置/登录 `low`。内容层与状态栏占位统一 `position: relative; z-index: 1`，确保极光只作氛围、不遮挡点击。
- **克制的动效层**：仅内容动效，时长 200–620ms、延迟不超过 160ms，全部只改 `transform`/`opacity`，并统一 `animation-fill-mode: backwards`，避免入场结束后压住按压态。页面结构「顶栏淡入 → 标题/月份上浮 → 主卡缩放 → 列表/分区依次上浮」；首页、统计、预算的关键金额做 760ms cubic ease-out 数字滚动（`setTimeout` ~30fps，token 失效机制防止快速切月时旧动画回写）；柱状图/趋势图从基线生长，环图淡入缩放；Tab、明细行、主按钮用 `hover-class` 提供按压反馈，动效层与液态玻璃的静态质感互不干扰。

---

## 七、验收记录（完成于 2026-10-20）

- **编译**：Web 编译通过；`mp-weixin` 编译成功（7 页面 + 全部组件，`unpackage/dist/dev/mp-weixin`）。`app.json` 仅注册 shell 等 7 页，四个 Tab 视图均以组件形式编译。
- **界面**：7 个页面在 390×844@2x 视口逐页截图核查（`_qa/` 目录）。
- **深色 Liquid Glass 改版（2026-10-20 19:40 复验）**：Web 与 `mp-weixin` 均重新编译成功；`_qa/v4-*.png` 覆盖全部 10 页，`_qa/v5-*-capsule.png` 用 47px 状态栏 + 87×32 胶囊模拟微信真机头部，确认铃铛/头像、语言切换、新增按钮均在胶囊下方；`_qa/v5-currency-sheet.png`、`v5-budget-sheet.png`、`v5-settle-dialog.png` 复核玻璃面板/弹层可读性。Canvas 环图轨道、柱状图渐变均已按黑底修正。
- **Aurora Glass 改版（2026-10-20 20:30 复验）**：Web 与 `mp-weixin` 重新编译成功；`_qa/v6-*.png` 覆盖全部 10 页。逐页探针确认：极光层均为 390×844 全屏固定（`z-index: 0`），内容层 `z-index: 1`，`bodyScrollW = 390` 无横向溢出；三档强度按页面正确落位（home/stats/budgets = high，records/debts/rates = mid，settings/login/record-edit/debt-edit = low）。动效实测：首页数字 11,221.84 → 14,797.85 → 15,330.54（约 900ms 收敛），统计 4,976.90 → 6,664.80 → 6,667.06，预算 5,481.62 → 7,998.23 → 8,000；切页后 66ms 内容挂载，主入场 `mintRiseIn` 在 200ms 时 opacity 0.795、300ms 时 0.981、约 420ms 收敛（主导入 320ms，延迟 ≤160ms），整页无白帧；Tab 按压态 opacity 0.58、明细行 0.62，触后切页/开详情正常，全程 0 异常。`mp-weixin` 产物已确认 `app.wxss` 的 7 组 keyframes、组件级 `barRise/trendRise/donutReveal`、5 个 Tab `hover-class` 与 `static/textures/grain.png` 均正确编译。
- **品牌图标（2026-10-20 21:31 复验）**：从设计图裁出左侧奶油方标（464→256，透明圆角）安装为 `static/icons/logo-light.png`，首页/登录左上角 28px、空状态 40px 均正常；右侧深色圆形头像裁为 512×512 与 144×144，保存在 `_brand/`，用于公众平台小程序头像。Web 重新编译后以 `_qa/v7-home.png`、`v7-login.png`、`v7-settings.png` 复核；`mp-weixin` 产物内 `static/icons/logo-light.png` 已更新，包结构无新增代码依赖。
- **常驻壳层 / 个人资料 / 实时汇率（2026-10-20 23:06 复验）**：Web 与 `mp-weixin` 均重新编译成功。切 Tab 以 `_qa/v8-tab-*.png`、`v8-switch-45ms.png`、`v8-switch-105ms.png` 复核：四个视图切换后 45ms 已完整渲染，`.tabbar`、`.status-spacer`、极光层始终各 1 份，无整屏白帧。资料流：相册选图 → 头像即时显示 → 改名「小满」→ 首页问候与头像同步 → 跨 Tab 重挂载仍同步 → 移除后恢复首字母（`v8-avatar-*.png`、`v8-name-dialog.png`、`v8-home-renamed.png`）。汇率流：首开自动弹确认、稍后不改表、手动刷新、应用后六币种与 `mint_rates_meta` 更新、同日再入不自动弹、手动仍可刷新、恢复默认清除来源（`v8-rates-*.png`；弹层流程用同结构的临时响应走查，测试后源码已还原并重新编译）。云对象侧以真实 token 调用本地 uniCloud 调试运行时：`latestRates` 返回 2026-10-20 实时六币种（USD 6.678242 / EUR 7.489515 / JPY 0.042232 / HKD 0.850847 / GBP 8.912656 / SGD 5.223569），`updateProfile` 的 UNAUTHORIZED / INVALID_AVATAR / NOT_FOUND 分支均符合预期。
- **正式包**：`unpackage/dist/build/mp-weixin`，已回写 `project.config.json` 的 `miniprogramRoot: "./"`；包内 7 页窗口背景均为 `#060807`，7 页均已注册 `aurora-bg` 组件，且无 `127.0.0.1:7000` / `localhost` 残留。**2026-10-21 09:30 复核**：开发包与正式包内的 `project.config.json` 均为 `"./"` 且各自根目录存在 7 页 `app.json`；工程根目录配置保留 `"unpackage/dist/dev/mp-weixin/"`，三者与各自打开目录匹配。
- **头像隐私授权（2026-10-21，应用内确认 + 官方预检）**：拍照/相册入口先弹 Mint 自己的授权确认框（同意/取消，本地记住一次），同意后再执行 `uni.getPrivacySetting`，需要时调用 `wx.requirePrivacyAuthorize`；官方拒绝则提示并不打开相机/相册。真机控制台会输出 `[mint privacy]` 诊断日志。Web 自动化验收通过（`_qa/v9-media-consent.mjs`：确认框出现、取消不打开选择器、同意后可选图并上传、二次选择不再弹），Web 与 `mp-weixin` 均重新编译通过，正式包已更新；微信官方隐私弹窗依赖公众平台《用户隐私保护指引》中的摄像头/相册声明，需按第三节第 4 步配置后真机复核（本轮未做真机弹窗验收）。
- **功能流**（`_qa/crud.mjs` 自动化，走真实 UI 交互，11/11 断言通过，全程 0 异常）：
  1. 记一笔：新增 ¥25.5 → 首页结余 15,330.54 → 15,305.04，笔数 17→18；
  2. 明细：新记录入列（¥25.50）；进入编辑页回填正确；
  3. 改：25.5 → 31，保存后明细更新（-¥31）；
  4. 删：二次确认后移除，笔数回 17，首页恢复原值；
  5. 结清：房东应付 ¥260 结清 → 应付 388→128；结清生成关联记录（带「结清生成」说明、不可编辑）；首页支出 +260；
  6. 预算：餐饮预算 600 → 999，使用率 89.8% → 54%，状态由「接近提醒线」变为「预算充足」。
- `_qa/` 含 `serve.mjs`（Web 构建静态服务）、`cdp.mjs`（页面截图/探针）、`press.mjs`（按压态与切页回归）、`crud.mjs`（功能流脚本）、`v8-tabs.mjs` / `v8-profile.mjs` / `v8-rates.mjs`（壳层、资料、汇率走查）、`v9-media-consent.mjs`（头像授权确认框与选择器联动）、`v9-set-file.mjs`（授权后选图回填头像）与全部截图，可用于回归；`_qa/edge-*` 为无头浏览器临时目录，用后清理。
- **公网部署（2026-10-20 18:55）**：云端已确认 `mint-core`、`mint-notify` 与 6 张 schema 存在（`cli cloud functions --list ... --cloud`）；正式包生成于 `unpackage/dist/build/mp-weixin`，包内无 `127.0.0.1:7000` 与 `localhost`，云调用端点统一为 `https://env-00jy6ydc58ll.api-hz.cloudbasefunction.cn`；公网网关 DNS/TLS 可连通。**尚未完成**：真机端到端登录（需在小程序后台加 request 合法域名，再用真机 `wx.login` 换 code）；支付宝云环境对 Frankfurter 的出站访问（本地 uniCloud 运行时已实测通过，正式环境首开由页面自动请求验证）。

---

## 八、常见问题

**Q：启动时报「uniCloud本地调试服务启动失败：当前项目未关联uniCloud服务空间」？**
A：工程尚未关联云空间。HBuilderX 里右键 `uniCloud-alipay` → 关联云服务空间，选择你已有的空间后重新运行。Web 端用的是内置演示数据，未关联时仅此提示、不影响演示；但小程序端登录与全部数据都走云对象，必须先关联，否则运行会中断。

**Q：控制台反复报 `GET http://127.0.0.1:7000/system/ping net::ERR_CONNECTION_REFUSED`，首页停在「网络开小差了」？**
A：说明你直接打开了开发者工具，而 HBuilderX 的 uniCloud 本地调试服务没有在运行。开发包的云对象固定请求 `127.0.0.1:7000`（控制台通道为 `8090`），这两个端口只由 HBuilderX 在「运行到微信开发者工具」时提供。回到 HBuilderX，确认已关联云空间，执行「运行 → 运行到小程序模拟器 → 微信开发者工具」，然后在开发者工具点「重试」。可在浏览器访问 `http://127.0.0.1:7000/system/ping`，返回 `{"code":0,"message":"服务可用"}` 即就绪。日志里的 `appLaunch with non-empty page stack` 是开发者工具热重启时旧页面栈未清空的系统提示，冷编译一次即消失，与业务代码无关。

**Q：控制台报 `Some selectors are not allowed in component wxss ...`？**
A：uni-app x 的样式隔离 2.0 会为每个组件注入 `@import "/app.wxss"`，其中的 `page` 标签选择器和 `[data-c-h]` 属性选择器会触发微信的这条告警。它只提示「组件内不允许此类选择器」，全局页面样式和组件自身的 class 样式均正常生效，不影响功能与视觉，无需处理。

**Q：小程序里点登录报「Cannot send network request to localhost」或 `obj.getString is not a function`？**
A：前者是微信开发者工具拦了 HBuilderX 的本地联调端口（`127.0.0.1:7000` 为 uniCloud 本地调试服务，`127.0.0.1:8090` 为控制台通道），只出现在开发包。在开发者工具右上角「详情 → 本地设置」勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」，再点「编译」即可。若随后看到 `closeSocket:fail ... close code ... 1006`，那是 uni-app x 开发期控制台 socket 超时后用保留码 `1006` 关闭连接、被开发者工具拒绝所致，属开发通道噪音，不影响业务，清空控制台重跑即可。后者是早期版本错误处理未兜底网络异常，已修复。正式包不请求本地端口，走云空间网关；手机/公网使用请按第三节第 3 小节操作（加入 request 合法域名并导入 `unpackage/dist/build/mp-weixin`）。

**Q：自动预览报 `unpackage/dist/dev/mp-weixin/app.json` 未找到？**
A：`miniprogramRoot` 是相对**当前开发者工具项目根目录**的路径，三个 `project.config.json` 不能混用：① 工程根目录的配置写 `"unpackage/dist/dev/mp-weixin/"`；② 开发包 `unpackage/dist/dev/mp-weixin/project.config.json` 写 `"./"`；③ 正式包 `unpackage/dist/build/mp-weixin/project.config.json` 写 `"./"`。如果开发者工具打开的是正式包目录，而包内配置仍指向 `unpackage/dist/dev/mp-weixin/`，就会报这个错（目录按正式包为基准，根本不存在）。本次已把开发包和正式包都改为 `"./"`；改完需在开发者工具里关闭项目再重新打开，配置才会重新读取。另注意每次「发行 → 微信小程序」都会覆盖正式包配置，发行后要再改一次。

**Q：小程序端登录报「云端尚未配置微信 AppSecret」？**
A：按第三节第 3 步填写 `mint-core/config.js` 的 `APP_SECRET` 并重新上传部署。

**Q：微信订阅消息收不到？**
A：依次检查：① 模板 ID 三处是否一致；② `mint-notify` 是否已上传（带定时触发器）；③ 模板字段名与 `SUBSCRIBE_DATA_KEYS` 是否匹配；④ 预算使用率是否达到提醒线；⑤ `mint-alert-log` 里本月是否已有记录（有则说明已发过，去重生效）。

**Q：点头像的「拍照 / 从相册选择」为什么没弹授权，直接打开了相机/相册？**
A：当前版本第一次选择会先弹 Mint 自己的「允许访问相机和相册」确认框，同意后才继续；它每个设备只问一次（本地标记 `mint_media_consent_v1`）。若连应用内确认框都没看到：① 这台设备此前已同意过，删除小程序或清除微信缓存后重进即可复现；② 开发者工具跑的是旧编译产物，回到 HBuilderX 重新「运行到小程序模拟器」。若应用内确认框出现而**微信官方**隐私框没出现：检查公众平台《用户隐私保护指引》是否已声明「摄像头」和「选中的照片或视频信息（相册）」并审核生效，以及该微信用户是否已同意过官方协议；真机控制台的 `[mint privacy] needAuthorization=... contract=...` 会给出判断。微信没有独立「相册 scope」，官方框也不会每次选择都弹，这与平台机制一致。

**Q：想重置演示数据？**
A：Web 演示数据存于内存，刷新页面即重置。