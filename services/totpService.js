const { authenticator, totp } = require('otplib');
const QRCode = require('qrcode');
const persistence = require('./persistence');

const parsePositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const DEFAULT_ISSUER = process.env.TOTP_DEFAULT_ISSUER || 'TOTP Server';
const DEFAULT_ACCOUNT = process.env.TOTP_DEFAULT_ACCOUNT || 'user';
const DEFAULT_WINDOW = parsePositiveInt(process.env.TOTP_WINDOW, 1);
const DEFAULT_DIGITS = parsePositiveInt(process.env.TOTP_DIGITS, 6);

class TOTPService {
  constructor() {
    // 配置TOTP选项（默认值）
    this.options = {
      step: 30, // 时间步长（秒）
      window: DEFAULT_WINDOW, // 验证窗口大小
      digits: DEFAULT_DIGITS, // 令牌位数
      algorithm: 'sha1' // 哈希算法
    };

    // 应用配置
    authenticator.options = this.options;
    totp.options = this.options;
  }

  async resolveSecret(providedSecret, issuer, account) {
    if (providedSecret) return providedSecret;
    if (issuer && account) {
      const stored = await persistence.getSecret(issuer, account);
      if (stored) return stored;
    }
    throw new Error('缺少secret参数');
  }

  /**
   * 生成新的TOTP密钥
   * @param {string} issuer - 发行者（如：MyApp）
   * @param {string} account - 账户标识（如：user@example.com）
   * @returns {Promise<object>} 包含密钥和相关信息
   */
  async generateSecret(issuer = DEFAULT_ISSUER, account = DEFAULT_ACCOUNT) {
    try {
      const secret = authenticator.generateSecret();
      const otpauth = authenticator.keyuri(account, issuer, secret);
      const currentToken = authenticator.generate(secret);

      await persistence.saveSecret(issuer, account, secret);

      return {
        success: true,
        secret,
        otpauth,
        currentToken,
        issuer,
        account,
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
   * @param {string} issuer - 可选，用于从持久化存储读取
   * @param {string} account - 可选，用于从持久化存储读取
   * @returns {Promise<boolean>} 令牌是否有效
   */
  async verifyToken(secret, token, issuer, account) {
    try {
      if (!token) {
        throw new Error('缺少token参数');
      }
      const resolvedSecret = await this.resolveSecret(secret, issuer, account);
      const isValid = authenticator.verify({ token, secret: resolvedSecret });
      return isValid;
    } catch (error) {
      throw new Error(`验证令牌失败: ${error.message}`);
    }
  }

  /**
   * 验证令牌并返回详细信息
   * @param {string} secret - TOTP密钥
   * @param {string} token - 用户提供的令牌
   * @param {string} issuer - 可选，用于从持久化存储读取
   * @param {string} account - 可选，用于从持久化存储读取
   * @returns {Promise<object>} 验证结果和详细信息
   */
  async verifyTokenWithDetails(secret, token, issuer, account) {
    try {
      if (!token) {
        throw new Error('缺少token参数');
      }

      const resolvedSecret = await this.resolveSecret(secret, issuer, account);

      const isValid = authenticator.verify({ token, secret: resolvedSecret });

      let windowUsed = 0;
      if (!isValid && this.options.window > 0) {
        for (let i = -this.options.window; i <= this.options.window; i++) {
          if (i === 0) continue;
          const checkToken = authenticator.generate(resolvedSecret, { epoch: Date.now() / 1000 + i * this.options.step });
          if (checkToken === token) {
            windowUsed = i;
            break;
          }
        }
      }

      const currentToken = authenticator.generate(resolvedSecret);
      const nextToken = authenticator.generate(resolvedSecret, { epoch: Date.now() / 1000 + this.options.step });

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
   */
  async generateQRCode(secret, issuer, account, res) {
    try {
      const resolvedSecret = await this.resolveSecret(secret, issuer, account);
      const otpauth = authenticator.keyuri(account, issuer, resolvedSecret);
      res.setHeader('Content-Type', 'image/png');
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
   */
  async generateQRCodeDataURL(secret, issuer, account) {
    try {
      const resolvedSecret = await this.resolveSecret(secret, issuer, account);
      const otpauth = authenticator.keyuri(account, issuer, resolvedSecret);
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
   */
  async getCurrentToken(secret, issuer, account) {
    try {
      const resolvedSecret = await this.resolveSecret(secret, issuer, account);
      return authenticator.generate(resolvedSecret);
    } catch (error) {
      throw new Error(`生成当前令牌失败: ${error.message}`);
    }
  }

  getConfig() {
    return { ...this.options };
  }

  updateConfig(newOptions) {
    this.options = { ...this.options, ...newOptions };
    authenticator.options = this.options;
    totp.options = this.options;
  }
}

module.exports = new TOTPService();
