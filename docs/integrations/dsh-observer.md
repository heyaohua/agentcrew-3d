# DSH / DeepSeek Harness 只读接入

AgentCrew 3D 从 `0.1.0-dev.5` 增加 DSH 原生 Cordis 插件。适配依据为 DeepSeek Harness 桌面版 `0.2.1-rc.5` 随应用提供的原生事件源码，不假定其他版本完全兼容。

## 安装与卸载

先启动新版观察服务，再在本仓库运行：

```sh
python3 scripts/dsh-observer.py install --profile desktop
```

安装器只向 `~/.dsh/profiles/desktop/cordis.patch.yml` 追加自己的标记块，并备份原文件；保留已有插件与配置。插件不需要 npm 安装，使用 Node.js 标准库。默认接收器配置位于 `~/.hermes3d-observer/connection.json`；如服务使用自定义状态目录，安装时传入同一个 `--state-dir`。其他 DSH profile 可通过 `--profile` 指定。

桌面版启用配置 HMR 时，修改会自动重新加载；安装器本身不会重启 DSH 或 Agent。加载成功后，状态目录会出现 `dsh-plugin-status.json`，只含启动时间和收发／失败计数，不含会话正文和令牌。如果没有出现，检查 DSH 插件加载状态；禁用 HMR 的 profile 需要在合适时机重新加载。

已运行的会话在插件加载后产生新原生事件即可接入，不回放历史对话。若正停在插件加载前产生的批准请求，只能等后续事件更新，插件不会凭空补造等待状态。

```sh
python3 scripts/dsh-observer.py uninstall --profile desktop
```

卸载仅移除自己的标记块，备份保留。项目路径写入插件入口，移动仓库后需重新安装。

## 状态依据

| DSH 原生事件 | 看板状态 |
| --- | --- |
| `turn/start`、`step/start`、普通 `tool/call` | 工作；已有未处理等待时保持等待 |
| `approval/asked` | 等待你批准 |
| `approval/decided` | 只解除对应批准 ID；其他等待不受影响 |
| `ask_user_question` 调用 | 等待你回答 |
| 对应 `tool/result` | 工具已返回；提问工具超时返回后也解除前台等待 |
| `turn/end` completed / aborted / error、blocked、max-tokens | 本轮结束 / 中断 / 错误 |
| 已观察会话的 `session/disposed` | 会话关闭，人物退场 |

子 Agent 必须同时有原生子会话来源和当前运行时所有权证据；普通分叉或恢复为独立根会话的旧子会话不冒充正在运行的子 Agent。关闭事件沿用先前记录的父子身份，不依赖已经撤销的所有权。

## 只读与限制

插件只订阅事件、提取白名单元数据、异步上报本机回环接收器；不调用模型，不拦截工具，不作出批准决定，不写入会话，不发送提示词、工具参数、正文或工具输出。需要确认或回答时回到 DSH。

上报有超时和有界队列，不重试旧事件；接收器离线或队列满会增加失败／丢弃计数，不阻断 DSH。事件可能缺失，因此长时间没有新证据会按观察器规则标记状态未知，不能把 DSH 应用进程仍在运行当作某个会话仍在工作。插件重载、应用强制退出或错过关闭事件时也可能先显示状态未知。

独立模拟与自动化验证不等于所有 DSH 版本、所有审批路径或长期真实会话验收。当前实际验证范围见 [版本记录](../releases.md)。
