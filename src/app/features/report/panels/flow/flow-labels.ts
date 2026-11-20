import { flowBytes } from '@core/analysis/views/flow/detail';
import { FLOW_IDS } from '@core/analysis/views/flow/fine';
import { type FlowModel, type FlowSource, type FlowTakeaway } from '@core/analysis/views/flow/flow.types';
import { type UiStrings } from '@core/i18n/ui-strings';

/**
 * What each node of the flow is called in the page's language. The model names packages, chunks
 * and screens by themselves and leaves the nodes it made up — your code, the folded ones, the
 * bootstrap — to the page, because only the page knows which language it is in.
 */
export const nodeName = (model: FlowModel, id: string, t: UiStrings): string => {
    const named: Record<string, string> = {
        [FLOW_IDS.own]: t.flowOwnCode,
        [FLOW_IDS.unattributed]: t.flowUnattributed,
        [FLOW_IDS.unknown]: t.flowUnknown,
        [FLOW_IDS.boot]: t.flowBoot,
        [FLOW_IDS.ownChunks]: t.flowOwnChunks,
        [FLOW_IDS.app]: t.flowApp,
    };
    const fixed = named[id];
    if (fixed) {
        return fixed;
    }
    if (id === FLOW_IDS.morePackages) {
        return t.flowMorePackages(model.sources.find(node => node.id === id)?.members.length ?? 0);
    }
    if (id === FLOW_IDS.moreShared) {
        return t.flowMoreShared(model.middles.find(node => node.id === id)?.chunks.length ?? 0);
    }
    if (id === FLOW_IDS.moreScreens) {
        return t.flowMoreScreens(model.targets.find(node => node.id === id)?.members.length ?? 0);
    }
    return (
        model.sources.find(node => node.id === id)?.label ??
        model.middles.find(node => node.id === id)?.label ??
        model.targets.find(node => node.id === id)?.label ??
        id
    );
};

/** How far a package reaches, as the label under its name says it: every screen, only one, or a count. */
export const reachText = (
    source: Pick<FlowSource, 'screens' | 'onlyScreen' | 'bootBytes'>,
    all: number,
    t: UiStrings,
): string => {
    if (source.bootBytes > 0 || (all > 1 && source.screens === all)) {
        return t.flowReachAll;
    }
    return source.onlyScreen === null ? t.flowReach(source.screens) : t.flowReachOnly(source.onlyScreen);
};

/** The sentence under the diagram, from the takeaway the model worked out. Empty when there is none. */
export const takeawayText = (model: FlowModel, t: UiStrings): string => {
    const takeaway: FlowTakeaway | null = model.takeaway;
    if (!takeaway) {
        return '';
    }
    if (takeaway.kind === 'screen') {
        return t.flowTakeawayScreen(
            takeaway.screen,
            flowBytes(takeaway.total),
            flowBytes(takeaway.boot),
            flowBytes(takeaway.shared),
            flowBytes(takeaway.own),
        );
    }
    const name = takeaway.own ? t.flowOwnCode : takeaway.source;
    switch (takeaway.kind) {
        case 'misplaced': {
            return t.flowTakeawayMisplaced(
                name,
                flowBytes(takeaway.bytes),
                takeaway.importers,
                takeaway.where,
                takeaway.downloads,
            );
        }
        case 'driver': {
            return t.flowTakeawayDriver(
                name,
                flowBytes(takeaway.bytes),
                takeaway.screen,
                flowBytes(takeaway.total),
                takeaway.where,
                takeaway.downloads,
            );
        }
        case 'boot': {
            return t.flowTakeawayBoot(name, flowBytes(takeaway.bytes), flowBytes(takeaway.boot), takeaway.screens);
        }
    }
};
