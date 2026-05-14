import { setIcon } from 'obsidian';
import type { DashboardTabController, DashboardWritingViewMode } from './types';
import type { WritingPanelMode } from '../../WritingViewRenderers';

const WRITING_MODES: Array<{ id: DashboardWritingViewMode; icon: string; label: string }> = [
    { id: 'list', icon: 'list', label: 'List' },
    { id: 'board', icon: 'columns-3', label: 'Board' },
    { id: 'arc', icon: 'activity', label: 'Arc' },
    { id: 'heatmap', icon: 'grid', label: 'Heatmap' },
    { id: 'holes', icon: 'shield-alert', label: 'Holes' },
];

export const writingController: DashboardTabController = {
    id: 'writing',
    async render(container, context) {
        container.empty();
        context.renderWritingGoalBanner(container);

        const switcher = container.createDiv(`storyteller-writing-switcher${context.isSimplifiedMobileDashboard() ? ' storyteller-writing-switcher--mobile' : ''}`);
        const renderActive = async () => {
            const existing = container.querySelector('.storyteller-writing-view-body');
            if (existing) {
                existing.remove();
            }

            const body = container.createDiv('storyteller-writing-view-body');
            await context.renderWritingMode(context.getWritingViewMode(), body);
        };

        const popOutBtn = switcher.createEl('button', {
            cls: 'storyteller-switcher-btn storyteller-switcher-popout',
        });

        const updatePopOut = () => {
            popOutBtn.empty();
            const currentMode = context.getWritingViewMode();
            const panelMode = currentMode === 'list' ? 'board' : currentMode;
            const modeInfo = WRITING_MODES.find(mode => mode.id === panelMode) ?? WRITING_MODES[1];
            setIcon(popOutBtn.createSpan(''), modeInfo.icon);
            const label = popOutBtn.createSpan({ cls: 'storyteller-popout-label' });
            label.setText(`Open ${modeInfo.label}`);
            setIcon(popOutBtn.createSpan(''), 'panel-right-open');
            popOutBtn.title = `Open ${modeInfo.label} in panel`;
        };

        if (context.isSimplifiedMobileDashboard()) {
            const modeSelect = switcher.createEl('select', {
                cls: 'storyteller-writing-mode-select',
                attr: {
                    'aria-label': 'Writing view mode'
                }
            });

            WRITING_MODES.forEach(mode => {
                const option = modeSelect.createEl('option', { text: mode.label });
                option.value = mode.id;
            });

            modeSelect.value = context.getWritingViewMode();
            modeSelect.addEventListener('change', () => { void (async () => {
                context.setWritingViewMode(modeSelect.value as DashboardWritingViewMode);
                updatePopOut();
                await renderActive();
            })(); });
            switcher.prepend(modeSelect);
        } else {
            WRITING_MODES.forEach(mode => {
                const button = switcher.createEl('button', {
                    cls: `storyteller-switcher-btn${context.getWritingViewMode() === mode.id ? ' is-active' : ''}`
                });
                setIcon(button.createSpan(), mode.icon);
                button.createSpan({ text: mode.label });
                button.onclick = async () => {
                    context.setWritingViewMode(mode.id);
                    switcher.querySelectorAll('.storyteller-switcher-btn:not(.storyteller-switcher-popout)')
                        .forEach(element => element.removeClass('is-active'));
                    button.addClass('is-active');
                    updatePopOut();
                    await renderActive();
                };
            });
        }

        updatePopOut();

        popOutBtn.onclick = () => {
            const currentMode = context.getWritingViewMode();
            const mode: WritingPanelMode = currentMode === 'list' ? 'board' : currentMode;
            void context.plugin.activateWritingPanelView(mode);
        };

        context.renderHeaderControls(
            container,
            'Writing',
            async (filter: string) => {
                context.setCurrentFilter(filter);
                await renderActive();
            },
            () => {
                void import('../../../modals/ChapterModal').then(({ ChapterModal }) => {
                    new ChapterModal(context.app, context.plugin, null, async (chapter) => {
                        await context.mutationRunner.runCreate({
                            action: async () => {
                                await context.plugin.saveChapter(chapter);
                            },
                            successNotice: `Chapter "${chapter.name}" created.`,
                            refreshMode: 'immediate',
                            refreshDetail: 'writing-chapter-created',
                        });
                    }).open();
                });
            },
            'Add Chapter',
            (setting) => {
                setting.addButton(button => {
                    button.setButtonText('Add scene').onClick(() => {
                        void import('../../../modals/SceneModal').then(({ SceneModal }) => {
                            new SceneModal(context.app, context.plugin, null, async (scene) => {
                                await context.mutationRunner.runCreate({
                                    action: async () => {
                                        await context.plugin.saveScene(scene);
                                    },
                                    successNotice: `Scene "${scene.name}" created.`,
                                    refreshMode: 'immediate',
                                    refreshDetail: 'writing-scene-created',
                                });
                            }).open();
                        });
                    });
                });
                setting.addButton(button => {
                    button.setIcon('layout-dashboard').setTooltip('Open story board canvas').onClick(async () => {
                        await context.plugin.openStoryBoard();
                    });
                });
            },
            (menu) => {
                menu.addItem(item => {
                    item.setTitle('Add scene');
                    item.setIcon('plus-circle');
                    item.onClick(() => {
                        void import('../../../modals/SceneModal').then(({ SceneModal }) => {
                            new SceneModal(context.app, context.plugin, null, async (scene) => {
                                await context.mutationRunner.runCreate({
                                    action: async () => {
                                        await context.plugin.saveScene(scene);
                                    },
                                    successNotice: `Scene "${scene.name}" created.`,
                                    refreshMode: 'immediate',
                                    refreshDetail: 'writing-scene-created-menu',
                                });
                            }).open();
                        });
                    });
                });
                menu.addItem(item => {
                    item.setTitle('Open story board');
                    item.setIcon('layout-dashboard');
                    item.onClick(() => {
                        void context.plugin.openStoryBoard();
                    });
                });
            }
        );

        await renderActive();
    },
};
