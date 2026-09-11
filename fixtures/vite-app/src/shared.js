/** Imported statically by every screen, so it ends up in a chunk they all pull in. */
export const mount = (host, html) => {
    if (host) {
        host.innerHTML = html;
    }
};

export const money = value => new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' }).format(value);
