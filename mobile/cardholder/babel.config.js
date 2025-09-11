module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // keep this if you add Reanimated later; harmless if unused
    plugins: ['react-native-reanimated/plugin'],
  };
};
