import { mount } from './shared.js';

/** A screen that defers a piece of itself: the chart is a block, not a fourth screen. */
export const render = () => {
    void import('./chart.widget.js').then(chart => mount(document.querySelector('#chart'), chart.draw()));
    return '<h1>Home</h1><div id="chart"></div>';
};
