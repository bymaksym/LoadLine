/**
 * What is said about a `loadline.json` that got something wrong, in both languages of the report.
 *
 * The command prints these under a report in the language it was asked for, and a Spanish report
 * with its warnings in English read as two tools. The keys in quotes stay as they are written in
 * the file: they are what somebody searches the file for.
 */

import { type Lang } from '../i18n/ui-strings';

export interface ConfigText {
    notConfig: string;
    unknownTopKey: (key: string) => string;
    badExtends: string;
    extendsMode: (own: string, base: string, baseMode: string, ownMode: string) => string;
    badMode: (given: string) => string;
    criteriaNotObject: string;
    unknownCriterion: (key: string) => string;
    recommendedStays: (problem: string) => string;
    gatesNotObject: string;
    unknownGate: (key: string) => string;
    gateOff: (problem: string) => string;
    badFailOn: (given: string) => string;
    badFailOnNewPackage: string;
    badFailOnSignals: string;
    unknownFailOnSignal: (kind: string) => string;
    badScreens: string;
    badPackages: string;
    forbiddenNotList: string;
    forbiddenWhat: (where: string) => string;
    forbiddenIn: (where: string, given: string) => string;
    forbiddenNoWhy: (where: string) => string;
    badBuild: string;
    badBuildList: (key: string) => string;
    badBuildScreens: string;
    badBuildScreen: (pattern: string) => string;
    badBuildPage: string;
    badRouteKey: (key: string) => string;
    notSize: (where: string, given: string) => string;
    bareSize: (where: string, given: string) => string;
    notShare: (where: string, given: string) => string;
    notNumber: (where: string, given: string) => string;
    acceptedNotList: string;
    unknownAccepted: (kind: string) => string;
    noWhy: (where: string) => string;
    bytesOf: (where: string) => string;
    ignored: (problem: string) => string;
    badUntil: (where: string, until: string) => string;
}

