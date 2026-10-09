define(['exports', './main-BYybeNsw'], (function (exports, main) { 'use strict';

	/** Deferred from inside a screen. Nobody navigates to it. */
	const draw = () => `<svg role="img" aria-label="${main.money(42)}"><rect width="10" height="10" /></svg>`;

	exports.draw = draw;

}));
