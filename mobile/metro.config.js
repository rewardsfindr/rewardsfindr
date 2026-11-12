const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// The offer catalog imports the plain Chase and Amex parsers from /api.
// Lookup stays inside mobile/node_modules so api/node_modules is not bundled.
config.watchFolders = [repoRoot];
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

module.exports = config;
