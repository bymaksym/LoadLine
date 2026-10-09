/**
 * The same application as `vite-app`, built by webpack 5 — what Create React App 5, Vue CLI 5 and
 * Angular 12 to 16 ship. A shared chunk is split out of the two routes that use it, so the stats
 * file has a lazy screen that arrives as two files.
 */
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    entry: './src/main.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].[contenthash:8].js',
        chunkFilename: '[name].[contenthash:8].js',
        clean: true,
    },
    devtool: 'source-map',
    optimization: { runtimeChunk: 'single', splitChunks: { chunks: 'all', minSize: 0 } },
    plugins: [new HtmlWebpackPlugin({ title: 'Loadline fixture' })],
};
