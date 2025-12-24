const { authenticator, totp } = require('otplib');
const QRCode = require('qrcode');

class TOTPService {
  constructor() {
    // 配置TOTP选项（默认值）
    this.options = {
      step: 30, // 时间步长（秒）
      window: 1, // 验证窗口大小
      digits: 6, // 令牌位数
      algorithm: 'sha1' // 哈希算法
    };

    // 应用配置
    authenticator.options = this.options;
    totp.options = this.options;
  }

  /**
   * 生成新的TOTP密钥
   * @param {string} issuer - 发行者（如：MyApp）
   * @param {string} account - 账户标识（如：user@example.com）
   * @returns {object} 包含密钥和相关信息
   */
  generateSecret(issuer = 'TOTP Server', account = 'user') {
    try {
      // 生成随机密钥
      const secret = authenticator.generateSecret();

      // 生成otpauth URL（用于二维码）
      const otpauth = authenticator.keyuri(account, issuer, secret);

      // 生成一个当前令牌（用于测试）
      const currentToken = authenticator.generate(secret);

      return {
        success: true,
        secret: secret,
        otpauth: otpauth,
        currentToken: currentToken,
        issuer: issuer,
        account: account,
        digits: this.options.digits,
        step: this.options.step,
        algorithm: this.options.algorithm,
        instructions: '将此密钥添加到您的认证应用（如Google Authenticator、Authy等）'
      };
    } catch (error) {
      throw new Error(`生成密钥失败: ${error.message}`);
    }
  }

  /**
   * 验证TOTP令牌
   * @param {string} secret - TOTP密钥
   * @param {string} token - 用户提供的令牌
   * @returns {boolean} 令牌是否有效
   */
  verifyToken(secret, token) {
    try {
      if (!secret || !token) {
        throw new Error('缺少secret或token参数');
      }

      // 验证令牌
      const isValid = authenticator.verify({ token, secret });
      return isValid;
    } catch (error) {
      throw new Error(`验证令牌失败: ${error.message}`);
    }
  }

  /**
   * 验证令牌并返回详细信息
   * @param {string} secret - TOTP密钥
   * @param {string} token - 用户提供的令牌
   * @returns {object} 验证结果和详细信息
   */
  verifyTokenWithDetails(secret, token) {
    try {
      if (!secret || !token) {
        throw new Error('缺少secret或token参数');
      }

      // 验证令牌
      const isValid = authenticator.verify({ token, secret });

      // 如果无效，检查是否在时间窗口内
      let windowUsed = 0;
      if (!isValid && this.options.window > 0) {
        for (let i = -this.options.window; i <= this.options.window; i++) {
          if (i === 0) continue;
          const checkToken = authenticator.generate(secret, { epoch: Date.now() / 1000 + i * this.options.step });
          if (checkToken === token) {
            windowUsed = i;
            break;
          }
        }
      }

      // 生成当前有效令牌（用于参考）
      const currentToken = authenticator.generate(secret);
      const nextToken = authenticator.generate(secret, { epoch: Date.now() / 1000 + this.options.step });

      return {
        valid: isValid || windowUsed !== 0,
        windowUsed: windowUsed,
        currentToken: currentToken,
        nextToken: nextToken,
        timestamp: Date.now(),
        message: windowUsed !== 0 ? `令牌在时间窗口 ${windowUsed} 内有效` : (isValid ? '令牌有效' : '令牌无效')
      };
    } catch (error) {
      throw new Error(`验证令牌失败: ${error.message}`);
    }
  }

  /**
   * 生成二维码图片（PNG格式）
   * @param {string} secret - TOTP密钥
   * @param {string} issuer - 发行者
   * @param {string} account - 账户标识
   * @param {object} res - Express响应对象
   */
  async generateQRCode(secret, issuer, account, res) {
    try {
      if (!secret) {
        throw new Error('缺少secret参数');
      }

      // 生成otpauth URL
      const otpauth = authenticator.keyuri(account, issuer, secret);

      // 设置响应头为PNG图片
      res.setHeader('Content-Type', 'image/png');

      // 生成二维码并直接发送到响应
      await QRCode.toFileStream(res, otpauth, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (error) {
      throw new Error(`生成二维码失败: ${error.message}`);
    }
  }

  /**
   * 生成二维码数据URL（base64）
   * @param {string} secret - TOTP密钥
   * @param {string} issuer - 发行者
   * @param {string} account - 账户标识
   * @returns {Promise<string>} 二维码数据URL
   */
  async generateQRCodeDataURL(secret, issuer, account) {
    try {
      if (!secret) {
        throw new Error('缺少secret参数');
      }

      const otpauth = authenticator.keyuri(account, issuer, secret);
      const dataURL = await QRCode.toDataURL(otpauth, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      return dataURL;
    } catch (error) {
      throw new Error(`生成二维码数据URL失败: ${error.message}`);
    }
  }

  /**
   * 生成当前有效令牌
   * @param {string} secret - TOTP密钥
   * @returns {string} 当前有效令牌
   */
  getCurrentToken(secret) {
    try {
      return authenticator.generate(secret);
    } catch (error) {
      throw new Error(`生成当前令牌失败: ${error.message}`);
    }
  }

  /**
   * 获取TOTP配置信息
   * @returns {object} TOTP配置
   */
  getConfig() {
    return { ...this.options };
  }

  /**
   * 更新TOTP配置
   * @param {object} newOptions - 新配置选项
   */
  updateConfig(newOptions) {
    this.options = { ...this.options, ...newOptions };
    authenticator.options = this.options;
    totp.options = this.options;
  }
}

// 导出单例实例
module.exports = new TOTPService();