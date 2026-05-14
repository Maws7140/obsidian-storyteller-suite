import { ImageDetailModal } from '../../../modals/ImageDetailModal';
import { EventModal } from '../../../modals/EventModal';
import { t } from '../../../i18n/strings';
import type { DashboardControllerContext, DashboardTabController } from './types';

export const eventsController: DashboardTabController = {
    id: 'events',
    async render(container, context) {
        container.empty();
        context.renderHeaderControls(container, t('events'), async (filter: string) => {
            context.setCurrentFilter(filter);
            await renderEventsList(container, context);
        }, () => {
            new EventModal(context.app, context.plugin, null, async (eventData) => {
                await context.mutationRunner.runCreate({
                    action: async () => {
                        await context.plugin.saveEvent(eventData);
                    },
                    successNotice: `Event "${eventData.name}" created.`,
                    refreshMode: 'immediate',
                    refreshDetail: 'event-created',
                });
            }).open();
        }, t('createNew'), (setting) => {
            setting.addButton(button => button
                .setButtonText(t('viewTimeline'))
                .setCta()
                .onClick(() => {
                    void context.plugin.activateTimelineView();
                }));
        });

        await renderEventsList(container, context);
    },
};

async function renderEventsList(container: HTMLElement, context: DashboardControllerContext): Promise<void> {
    const existingListContainer = container.querySelector('.storyteller-list-container');
    if (existingListContainer) existingListContainer.remove();

    const filter = context.getCurrentFilter();
    const events = (await context.plugin.listEvents()).filter(event =>
        event.name.toLowerCase().includes(filter) ||
        (event.description || '').toLowerCase().includes(filter) ||
        (event.dateTime || '').toLowerCase().includes(filter) ||
        (event.location || '').toLowerCase().includes(filter)
    );
    const locations = await context.plugin.listLocations();

    const listContainer = container.createDiv('storyteller-list-container storyteller-events-list-container');
    if (events.length === 0) {
        listContainer.createEl('p', { text: t('noEventsFound') + (filter ? t('matchingFilter') : '') });
        return;
    }

    events.forEach(event => {
        const itemEl = listContainer.createDiv('storyteller-list-item');
        const pfpContainer = itemEl.createDiv('storyteller-list-item-pfp');
        if (event.profileImagePath) {
            const imgEl = pfpContainer.createEl('img');
            try {
                imgEl.src = context.getImageSrc(event.profileImagePath);
                imgEl.alt = event.name;
            } catch {
                pfpContainer.createSpan({ text: '?', title: 'Error loading image' });
            }
        } else {
            pfpContainer.createDiv({ cls: 'storyteller-pfp-placeholder', text: event.name.substring(0, 1).toUpperCase() });
        }

        const infoEl = itemEl.createDiv('storyteller-list-item-info');
        infoEl.createEl('strong', { text: event.name });
        if (event.dateTime) infoEl.createEl('span', { text: ` (${event.dateTime})`, cls: 'storyteller-timeline-date' });
        if (event.description) infoEl.createEl('p', { text: event.description.substring(0, 100) + (event.description.length > 100 ? '...' : '') });

        if (event.images && Array.isArray(event.images) && event.images.length > 0) {
            const imagesRow = infoEl.createDiv('storyteller-event-images-row');
            event.images.forEach(imagePath => {
                try {
                    const thumb = imagesRow.createEl('img', { cls: 'storyteller-event-image-thumb' });
                    thumb.src = context.getImageSrc(imagePath);
                    thumb.alt = `${event.name} image`;
                    thumb.loading = 'lazy';
                    thumb.setCssStyles({ maxWidth: '48px' });
                    thumb.setCssStyles({ maxHeight: '48px' });
                    thumb.setCssStyles({ marginRight: '4px' });
                    thumb.setCssStyles({ cursor: 'pointer' });
                    thumb.addEventListener('click', () => {
                        new ImageDetailModal(context.app, context.plugin, { id: imagePath, filePath: imagePath }, false, () => Promise.resolve()).open();
                    });
                } catch {
                    imagesRow.createSpan({ text: '?', title: 'Error loading image' });
                }
            });
        }

        const extraInfoEl = infoEl.createDiv('storyteller-list-item-extra');
        if (event.isMilestone) extraInfoEl.createSpan({ cls: 'storyteller-meta-badge storyteller-event-milestone-badge', text: 'Milestone' });
        if (event.status) {
            const statusSlug = event.status.toLowerCase().replace(/\s+/g, '-');
            extraInfoEl.createSpan({ cls: `storyteller-meta-badge storyteller-event-status-badge storyteller-event-status-${statusSlug}`, text: event.status });
        }
        if (event.location) {
            const locationName = context.resolveLocationName(event.location, locations);
            extraInfoEl.createSpan({ cls: 'storyteller-meta-badge storyteller-event-location-badge', text: locationName });
        }

        const actionsEl = itemEl.createDiv('storyteller-list-item-actions');
        context.addEditButton(actionsEl, () => {
            new EventModal(context.app, context.plugin, event, async (updatedData) => {
                await context.mutationRunner.runUpdate({
                    action: async () => {
                        await context.plugin.saveEvent(updatedData);
                    },
                    successNotice: `Event "${updatedData.name}" updated.`,
                    refreshMode: 'immediate',
                    refreshDetail: 'event-updated',
                });
            }).open();
        });
        context.addDeleteButton(actionsEl, async () => {
            if (event.filePath) {
                await context.mutationRunner.runDelete({
                    confirmMessage: `Are you sure you want to delete "${event.name}"?`,
                    action: async () => {
                        await context.plugin.deleteEvent(event.filePath!);
                    },
                    refreshMode: 'immediate',
                    refreshDetail: 'event-deleted',
                });
            }
        });
        context.addOpenFileButton(actionsEl, event.filePath);
    });
}
