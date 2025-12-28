const path = require('path');
const express = require('express');
const totpService = require('./services/totpService');

const DEFAULT_ISSUER = process.env.TOTP_DEFAULT_ISSUER || 'TOTP Server';
const DEFAULT_ACCOUNT = process.env.TOTP_DEFAULT_ACCOUNT || 'user';

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/ui', express.static(path.join(__dirname, 'public')));

// 路由
app.get('/', (req, res) => {
  res.json({
    message: 'TOTP服务器正在运行',
    endpoints: {
      generate: 'POST /api/totp/generate',
      verify: 'POST /api/totp/verify',
      verifyDetails: 'POST /api/totp/verify-details',
      currentToken: 'POST /api/totp/current-token',
      qrcode: 'GET /api/totp/qrcode?secret=YOUR_SECRET&issuer=MyApp&account=user',
      qrcodeDataURL: 'GET /api/totp/qrcode-dataurl?secret=YOUR_SECRET',
      config: 'GET /api/totp/config'
    },
    documentation: '使用说明请参考 README.md'
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// TOTP生成端点
app.post('/api/totp/generate', async (req, res) => {
  try {
    const { issuer, account } = req.body;
    const result = await totpService.generateSecret(issuer, account);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TOTP验证端点（简单）
app.post('/api/totp/verify', async (req, res) => {
  try {
    const { secret, token, issuer, account } = req.body;
    const isValid = await totpService.verifyToken(secret, token, issuer, account);
    res.json({ valid: isValid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// TOTP验证端点（详细）
app.post('/api/totp/verify-details', async (req, res) => {
  try {
    const { secret, token, issuer, account } = req.body;
    const result = await totpService.verifyTokenWithDetails(secret, token, issuer, account);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取当前有效令牌
app.post('/api/totp/current-token', async (req, res) => {
  try {
    const { secret, issuer, account } = req.body;
    const token = await totpService.getCurrentToken(secret, issuer, account);
    res.json({ secret: secret || null, currentToken: token, timestamp: Date.now() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 二维码生成端点（PNG图片）
app.get('/api/totp/qrcode', async (req, res) => {
  try {
    const { secret, issuer = DEFAULT_ISSUER, account = DEFAULT_ACCOUNT } = req.query;
    await totpService.generateQRCode(secret, issuer, account, res);
  } catch (error) {
    if (res.headersSent) {
      console.error('生成二维码时出错（响应头已发送）:', error.message);
      res.end();
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// 二维码生成端点（Base64数据URL）
app.get('/api/totp/qrcode-dataurl', async (req, res) => {
  try {
    const { secret, issuer = DEFAULT_ISSUER, account = DEFAULT_ACCOUNT } = req.query;
    const dataURL = await totpService.generateQRCodeDataURL(secret, issuer, account);
    res.json({
      success: true,
      dataURL: dataURL,
      secret: secret || null,
      issuer: issuer,
      account: account
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取TOTP配置
app.get('/api/totp/config', (req, res) => {
  try {
    const config = totpService.getConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新TOTP配置（需要授权，此处为简单实现）
app.post('/api/totp/config', (req, res) => {
  try {
    // 注意：在生产环境中，此处应添加身份验证
    const newConfig = req.body;
    totpService.updateConfig(newConfig);
    res.json({
      success: true,
      message: '配置已更新',
      config: totpService.getConfig()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`=======================================`);
  console.log(`TOTP服务器运行在 http://localhost:${PORT}`);
  console.log(`API文档: http://localhost:${PORT}`);
  console.log(`健康检查: http://localhost:${PORT}/health`);
  console.log(`=======================================`);
  console.log(`示例请求:`);
  console.log(`生成密钥: curl -X POST http://localhost:${PORT}/api/totp/generate -H "Content-Type: application/json" -d '{"issuer":"MyApp","account":"user@example.com"}'`);
  console.log(`验证令牌: curl -X POST http://localhost:${PORT}/api/totp/verify -H "Content-Type: application/json" -d '{"secret":"YOUR_SECRET","token":"123456"}'`);
  console.log(`=======================================`);
});
