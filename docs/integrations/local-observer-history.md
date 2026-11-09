> 历史设计与验证记录。部分状态规则已被后续章节修正；当前用法以 [接入说明](local-observer.md) 为准。

# 本机终端观察室

观察 Codex、Claude Code、Kimi Code 的会话活动。所有确认、提问回答与继续操作仍在原终端进行；此模式不连接模型、不发送任务、不替用户批准操作。

## 启动

要求 Node.js 20+、npm 10+。Hook 辅助程序要求 Python 3.11+（使用标准库，无需 pip 安装）。

```sh
npm ci
npm run observe
```

打开 `http://localhost:3000/observe`。可通过 `PORT` 修改端口。观察入口仅在带 `--observe` 启动时启用；普通 `npm run dev` 不启动接收器。

默认状态目录：`~/.hermes3d-observer`，可用 `OBSERVER_STATE_DIR` 覆盖。该目录包含私有接收令牌、连接参数和仅含元数据的状态快照。不要上传或提交这个目录。

使用默认本机 HTTP 监听即可。若选择 HTTPS，需要本机 Python 信任证书；辅助程序不会绕过证书检查。Studio 启用网络访问认证时，状态读取仍受其认证保护；Hook 入口另要求回环来源和独立令牌。

## 追加 Hook

先运行上述服务，再用本机可用的 Python 3.11+ 执行：

```sh
python3 scripts/observer-hooks.py install --tool codex
python3 scripts/observer-hooks.py install --tool claude
python3 scripts/observer-hooks.py install --tool kimi
```

安装器会保留现有 Hook，只追加带专用标记的观察命令，并在修改前生成旁边的 `.observer-backup-时间-随机值` 文件。重复安装不会重复添加。

Codex 的新版本还会单独校验 Hook 信任。若已安装但没有事件，在 Codex 的 Hook 管理界面核对并信任这些观察命令；不要使用全局绕过 Hook 信任的选项。重新安装改变命令路径后可能需要重新信任。

Hook 命令固定引用当前 Python 和脚本的绝对路径，因此请保留此工作树；若移动目录，重新运行安装。若使用自定义状态目录，安装时也传入 `--state-dir /absolute/path`。已有终端会话可能需要重新加载或重启才能识别新 Hook，观察服务不会自动操作这些会话。

## 大屏行为

- 每个“工具 + 原生会话 ID”独立出现，可同时观察同一工具的多个项目。
- 右侧卡片显示工具、项目、会话 ID、最近事件和更新时间，点击可查看完整项目路径与会话 ID，供返回终端定位。
- `PermissionRequest` 显示“等待你确认”；已识别的结构化提问显示“等待你回答”。
- 新提示词、工具执行结果等明确进展会更新状态；普通 PreToolUse 不能清除原有等待。存在工具调用 ID 时按调用对应，多个并发待确认需分别结束；缺少调用 ID 时按工具名称匹配，无法区分同名并行调用。
- Stop 仅表示“本轮已结束”，不代表项目已完成、成功或验收通过。
- 超过 120 秒没有事件显示“状态可能过期”。长时间思考或工具执行也可能暂时没有事件，这不是进程退出的证据。
- 服务重启后恢复的记录标为过期，直到新事件到达。浏览器断线会停止把已有记录当作实时工作状态。
- 只有新事件才能发现会话，不扫描所有旧对话。自然语言回复中的问题不做语义猜测；子 Agent 只有独立原生会话事件时才独立出现。

保存最多 200 个最近更新的会话，每个会话最多 12 条元数据事件。历史结束会话可在页面中隐藏。

## 数据范围与失败行为

只允许工具名称、会话 ID、工作目录、事件类别、被调用工具名称、调用 ID、时间和事件 ID。原始提示词、命令参数、工具输出、完整对话和账号凭证不进入大屏。

Hook 只向回环地址上报。接收器认证、请求大小和字段验证均有测试。单次网络等待上限 0.6 秒，Hook 超时配置 2 秒；服务未启动或事件无法识别时静默退出，不改变原工具的确认规则。

## 局域网只读展示

明确需要无口令的局域网大屏时，可在已有生产构建上运行：

```sh
HOST=0.0.0.0 PORT=5297 node server/index.js --observe --observe-public
```

通过 `http://<本机局域网IP>:5297/observe` 查看。此模式仅开放观察页面、状态读取和显示资源；运行时办公室、其他 API、非读取请求和 WebSocket 均禁止。事件接收仍要求回环来源与独立 Hook 令牌，远程浏览器不能提交事件或控制 Agent。能够连接此端口的人可以查看会话状态与项目路径。去掉 `--observe-public` 并恢复 `HOST=127.0.0.1` 即回到本机模式。

## 卸载与回退

```sh
python3 scripts/observer-hooks.py uninstall --tool codex
python3 scripts/observer-hooks.py uninstall --tool claude
python3 scripts/observer-hooks.py uninstall --tool kimi
```

卸载仅移除本功能标记的 Hook，保留其他配置。停止当前观察服务即可关闭大屏接收器。已有状态目录可保留供下次使用；需要回退配置时先比较对应备份，避免覆盖安装后用户新增的其他设置。

