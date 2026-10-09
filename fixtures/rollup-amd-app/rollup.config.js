/**
 * The fixture's sources as RequireJS would load them: AMD modules, ids without the extension, the
 * lazy routes as `require([…])`, and a page that starts the application from `data-main` with the
 * loader on a CDN — the shape of a RequireJS application before ES modules.
 */
const page = {
    name: 'page',
    generateBundle(_, bundle) {
        const main = Object.values(bundle).find(chunk => chunk.type === 'chunk' && chunk.isEntry);
        this.emitFile({
            type: 'asset',
            fileName: 'index.html',
            source: `<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <title>Loadline fixture</title>
    </head>
    <body>
        <nav><a href="#/home">Home</a> <a href="#/orders">Orders</a> <a href="#/settings">Settings</a></nav>
        <main id="outlet"></main>
        <script data-main="${main.fileName.replace(/\.js$/, '')}" src="https://cdnjs.cloudflare.com/ajax/libs/require.js/2.3.6/require.min.js"></script>
    </body>
</html>
`,
        });
    },
};

export default {
    input: 'src/main.js',
    output: { dir: 'dist', format: 'amd', entryFileNames: '[name]-[hash].js', chunkFileNames: '[name]-[hash].js' },
    plugins: [page],
};
