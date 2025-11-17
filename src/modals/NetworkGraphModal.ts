// Network Graph Modal - Popup overlay for network visualization
// Provides a modal interface for viewing the entity relationship graph with improved UX

import { App, ButtonComponent, Menu, Modal, Notice } from 'obsidian';
import StorytellerSuitePlugin from '../main';
import { t } from '../i18n/strings';
import { NetworkGraphRenderer } from '../views/NetworkGraphRenderer';
import { GraphFilters } from '../types';
import { ResponsiveModal } from './ResponsiveModal';

const ENTITY_TYPES = ['character', 'location', 'event', 'item'] as const;
type EntityType = typeof ENTITY_TYPES[number];

// Modal to explore the relationship network with progressive filters and tooling
export class NetworkGraphModal extends ResponsiveModal {
	private readonly plugin: StorytellerSuitePlugin;
	private graphRenderer: NetworkGraphRenderer | null = null;
	private graphContainer: HTMLElement | null = null;

	private currentFilters: GraphFilters = {};
	private selectedEntityTypes: Set<EntityType> = new Set(ENTITY_TYPES);

	private filterChipsContainer: HTMLElement | null = null;
	private filterClearButton: HTMLButtonElement | null = null;
	private filterToggleButton: ButtonComponent | null = null;
	private filterBadgeEl: HTMLElement | null = null;
	private filterDrawer: HTMLElement | null = null;
	private filterBackdrop: HTMLElement | null = null;
	private filterDrawerVisible = false;
	private lastFocusedElement: HTMLElement | null = null;
	private statusBarEl: HTMLElement | null = null; // NEW: Status bar element
	private liveRegionEl: HTMLElement | null = null; // NEW: ARIA live region
	private searchDebounceTimer: NodeJS.Timeout | null = null; // Priority 2.3: Debounced search

	private filterInputs = {
		entityCheckboxes: new Map<EntityType, HTMLInputElement>(),
		timelineStart: null as HTMLInputElement | null,
		timelineEnd: null as HTMLInputElement | null
	};

	private edgeLabelsToggleButton: ButtonComponent | null = null;
	private edgeLabelsVisible = false;
	private exportButtonEl: HTMLButtonElement | null = null;
	private infoToggleButton: ButtonComponent | null = null;
	private aboutSection: HTMLElement | null = null;

	private readonly handleGlobalKeydown = (evt: KeyboardEvent) => {
		if (evt.key === 'Escape' && this.filterDrawerVisible) {
			evt.preventDefault();
			this.toggleFilterDrawer(false);
		}
	};

	constructor(app: App, plugin: StorytellerSuitePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		super.onOpen();

		window.addEventListener('keydown', this.handleGlobalKeydown, true);

		this.selectedEntityTypes = new Set(ENTITY_TYPES);
		this.currentFilters = {};

		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('storyteller-network-graph-modal');
		contentEl.addClass('storyteller-graph-modal-content');

		this.modalEl.style.width = '90vw';
		this.modalEl.style.maxWidth = '1400px';
		this.modalEl.style.height = '85vh';
		this.modalEl.addClass('storyteller-network-graph-shell');

		// Create ARIA live region for screen readers (hidden)
		this.liveRegionEl = contentEl.createDiv();
		this.liveRegionEl.setAttribute('role', 'status');
		this.liveRegionEl.setAttribute('aria-live', 'polite');
		this.liveRegionEl.setAttribute('aria-atomic', 'true');
		this.liveRegionEl.style.position = 'absolute';
		this.liveRegionEl.style.left = '-10000px';
		this.liveRegionEl.style.width = '1px';
		this.liveRegionEl.style.height = '1px';
		this.liveRegionEl.style.overflow = 'hidden';

		this.buildHeader(contentEl);
		this.createToolbar(contentEl);
		this.createFilterChipRow(contentEl);

		const graphStage = contentEl.createDiv('storyteller-graph-stage');
		void this.initializeGraph(graphStage);

		this.createFilterDrawer(contentEl);
		this.renderFilterChips();
		this.setupKeyboardShortcuts(); // NEW: Setup keyboard shortcuts
	}

