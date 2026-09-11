import { Component, inject } from '@angular/core';
import { IntakePageComponent } from './features/intake/intake.page';
import { PaletteComponent } from './features/palette/palette';
import { ReportPageComponent } from './features/report/report.page';
import { DensityService } from './state/density.service';
import { I18nService } from './state/i18n.service';
import { PaletteService } from './state/palette.service';
import { ReportStore } from './state/report.store';
import { ThemeService } from './state/theme.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.html',
    styleUrl: './app.scss',
    imports: [IntakePageComponent, ReportPageComponent, PaletteComponent],
})
export class App {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly theme = inject(ThemeService);
    protected readonly density = inject(DensityService);
    protected readonly palette = inject(PaletteService);
    protected readonly store = inject(ReportStore);
}
