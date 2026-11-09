# 参与 AgentCrew 3D

欢迎通过本仓库的 Issue / Pull Request 提交问题和改进。请先阅读 [README](README.md) 和 [本地观察接入说明](docs/integrations/local-observer.md)。

## 本地运行

```sh
git clone https://github.com/heyaohua/agentcrew-3d.git
cd agentcrew-3d
npm ci
npm run observe
```

打开 `http://127.0.0.1:3000/observe`。观察模式不需要 Gateway；开发原 Hermes3D Studio 功能时，参考 [上游 README](README.hermes3d.md)。

## 提交要求

- 保持观察模式只读；不要把无事件、进程存活或回合结束解释成任务成功。
- 不记录或提交提示词、工具参数、输出、会话快照、接收令牌、个人路径及真实会话截图。
- 保留已有 Hook；卸载只移除本项目管理的条目。
- 为状态和权限变化提供对应测试。界面变化要实看浏览器，分别说明模拟与真实验证。
- 保留 Hermes3D 来源、原作者版权及 MIT 许可文本；引入素材时说明来源和许可。
- 提交小而明确的改动，说明变更原因、验证结果及未验证范围。不要降低断言或跳过失败来包装通过。

## 常用检查

```sh
npm run typecheck
npm run test:observer
python3 -m unittest discover -s tests/observer -p 'test_*.py'
npx vitest run tests/unit/observer*.test.ts
npm run build -- --webpack
```

完整检查还有 `npm run lint`、`npm run test -- --run` 和 `npm run e2e`。E2E 需先安装 Playwright 浏览器；上游历史失败应如实记录。

安全漏洞请遵循 [SECURITY.md](SECURITY.md)，不要在公开 Issue 中附带凭证或可直接利用的细节。