	onClose(): void {
		super.onClose();
		window.removeEventListener('keydown', this.handleGlobalKeydown, true);

		// Clean up debounce timer
		if (this.searchDebounceTimer) {
			clearTimeout(this.searchDebounceTimer);
			this.searchDebounceTimer = null;
		}

		if (this.graphRenderer) {
			this.graphRenderer.destroy();
			this.graphRenderer = null;
		}
	}

	private buildHeader(container: HTMLElement): void {
		const header = container.createDiv('storyteller-graph-header');
		header.createEl('h2', { text: t('networkGraph') });

		const actions = header.createDiv('storyteller-graph-header-actions');
		this.infoToggleButton = new ButtonComponent(actions);
		this.infoToggleButton.buttonEl.addClass('storyteller-toolbar-button', 'storyteller-info-toggle');
		this.infoToggleButton.buttonEl.setAttribute('type', 'button');
		this.infoToggleButton
			.setIcon('info')
			.setButtonText(t('about'))
			.setTooltip(t('about'))
			.onClick(() => this.toggleAboutSection());
		this.infoToggleButton.buttonEl.setAttribute('aria-expanded', 'false');

		this.aboutSection = container.createDiv('storyteller-graph-about storyteller-collapsible');
		this.aboutSection.setAttribute('aria-hidden', 'true');
		this.aboutSection.createEl('p', {
			text: 'Interactive visualization of relationships between story entities.'
		});
		const tipsList = this.aboutSection.createEl('ul', { cls: 'storyteller-graph-tips' });
		tipsList.createEl('li', { text: 'Drag nodes or hold Shift to explore related clusters.' });
		tipsList.createEl('li', { text: 'Use zoom controls or the mouse wheel to focus on details.' });
		tipsList.createEl('li', { text: 'Apply filters to narrow the dataset before exporting images.' });
	}

