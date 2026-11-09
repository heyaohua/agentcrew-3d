# Observer Work / Rest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 用亮屏工位和喝茶、游戏休息区表达真实会话状态。
**Architecture:** Observer 模型携带原始状态、过期标记和稳定座位序号；独立的观察动画控制器驱动人物和屏幕，保持普通办公室不变。3D/2D复用状态含义，各自实现绘制。
**Tech Stack:** TypeScript、React、Three.js、Phaser、Vitest。
**Spec:** docs/superpowers/specs/2026-11-05-observer-work-rest-design.md

## Global Constraints
- 只读、现有 Hook 不改、不重启 Agent；保留名字和等待提醒。
- 过期只表示不确定；关闭人物离场但历史保留。
- 不用假事件污染运行中的真实列表；测试事件走隔离场景。

## Review Focus
- 超过八个会话也不重叠占座；工作工位专属，休息家具共享，同一坐点同一时刻仅供一人。
- 轮询与筛选不重置走位或导致座位闪跳。
- working→waiting立即关屏并前往休息，不受旧工作粘滞状态影响。
- 过期/断线冻结位置并停止确定性的工作动画。
- 区域间路径可达，实时工作事件能打断喝茶和游戏。

### Task 1: 共享状态和座位
Files: src/features/observer/model.ts; src/features/retro-office/core/types.ts; tests/unit/observerModel.test.ts
Interface: OfficeAgent.observation?: {state: Observer session state; uncertain: boolean; seat: number}。
- [x] 测试关闭不产生人物、等待保留state、过期标记保留、筛选不改变seat。
- [x] 实现确定性的会话座位与独立于动画的状态元数据。
- [x] Vitest定向验证。

### Task 2: 3D双区和动作
Files: src/features/observer/workRest.ts; src/features/observer/ObserverOffice3D.tsx; src/features/retro-office/objects/agents.tsx; src/features/retro-office/core/types.ts; src/features/observer/ObserverScreen.tsx; tests/unit/observerWorkRest.test.ts
Interface: 独立纯函数layout/simulation，产生RenderAgent位置/动作和screen状态；ObserverOffice3D消费OfficeAgent[]并回调会话选择。
- [x] 先写状态切换、过期冻结、多角色分配和往返路径测试，观察失败。
- [x] 实现按容量扩充个人工位、固定共享休息家具与空座预约、避障走位、工作/喝茶/游戏动作和屏幕开关。
- [x] 对共享AgentModel只增加可选观察动作，不改变原有办公室表现。
- [x] 定向Vitest、类型检查。

### Task 3: 2D双区和动作
Files: src/features/pixel-office/{PixelOffice2D.tsx,types.ts,buildPixelInputs.ts,map/workspaceMap.ts,sim/agentSimulation.ts,scene/PixelOfficeScene.ts}; tests/unit/observerPixelWorkRest.test.ts
Interface: 消费Task1 observation，使用独立观察路径，不影响普通地图。
- [x] 测试工作到休息、等待、过期冻结、12个角色位置。
- [x] 增加茶桌和游戏设施、亮暗屏绘制、休闲动作；真实状态单独保留。
- [x] 定向测试和类型检查。

### Task 4: 验证、部署
- [x] 独立源码复核与状态切换检查。
- [x] lint/typecheck，Webpack生产构建成功。
- [x] 隔离浏览器演练工作↔休息、等待、过期、关闭，两种视图截图和脚本错误检查。
- [x] 仅重启观察服务，真实页面确认并保存结果；提交独立分支，不合并main。


## 实施记录

- 选择独立 ObserverOffice3D 复用现有 AgentModel，避免将观察动画规则嵌入原运行时办公室的庞大控制器；普通办公室保留原路径。
- 用户在可见浏览器演练中纠正：休息区不能是另一排电脑桌。已改为沙发、圆茶几、茶杯、棋盘与纸牌；工作电脑仅保留在工作区。
- 共享状态与座位、3D/2D控制器、独立检查、隔离Chrome演练已完成。已更新观察服务并用可见Chrome核查真实页面，无脚本错误。
- 详细验证范围及全量测试未通过项见 docs/integrations/local-observer.md。

## 共享生活空间纠正

- 按用户纠正，取消一人一套休息家具；改为固定共享长沙发、围合茶几、桌游桌和茶水间。休息座位从家具坐点池分配，离座后释放，满座候座。
- 独立检查发现并修复 2D 沙发朝向与坐点相反、3D 坐姿低于坐垫两处问题。
- 实际浏览器另发现并修复 2D 竖向沙发遮挡人物；新增所有共享坐点与过期状态的层级回归。当前 8 个相关测试文件 56 项通过，类型检查、修改范围 ESLint 和 Webpack 生产构建通过；本轮浏览器与部署验证见 local-observer.md。
