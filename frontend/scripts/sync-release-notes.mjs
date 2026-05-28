import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const changelogPath = path.join(repoRoot, 'CHANGELOG.md')
const publicDocsDir = path.join(repoRoot, 'frontend', 'public', 'docs')
const releaseNotesMarkdownPath = path.join(publicDocsDir, 'release-notes.md')
const releaseNotesHtmlPath = path.join(publicDocsDir, 'release-notes.html')

function normalizeMarkdown(markdown) {
  return markdown.replace(/\r\n/g, '\n').trimEnd() + '\n'
}

function stripHtmlComments(markdown) {
  return markdown.replace(/<!--[\s\S]*?-->/g, '').trim()
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>')
}

function parseReleaseNotes(markdown) {
  const lines = stripHtmlComments(markdown).split('\n')
  const result = {
    title: '版本发布记录',
    releases: [],
  }
  let currentRelease = null
  let currentGroup = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    if (line.startsWith('# ')) {
      result.title = line.replace(/^#\s+/, '').trim() || result.title
      continue
    }

    if (line.startsWith('## ')) {
      currentRelease = {
        version: line.replace(/^##\s+/, '').trim(),
        date: '',
        groups: [],
      }
      result.releases.push(currentRelease)
      currentGroup = null
      continue
    }

    if (!currentRelease) {
      continue
    }

    if (line.startsWith('发布时间：')) {
      currentRelease.date = line
      continue
    }

    if (line.endsWith('：') && !line.startsWith('- ')) {
      currentGroup = {
        title: line.slice(0, -1),
        items: [],
      }
      currentRelease.groups.push(currentGroup)
      continue
    }

    if (line.startsWith('- ')) {
      if (!currentGroup) {
        currentGroup = {
          title: '主要变化',
          items: [],
        }
        currentRelease.groups.push(currentGroup)
      }
      currentGroup.items.push(line.replace(/^-\s+/, '').trim())
    }
  }

  return result
}

function renderPublicMarkdown(markdown) {
  const markdownWithoutComments = stripHtmlComments(markdown).replace(/\n{3,}/g, '\n\n')
  return normalizeMarkdown(
    markdownWithoutComments.replace(
      /^(# .+)\n+/,
      '$1\n\n<!-- 本文件由根目录 CHANGELOG.md 生成，请勿直接编辑；运行 npm --prefix frontend run sync:release-notes 更新。 -->\n\n'
    )
  )
}

function renderReleaseNotesHtml(parsed) {
  const latestVersion = parsed.releases[0]?.version ?? '当前版本'
  const title = renderInlineMarkdown(parsed.title)
  const releaseArticles = parsed.releases
    .map((release) => {
      const groups = release.groups
        .map((group) => {
          const items = group.items
            .map((item) => `            <li>${renderInlineMarkdown(item)}</li>`)
            .join('\n')
          return `          <p class="section-label">${renderInlineMarkdown(group.title)}</p>
          <ul>
${items}
          </ul>`
        })
        .join('\n')

      return `      <article class="release">
        <div class="release-head">
          <h2>${renderInlineMarkdown(release.version)}</h2>
          <span class="date">${renderInlineMarkdown(release.date)}</span>
        </div>
${groups}
      </article>`
    })
    .join('\n\n')

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ArchSight 结构力学求解器${escapeHtml(parsed.title)}</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <script>
    (() => {
      const storedTheme = window.localStorage.getItem("archsight:theme");
      const theme = storedTheme === "light" ? "light" : "dark";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    })();
  </script>
  <style>
    :root {
      color-scheme: dark;
      --bg: #07111f;
      --body-bg: #07111f;
      --card-bg: rgba(13, 26, 45, 0.72);
      --text: #e6edf7;
      --muted: #9fb0c7;
      --line: #24344c;
      --accent: #13bff2;
      --accent-soft: rgba(19, 191, 242, 0.14);
      --accent-text: #9eeaff;
      --button-bg: rgba(13, 26, 45, 0.78);
      --button-hover: rgba(19, 191, 242, 0.14);
      --code-bg: rgba(159, 176, 199, 0.13);
    }
    :root[data-theme="light"] {
      color-scheme: light;
      --bg: #eef3f8;
      --body-bg: #eef3f8;
      --card-bg: rgba(255, 255, 255, 0.78);
      --text: #0f172a;
      --muted: #475569;
      --line: #cbd5e1;
      --accent: #0369a1;
      --accent-soft: rgba(14, 165, 233, 0.1);
      --accent-text: #075985;
      --button-bg: rgba(255, 255, 255, 0.88);
      --button-hover: rgba(14, 165, 233, 0.1);
      --code-bg: rgba(15, 23, 42, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--body-bg);
      color: var(--text);
      font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
      line-height: 1.72;
      transition: background 0.25s ease, color 0.25s ease;
    }
    main { width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0 72px; }
    header { border-bottom: 1px solid var(--line); margin-bottom: 24px; padding-bottom: 22px; }
    h1 { margin: 0; font-size: clamp(1.65rem, 3vw, 2.35rem); line-height: 1.18; letter-spacing: 0; }
    h2 { margin: 0; font-size: 1.3rem; letter-spacing: 0; }
    p, li { color: var(--muted); }
    ul { margin: 10px 0 0; padding-left: 1.2rem; }
    li + li { margin-top: 6px; }
    a { color: var(--accent); }
    code {
      border-radius: 6px;
      background: var(--code-bg);
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      font-size: 0.92em;
      padding: 0.12em 0.34em;
    }
    .doc-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 22px; }
    .back { display: inline-flex; text-decoration: none; font-weight: 700; }
    .theme-toggle {
      border: 1px solid var(--line);
      background: var(--button-bg);
      color: var(--text);
      border-radius: 8px;
      cursor: pointer;
      font: inherit;
      font-size: 0.88rem;
      font-weight: 700;
      padding: 8px 12px;
      transition: background 0.2s ease, border-color 0.2s ease;
    }
    .theme-toggle:hover { background: var(--button-hover); border-color: var(--accent); }
    .tag {
      display: inline-flex;
      width: fit-content;
      border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent);
      background: var(--accent-soft);
      color: var(--accent-text);
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 0.82rem;
      font-weight: 700;
    }
    .release-list { display: grid; gap: 16px; }
    .release {
      border: 1px solid var(--line);
      background: var(--card-bg);
      border-radius: 8px;
      padding: 18px;
    }
    .release-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
    .date { color: var(--muted); font-size: 0.92rem; font-weight: 700; }
    .section-label { margin: 12px 0 0; color: var(--text); font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <div class="doc-actions">
      <a class="back" href="/">返回工作台</a>
      <button class="theme-toggle" type="button" data-theme-toggle>
        切换为<span data-theme-label>浅色阅读</span>
      </button>
    </div>
    <header>
      <span class="tag">当前版本 ${renderInlineMarkdown(latestVersion)}</span>
      <h1>${title}</h1>
    </header>

    <section class="release-list" aria-label="${title}">
${releaseArticles}
    </section>
    <script>
      (() => {
        const applyTheme = (theme, persist = false) => {
          const normalized = theme === "light" ? "light" : "dark";
          document.documentElement.dataset.theme = normalized;
          document.documentElement.style.colorScheme = normalized;
          document.querySelectorAll("[data-theme-label]").forEach((item) => {
            item.textContent = normalized === "dark" ? "浅色阅读" : "深色阅读";
          });
          if (persist) window.localStorage.setItem("archsight:theme", normalized);
        };
        applyTheme(window.localStorage.getItem("archsight:theme"));
        document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
          applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
        });
        window.addEventListener("storage", (event) => {
          if (event.key === "archsight:theme") applyTheme(event.newValue);
        });
      })();
    </script>
  </main>
</body>
</html>
`
}

const changelogMarkdown = normalizeMarkdown(readFileSync(changelogPath, 'utf-8'))
const releaseNotesHtml = renderReleaseNotesHtml(parseReleaseNotes(changelogMarkdown))

mkdirSync(publicDocsDir, { recursive: true })
writeFileSync(releaseNotesMarkdownPath, renderPublicMarkdown(changelogMarkdown), 'utf-8')
writeFileSync(releaseNotesHtmlPath, releaseNotesHtml, 'utf-8')

console.log(`已同步 ${path.relative(repoRoot, releaseNotesMarkdownPath)} 和 ${path.relative(repoRoot, releaseNotesHtmlPath)}`)