	private createToolbar(container: HTMLElement): void {
		const toolbarWrapper = container.createDiv('storyteller-graph-toolbar-wrapper');
		const toolbar = toolbarWrapper.createDiv('storyteller-graph-toolbar');

		// Filter toggle button group
		const filterGroup = toolbar.createDiv('storyteller-toolbar-group storyteller-toolbar-group--filters');
		this.filterToggleButton = new ButtonComponent(filterGroup);
		this.filterToggleButton.buttonEl.classList.add('storyteller-toolbar-button', 'storyteller-filter-toggle');
		this.filterToggleButton.buttonEl.setAttribute('type', 'button');
		this.filterToggleButton
			.setIcon('filter')
			.setButtonText(t('filters'))
			.setTooltip(t('filters'))
			.onClick(() => this.toggleFilterDrawer());
		this.filterToggleButton.buttonEl.setAttribute('aria-expanded', 'false');
		this.filterBadgeEl = this.filterToggleButton.buttonEl.createSpan({ cls: 'storyteller-filter-badge', text: '0' });
		this.filterBadgeEl.setAttr('aria-hidden', 'true');

		// Explore group - search, layout, zoom controls
		const exploreGroup = toolbar.createDiv('storyteller-toolbar-group storyteller-toolbar-group--explore');
		const searchInput = exploreGroup.createEl('input', {
			type: 'search',
			placeholder: t('searchEntities'),
			cls: 'storyteller-toolbar-search storyteller-network-search-input'
		});
		searchInput.setAttr('aria-label', t('searchEntities'));
		
		// Priority 2.3: Debounced search for better performance
		searchInput.addEventListener('input', () => {
			if (this.searchDebounceTimer) {
				clearTimeout(this.searchDebounceTimer);
			}
			
			this.searchDebounceTimer = setTimeout(() => {
				const term = searchInput.value.trim();
				if (term.length > 1) {
					this.graphRenderer?.searchAndHighlight(term);
					this.announceToScreenReader(`${t('searchEntities')}: ${term}`);
				} else {
					this.graphRenderer?.clearSearch();
				}
			}, 300); // 300ms debounce delay
		});

		const layoutSelect = exploreGroup.createEl('select', { cls: 'storyteller-toolbar-select' });
		layoutSelect.setAttr('aria-label', t('layout'));
		const layouts: Array<{ value: 'cose' | 'circle' | 'grid' | 'concentric'; label: string }> = [
			{ value: 'cose', label: t('forceDirected') },
			{ value: 'circle', label: t('circle') },
			{ value: 'grid', label: t('grid') },
			{ value: 'concentric', label: t('concentric') }
		];
		layouts.forEach(layout => layoutSelect.createEl('option', { value: layout.value, text: layout.label }));
		layoutSelect.addEventListener('change', () => {
			const layoutValue = layoutSelect.value as 'cose' | 'circle' | 'grid' | 'concentric';
			this.graphRenderer?.changeLayout(layoutValue);
			this.announceToScreenReader(`${t('layoutChanged')}: ${layouts.find(l => l.value === layoutValue)?.label}`);
		});

		const zoomSegment = exploreGroup.createDiv('storyteller-toolbar-segment');
		const zoomInBtn = new ButtonComponent(zoomSegment);
		zoomInBtn.buttonEl.addClass('storyteller-toolbar-button');
		zoomInBtn.buttonEl.setAttribute('type', 'button');
		zoomInBtn
			.setIcon('zoom-in')
			.setTooltip(t('zoomIn'))
			.onClick(() => this.graphRenderer?.zoomIn());
		zoomInBtn.buttonEl.setAttr('aria-label', t('zoomIn'));

		const zoomOutBtn = new ButtonComponent(zoomSegment);
		zoomOutBtn.buttonEl.addClass('storyteller-toolbar-button');
		zoomOutBtn.buttonEl.setAttribute('type', 'button');
		zoomOutBtn
			.setIcon('zoom-out')
			.setTooltip(t('zoomOut'))
			.onClick(() => this.graphRenderer?.zoomOut());
		zoomOutBtn.buttonEl.setAttr('aria-label', t('zoomOut'));

		const fitBtn = new ButtonComponent(zoomSegment);
		fitBtn.buttonEl.addClass('storyteller-toolbar-button');
		fitBtn.buttonEl.setAttribute('type', 'button');
		fitBtn
			.setIcon('maximize-2')
			.setTooltip(t('fitToView'))
			.onClick(() => this.graphRenderer?.fitToView());
		fitBtn.buttonEl.setAttr('aria-label', t('fitToView'));

		// Display group - toggles and export
		const displayGroup = toolbar.createDiv('storyteller-toolbar-group storyteller-toolbar-group--display');
		this.edgeLabelsToggleButton = new ButtonComponent(displayGroup);
		this.edgeLabelsToggleButton.buttonEl.classList.add('storyteller-toolbar-button');
		this.edgeLabelsToggleButton.buttonEl.setAttribute('type', 'button');
		this.edgeLabelsToggleButton
			.setIcon('tag')
			.setTooltip(t('toggleEdgeLabels') ?? 'Toggle edge labels')
			.onClick(() => this.toggleEdgeLabels());
		this.edgeLabelsToggleButton.buttonEl.setAttr('aria-label', t('toggleEdgeLabels') ?? 'Toggle edge labels');
		this.edgeLabelsToggleButton.buttonEl.setAttribute('aria-pressed', 'false');

		const refreshBtn = new ButtonComponent(displayGroup);
		refreshBtn.buttonEl.classList.add('storyteller-toolbar-button');
		refreshBtn.buttonEl.setAttribute('type', 'button');
		refreshBtn
			.setIcon('refresh-cw')
			.setTooltip(t('refresh'))
			.onClick(async () => {
				await this.graphRenderer?.refresh();
			});
		refreshBtn.buttonEl.setAttr('aria-label', t('refresh'));

		const exportBtn = new ButtonComponent(displayGroup);
		exportBtn.buttonEl.classList.add('storyteller-toolbar-button', 'storyteller-export-button');
		exportBtn.buttonEl.setAttribute('type', 'button');
		exportBtn
			.setIcon('image')
			.setButtonText(t('exportGraph'))
			.setTooltip(t('exportGraph'))
			.onClick(() => this.showExportMenu());
		this.exportButtonEl = exportBtn.buttonEl;
	}

