/**
 * The router. Every screen is behind a dynamic import, which is the only thing that has to be true
 * for a build to be worth reading: it is what puts a boundary in the graph.
 */
import { mount } from './shared.js';

const routes = {
    '#/home': () => import('./home.page.js'),
    '#/orders': () => import('./orders.page.js'),
    '#/settings': () => import('./settings.page.js'),
};

const go = async () => {
    const load = routes[location.hash] ?? routes['#/home'];
    const screen = await load();
    mount(document.querySelector('#outlet'), screen.render());
};

addEventListener('hashchange', go);
go();
