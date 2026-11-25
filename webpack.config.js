const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => ({
  entry: './app.js',
  // No eval-based source maps: the CSP does not allow 'unsafe-eval'
  devtool: argv.mode === 'development' ? 'source-map' : false,
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js'
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-react']
          }
        }
      }
      // CSS files are copied by post-build script (scripts/post-build.js)
      // No need for CSS loaders as styles are loaded via <link> tags
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx']
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './index.html'
    })
  ]
});
