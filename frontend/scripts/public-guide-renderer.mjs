import path from 'node:path'

const REPOSITORY_BLOB_ROOT = 'https://github.com/ArchSightLabs/archsight-solver/blob/main'

const PUBLIC_GUIDE_HREFS = new Map([
  ['docs/quickstart.md', '/docs/quickstart.html'],
  ['docs/en/quickstart.md', '/docs/quickstart.en.html'],
  ['docs/golden-flows.md', '/docs/golden-flows.html'],
])

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function resolveDocumentHref(sourcePath, rawTarget) {
  if (['#', 'https://', 'http://', 'mailto:'].some((prefix) => rawTarget.startsWith(prefix))) {
    return rawTarget
  }

  const [targetPath, fragment = ''] = rawTarget.split('#', 2)
  const resolvedPath = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), targetPath))
  const publicHref = PUBLIC_GUIDE_HREFS.get(resolvedPath)
  const suffix = fragment ? `#${fragment}` : ''
  return publicHref ? `${publicHref}${suffix}` : `${REPOSITORY_BLOB_ROOT}/${resolvedPath}${suffix}`
}

function renderInlineMarkdown(value, sourcePath, allowLinks = true) {
  const tokens = []
  const tokenized = value.replace(
    /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g,
    (match, code, linkLabel, linkTarget, strongText) => {
      let rendered
      if (code !== undefined) {
        rendered = `<code>${escapeHtml(code)}</code>`
      } else if (linkLabel !== undefined && allowLinks) {
        const href = resolveDocumentHref(sourcePath, linkTarget.trim())
        rendered = `<a href="${escapeHtml(href)}">${renderInlineMarkdown(linkLabel, sourcePath, false)}</a>`
      } else if (strongText !== undefined) {
        rendered = `<strong>${escapeHtml(strongText)}</strong>`
      } else {
        rendered = escapeHtml(match)
      }
      const token = `PUBLICDOCTOKEN${tokens.length}END`
      tokens.push(rendered)
      return token
    },
  )

  return tokens.reduce(
    (rendered, token, index) => rendered.replace(`PUBLICDOCTOKEN${index}END`, token),
    escapeHtml(tokenized),
  )
}

function slugifyHeading(value, fallbackIndex) {
  const slug = value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, '-')
    .replace(/[^\p{Letter}\p{Number}\-_.]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || `section-${fallbackIndex}`
}

function parseTableRow(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
}

function isTableSeparator(line) {
  const cells = parseTableRow(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function renderMarkdown(markdown, sourcePath) {
  const lines = markdown.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n')
  const output = []
  const headings = []
  const usedSlugs = new Map()
  let paragraph = []
  let listType = null
  let listItems = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    output.push(`      <p>${renderInlineMarkdown(paragraph.join(' '), sourcePath)}</p>`)
    paragraph = []
  }

  const flushList = () => {
    if (!listType || listItems.length === 0) return
    const items = listItems.map((item) => `        <li>${renderInlineMarkdown(item, sourcePath)}</li>`).join('\n')
    output.push(`      <${listType}>\n${items}\n      </${listType}>`)
    listType = null
    listItems = []
  }

  const flushBlocks = () => {
    flushParagraph()
    flushList()
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]
    const line = rawLine.trim()

    if (line.startsWith('```')) {
      flushBlocks()
      const language = line.slice(3).trim().replace(/[^a-z0-9_-]/gi, '')
      const codeLines = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index])
        index += 1
      }
      const languageClass = language ? ` class="language-${escapeHtml(language)}"` : ''
      output.push(`      <pre><code${languageClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
      continue
    }

    if (!line) {
      flushBlocks()
      continue
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      flushBlocks()
      const level = headingMatch[1].length
      const title = headingMatch[2].trim()
      if (level === 1) continue
      const baseSlug = slugifyHeading(title, headings.length + 1)
      const occurrence = usedSlugs.get(baseSlug) ?? 0
      usedSlugs.set(baseSlug, occurrence + 1)
      const slug = occurrence === 0 ? baseSlug : `${baseSlug}-${occurrence + 1}`
      output.push(`      <h${level} id="${escapeHtml(slug)}">${renderInlineMarkdown(title, sourcePath)}</h${level}>`)
      if (level === 2) headings.push({ title, slug })
      continue
    }

    if (line.startsWith('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      flushBlocks()
      const headers = parseTableRow(line)
      index += 2
      const rows = []
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        rows.push(parseTableRow(lines[index]))
        index += 1
      }
      index -= 1
      const headerHtml = headers.map((cell) => `<th>${renderInlineMarkdown(cell, sourcePath)}</th>`).join('')
      const rowsHtml = rows.map((row) => `          <tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell, sourcePath)}</td>`).join('')}</tr>`).join('\n')
      output.push(`      <div class="table-wrap">\n        <table>\n          <thead><tr>${headerHtml}</tr></thead>\n          <tbody>\n${rowsHtml}\n          </tbody>\n        </table>\n      </div>`)
      continue
    }

    const unorderedMatch = line.match(/^[-*]\s+(.+)$/)
    const orderedMatch = line.match(/^\d+\.\s+(.+)$/)
    if (unorderedMatch || orderedMatch) {
      flushParagraph()
      const nextListType = unorderedMatch ? 'ul' : 'ol'
      if (listType && listType !== nextListType) flushList()
      listType = nextListType
      listItems.push((unorderedMatch ?? orderedMatch)[1])
      continue
    }

    if (line.startsWith('> ')) {
      flushBlocks()
      output.push(`      <blockquote>${renderInlineMarkdown(line.slice(2), sourcePath)}</blockquote>`)
      continue
    }

    if (/^---+$/.test(line)) {
      flushBlocks()
      output.push('      <hr />')
      continue
    }

    if (listType && listItems.length > 0) {
      listItems[listItems.length - 1] += ` ${line}`
    } else {
      paragraph.push(line)
    }
  }

  flushBlocks()
  return { body: output.join('\n'), headings }
}