	private createFilterChipRow(container: HTMLElement): void {
		const chipRow = container.createDiv('storyteller-filter-chip-row');
		this.filterChipsContainer = chipRow.createDiv('storyteller-active-filter-chips');

		this.filterClearButton = chipRow.createEl('button', {
			text: t('clearAllFilters'),
			cls: 'storyteller-filter-clear',
			attr: { type: 'button' }
		});
		this.filterClearButton.addEventListener('click', () => {
			void this.resetFilters();
		});
	}

	private createFilterDrawer(container: HTMLElement): void {
		this.filterBackdrop = container.createDiv('storyteller-filter-backdrop');
		this.filterBackdrop.addEventListener('click', () => this.toggleFilterDrawer(false));

		this.filterDrawer = container.createDiv('storyteller-graph-filter-drawer');
		this.filterDrawer.setAttr('role', 'dialog');
		this.filterDrawer.setAttr('aria-modal', 'true');
		this.filterDrawer.setAttr('aria-hidden', 'true');
		this.filterDrawer.setAttr('tabindex', '-1');

		const drawerHeader = this.filterDrawer.createDiv('storyteller-filter-drawer-header');
		drawerHeader.createEl('h3', { text: t('graphFilters') });
		const drawerClose = new ButtonComponent(drawerHeader);
		drawerClose.buttonEl.addClass('storyteller-toolbar-button');
		drawerClose.buttonEl.setAttribute('type', 'button');
		drawerClose
			.setIcon('x')
			.setTooltip(t('cancel'))
			.onClick(() => this.toggleFilterDrawer(false));

		const presets = this.filterDrawer.createDiv('storyteller-filter-presets');
		const allBtn = presets.createEl('button', { text: t('all'), cls: 'storyteller-filter-preset', attr: { type: 'button' } });
		allBtn.addEventListener('click', () => {
			void this.applyEntityPreset([...ENTITY_TYPES]);
		});
		const charactersBtn = presets.createEl('button', { text: t('characters'), cls: 'storyteller-filter-preset', attr: { type: 'button' } });
		charactersBtn.addEventListener('click', () => {
			void this.applyEntityPreset(['character']);
		});
		const peoplePlacesBtn = presets.createEl('button', {
			text: `${t('characters')} + ${t('locations')}`,
			cls: 'storyteller-filter-preset',
			attr: { type: 'button' }
		});
		peoplePlacesBtn.addEventListener('click', () => {
			void this.applyEntityPreset(['character', 'location']);
		});

		const entitySection = this.filterDrawer.createDiv('storyteller-filter-section');
		entitySection.createEl('p', {
			text: t('filterByEntityTypes'),
			cls: 'storyteller-filter-description'
		});

		const checkboxGrid = entitySection.createDiv('storyteller-filter-grid');
		this.filterInputs.entityCheckboxes.clear();
		ENTITY_TYPES.forEach(type => {
			const labelKey = (type + 's') as 'characters' | 'locations' | 'events' | 'items';
			const checkboxContainer = checkboxGrid.createDiv('storyteller-filter-checkbox storyteller-filter-checkbox--drawer');
			const checkbox = checkboxContainer.createEl('input', { type: 'checkbox' });
			checkbox.checked = true;
			checkbox.id = `graph-filter-${type}`;
			this.filterInputs.entityCheckboxes.set(type, checkbox);

			const label = checkboxContainer.createEl('label', { text: t(labelKey) });
			label.htmlFor = checkbox.id;

			checkbox.addEventListener('change', () => {
				if (checkbox.checked) {
					this.selectedEntityTypes.add(type);
				} else {
					this.selectedEntityTypes.delete(type);
				}

				if (this.selectedEntityTypes.size === ENTITY_TYPES.length) {
					delete this.currentFilters.entityTypes;
				} else {
					this.currentFilters.entityTypes = Array.from(this.selectedEntityTypes);
				}

				void this.syncFilters();
			});
		});

		const timelineSection = this.filterDrawer.createDiv('storyteller-filter-section storyteller-filter-section--timeline');
		timelineSection.createEl('p', {
			text: t('filterByTimeline'),
			cls: 'storyteller-filter-description'
		});

		const timelineInputs = timelineSection.createDiv('storyteller-timeline-filters storyteller-timeline-filters--drawer');
		const startContainer = timelineInputs.createDiv('date-input-wrapper');
		startContainer.createEl('label', { text: t('timelineStart'), cls: 'storyteller-filter-label' });
		this.filterInputs.timelineStart = startContainer.createEl('input', { type: 'date' });
		this.filterInputs.timelineStart.addEventListener('change', () => {
			this.currentFilters.timelineStart = this.filterInputs.timelineStart?.value || undefined;
			void this.syncFilters();
		});

		const endContainer = timelineInputs.createDiv('date-input-wrapper');
		endContainer.createEl('label', { text: t('timelineEnd'), cls: 'storyteller-filter-label' });
		this.filterInputs.timelineEnd = endContainer.createEl('input', { type: 'date' });
		this.filterInputs.timelineEnd.addEventListener('change', () => {
			this.currentFilters.timelineEnd = this.filterInputs.timelineEnd?.value || undefined;
			void this.syncFilters();
		});

		const actions = this.filterDrawer.createDiv('storyteller-filter-actions storyteller-filter-actions--drawer');
		const resetBtn = new ButtonComponent(actions);
		resetBtn.buttonEl.addClass('storyteller-toolbar-button');
		resetBtn.buttonEl.setAttribute('type', 'button');
		resetBtn
			.setButtonText(t('resetFilters'))
			.onClick(() => {
				void this.resetFilters();
			});

		const closeBtn = new ButtonComponent(actions);
		closeBtn.buttonEl.addClass('storyteller-toolbar-button');
		closeBtn.buttonEl.setAttribute('type', 'button');
		closeBtn
			.setButtonText(t('cancel'))
			.onClick(() => this.toggleFilterDrawer(false));

		this.filterDrawer.addEventListener('keydown', evt => {
			if (evt.key === 'Tab' && this.filterDrawerVisible) {
				this.maintainFocusTrap(evt);
			}
		});
	}

