define(['require', 'exports', './main-BYybeNsw'], (function (require, exports, main) { 'use strict';

    /** A screen that defers a piece of itself: the chart is a block, not a fourth screen. */
    const render = () => {
        void new Promise(function (resolve, reject) { require(['./chart.widget-B9pOKD4g'], resolve, reject); }).then(chart => main.mount(document.querySelector('#chart'), chart.draw()));
        return '<h1>Home</h1><div id="chart"></div>';
    };

    exports.render = render;

}));
