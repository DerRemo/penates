// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://penates.dev',
  integrations: [
    starlight({
      title: 'Penates',
      logo: { src: './src/assets/mark.svg', alt: 'Penates' },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/custom.css'],
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        de: { label: 'Deutsch', lang: 'de' },
      },
      // Starlight 0.30.x: social is an OBJECT {key: url}, NOT an array (array form only from 0.32+)
      social: { github: 'https://github.com/DerRemo/penates' },
      // Light (Catppuccin Latte) as default when no stored choice exists.
      // Runs before Starlight's theme script; the toggle + stored choice stay respected.
      head: [
        {
          tag: 'script',
          content:
            "if(!localStorage.getItem('starlight-theme')){document.documentElement.dataset.theme='light'}",
        },
      ],
      sidebar: [
        {
          label: 'Introduction',
          translations: { de: 'Einführung' },
          items: [
            { slug: 'docs' },
            { slug: 'docs/quickstart' },
            { slug: 'docs/concepts' },
          ],
        },
        {
          label: 'Install & Operate',
          translations: { de: 'Installation & Betrieb' },
          autogenerate: { directory: 'docs/install' },
        },
        {
          label: 'Features',
          translations: { de: 'Funktionen' },
          autogenerate: { directory: 'docs/features' },
        },
        {
          label: 'Reference',
          translations: { de: 'Referenz' },
          autogenerate: { directory: 'docs/reference' },
        },
        {
          label: 'Contributing',
          translations: { de: 'Mitmachen' },
          items: [{ slug: 'docs/contributing' }],
        },
      ],
    }),
  ],
});