	private maintainFocusTrap(evt: KeyboardEvent): void {
		if (!this.filterDrawerVisible || !this.filterDrawer) return;

		const focusable = Array.from(
			this.filterDrawer.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
		).filter(el => !el.hasAttribute('disabled'));

		if (focusable.length === 0) return;

		const first = focusable[0];
		const last = focusable[focusable.length - 1];

		if (evt.shiftKey && document.activeElement === first) {
			evt.preventDefault();
			last.focus();
		} else if (!evt.shiftKey && document.activeElement === last) {
			evt.preventDefault();
			first.focus();
		}
	}

	private toggleAboutSection(): void {
		if (!this.aboutSection || !this.infoToggleButton) return;
		const isOpen = this.aboutSection.hasClass('is-open');
		this.aboutSection.toggleClass('is-open', !isOpen);
		this.aboutSection.setAttr('aria-hidden', isOpen ? 'true' : 'false');
		this.infoToggleButton.buttonEl.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
	}

	private async initializeGraph(container: HTMLElement): Promise<void> {
		this.graphContainer = container.createDiv('storyteller-network-graph-container');
		this.graphContainer.style.flex = '1';
		this.graphContainer.style.overflow = 'visible'; // Changed from 'hidden' to allow info panel to show
		this.graphContainer.style.position = 'relative';
		this.graphContainer.style.minHeight = '420px';

		// Create status bar at the top of the graph container
		this.createStatusBar(this.graphContainer);

		try {
			const renderer = new NetworkGraphRenderer(this.graphContainer, this.plugin, true); // true = isModal
			await renderer.initializeCytoscape();
			this.graphRenderer = renderer;
			
			// Update status bar after graph loads
			this.updateStatusBar();
		} catch (error) {
			console.error('Error initializing network graph:', error);
			this.graphContainer.createEl('p', {
				text: 'Error loading network graph. See console for details.',
				cls: 'storyteller-empty-state'
			});
		}
	}

