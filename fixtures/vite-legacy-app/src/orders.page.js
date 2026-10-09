import { table } from './table.js';

export const render = () => `<h1>Orders</h1>${table([12.5, 99, 1234.5])}`;
