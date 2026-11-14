const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');
const config = getDefaultConfig(projectRoot);

// The phone imports the plain offer catalog from /api.
// Babel helpers for those files must resolve from the app, not from /api.
config.watchFolders = [path.resolve(repoRoot, 'api')];
config.resolver.extraNodeModules = {
  '@babel/runtime': path.resolve(projectRoot, 'node_modules', '@babel', 'runtime'),
};

module.exports = config;