## 验证

```sh
npm run test:observer
python3 -m unittest discover -s tests/observer -p 'test_*.py'
npx vitest run tests/unit/observerModel.test.ts
npm run typecheck
```

HTTP/状态测试和模拟事件回放不等于真实 CLI 验证。部署记录应分别列出三种工具实际产生的事件，以及真实等待确认后恢复是否完成。不要把手工发出的 PermissionRequest 当作工具真实弹出的确认。

局域网验收应使用实际 IP 地址在浏览器里检查样式、脚本、3D 场景、2D 切换和会话详情，不能仅以 HTML 或状态接口返回 200 作为页面可用证据。HTTP 公开观察模式会在响应发送时去除生产构建中要求 HTTPS 升级的指令及 HSTS，保留其余 CSP；否则浏览器可能把子资源升级到没有 TLS 的端口，出现 `ERR_SSL_PROTOCOL_ERROR` 和无样式页面。HTTPS 模式及原 Studio 策略保持不变。


## 工作与休息的场景表现

观察视图将工作区与休息区分开。收到明确的工作状态后，人物走到自己工位、坐下，电脑屏幕亮起；就绪、回合结束、中断或等待处理时，电脑熄屏，人物走到休息区喝茶或玩实体桌游。休息区使用沙发、茶几、茶具和纸牌/棋盘，不放电脑或电子屏。

- 等待处理保留金色提示，错误保留红色提示。休闲动作不是终端实际行为。
- 过期或断连暂停确定性活动并显示状态待更新，保留当前坐标；不能据此判断任务完成。
- 已关闭会话不再绘制人物；列表保留历史。隐藏结束记录不会改变其他会话的座位。
- 工作区按会话数扩充个人工位；休息区固定布置共享长沙发、围合茶几、桌游桌和茶水台，按家具坐点分配空位，不按会话复制家具。座位满时在过道候座；3D 和 2D 使用相同的状态含义。
- 此功能不修改 Hook、不添加控制终端的能力，也不要求重启 Agent。

2026-11-05 上一版验证（共享休息区纠正前）：定向状态与两种动画控制器测试通过，独立核查 47 项通过；生产 Webpack 构建、类型检查和修改文件 ESLint 通过。可见 Chrome 使用仅在测试浏览器内替换的状态完成工作/休息往返、等待、错误、过期及 12 人场景演练，未向真实接收器注入模拟会话。完整 Vitest 首次无沙箱回归为 1236 通过、2 失败：既有 colorSemanticsGuard 的 GatewayConnectScreen 原始色值违规；hermesAgentBridge 的 chat.abort WebSocket 404 单独复跑 29/29 通过。这不代表完整测试套件全绿或全部工具真人审批闭环验收。

上一版部署：已仅重启观察服务，并用可见 Chrome 打开实际局域网页面，确认双区、真实会话列表和等待提醒正常，无脚本错误。亮屏与工作/休息转场证据来自隔离演练；不将其冒充所有真实 Agent 的完整状态闭环。


### 共享休息区纠正（2026-11-05）

休息家具改为固定共享布局：3D 有大 L 型沙发、共用茶几、沿墙茶水台、对坐桌游沙发和阅读长椅；2D 有共享 L 型沙发、窗边长沙发及茶水设施。工位仍一人一机。空闲人物使用家具的空坐点，返工离座后释放；冻结状态保留位置和占位，满座在过道候座，不复制家具。

独立检查修复三处实际问题：2D 沙发朝向、3D 坐垫高度、2D 竖向沙发遮挡人物。最后一项由可见浏览器截图发现，新增层级回归后重拍，不能仅用状态逻辑测试替代视觉检查。当前 8 个相关测试文件 56/56 通过，类型检查、修改范围 ESLint、Webpack 生产构建通过。独立 QA 另行复核 28 个 3D 坐点、过期占位，以及 2D 观察专用深度处理。

本轮可见 Chrome 实拍覆盖 12 人与 24 人隔离场景、工作与休息往返、2D 左右/底部沙发有人及过期冻结，无控制台错误。独立 QA 确认修后人物身体可见、3D 共用沙发和多人桌游可辨；24 人密集名牌仍会挤压，这是剩余体验限制。模拟状态仅在测试浏览器内拦截，未注入真实接收器。

最终生产构建后仅重启观察服务，实际局域网 `/observe` 的 3D/2D 页面已在可见 Chrome 中检查，无脚本错误，真实会话和等待提醒正常显示。当前真实页面存在过期会话，保留原状态提示；不据此声称全部真实工具的工作往返已闭环。验证证据分别保留于临时目录 `hermes-shared-lounge-browser`（首次发现遮挡）、`hermes-shared-lounge-verified`（修后隔离演练）、`hermes-shared-lounge-live`（真实局域网页面）。未重启用户 Agent。

真实页面首次加载还发现：2D 过期会话初始化在过道，导致休息区空置。已修为无历史位置的新过期人物优先分配共享空坐点后冻结；既有人物在工作/行走时过期仍冻结旧坐标。新增 27 人初始化测试验证 24 座加 3 候座，独立 QA 另外核验行走、工作及恢复边界。最终相关测试为 56/56，通过再次构建并更新观察服务后复查。

