import { App, Plugin, PluginSettingTab, Setting, Notice, TFile } from 'obsidian';
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
            callback: () => this.pullFromDocBase(),
        });

        this.addCommand({
            id: 'push-to-docbase',
            name: 'Push this note to DocBase',
            callback: () => this.pushToDocBase(),
        });

        this.addSettingTab(new DocBaseSettingTab(this.app, this));
    }

    async pullFromDocBase() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file.');
            return;
        }

        const content = await this.app.vault.read(activeFile);
        const yamlMatch = content.match(/---\n([\s\S]*?)\n---/);

        if (yamlMatch) {
            const yamlContent = yamlMatch[1];
            const docbaseNoteIdMatch = yamlContent.match(/docbase_note_id:\s*"(\d+)"|docbase_note_id:\s*(\d+)/);
            const docbaseNoteId = docbaseNoteIdMatch ? (docbaseNoteIdMatch[1] || docbaseNoteIdMatch[2]) : null;

            if (!docbaseNoteId) {
                new Notice('docbase_note_id not found in the YAML front matter.');
                return;
            }

            try {
                const response = await getDocBaseNote(this.settings.accessToken, this.settings.teamId, docbaseNoteId as string);
                if (response.status === 200) {
                    const note = await response.json();
                    const { title, body, draft, tags } = note;

                    const newYaml = `---\ntitle: "${title}"\ndraft: ${draft}\ntags:\n${tags.map((tag: string) => `  - "${tag}"`).join('\n')}\ndocbase_note_id: "${docbaseNoteId}"\n---\n`;
                    const newContent = `${newYaml}\n# ${title}\n\n${body}`;

                    await this.app.vault.modify(activeFile, newContent);
                    new Notice('Note pulled from DocBase successfully.');
                } else {
                    new Notice(`Failed to pull note from DocBase: ${response.statusText}`);
                }
            } catch (error) {
                new Notice(`Failed to pull note from DocBase: ${error.message}`);
            }
        } else {
            new Notice('YAML front matter not found.');
        }
    }

    async pushToDocBase() {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file.');
            return;
        }

        const content = await this.app.vault.read(activeFile);
        const match = content.match(/docbase_note_id:\s*"(\d+)"|docbase_note_id:\s*(\d+)/);

        if (match) {
            const docbaseNoteId = match[1] || match[2];
            const yamlHeaderMatch = content.match(/---\n([\s\S]*?)\n---/);
            const bodyMatch = content.match(/#\s*(.*?)\n([\s\S]*)/);

            if (yamlHeaderMatch && bodyMatch) {
                const yamlContent = yamlHeaderMatch[1];
                const bodyContent = bodyMatch[2];
                const yamlLines = yamlContent.split('\n');
                let title = '';
                let draft = false;
                let tags: string[] = [];
                let inTagsSection = false;

                for (let i = 0; i < yamlLines.length; i++) {
                    const line = yamlLines[i].trim();
                    if (line.startsWith('title:')) {
                        title = line.replace('title:', '').trim().replace(/^"(.*)"$/, '$1');
                    } else if (line.startsWith('draft:')) {
                        draft = line.replace('draft:', '').trim() === 'true';
                    } else if (line.startsWith('tags:')) {
                        inTagsSection = true;
                    } else if (inTagsSection) {
                        if (line.startsWith('- ')) {
                            const tag = line.replace('- ', '').trim().replace(/^"(.*)"$/, '$1');
                            tags.push(tag);
                        } else {
                            inTagsSection = false; // タグセクションの終了を検出
                        }
                    }
                }

                const requestBody = {
                    title: title,
                    body: bodyContent,
                    draft: draft,
                    tags: tags
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
        } else {
            new Notice('docbase_note_id property not found.');
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

        containerEl.createEl('h2', { text: 'DocBase Plugin Settings' });

        new Setting(containerEl)
            .setName('Access Token')
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