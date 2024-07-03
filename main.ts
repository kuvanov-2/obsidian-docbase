import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import { getDocBaseNote, pushDocBaseNote } from './api';

interface DocBasePluginSettings {
	accessToken: string;
	teamId: string;
}

const DEFAULT_SETTINGS: DocBasePluginSettings = {
	accessToken: '',
	teamId: ''
}

export default class DocBasePlugin extends Plugin {
	settings: DocBasePluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'get-from-docbase',
			name: 'Get from DocBase',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					if (!checking) {
						this.getFromDocBase(activeFile.path);
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
						this.pushToDocBase(activeFile.path);
					}
					return true;
				}
				return false;
			}
		});

		this.addSettingTab(new DocBaseSettingTab(this.app, this));
	}

	async getFromDocBase(filePath: string) {
		const file = await this.app.vault.getAbstractFileByPath(filePath);
		const content = await this.app.vault.read(file);
		console.log('File content:', content);

		const match = content.match(/docbase_note_id:\s*"(\d+)"|docbase_note_id:\s*(\d+)/);

		if (match) {
			const docbaseNoteId = match[1] || match[2];
			try {
				const docbaseData = await getDocBaseNote(this.settings.accessToken, this.settings.teamId, docbaseNoteId);

				const title = docbaseData.title;
				const body = docbaseData.body;
				const tags = docbaseData.tags || [];
				const draft = docbaseData.draft;

				let newContent = `---\n`;
				newContent += `docbase_note_id: ${docbaseNoteId}\n`;
				newContent += `title: "${title}"\n`;
				if (draft !== undefined) {
					newContent += `draft: ${draft}\n`;
				}
				if (tags.length > 0) {
					newContent += `tags:\n`;
					tags.forEach((tag: any) => {
						newContent += `  - "${tag.name}"\n`;
					});
				}
				newContent += `---\n\n`;
				newContent += `# ${title}\n\n${body}`;

				await this.app.vault.modify(file, newContent);
				new Notice('DocBase note updated successfully.');
			} catch (error) {
				new Notice('Failed to fetch note from DocBase.');
			}
		} else {
			new Notice('docbase_note_id property not found.');
			console.log('docbase_note_id property not found.');
		}
	}

	async pushToDocBase(filePath: string) {
		const file = await this.app.vault.getAbstractFileByPath(filePath);
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

				// タグセクションの終了後も空行を許可する修正
				if (inTagsSection) {
					for (let i = 0; i < yamlLines.length; i++) {
						const line = yamlLines[i].trim();
						if (line.startsWith('- ')) {
							const tag = line.replace('- ', '').trim().replace(/^"(.*)"$/, '$1');
							tags.push(tag);
							console.log('Tag added:', tag); // デバッグ用ログ
						} else if (line === '') {
							continue;
						} else {
							break;
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
