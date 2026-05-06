declare module '*.css';

type FolderEntry = {
	name: string;
	path: string;
	kind: 'file' | 'directory';
	size: number | null;
};

interface Window {
	secureDrive: {
		apiBaseUrl: string;
		pickFolder: () => Promise<string | null>;
		listFolder: (folderPath: string) => Promise<FolderEntry[]>;
	};
}
