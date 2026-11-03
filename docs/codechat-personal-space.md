# CodeChat 个人空间

普通用户在 LibreChat 登录后自动准备个人空间，重新登录复用同一分配。
主界面保留聊天，Coding 切换到共享 OpenHands 编排服务与个人运行环境。
Files 管理个人盘上的源码及上传文件，My applications 管理已经发布的应用，
Databases 管理工程数据库，Storage & plan 显示用量和测试升级。

文件行支持预览、下载、文本编辑、确认删除；编辑及删除校验打开时的版本。
工程虚拟环境、依赖缓存和 Agent 状态保存在个人卷并纳入文件用量。
聊天中可以要求助手编写代码、运行测试，再提交构建、推送私有 Harbor 和部署。
应用页显示进度、失败、清理状态、访问地址、启停、日志与 CPU/内存。

私有对象存储在文件服务就绪后自动准备，一个个人空间一个桶。
Coding 使用 owner-scoped object_cli 运行连接测试；下次发布自动注入桶连接与工程前缀。
普通浏览器接口不返回对象存储凭据，停止或删除应用不删除持久数据。

codechat.storageAccounting.enabled 默认 false，显式开启才显示新账本和对象服务状态；
codechat.capacity.enabled 控制现有套餐入口。配置字段在共享 configSchema 验证。
通过同源 BFF 转发已验证的 OIDC 身份，客户端 subject、价格或任意 URL 不作为权限依据。

五类计量是个人文件、项目数据库、对象版本、Harbor 原生计数与额外应用卷核验。
只有全部新鲜有效时显示完整受管逻辑用量；读取失败保留旧值并标过期。
分类额度独立，不是可挪用的统一硬配额；Harbor 无限额度如实标示。
测试支付只增加文件盘和应用数，不增加对象/镜像/数据库额度或模型余额。
真实付款、对象与镜像扩容、任意额外应用持久卷及回收站尚未接入。

完整手册与协议以相邻 platform-control 仓库 docs/user-guide.md、
docs/storage-accounting-guide.md、docs/storage-accounting-contract.md 为准。
部署验收单独记录，不能用“方案已生成”替代真实环境就绪。
