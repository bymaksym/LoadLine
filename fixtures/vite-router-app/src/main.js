/**
 * The router, written as a route table the way vue-router, Nuxt and React Router write theirs: an
 * object per route with a path, a name and a key that imports the screen. The language file is
 * lazy too, and no route opens it: it is what the table is there to tell apart from a screen.
 */
import { mount } from './shared.js';

const routes = [
    { path: '/', name: 'dashboard', component: () => import('./home.page.js') },
    { path: '/orders', name: 'order-list', component: () => import('./orders.page.js') },
    { path: '/settings', component: () => import('./settings.page.js') },
];

const messages = { es: { load: () => import('./messages.es.js') } };

const go = async () => {
    const path = location.hash.slice(1) || '/';
    const route = routes.find(entry => entry.path === path) ?? routes[0];
    const screen = await route.component();
    const words = navigator.language.startsWith('es') ? await messages.es.load() : null;
    mount(document.querySelector('#outlet'), screen.render(words?.default));
};

addEventListener('hashchange', go);
go();