	private showExportMenu(): void {
		if (!this.exportButtonEl) return;

		const menu = new Menu();
		menu.addItem(item => {
			item.setTitle(t('exportAsPNG'))
				.setIcon('image')
				.onClick(async () => {
					await this.graphRenderer?.exportAsImage('png');
					new Notice(t('graphExported'));
				});
		});
		menu.addItem(item => {
			item.setTitle(t('exportAsJPG'))
				.setIcon('image')
				.onClick(async () => {
					await this.graphRenderer?.exportAsImage('jpg');
					new Notice(t('graphExported'));
				});
		});

		const rect = this.exportButtonEl.getBoundingClientRect();
		menu.showAtPosition({
			x: rect.left,
			y: rect.bottom
		});
	}

	private toggleFilterDrawer(force?: boolean): void {
		if (!this.filterDrawer || !this.filterBackdrop || !this.filterToggleButton) return;

		const nextState = force !== undefined ? force : !this.filterDrawerVisible;
		if (nextState === this.filterDrawerVisible) return;

		this.filterDrawerVisible = nextState;
		this.filterDrawer.toggleClass('is-open', nextState);
		this.filterDrawer.setAttr('aria-hidden', nextState ? 'false' : 'true');
		this.filterBackdrop.toggleClass('is-visible', nextState);
		this.filterToggleButton.buttonEl.setAttribute('aria-expanded', nextState ? 'true' : 'false');

		if (nextState) {
			this.lastFocusedElement = document.activeElement as HTMLElement | null;
			window.requestAnimationFrame(() => {
				const focusTarget = this.filterDrawer?.querySelector<HTMLElement>('input,button,select');
				focusTarget?.focus();
			});
		} else if (this.lastFocusedElement) {
			this.lastFocusedElement.focus({ preventScroll: true });
		}
	}

	private renderFilterChips(): void {
		if (!this.filterChipsContainer || !this.filterBadgeEl || !this.filterClearButton) return;

		const chipsContainer = this.filterChipsContainer;
		chipsContainer.empty();
		const chips: Array<{ label: string; remove: () => void; ariaLabel: string }> = [];

		const entityFilter = this.currentFilters.entityTypes;
		if (entityFilter && entityFilter.length > 0 && entityFilter.length < ENTITY_TYPES.length) {
			const labels = entityFilter.map(type => t((type + 's') as 'characters' | 'locations' | 'events' | 'items'));
			chips.push({
				label: labels.join(', '),
				ariaLabel: t('filterByEntityTypes'),
				remove: () => {
					void this.applyEntityPreset([...ENTITY_TYPES]);
				}
			});
		}

		if (this.currentFilters.timelineStart) {
			chips.push({
				label: `${t('timelineStart')}: ${this.currentFilters.timelineStart}`,
				ariaLabel: t('timelineStart'),
				remove: () => {
					if (this.filterInputs.timelineStart) {
						this.filterInputs.timelineStart.value = '';
					}
					this.currentFilters.timelineStart = undefined;
					void this.syncFilters();
				}
			});
		}

		if (this.currentFilters.timelineEnd) {
			chips.push({
				label: `${t('timelineEnd')}: ${this.currentFilters.timelineEnd}`,
				ariaLabel: t('timelineEnd'),
				remove: () => {
					if (this.filterInputs.timelineEnd) {
						this.filterInputs.timelineEnd.value = '';
					}
					this.currentFilters.timelineEnd = undefined;
					void this.syncFilters();
				}
			});
		}

		if (this.currentFilters.groups?.length) {
			chips.push({
				label: this.currentFilters.groups.join(', '),
				ariaLabel: t('groups'),
				remove: () => {
					delete this.currentFilters.groups;
					void this.syncFilters();
				}
			});
		}

		if (chips.length === 0) {
			chipsContainer.createEl('span', {
				text: `${t('filters')}: ${t('all')}`,
				cls: 'storyteller-filter-chip-placeholder'
			});
			this.filterBadgeEl.textContent = '0';
			this.filterToggleButton?.buttonEl.toggleClass('has-active-filters', false);
			this.filterClearButton.classList.add('is-disabled');
			this.filterClearButton.setAttribute('disabled', 'true');
			return;
		}

		chips.forEach(chip => {
			const chipEl = chipsContainer.createDiv('storyteller-filter-chip');
			chipEl.createSpan({ text: chip.label });
			const removeBtn = chipEl.createEl('button', {
				text: '×',
				cls: 'storyteller-filter-chip-remove',
				attr: { type: 'button', 'aria-label': `${chip.ariaLabel} - ${t('resetFilters')}` }
			});
			removeBtn.addEventListener('click', () => chip.remove());
		});

		this.filterBadgeEl.textContent = String(chips.length);
		this.filterToggleButton?.buttonEl.toggleClass('has-active-filters', true);
		this.filterClearButton.classList.remove('is-disabled');
		this.filterClearButton.removeAttribute('disabled');
	}

