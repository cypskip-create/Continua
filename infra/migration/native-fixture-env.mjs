/** Evaluate before compatibility imports validate their environment. Never use
 * a developer's inherited production database for a pure numerical fixture. */
process.env.NODE_ENV='test';
process.env.DATABASE_URL='postgresql://fixture:fixture@127.0.0.1:1/fixture';
process.env.CACHE_DRIVER='memory';
process.env.LOG_LEVEL='fatal';
process.env.ENGINE_PYTHON_BIN=process.env.NATIVE_PYTHON_BIN ?? 'python3';
