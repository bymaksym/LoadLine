/**
 * The same application as `vite-app`, built by webpack 4 — what Create React App 2 to 4 and Vue CLI
 * shipped. Its chunks load each other through a run-time table of numbers (`webpackJsonp`), not
 * through `import()`, so a folder of them carries no graph a reader of ES modules can follow.
 */
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    entry: './src/main.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].[contenthash:8].js',
        chunkFilename: '[name].[contenthash:8].js',
    },
    devtool: 'source-map',
    plugins: [new HtmlWebpackPlugin({ title: 'Loadline fixture' })],
};
