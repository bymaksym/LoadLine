/**
 * Which npm packages are third-party services rather than parts of the application.
 *
 * It is a list, and a list is the wrong tool for most of what this project does — the rules
 * elsewhere read conventions, never names, because a name list is right for the libraries in
 * fashion today and wrong for the one released next year. Here the list **is** the fact: there is
 * nothing about the shape of `@sentry/browser` that says "error capture", and the question being
 * asked — how much of your first load is analytics, ads, support chat and error capture — cannot be
 * answered from structure.
 *
 * So it is a list, kept short, kept honest about being incomplete, and updatable in one commit. It
 * consults nothing: the alternative — asking npm what a package is — would mean sending the
 * dependency list of a private application out to the network, which this tool does not do.
 */

/** Category → the package names, or scopes, that belong to it. A scope ends in `/`. */
const CATALOG: Record<string, string[]> = {
    analytics: [
        '@amplitude/',
        '@segment/',
        '@vercel/analytics',
        'analytics',
        'ga-gtag',
        'gtag',
        'mixpanel-browser',
        'posthog-js',
        'plausible-tracker',
        'react-ga',
        'react-ga4',
        'vue-gtag',
        '@snowplow/',
        'matomo-tracker',
        'heap-analytics',
    ],
    ads: ['@google/adsense', 'react-adsense', 'prebid.js', 'adsbygoogle'],
    support: ['@intercom/', 'intercom-client', 'react-intercom', 'crisp-sdk-web', 'zendesk', '@zendesk/', 'tawk.to'],
    errors: [
        '@sentry/',
        'bugsnag-js',
        '@bugsnag/',
        'rollbar',
        '@datadog/browser-rum',
        '@datadog/browser-logs',
        'logrocket',
        'trackjs',
        '@newrelic/browser-agent',
        'raygun4js',
    ],
    experiments: ['@optimizely/', 'launchdarkly-js-client-sdk', 'unleash-proxy-client', '@growthbook/', 'splitio'],
    session: ['hotjar', '@hotjar/browser', 'fullstory', '@fullstory/browser', 'smartlook-client', 'clarity-js'],
    payments: ['@stripe/', 'braintree-web', '@paypal/', 'square'],
    maps: ['@googlemaps/', 'mapbox-gl', 'leaflet', 'google-map-react'],
    social: ['react-share', 'react-facebook', 'twitter-widgets'],
};

/** The category a package belongs to, or `null` when it is not one of these. */
export const categoryOf = (pkg: string): string | null => {
    for (const [category, names] of Object.entries(CATALOG)) {
        const hit = names.some(name => (name.endsWith('/') ? pkg.startsWith(name) : pkg === name));
        if (hit) {
            return category;
        }
    }

    return null;
};
