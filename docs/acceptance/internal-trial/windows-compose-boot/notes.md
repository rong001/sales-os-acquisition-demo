# Windows Compose 启动验收笔记

## 结论摘要

| 项 | 结果 |
|---|---|
| 交付物（Compose + START_WINDOWS + PS1 + example env） | **已交付** |
| 本机（Linux bot）Docker Engine 安装 | 已为验证安装；**非**给 Windows 用户自动安装 |
| 干净项目 `salesos_trial_clean` + 端口 19180/39100 | 已用 |
| 纯 bridge Compose（与 Windows 交付一致） | **本机 FAIL**：容器间 TCP 超时 |
| 业务冒烟（manager 登录 → 分配 → 到期跟进 → 重启保数） | **PASS**（bot 上借助 **未打入用户包** 的 hairpin 覆盖层） |
| **Windows 本机** | **待验** |

## 本机 bridge 失败现象

- `postgres` / `redis` 容器自身 healthcheck 正常。
- 同 bridge 内 `api → redis:6379` / `api → postgres:5432` **TCP timeout**。
- 宿主机访问已发布端口（如 web `:19180`）正常。
- 判断为 bot 环境 Docker bridge/转发异常，**不是** Compose 文件语法问题；`docker compose config` 通过。

## Bot 验证变通（不进入用户包）

`verify-internal-trial-clean/.../docker-compose.internal-trial.bot-hairpin.verify.yml`：

- 临时把 Postgres/Redis 发布到宿主机 `45432` / `46379`
- `api`/`worker` 经 `host.docker.internal` 回连

**Windows Docker Desktop 用户路径仍是原版 `docker-compose.internal-trial.yml`（DB/Redis 不发布）。**

## 冒烟步骤（已执行）

1. manager@demo.local 登录，role=supervisor  
2. 经理分配合成线索给 agent@demo.local  
3. 销售写入 `next_follow_at`（已到期）→ workbench due 可见 → handle  
4. `docker compose stop` + `start`（无 `-v`）→ case 仍在，归属保留  

## 诚实缺口

1. **Windows 宿主机未在此环境实测**（无 Windows / 无 Docker Desktop GUI）。  
2. Bot 上 **nginx `/api` → api:3000** 因 bridge 失败未能验证；Desktop 上通常可用。  
3. 用户包 **不得**依赖 hairpin 覆盖层。  
