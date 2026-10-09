define(['exports', './main-BYybeNsw'], (function (exports, main) { 'use strict';

	/**
	 * Imported statically by two screens and by nothing the bootstrap pulls in, which is what makes the
	 * bundler give it a chunk of its own: the shared chunk the whole report is about.
	 */
	const table = rows => `<table>${rows.map(row => `<tr><td>${main.money(row)}</td></tr>`).join('')}</table>`;

	exports.table = table;

}));
