import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { setUnitSpace } from './app/core/format/format.utils';

// A figure and its unit never part on the page: see `setUnitSpace`.
setUnitSpace(' ');

try {
    await bootstrapApplication(App, appConfig);
} catch (error) {
    console.error(error);
}