	private async syncFilters(): Promise<void> {
		await this.graphRenderer?.applyFilters(this.currentFilters);
		this.renderFilterChips();
		this.updateStatusBar(); // Update status bar when filters change
		
		// Announce filter changes to screen readers
		const activeFilters = Object.keys(this.currentFilters).length;
		if (activeFilters > 0) {
			this.announceToScreenReader(t('filterApplied'));
		}
	}

	private async applyEntityPreset(types: EntityType[]): Promise<void> {
		this.selectedEntityTypes = new Set(types);
		this.filterInputs.entityCheckboxes.forEach((checkbox, type) => {
			checkbox.checked = types.includes(type);
		});

		if (types.length === ENTITY_TYPES.length) {
			delete this.currentFilters.entityTypes;
		} else {
			this.currentFilters.entityTypes = [...types];
		}

		await this.syncFilters();
	}

	private async resetFilters(): Promise<void> {
		this.selectedEntityTypes = new Set(ENTITY_TYPES);
		this.filterInputs.entityCheckboxes.forEach(cb => {
			cb.checked = true;
		});
		if (this.filterInputs.timelineStart) {
			this.filterInputs.timelineStart.value = '';
		}
		if (this.filterInputs.timelineEnd) {
			this.filterInputs.timelineEnd.value = '';
		}
		this.currentFilters = {};
		await this.syncFilters();
	}

	private toggleEdgeLabels(): void {
		this.graphRenderer?.toggleEdgeLabels();
		this.edgeLabelsVisible = !this.edgeLabelsVisible;
		if (this.edgeLabelsToggleButton) {
			this.edgeLabelsToggleButton.buttonEl.toggleClass('is-active', this.edgeLabelsVisible);
			this.edgeLabelsToggleButton.buttonEl.setAttribute('aria-pressed', this.edgeLabelsVisible ? 'true' : 'false');
		}
	}

