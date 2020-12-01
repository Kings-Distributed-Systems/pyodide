var ProgressBarPlugin = require('progress-bar-webpack-plugin');
const path = require('path');

module.exports = {
  entry: {
    pyodide: "./src/pyodide.js",
  },
  output: {
      filename: '[name]' + '.js',
      path: path.resolve(__dirname, "dist"),
      libraryTarget: 'commonjs2',
  },
  resolve: {
    fallback: { 
      "path": false, 
      "fs": false,
      "ws": false,
//      "buffer": require.resolve("buffer/"),
//      "child_process": false,
//      "crypto": require.resolve("crypto-browserify"),
      "fetch": false
    }
  },
  plugins: [
    new ProgressBarPlugin()
  ],
  target: 'node'
};
