# TOTP 服务器

一个基于 Express 的简单 TOTP (Time-based One-Time Password) 服务，提供密钥生成、令牌验证、二维码输出与配置管理接口。

## 功能
- 生成 TOTP 密钥、otpauth URL 与当前令牌
- 校验用户提交的令牌（简版与详情版）
- 输出二维码（PNG 或 Base64 Data URL）方便在验证器中扫码
- 获取/更新 TOTP 配置（步长、位数、算法等）
- 健康检查与服务自描述首页

## 环境要求
- Node.js >= 14
- npm >= 6（或使用 pnpm/yarn 也可）

## 初始化
```bash
npm install
```

## 启动
```bash
# 默认端口 3000，可通过环境变量 PORT 覆盖
npm start
# 或开发快速启动
npm run dev
```
服务启动后访问首页查看可用端点：
- http://localhost:3000/
- 健康检查: http://localhost:3000/health
- 可视化测试页: http://localhost:3000/ui

## 环境变量
- `PORT`：服务端口，默认 3000
- `TOTP_DEFAULT_ISSUER`：默认发行者（issuer），默认 `TOTP Server`
- `TOTP_DEFAULT_ACCOUNT`：默认账户标识（account），默认 `user`
- `TOTP_WINDOW`：TOTP 验证窗口大小，默认 `1`
- `TOTP_DIGITS`：令牌位数，默认 `6`
- `TOTP_DB_PATH`：SQLite 文件路径，默认 `./totp.db`
- `TOTP_REDIS_URL`：Redis 连接串（可选，未配置则仅用 SQLite）

密钥生成会以 `issuer+account` 为键持久化到 SQLite，并可选使用 Redis 做缓存。

## API 概览
所有请求和响应均为 JSON，除二维码 PNG 接口外。

- 生成密钥: POST /api/totp/generate
- 验证令牌（简版）: POST /api/totp/verify（可传 secret，或使用 issuer+account 读取已持久化的 secret）
- 验证令牌（详情）: POST /api/totp/verify-details（同上）
- 获取当前令牌: POST /api/totp/current-token
- 二维码 PNG: GET /api/totp/qrcode?secret=...&issuer=...&account=...
- 二维码 Data URL: GET /api/totp/qrcode-dataurl?secret=...&issuer=...&account=...
- 获取配置: GET /api/totp/config
- 更新配置: POST /api/totp/config

## 请求示例

### 1) 生成密钥
```bash
curl -X POST http://localhost:3000/api/totp/generate \
  -H "Content-Type: application/json" \
  -d '{"issuer":"MyApp","account":"user@example.com"}'
```
响应示例（部分字段）：
```json
{
  "success": true,
  "secret": "KZXW6...",
  "otpauth": "otpauth://totp/user@example.com?secret=...&issuer=MyApp",
  "currentToken": "123456",
  "issuer": "MyApp",
  "account": "user@example.com",
  "digits": 6,
  "step": 30,
  "algorithm": "sha1"
}
```

### 2) 简单验证令牌
```bash
curl -X POST http://localhost:3000/api/totp/verify \
  -H "Content-Type: application/json" \
  -d '{"secret":"YOUR_SECRET","token":"123456"}'
```
响应：
```json
{ "valid": true }
```

### 3) 详细验证令牌（含窗口偏移）
```bash
curl -X POST http://localhost:3000/api/totp/verify-details \
  -H "Content-Type: application/json" \
  -d '{"secret":"YOUR_SECRET","token":"123456"}'
```
响应示例：
```json
{
  "valid": true,
  "windowUsed": 0,
  "currentToken": "123456",
  "nextToken": "654321",
  "timestamp": 1710000000000,
  "message": "令牌有效"
}
```

### 4) 获取当前有效令牌
```bash
curl -X POST http://localhost:3000/api/totp/current-token \
  -H "Content-Type: application/json" \
  -d '{"secret":"YOUR_SECRET"}'
```

### 5) 获取二维码
- PNG: 直接在浏览器访问
  - http://localhost:3000/api/totp/qrcode?secret=YOUR_SECRET&issuer=MyApp&account=user@example.com
- Data URL（返回 JSON 包含 dataURL）
  - http://localhost:3000/api/totp/qrcode-dataurl?secret=YOUR_SECRET&issuer=MyApp&account=user@example.com

### 6) 配置管理
- 查看配置
```bash
curl http://localhost:3000/api/totp/config
```
- 更新配置（示例：改为 8 位令牌、60 秒步长）
```bash
curl -X POST http://localhost:3000/api/totp/config \
  -H "Content-Type: application/json" \
  -d '{"digits":8,"step":60}
```
> 生产环境应在此接口添加鉴权。

## 在代码中直接使用
可以直接复用服务层逻辑，示例：
```javascript
const totpService = require('./services/totpService');

// 生成密钥
const { secret, otpauth } = totpService.generateSecret('MyApp', 'user@example.com');

// 验证令牌
const ok = totpService.verifyToken(secret, '123456');
console.log('是否有效', ok);

// 获取当前令牌
console.log('当前令牌', totpService.getCurrentToken(secret));
```
对应实现见 [services/totpService.js](services/totpService.js) 与路由入口 [index.js](index.js)。

## 目录结构
- [index.js](index.js): Express 入口与路由
- [services/totpService.js](services/totpService.js): TOTP 业务逻辑
- [package.json](package.json): 项目元数据与脚本

## 常见问题
- 返回 400 缺少参数：检查请求体或查询参数是否完整。
- 二维码接口无响应：确认 `secret` 是否传入，PNG 接口直接输出图片不返回 JSON。
- 时钟偏移导致验证失败：可在配置中调整 `window` 或 `step`，并同步服务器时间。

## 许可证
MIT
