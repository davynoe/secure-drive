import { defineConfig, loadEnv } from 'vite';

// https://vitejs.dev/config
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const apiBaseUrl = env.VITE_API_URL ?? '';

	return {
		define: {
			__API_BASE_URL__: JSON.stringify(apiBaseUrl),
		},
		build: {
			rollupOptions: {
				external: ['better-sqlite3'],
			},
		},
	};
});
