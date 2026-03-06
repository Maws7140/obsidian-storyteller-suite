import { App, Modal, TFile, ButtonComponent, setIcon } from 'obsidian';
import { Economy } from '../types';
import StorytellerSuitePlugin from '../main';
import { extractLedgerEntries, computeBalance, formatBalance } from '../utils/LedgerParser';

export class EconomyDetailModal extends Modal {
    private economy: Economy;
    private plugin: StorytellerSuitePlugin;

    constructor(app: App, plugin: StorytellerSuitePlugin, economy: Economy) {
        super(app);
        this.plugin = plugin;
        this.economy = economy;
        this.modalEl.addClass('storyteller-economy-detail-modal');
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // ── Header ──────────────────────────────────────────────────────────────

        const header = contentEl.createDiv('storyteller-economy-detail-header');

        if (this.economy.profileImagePath) {
            const img = header.createEl('img', { cls: 'storyteller-economy-detail-avatar' });
            img.src = this.getImageSrc(this.economy.profileImagePath);
            img.alt = this.economy.name;
        } else {
            header.createDiv({
                cls: 'storyteller-economy-detail-avatar-placeholder',
                text: this.economy.name.substring(0, 1).toUpperCase()
            });
        }

        const headerInfo = header.createDiv('storyteller-economy-detail-header-info');

        headerInfo.createEl('h2', { cls: 'storyteller-economy-detail-name', text: this.economy.name });

        const metaParts: string[] = [];
        if (this.economy.economicSystem) metaParts.push(this.economy.economicSystem);
        if (this.economy.status) metaParts.push(this.economy.status);
        if (metaParts.length) {
            headerInfo.createDiv({ cls: 'storyteller-economy-detail-meta', text: metaParts.join(' • ') });
        }

        const balanceEl = headerInfo.createDiv({ cls: 'storyteller-economy-detail-balance', text: 'Balance: …' });
        this.loadBalance().then(bal => { balanceEl.textContent = 'Balance: ' + bal; });

        const headerActions = header.createDiv('storyteller-economy-detail-header-actions');

        new ButtonComponent(headerActions)
            .setIcon('pencil')
            .setTooltip('Edit')
            .onClick(() => {
                this.close();
                import('./EconomyModal').then(({ EconomyModal }) => {
                    new EconomyModal(this.app, this.plugin, this.economy, async (updated) => {
                        await this.plugin.saveEconomy(updated);
                    }).open();
                });
            });

        new ButtonComponent(headerActions)
            .setIcon('x')
            .setTooltip('Close')
            .onClick(() => this.close());

        // ── Overview ─────────────────────────────────────────────────────────────

        if (this.economy.description) {
            this.buildSection(contentEl, 'Overview', sec => {
                sec.createEl('p', { text: this.economy.description });
            });
        }

        // ── Currencies ───────────────────────────────────────────────────────────

        if (this.economy.currencies && this.economy.currencies.length > 0) {
            this.buildSection(contentEl, 'Currencies', sec => {
                const grid = sec.createDiv('storyteller-economy-currencies-grid');
                for (const cur of this.economy.currencies!) {
                    const card = grid.createDiv('storyteller-economy-currency-card');
                    card.createEl('strong', { text: cur.name });
                    if (cur.exchangeRate !== undefined) {
                        card.createEl('span', { text: `× ${cur.exchangeRate}` });
                    }
                    if (cur.description) {
                        card.createEl('p', { text: cur.description });
                    }
                }
            });
        }

        // ── Resources + Trade Routes (two-col) ───────────────────────────────────

        const hasResources = this.economy.resources && this.economy.resources.length > 0;
        const hasRoutes = this.economy.tradeRoutes && this.economy.tradeRoutes.length > 0;

        if (hasResources || hasRoutes) {
            const twoCol = contentEl.createDiv('storyteller-economy-detail-two-col');

            if (hasResources) {
                const resSec = twoCol.createDiv('storyteller-economy-detail-section');
                resSec.createEl('h3', { text: 'Resources' });
                const list = resSec.createDiv('storyteller-economy-resources-list');
                for (const res of this.economy.resources!) {
                    const avail = res.availability || 'common';
                    list.createEl('span', {
                        cls: `storyteller-resource-chip is-${avail}`,
                        text: res.value ? `${res.name} — ${avail} (${res.value})` : `${res.name} — ${avail}`
                    });
                }
            }

            if (hasRoutes) {
                const routeSec = twoCol.createDiv('storyteller-economy-detail-section');
                routeSec.createEl('h3', { text: 'Trade Routes' });
                for (const route of this.economy.tradeRoutes!) {
                    const item = routeSec.createDiv('storyteller-trade-route-item');
                    item.createEl('span', { cls: 'storyteller-trade-route-name', text: route.name });
                    if (route.origin || route.destination) {
                        item.createEl('span', {
                            cls: 'storyteller-trade-route-path',
                            text: `${route.origin || '?'} → ${route.destination || '?'}`
                        });
                    }
                    if (route.goods && route.goods.length > 0) {
                        const goodsRow = item.createDiv('storyteller-trade-route-goods');
                        for (const good of route.goods) {
                            goodsRow.createEl('span', { cls: 'storyteller-trade-route-good', text: good });
                        }
                    }
                    if (route.status) {
                        item.createEl('span', {
                            cls: 'storyteller-trade-route-path',
                            text: route.status
                        });
                    }
                }
            }
        }

        // ── Linked Entities ───────────────────────────────────────────────────────

        const linkedGroups: [string, string[] | undefined][] = [
            ['Characters',  this.economy.linkedCharacters],
            ['Locations',   this.economy.linkedLocations],
            ['Cultures',    this.economy.linkedCultures],
            ['Factions',    this.economy.linkedFactions],
        ];
        const anyLinked = linkedGroups.some(([, arr]) => arr && arr.length > 0);

        if (anyLinked) {
            this.buildSection(contentEl, 'Linked Entities', sec => {
                for (const [label, arr] of linkedGroups) {
                    if (!arr || arr.length === 0) continue;
                    const row = sec.createDiv('storyteller-economy-linked-row');
                    row.createEl('span', { cls: 'storyteller-economy-linked-label', text: label });
                    const chips = row.createDiv('storyteller-economy-linked-chips');
                    for (const name of arr) {
                        chips.createEl('span', { cls: 'storyteller-linked-chip', text: name });
                    }
                }
            });
        }

        // ── Industries + Taxation (two-col) ───────────────────────────────────────

        if (this.economy.industries || this.economy.taxation) {
            const twoCol = contentEl.createDiv('storyteller-economy-detail-two-col');
            if (this.economy.industries) {
                const sec = twoCol.createDiv('storyteller-economy-detail-section');
                sec.createEl('h3', { text: 'Industries' });
                sec.createEl('p', { text: this.economy.industries });
            }
            if (this.economy.taxation) {
                const sec = twoCol.createDiv('storyteller-economy-detail-section');
                sec.createEl('h3', { text: 'Taxation' });
                sec.createEl('p', { text: this.economy.taxation });
            }
        }
    }

    onClose() {
        this.contentEl.empty();
    }

    private buildSection(parent: HTMLElement, title: string, builder: (sec: HTMLElement) => void): void {
        const sec = parent.createDiv('storyteller-economy-detail-section');
        sec.createEl('h3', { text: title });
        builder(sec);
    }

    private async loadBalance(): Promise<string> {
        if (!this.economy.filePath) return '—';
        const file = this.app.vault.getAbstractFileByPath(this.economy.filePath);
        if (!(file instanceof TFile)) return '—';
        const content = await this.app.vault.read(file);
        const entries = extractLedgerEntries(content);
        return entries.length ? formatBalance(computeBalance(entries)) : '—';
    }

    private getImageSrc(imagePath: string): string {
        const file = this.app.vault.getAbstractFileByPath(imagePath);
        if (file instanceof TFile) {
            return this.app.vault.getResourcePath(file);
        }
        return imagePath;
    }
}
