import { contextBridge, ipcRenderer } from 'electron';

type FolderEntry = {
	name: string;
	path: string;
	kind: 'file' | 'directory';
	size: number | null;
};

contextBridge.exposeInMainWorld('secureDrive', {
	pickFolder: (): Promise<string | null> => ipcRenderer.invoke('secure-drive:pick-folder'),
	listFolder: (folderPath: string): Promise<FolderEntry[]> =>
		ipcRenderer.invoke('secure-drive:list-folder', folderPath),
});
