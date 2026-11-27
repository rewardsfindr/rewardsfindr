const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

config.resolver.extraNodeModules = {
  '@babel/runtime': path.resolve(projectRoot, 'node_modules', '@babel', 'runtime'),
};

module.exports = config;
