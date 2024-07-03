import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, normalizePath } from 'obsidian';
import { getDocBaseNote, pushDocBaseNote } from './api';

interface DocBasePluginSettings {
    accessToken: string;
    teamId: string;
}

const DEFAULT_SETTINGS: DocBasePluginSettings = {
    accessToken: '',
    teamId: ''
};

export default class DocBasePlugin extends Plugin {
    settings: DocBasePluginSettings;

    async onload() {
        console.log('Loading DocBase Plugin');
        await this.loadSettings();

        this.addCommand({
            id: 'push-docbase-note',
            name: 'Push to DocBase',
            checkCallback: (checking: boolean) => {
                if (checking) {
                    return !!this.app.workspace.getActiveFile();
                }
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    this.pushToDocBase(activeFile.path);
                }
            }
        });

        this.addCommand({
            id: 'pull-docbase-note',
            name: 'Pull this note from DocBase',
            checkCallback: (checking: boolean) => {
                if (checking) {
                    return !!this.app.workspace.getActiveFile();
                }
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    this.pullFromDocBase(activeFile.path);
                }
            }
        });

        this.addSettingTab(new DocBaseSettingTab(this.app, this));
    }

    onunload() {
        console.log('Unloading DocBase Plugin');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async pushToDocBase(filePath: string) {
        const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
        const content = await this.app.vault.read(file);
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
                    console.log('Processing line:', line); // デバッグ用ログ
                    if (line.startsWith('title:')) {
                        title = line.replace('title:', '').trim().replace(/^"(.*)"$/, '$1');
                    } else if (line.startsWith('draft:')) {
                        draft = line.replace('draft:', '').trim() === 'true';
                    } else if (line.startsWith('tags:')) {
                        inTagsSection = true;
                        console.log('Tags section found'); // デバッグ用ログ
                    } else if (inTagsSection) {
                        if (line.startsWith('- ')) {
                            const tag = line.replace('- ', '').trim().replace(/^"(.*)"$/, '$1');
                            tags.push(tag);
                            console.log('Tag added:', tag); // デバッグ用ログ
                        } else {
                            inTagsSection = false; // タグセクションの終了を検出
                            console.log('Tags section ended'); // デバッグ用ログ
                        }
                    }
                }

                // タグが一つしかない場合は文字列に変換
                const docBaseTags = tags.length === 1 ? tags[0] : tags;

                // 再度タグの最終結果を表示するためのログを追加
                console.log('Final tags after processing:', docBaseTags); // デバッグ用ログ

                const requestBody = {
                    title: title,
                    body: bodyContent,
                    draft: draft,
                    tags: docBaseTags
                };

                console.log('Request Body:', requestBody);  // デバッグ用ログ

                try {
                    await pushDocBaseNote(this.settings.accessToken, this.settings.teamId, docbaseNoteId, requestBody);
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
	async pullFromDocBase(filePath: string) {
		const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
		const content = await this.app.vault.read(file);
		const match = content.match(/docbase_note_id:\s*"(\d+)"|docbase_note_id:\s*(\d+)/);
	
		if (match) {
			const docbaseNoteId = match[1] || match[2];
			try {
				const response = await getDocBaseNote(this.settings.accessToken, this.settings.teamId, docbaseNoteId);
				const { title, body, draft, tags } = response;
	
				// Create new YAML header
				let newYaml = `---\ntitle: "${title}"\ndraft: ${draft}\ntags:\n`;
				tags.forEach((tag: { name: string }) => {
					newYaml += `  - "${tag.name}"\n`;
				});
				newYaml += `docbase_note_id: "${docbaseNoteId}"\n---`;
	
				// Create new content
				const newContent = `${newYaml}\n# ${title}\n${body}`;
	
				// Overwrite the file with the new content
				await this.app.vault.modify(file, newContent);
	
				new Notice('DocBase note retrieved successfully.');
			} catch (error) {
				new Notice('Failed to retrieve note from DocBase.');
			}
		} else {
			new Notice('docbase_note_id property not found.');
		}
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
            .setDesc('Enter your DocBase access token')
            .addText(text => text
                .setPlaceholder('Enter your token')
                .setValue(this.plugin.settings.accessToken)
                .onChange(async (value) => {
                    console.log('Access Token: ' + value);
                    this.plugin.settings.accessToken = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Team ID')
            .setDesc('Enter your DocBase team ID')
            .addText(text => text
                .setPlaceholder('Enter your team ID')
                .setValue(this.plugin.settings.teamId)
                .onChange(async (value) => {
                    console.log('Team ID: ' + value);
                    this.plugin.settings.teamId = value;
                    await this.plugin.saveSettings();
                }));
    }
}