	/**
	 * Setup keyboard shortcuts for graph navigation
	 * Priority 1.2: Implement keyboard navigation
	 */
	private setupKeyboardShortcuts(): void {
		const shortcuts: Array<{ key: string; ctrlKey?: boolean; handler: () => void; description: string }> = [
			{ key: 'f', handler: () => this.graphRenderer?.fitToView(), description: t('graphFitToView') },
			{ key: '+', handler: () => this.graphRenderer?.zoomIn(), description: 'Zoom In' },
			{ key: '=', handler: () => this.graphRenderer?.zoomIn(), description: 'Zoom In' },
			{ key: '-', handler: () => this.graphRenderer?.zoomOut(), description: 'Zoom Out' },
			{ key: 'Escape', handler: () => this.toggleFilterDrawer(false), description: 'Close Filter Drawer' },
			{ key: 'f', ctrlKey: true, handler: () => this.focusSearch(), description: 'Focus Search' },
			{ key: '?', handler: () => this.showKeyboardHelp(), description: t('keyboardShortcuts') }
		];

		this.contentEl.addEventListener('keydown', (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			// Don't intercept if user is typing in an input
			if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
				if (e.key !== 'Escape') return;
			}

			const matchingShortcut = shortcuts.find(sc => 
				sc.key === e.key && 
				(sc.ctrlKey === undefined || sc.ctrlKey === (e.ctrlKey || e.metaKey))
			);

			if (matchingShortcut) {
				e.preventDefault();
				e.stopPropagation();
				matchingShortcut.handler();
			}
		});
	}

	/**
	 * Focus the search input
	 */
	private focusSearch(): void {
		const searchInput = this.contentEl.querySelector<HTMLInputElement>('.storyteller-network-search-input');
		searchInput?.focus();
	}

	/**
	 * Show keyboard shortcuts help overlay
	 */
	private showKeyboardHelp(): void {
		const modal = new Modal(this.app);
		modal.titleEl.setText(t('keyboardShortcuts'));
		
		const shortcuts = [
			{ key: 'F', description: t('graphFitToView') },
			{ key: '+/=', description: 'Zoom In' },
			{ key: '-', description: 'Zoom Out' },
			{ key: 'Ctrl+F', description: 'Focus Search' },
			{ key: 'Esc', description: 'Close Filter Drawer' },
			{ key: '?', description: 'Show This Help' }
		];

		const table = modal.contentEl.createEl('table', { cls: 'storyteller-keyboard-shortcuts-table' });
		shortcuts.forEach(sc => {
			const row = table.createEl('tr');
			row.createEl('td', { text: sc.key, cls: 'storyteller-shortcut-key' });
			row.createEl('td', { text: sc.description, cls: 'storyteller-shortcut-desc' });
		});

		modal.open();
	}

	/**
	 * Announce message to screen readers via ARIA live region
	 * Priority 1.3: Improve screen reader support
	 */
	private announceToScreenReader(message: string): void {
		if (!this.liveRegionEl) return;
		
		// Clear first to ensure announcement
		this.liveRegionEl.textContent = '';
		
		setTimeout(() => {
			if (this.liveRegionEl) {
				this.liveRegionEl.textContent = message;
			}
		}, 100);
	}

	/**
	 * Update status bar with current graph metrics
	 * Priority 1.1: Add status bar for node/edge counts
	 */
	private updateStatusBar(): void {
		if (!this.statusBarEl) return;

		const nodeCount = this.graphRenderer?.getNodeCount() || 0;
		const edgeCount = this.graphRenderer?.getEdgeCount() || 0;
		const activeFilters = Object.keys(this.currentFilters).length;

		let statusText = '';
		if (nodeCount === 0 && edgeCount === 0) {
			statusText = t('emptyGraphMessage') || 'No entities to display';
		} else {
			statusText = `${nodeCount} ${nodeCount === 1 ? 'node' : 'nodes'} • ${edgeCount} ${edgeCount === 1 ? 'edge' : 'edges'}`;
			if (activeFilters > 0) {
				statusText += ` (${activeFilters} ${activeFilters === 1 ? 'filter' : 'filters'} active)`;
			}
		}

		this.statusBarEl.textContent = statusText;
	}

	/**
	 * Create status bar element
	 */
	private createStatusBar(container: HTMLElement): void {
		this.statusBarEl = container.createDiv('storyteller-graph-status-bar');
		this.statusBarEl.setAttribute('role', 'status');
		this.statusBarEl.setAttribute('aria-live', 'polite');
		this.updateStatusBar();
	}

	/**
	 * Render empty state when no nodes are visible
	 * Priority 1.1: Fix confusing empty state
	 */
	private showEmptyState(container: HTMLElement): void {
		const emptyState = container.createDiv('storyteller-empty-state');
		emptyState.setAttribute('role', 'status');
		
		const icon = emptyState.createDiv('storyteller-empty-state-icon');
		icon.innerHTML = '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="8" cy="10" r="1" fill="currentColor"/><circle cx="16" cy="10" r="1" fill="currentColor"/><path d="M8 15h8"/></svg>';
		
		emptyState.createEl('h3', { text: t('emptyGraphTitle') });
		emptyState.createEl('p', { text: t('emptyGraphMessage'), cls: 'storyteller-empty-state-message' });
		
		const tips = emptyState.createDiv('storyteller-empty-state-tips');
		tips.createEl('p', { text: t('emptyGraphTip'), cls: 'storyteller-empty-state-tip' });
		
		const actions = emptyState.createDiv('storyteller-empty-state-actions');
		const resetBtn = actions.createEl('button', { text: t('resetFilters'), cls: 'mod-cta' });
		resetBtn.addEventListener('click', () => {
			void this.resetFilters();
		});
	}
}

