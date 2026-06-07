import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const allowedHosts = env.VITE_ALLOWED_HOSTS?.split(',')
		.map((s) => s.trim())
		.filter(Boolean);

	return {
		plugins: [tailwindcss(), sveltekit()],
		server: { host: '127.0.0.1', allowedHosts }
	};
});
