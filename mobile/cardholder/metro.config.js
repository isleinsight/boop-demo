// metro.config.js
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;             // mobile/cardholder
const workspaceRoot = path.resolve(projectRoot, '..'); // mobile/

module.exports = (() => {
  const config = getDefaultConfig(projectRoot);

  // Watch the workspace root so Metro sees shared files
  config.watchFolders = [workspaceRoot];

  // Resolve modules from app node_modules first, then workspace node_modules
  config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
  ];

  // Monorepo helpers (Expo SDK 49+)
  config.resolver.disableHierarchicalLookup = true;
  config.resolver.unstable_enableSymlinks = true;

  return config;
})();