function renderThemeRuntime({ lightLabel, darkLabel }) {
  return `
    <script>
      (() => {
        const applyTheme = (theme, persist = false) => {
          const normalized = theme === "light" ? "light" : "dark";
          document.documentElement.dataset.theme = normalized;
          document.documentElement.style.colorScheme = normalized;
          document.querySelectorAll("[data-theme-label]").forEach((item) => {
            item.textContent = normalized === "dark" ? ${JSON.stringify(lightLabel)} : ${JSON.stringify(darkLabel)};
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
    </script>`
}

export function renderPublicGuideHtml(markdown, options) {
  const { sourcePath, lang, backLabel, contentsLabel, themeButtonPrefix, lightThemeLabel, darkThemeLabel, currentVersion } = options
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? 'ArchSight Solver'
  const { body, headings } = renderMarkdown(markdown, sourcePath)
  const versionLabel = currentVersion
    ? (String(currentVersion).startsWith('v') ? String(currentVersion) : `v${currentVersion}`)
    : 'v1.8.2'
  const tableOfContents = headings.length > 1
    ? `
      <nav class="toc" aria-label="${escapeHtml(contentsLabel)}">
        <strong>${escapeHtml(contentsLabel)}</strong>
        <div>${headings.map((heading) => `<a href="#${escapeHtml(heading.slug)}">${renderInlineMarkdown(heading.title, sourcePath)}</a>`).join('')}</div>
      </nav>`
    : ''

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · ArchSight Solver</title>
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
      --card: rgba(13, 26, 45, 0.78);
      --text: #e6edf7;
      --muted: #a9b8cd;
      --line: #263852;
      --accent: #13bff2;
      --accent-soft: rgba(19, 191, 242, 0.13);
      --code: #0b1728;
    }
    :root[data-theme="light"] {
      color-scheme: light;
      --bg: #eef3f8;
      --card: rgba(255, 255, 255, 0.9);
      --text: #0f172a;
      --muted: #475569;
      --line: #cbd5e1;
      --accent: #0369a1;
      --accent-soft: rgba(14, 165, 233, 0.1);
      --code: #e2e8f0;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif; line-height: 1.72; }
    main { width: min(980px, calc(100% - 32px)); margin: 0 auto; padding: 42px 0 72px; }
    .doc-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 24px; }
    .back { color: var(--accent); font-weight: 800; text-decoration: none; }
    .theme-toggle { border: 1px solid var(--line); background: var(--card); color: var(--text); border-radius: 8px; cursor: pointer; font: inherit; font-size: 0.88rem; font-weight: 700; padding: 8px 12px; }
    .theme-toggle:hover { border-color: var(--accent); background: var(--accent-soft); }
    .page-header { margin: 18px 0 26px; }
    .page-header p { margin: 0 0 8px; color: var(--accent); font-size: 0.82rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    .toc { border: 1px solid var(--line); background: var(--card); border-radius: 10px; margin-bottom: 28px; padding: 16px; }
    .toc div { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 8px; }
    .toc a { font-size: 0.9rem; text-decoration: none; }
    article { border: 1px solid var(--line); background: var(--card); border-radius: 10px; padding: clamp(18px, 4vw, 34px); }
    h1 { margin: 0 0 10px; font-size: clamp(1.75rem, 4vw, 2.7rem); line-height: 1.2; }
    h2 { border-top: 1px solid var(--line); margin: 36px 0 12px; padding-top: 28px; font-size: 1.42rem; scroll-margin-top: 20px; }
    h3 { margin: 26px 0 10px; font-size: 1.12rem; }
    p, li, td { color: var(--muted); }
    a { color: var(--accent); }
    strong { color: var(--text); }
    ul, ol { padding-left: 1.35rem; }
    li + li { margin-top: 7px; }
    code { border-radius: 5px; background: var(--code); color: var(--text); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; padding: 0.12em 0.34em; }
    pre { overflow-x: auto; border: 1px solid var(--line); border-radius: 9px; background: var(--code); padding: 15px; }
    pre code { background: transparent; padding: 0; }
    blockquote { border-left: 4px solid var(--accent); background: var(--accent-soft); color: var(--muted); margin: 18px 0; padding: 12px 16px; }
    .table-wrap { overflow-x: auto; margin: 18px 0; }
    table { width: 100%; border-collapse: collapse; min-width: 560px; }
    th, td { border: 1px solid var(--line); padding: 10px 12px; text-align: left; vertical-align: top; }
    th { background: var(--accent-soft); color: var(--text); }
    hr { border: 0; border-top: 1px solid var(--line); margin: 30px 0; }
    @media (max-width: 640px) { main { padding-top: 24px; } article { border-radius: 8px; } }
  </style>
</head>
<body>
  <main>
    <div class="doc-actions">
      <a class="back" href="/">${escapeHtml(backLabel)}</a>
      <button class="theme-toggle" type="button" data-theme-toggle>${escapeHtml(themeButtonPrefix)}<span data-theme-label>${escapeHtml(lightThemeLabel)}</span></button>
    </div>
    <header class="page-header">
      <p>ArchSight Solver ${escapeHtml(versionLabel)}</p>
      <h1>${renderInlineMarkdown(title, sourcePath)}</h1>
    </header>${tableOfContents}
    <article>
${body}
    </article>${renderThemeRuntime({ lightLabel: lightThemeLabel, darkLabel: darkThemeLabel })}
  </main>
</body>
</html>
`
}
