const fs = require('fs');
const path = require('path');
const ORIGINAL_ENV = { ...process.env };

const loadService = (env = {}) => {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, ...env };
  return require('../services/totpService');
};

const cleanupDb = (dbPath) => {
  if (dbPath && fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
};

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.resetModules();
});

describe('TOTPService', () => {
  const testDb = path.join(__dirname, 'totp-test.db');

  afterEach(() => cleanupDb(testDb));

  test('respects environment defaults for issuer/account/window/digits', async () => {
    const service = loadService({
      TOTP_DEFAULT_ISSUER: 'EnvIssuer',
      TOTP_DEFAULT_ACCOUNT: 'EnvUser',
      TOTP_WINDOW: '2',
      TOTP_DIGITS: '8',
      TOTP_DB_PATH: testDb,
      TOTP_REDIS_URL: ''
    });

    const result = await service.generateSecret();
    const config = service.getConfig();

    expect(result.issuer).toBe('EnvIssuer');
    expect(result.account).toBe('EnvUser');
    expect(config.window).toBe(2);
    expect(config.digits).toBe(8);
  });

  test('verifyToken returns true for a valid token', async () => {
    const service = loadService({ TOTP_DB_PATH: testDb, TOTP_REDIS_URL: '' });
    const { authenticator } = require('otplib');
    authenticator.options = service.getConfig();

    const secret = authenticator.generateSecret();
    const token = authenticator.generate(secret);

    await expect(service.verifyToken(secret, token)).resolves.toBe(true);
  });

  test('updateConfig merges and applies new values', () => {
    const service = loadService({ TOTP_DB_PATH: testDb, TOTP_REDIS_URL: '' });
    service.updateConfig({ digits: 8, window: 3 });

    const updated = service.getConfig();
    expect(updated.digits).toBe(8);
    expect(updated.window).toBe(3);
  });
});
