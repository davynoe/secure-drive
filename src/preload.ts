import { contextBridge, ipcRenderer } from 'electron';

declare const __API_BASE_URL__: string;

type FolderEntry = {
	name: string;
	path: string;
	kind: 'file' | 'directory';
	size: number | null;
};

contextBridge.exposeInMainWorld('secureDrive', {
	apiBaseUrl: __API_BASE_URL__,
	pickFolder: (): Promise<string | null> => ipcRenderer.invoke('secure-drive:pick-folder'),
	listFolder: (folderPath: string): Promise<FolderEntry[]> =>
		ipcRenderer.invoke('secure-drive:list-folder', folderPath),
});
