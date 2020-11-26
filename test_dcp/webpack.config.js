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
      "child_process": false,
      "crypto": false,
      "fetch": false
    }
  },
  target: 'webworker'
};
