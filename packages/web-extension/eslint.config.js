module.exports = (async () => {
  const configModule = await import("./eslint.config.mjs");
  return configModule.default;
})();
