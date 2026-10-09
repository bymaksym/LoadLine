define(['require', 'exports'], (function (require, exports) { 'use strict';

    /** Imported statically by every screen, so it ends up in a chunk they all pull in. */
    const mount = (host, html) => {
        if (host) {
            host.innerHTML = html;
        }
    };

    const money = value => new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' }).format(value);

    /**
     * The router. Every screen is behind a dynamic import, which is the only thing that has to be true
     * for a build to be worth reading: it is what puts a boundary in the graph.
     */

    const routes = {
        '#/home': () => new Promise(function (resolve, reject) { require(['./home.page-Cbts5qDk'], resolve, reject); }),
        '#/orders': () => new Promise(function (resolve, reject) { require(['./orders.page-BnqxhRsL'], resolve, reject); }),
        '#/settings': () => new Promise(function (resolve, reject) { require(['./settings.page-YkJpg7Da'], resolve, reject); }),
    };

    const go = async () => {
        const load = routes[location.hash] ?? routes['#/home'];
        const screen = await load();
        mount(document.querySelector('#outlet'), screen.render());
    };

    addEventListener('hashchange', go);
    go();

    exports.money = money;
    exports.mount = mount;

}));