最后一次真实 LAN 复拍确认 2D 过期人物已分布在共享沙发坐点，实时工作人物可返回工位；两种视图无脚本错误。末次证据目录为 `hermes-shared-lounge-live-final`。

## 子 Agent 与状态可信度（2026-11-05）

事件契约向后兼容：新增 `SubagentStart`、`SubagentStop`；可选 `agentId`、`agentType`、`processInfo: {pid,start}`。子事件必须有 agentId。主会话沿用原身份，子身份按工具、父会话 sessionId、agentId 区分；子 Agent 的等待和结束不覆盖父会话。Codex 已知子线程的直接 sessionId 工具事件归回同一子身份，避免重复人物。HTTP 入口仍只接受带独立接收令牌的 loopback 上报。

接收器输出 `parentId`、`activeChildren`、`freshness`（fresh/process/unknown/settled）、`silent`、`processAlive`。不对页面暴露 processInfo。进程凭据只由本机 Hook 从祖先进程取得 PID 与启动时间，不采集命令行参数、环境变量或正文；接收器核对精确 PID/启动时间，避免 PID 重用。原状态已是 working、进程仍存活且未收到结束事件时，两分钟静默不会自动变成休息；updatedAt 仍为真实事件时间，不生成心跳事件。进程存活本身不会把 waiting/ended 等状态改成 working。没有进程证据的静默、服务恢复的未确认运行态、进程退出/断开均标 unknown。结束/中断/错误/关闭是明确状态，不因时间流逝抹去。

界面分别统计主会话、子 Agent、工作中与状态未知。未知状态只在列表保留最后记录，不在工作/休息场景虚构人物活动，不计作当前待批准；原待批准记录仍可查。默认隐藏已结束、中断、关闭历史，可取消筛选查看。父会话的子 Agent 工作数单独展示，不冒充父会话本身正在执行。

上游字段依据：[Codex Hook 文档](https://developers.openai.com/codex/hooks/) 与 [Claude Code Hook 文档](https://code.claude.com/docs/en/hooks)。Hook 上报不包含 transcript、prompt、tool_input、tool_response、last_assistant_message；下述 Codex 兼容层仅在本机有界读取会话文件尾部，提取白名单生命周期元数据，不上传、不保留正文。Kimi 仅保留实际支持的会话事件，不假定其具有同名子 Agent 生命周期 Hook。

兼容旧 Codex 进程：真实验证中，已有工具 Hook 可携带 agent_id，但当前轮次缓存旧配置时，新增 SubagentStop 未到达。因此增加本机只读生命周期校正，只针对接收器已经知道的 Codex UUID，在标准 sessions 目录索引同名记录；提取 task_started/task_complete/turn_aborted 的类型、时间和 turn_id。不会保存、上报对话、工具参数或输出。每文件读取上限 512 KiB，有界缓存；非 UUID、符号链接目录、非 Codex 会话不走此通道。快照标记 source=codex-lifecycle，较旧记录不能覆盖较新 Hook，下一轮不会继承上轮已经结束的权限等待。此格式不是上游稳定 API；解析失败时保留 Hook 证据或 unknown，不编造完成。

验证策略按 API 工程技能执行，沿用本地接收器隔离 HTTP 测试，未建立公网 Webhook 或上传本机状态。Postman CLI status 在当前环境报 SecItemCopyMatching -50 并退出 139，故不宣称 Postman 执行通过。

独立 QA 额外复核并修复了旧身份合并、嵌套父关联、无 ID 权限请求解除、尾窗移动与乱序回退。reader 以 inode/dev/文件长度及旧末尾 hash 判断追加连续性，缓存按时间单调更新；已确认生命周期另存白名单字段供服务重启恢复，仍保留原 Hook lastEvent 契约。

真实验证已观察到现有 Codex 游戏会话多个子 Agent 的独立工具事件、父关联和进程证据，以及本机 task_complete 将实际结束的子 Agent 校正为结束。新起只读 Codex 验收进程在模型请求阶段连续网络超时，已只终止该测试进程；因此 SubagentStart/Stop 原生事件已实现并通过契约回放，但新进程原生完整生命周期不宣称真实通过。Claude 子生命周期配置与归一化/接收器通过测试，未新开真人 Claude 子任务；Kimi 未宣称支持未观察到的子生命周期。

最终验证：接收器/进程/生命周期相关 26 项、Python Hook 8 项、前端及像素回归 59 项通过（合计 93 项）；类型检查、修改范围 ESLint、Webpack 生产构建通过，独立 QA 指定范围复核通过。可见 Chrome 在实际局域网检查 3D/2D、父子标签、未知计数和历史筛选，无脚本错误。重启后真实 QA 子 Agent 仍为 ended，来源明确为 codex-lifecycle；游戏子 Agent 工作状态独立显示。清理了网络超时后已停止的唯一自建 CLI 验收记录，保留其私有备份，未删除用户会话或重启用户 Agent。
