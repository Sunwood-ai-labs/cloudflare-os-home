import { defineConfig } from "vitepress";

const siteTitle = "Cloudflare OS Home";
const siteDescription =
  "An unofficial local, agent-first Cloudflare OS workspace with LiteLLM, Docker Compose, and Tailscale.";
const siteBase = "/cloudflare-os-home/";
const repoUrl = "https://github.com/Sunwood-ai-labs/cloudflare-os-home";

const englishSidebar = [
  {
    text: "Guide",
    items: [
      { text: "Getting started", link: "/guide/getting-started" },
      { text: "Usage", link: "/guide/usage" },
      { text: "Architecture", link: "/guide/architecture" },
      { text: "Evidence", link: "/guide/evidence" },
      { text: "Troubleshooting", link: "/guide/troubleshooting" },
    ],
  },
];

const japaneseSidebar = [
  {
    text: "ガイド",
    items: [
      { text: "はじめに", link: "/ja/guide/getting-started" },
      { text: "使い方", link: "/ja/guide/usage" },
      { text: "アーキテクチャ", link: "/ja/guide/architecture" },
      { text: "証跡", link: "/ja/guide/evidence" },
      { text: "トラブルシュート", link: "/ja/guide/troubleshooting" },
    ],
  },
];

export default defineConfig({
  title: siteTitle,
  description: siteDescription,
  base: siteBase,
  lang: "en-US",
  cleanUrls: true,
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: siteBase + "favicon.svg" }],
    ["meta", { name: "theme-color", content: "#E66A3C" }],
    ["meta", { property: "og:image", content: siteBase + "ogp.svg" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
  ],
  themeConfig: {
    logo: "/logo.svg",
    socialLinks: [{ icon: "github", link: repoUrl }],
    footer: {
      message: "Unofficial local integration for research and personal use.",
      copyright: "Copyright (c) 2026 Sunwood AI Labs",
    },
  },
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      link: "/",
      themeConfig: {
        nav: [
          { text: "Home", link: "/" },
          { text: "Guide", link: "/guide/getting-started" },
          { text: "Evidence", link: "/guide/evidence" },
          { text: "GitHub", link: repoUrl },
        ],
        sidebar: englishSidebar,
      },
    },
    ja: {
      label: "日本語",
      lang: "ja-JP",
      link: "/ja/",
      themeConfig: {
        nav: [
          { text: "ホーム", link: "/ja/" },
          { text: "ガイド", link: "/ja/guide/getting-started" },
          { text: "証跡", link: "/ja/guide/evidence" },
          { text: "GitHub", link: repoUrl },
        ],
        sidebar: japaneseSidebar,
      },
    },
  },
});
