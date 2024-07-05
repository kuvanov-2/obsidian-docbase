import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, stringifyYaml } from 'obsidian';
import { getDocBaseNote, pushDocBaseNote } from './api';

interface DocBasePluginSettings {
    accessToken: string;
    teamId: string;
}

const DEFAULT_SETTINGS: DocBasePluginSettings = {
    accessToken: '',
    teamId: '',
}

export default class DocBasePlugin extends Plugin {
    settings: DocBasePluginSettings;

    async onload() {
        await this.loadSettings();

        this.addCommand({
            id: 'pull-from-docbase',
            name: 'Pull this note from DocBase',
            checkCallback: (checking: boolean) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    if (!checking) {
                        this.pullFromDocBase();
                    }
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'push-to-docbase',
            name: 'Push this note to DocBase',
            checkCallback: (checking: boolean) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    if (!checking) {
                        this.pushToDocBase();
                    }
                    return true;
                }
                return false;
            }
        });

        this.addSettingTab(new DocBaseSettingTab(this.app, this));
    }

    async pullFromDocBase() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file.');
            return;
        }

        const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
        const docbaseNoteId = frontmatter?.docbase_note_id;

        if (!docbaseNoteId) {
            new Notice('docbase_note_id not found in the frontmatter.');
            return;
        }

        try {
            const response = await getDocBaseNote(this.settings.accessToken, this.settings.teamId, docbaseNoteId as string);
            if (response.status === 200) {
                const note = await response.json();
                const { title, body, draft, tags } = note;

                const newYaml = stringifyYaml({
                    title: title,
                    draft: draft,
                    tags: tags,
                    docbase_note_id: docbaseNoteId
                });
                const newContent = `---\n${newYaml}---\n\n# ${title}\n\n${body}`;

                await this.app.vault.modify(activeFile, newContent);
                new Notice('Note pulled from DocBase successfully.');
            } else {
                new Notice(`Failed to pull note from DocBase: ${response.statusText}`);
            }
        } catch (error) {
            new Notice(`Failed to pull note from DocBase: ${error.message}`);
        }
    }

    async pushToDocBase() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file.');
            return;
        }

        const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
        const docbaseNoteId = frontmatter?.docbase_note_id;

        if (!docbaseNoteId) {
            new Notice('docbase_note_id property not found in frontmatter.');
            return;
        }

        const content = await this.app.vault.read(activeFile);
        const bodyMatch = content.match(/#\s*(.*?)\n([\s\S]*)/);

        if (frontmatter && bodyMatch) {
            const bodyContent = bodyMatch[2];
            const { title, draft, tags } = frontmatter;

            const requestBody = {
                title: title,
                body: bodyContent,
                draft: draft || false,
                tags: tags || []
            };

            try {
                await pushDocBaseNote(this.settings.accessToken, this.settings.teamId, requestBody, docbaseNoteId as string);
                new Notice('DocBase note pushed successfully.');
            } catch (error) {
                new Notice('Failed to push note to DocBase.');
            }
        } else {
            new Notice('Failed to parse note content.');
        }
    }

    onunload() {
        // Clean up any resources
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class DocBaseSettingTab extends PluginSettingTab {
    plugin: DocBasePlugin;

    constructor(app: App, plugin: DocBasePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('Access token')
            .setDesc('Enter your DocBase access token.')
            .addText(text => text
                .setPlaceholder('Enter your access token')
                .setValue(this.plugin.settings.accessToken)
                .onChange(async (value) => {
                    this.plugin.settings.accessToken = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Team ID')
            .setDesc('Enter your DocBase team ID.')
            .addText(text => text
                .setPlaceholder('Enter your team ID')
                .setValue(this.plugin.settings.teamId)
                .onChange(async (value) => {
                    this.plugin.settings.teamId = value;
                    await this.plugin.saveSettings();
                }));
    }
}