export const CONFIG_TEXT: Record<Lang, ConfigText> = {
    en: {
        notConfig: 'Not a loadline.json: it needs "tool": "loadline" and "version": 1.',
        unknownTopKey: key => `"${key}" is not a key of loadline.json, and nothing reads it.`,
        badExtends:
            '"extends" has to be a file or a package, or a list of them, like "@acme/loadline-config". Nothing is inherited.',
        extendsMode: (own, base, baseMode, ownMode) =>
            `${own} says "mode": "${ownMode}", but ${base}, which it extends, writes its sizes in ${baseMode}: every inherited threshold would be read in the wrong unit. Use the same "mode", or leave it out.`,
        badMode: given => `"mode" has to be "raw", "gzip" or "brotli", not ${given}. It is ignored.`,
        criteriaNotObject: '"criteria" has to be an object of thresholds. It is ignored.',
        unknownCriterion: key => `"criteria.${key}" is not one of the criteria, so it changes nothing.`,
        recommendedStays: problem => `${problem} The recommended value stays.`,
        gatesNotObject: '"gates" has to be an object. No gate from the file applies.',
        unknownGate: key => `"gates.${key}" is not a gate, so it guards nothing.`,
        gateOff: problem => `${problem} That gate cannot run.`,
        badFailOn: given => `"gates.failOn" has to be "high", "mid" or "none", not ${given}.`,
        badFailOnNewPackage: '"gates.failOnNewPackage" has to be true or false.',
        badFailOnSignals: '"gates.failOnSignals" has to be a list of signals, like ["forbidden", "secrets"].',
        unknownFailOnSignal: kind => `"gates.failOnSignals" names ${kind}, which is not a signal.`,
        badScreens: '"gates.screens" has to map a screen to a size, like { "rooms": "400kB" }.',
        badPackages: '"packages" has to be a list of package names. It is ignored.',
        forbiddenNotList: '"forbidden" has to be a list of rules, like [{ "package": "moment", "why": "…" }].',
        forbiddenWhat: where => `The "forbidden" rule ${where} has to name a "package" or a "path" — one of the two.`,
        forbiddenIn: (where, given) =>
            `The "in" of the "forbidden" rule ${where} has to be "bootstrap" or "anywhere", not ${given}.`,
        forbiddenNoWhy: where =>
            `The "forbidden" rule ${where} has no "why". It is the first thing whoever meets it reads.`,
        badBuild: '"build" has to be an object, like { "entries": ["main.*.js"] }. It is ignored.',
        badBuildList: key => `"build.${key}" has to be a list of names or paths, like ["main.*.js"]. It is ignored.`,
        badBuildScreens:
            '"build.screens" has to map a file to "screen" or "piece", like { "*.widget.ts": "piece" }. It is ignored.',
        badRouteKey: key => `"${key}" in "build.routeKeys" is not a property name, like "page". It is ignored.`,
        badBuildScreen: pattern =>
            `"build.screens" says something other than "screen" or "piece" for ${pattern}. That line is ignored.`,
        badBuildPage: '"build.page" has to be the name of an HTML file of the build, like "app.html". It is ignored.',
        notSize: (where, given) => `${where} has to be a size like "350kB" or "1.5MB", not ${given}.`,
        bareSize: (where, given) =>
            `${where} is ${given}, which would be ${given} bytes. Write "${given}kB", or "${given}B" if bytes are meant.`,
        notShare: (where, given) => `${where} has to be a share like "25%" or 0.25, not ${given}.`,
        notNumber: (where, given) => `${where} has to be a number, not ${given}.`,
        acceptedNotList: '"accepted" has to be a list. Nothing in it is accepted.',
        unknownAccepted: kind => `Unknown signal in "accepted": ${kind}. It accepts nothing.`,
        noWhy: where => `The acceptance of ${where} has no "why". An acceptance without a reason is a suppression.`,
        bytesOf: where => `The "bytes" of ${where}`,
        ignored: problem => `${problem} It is ignored.`,
        badUntil: (where, until) => `The "until" of ${where} is not a YYYY-MM-DD date: ${until}. It is ignored.`,
    },
    es: {
        notConfig: 'No es un loadline.json: necesita "tool": "loadline" y "version": 1.',
        unknownTopKey: key => `"${key}" no es una clave de loadline.json y nada la lee.`,
        badExtends:
            '"extends" tiene que ser un fichero o un paquete, o una lista de ellos, como "@acme/loadline-config". No se hereda nada.',
        extendsMode: (own, base, baseMode, ownMode) =>
            `${own} dice "mode": "${ownMode}", pero ${base}, del que hereda, escribe sus tamaños en ${baseMode}: todos los umbrales heredados se leerían en otra unidad. Pon el mismo "mode" o quítalo.`,
        badMode: given => `"mode" tiene que ser "raw", "gzip" o "brotli", no ${given}. Se ignora.`,
        criteriaNotObject: '"criteria" tiene que ser un objeto de umbrales. Se ignora.',
        unknownCriterion: key => `"criteria.${key}" no es ninguno de los criterios, así que no cambia nada.`,
        recommendedStays: problem => `${problem} Se queda el valor recomendado.`,
        gatesNotObject: '"gates" tiene que ser un objeto. No se aplica ningún gate del fichero.',
        unknownGate: key => `"gates.${key}" no es un gate, así que no vigila nada.`,
        gateOff: problem => `${problem} Ese gate no puede comprobarse.`,
        badFailOn: given => `"gates.failOn" tiene que ser "high", "mid" o "none", no ${given}.`,
        badFailOnNewPackage: '"gates.failOnNewPackage" tiene que ser true o false.',
        badFailOnSignals: '"gates.failOnSignals" tiene que ser una lista de señales, como ["forbidden", "secrets"].',
        unknownFailOnSignal: kind => `"gates.failOnSignals" nombra ${kind}, que no es una señal.`,
        badScreens: '"gates.screens" tiene que asignar un tamaño a cada pantalla, como { "rooms": "400kB" }.',
        badPackages: '"packages" tiene que ser una lista de nombres de paquete. Se ignora.',
        forbiddenNotList: '"forbidden" tiene que ser una lista de reglas, como [{ "package": "moment", "why": "…" }].',
        forbiddenWhat: where =>
            `La regla de "forbidden" ${where} tiene que nombrar un "package" o un "path": uno de los dos.`,
        forbiddenIn: (where, given) =>
            `El "in" de la regla de "forbidden" ${where} tiene que ser "bootstrap" o "anywhere", no ${given}.`,
        forbiddenNoWhy: where =>
            `La regla de "forbidden" ${where} no tiene "why". Es lo primero que lee quien se la encuentra.`,
        badBuild: '"build" tiene que ser un objeto, como { "entries": ["main.*.js"] }. Se ignora.',
        badBuildList: key =>
            `"build.${key}" tiene que ser una lista de nombres o rutas, como ["main.*.js"]. Se ignora.`,
        badBuildScreens:
            '"build.screens" tiene que asignar a cada fichero "screen" o "piece", como { "*.widget.ts": "piece" }. Se ignora.',
        badRouteKey: key => `"${key}" en "build.routeKeys" no es un nombre de propiedad, como "page". Se ignora.`,
        badBuildScreen: pattern =>
            `"build.screens" dice algo que no es "screen" ni "piece" para ${pattern}. Esa línea se ignora.`,
        badBuildPage: '"build.page" tiene que ser el nombre de un HTML del build, como "app.html". Se ignora.',
        notSize: (where, given) => `${where} tiene que ser un tamaño como "350kB" o "1.5MB", no ${given}.`,
        bareSize: (where, given) =>
            `${where} vale ${given}, que serían ${given} bytes. Escribe "${given}kB", o "${given}B" si son bytes.`,
        notShare: (where, given) => `${where} tiene que ser una proporción como "25%" o 0.25, no ${given}.`,
        notNumber: (where, given) => `${where} tiene que ser un número, no ${given}.`,
        acceptedNotList: '"accepted" tiene que ser una lista. No se acepta nada de lo que lleva.',
        unknownAccepted: kind => `Señal desconocida en "accepted": ${kind}. No acepta nada.`,
        noWhy: where => `La aceptación de ${where} no tiene "why". Una aceptación sin motivo es un silencio.`,
        bytesOf: where => `El "bytes" de ${where}`,
        ignored: problem => `${problem} Se ignora.`,
        badUntil: (where, until) => `El "until" de ${where} no es una fecha AAAA-MM-DD: ${until}. Se ignora.`,
    },
};
