# AgentCrew 3D：本地终端接入

观察 Codex、Claude Code、Kimi Code。确认、回答和继续操作始终在原终端完成。观察模式不调用模型，也不会替你批准、取消或派发任务。

## 启动

需要 Node.js 20+、npm 10+；Hook 辅助脚本需要 Python 3.11+，仅使用标准库。

```sh
npm ci
npm run observe
```

打开 `http://127.0.0.1:3000/observe`。`PORT` 可修改端口。接收器只在带 `--observe` 启动时启用。原 Studio / Gateway 功能属于独立模式，见 [上游文档](../../README.hermes3d.md)。

生产运行：

```sh
npm run build -- --webpack
npm run start -- --observe
```

## 安装 Hook

保持服务运行，在另一个终端仅为自己使用的工具执行：

```sh
python3 scripts/observer-hooks.py install --tool codex
python3 scripts/observer-hooks.py install --tool claude
python3 scripts/observer-hooks.py install --tool kimi
```

安装器保留其他配置，只追加带专用标记的命令，并生成 `.observer-backup-时间-随机值` 备份。重复安装不会重复添加。

- Codex 可能要求在 Hook 管理界面审阅并信任新增命令。不要全局绕过 Hook 信任。
- 已启动的 Agent 可能缓存旧配置，需要重新加载或重启。观察服务不会自动重启它们。
- Hook 固定引用安装时 Python 和脚本的绝对路径。项目移动后需要重新安装。
- 默认状态目录 `~/.hermes3d-observer` 为兼容旧安装而保留；自定义 `OBSERVER_STATE_DIR` 时，安装脚本也传入 `--state-dir /absolute/path`。

## 状态怎样解释

| 状态 | 含义与表现 |
| --- | --- |
| 工作中 | 有明确工作事件／生命周期证据；人物前往工位，屏幕亮起 |
| 等待你处理 | 明确的批准请求或已识别结构化问题；金色提醒，操作仍回终端 |
| 就绪／本轮结束 | 可去共享休息区；Stop 不表示任务成功或验收通过 |
| 错误／中断 | 独立保留异常标识，不演出成功庆祝 |
| 未知 | 证据不足、失联或恢复后尚未确认；保留最后记录，不生成确定的工作／休息人物 |
| 关闭 | 不再绘制人物，可在历史中查看 |

普通工具开始事件不会自动清除待批准。支持调用 ID 时按调用匹配；无调用 ID 时按工具名匹配，无法可靠区分所有同名并发请求。

超过 120 秒没有事件不是进程退出的证明。如果原状态是工作中且本机精确 PID／启动时间证据仍有效，可以继续保留工作态；进程存活本身不会把等待或结束改成工作。没有可靠证据则显示未知。浏览器断线时不把旧快照当作实时状态。

主会话、子 Agent 分开计数。子 Agent 必须有可靠身份与生命周期事件；同一父会话的子事件不覆盖父状态。Kimi 不假定具有与其他工具相同的子 Agent Hook。默认隐藏已结束、中断、关闭历史。

最多保存 200 个最近会话，每个会话最多 12 条元数据事件。收工短暂伸展属于装饰过渡，不增加工作人数。

## 数据与兼容校正

Hook 只上报白名单元数据：工具／会话／子 Agent 身份、工作目录、事件类别、被调用工具名、调用 ID、时间和事件 ID，以及用于本机核对的 PID／启动时间。进程凭据不会暴露给页面，不收集完整命令行或环境变量。

为兼容旧 Codex 进程漏报生命周期，接收器可针对**已经知道的 Codex UUID**，在标准 sessions 目录寻找对应记录，有界读取文件尾部（每文件最多 512 KiB），只提取生命周期类型、时间和 turn ID。原始对话、提示词、命令参数和输出不被保存或上传。非 UUID、非 Codex 和符号链接目录不走此通道。

Hook 只发往回环地址，使用独立令牌认证；网络等待上限 0.6 秒，Hook 超时配置 2 秒。服务未启动时静默失败，不改变工具的批准规则。

## 局域网大屏

```sh
npm run build -- --webpack
HOST=0.0.0.0 PORT=5297 npm run start -- --observe --observe-public
```

本机使用 `http://127.0.0.1:5297/observe`，其他设备使用 `http://<当前局域网IP>:5297/observe`。IP 可能随网络变化；其他设备上的 `127.0.0.1` 指的是该设备自己。

此模式无查看口令，仅开放观察页面、状态读取和必要显示资源。原 Studio、其他 API、远程写请求及 WebSocket 被阻止；Hook 接收仍要求回环来源和独立令牌。能够连接此端口的人可以查看项目路径和会话元数据，请只在可信局域网使用。

去掉 `--observe-public`、恢复 `HOST=127.0.0.1` 并重启观察服务即可回到本机模式。无需改动 Agent。

## 常见问题

- **页面打不开**：先试本机固定入口，再确认端口、当前 IP 和服务是否运行。不要继续使用换网前的 IP。
- **页面有文字但没有样式／3D**：检查 JS/CSS 是否加载，HTTP 与 HTTPS 是否混用；仅 HTML 200 不能证明页面可用。
- **列表为空**：等待新事件，检查 Hook 路径、受支持版本及信任状态；可能需要重新加载工具配置。
- **有主 Agent，没有子 Agent**：先确认工具实际提供了独立子身份和事件，不根据终端数量虚构人物。
- **显示未知**：表示证据不足。不要通过增加动画、重放历史或把静默当休息来掩盖。

## 卸载

```sh
python3 scripts/observer-hooks.py uninstall --tool codex
python3 scripts/observer-hooks.py uninstall --tool claude
python3 scripts/observer-hooks.py uninstall --tool kimi
```

仅移除本项目管理的 Hook，保留其他配置。停掉观察服务即可关闭接收器。恢复旧备份前先比较差异，避免覆盖之后新增的配置。

## 验证范围

```sh
npm run test:observer
python3 -m unittest discover -s tests/observer -p 'test_*.py'
npx vitest run tests/unit/observer*.test.ts
npm run typecheck
```

真实工具、隔离模拟、浏览器界面及人工验收分别记录。不要把手工构造的批准事件说成真实 CLI 审批闭环。版本范围见 [releases](../releases.md)，历史设计和失败记录保留在 [历史记录](local-observer-history.md)。

## DSH / DeepSeek Harness

DSH 使用独立的原生 Cordis 插件，安装、卸载及版本限制见 [DSH 接入说明](dsh-observer.md)。不要为 DSH 安装 Claude Hook 或复用其他工具身份。
