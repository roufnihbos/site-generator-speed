// Faster drop-in for makefun-site 1.0.0 (same output, byte for byte). Dependency-free ES module.
import { parseFrontMatter } from './vendor/lib/frontmatter.js';
import { parseTemplate, TemplateError } from './vendor/lib/template.js';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---- text
const ESC_RE = /[&<>"']/;
const ESC_G = /[&<>"']/g;
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escFn = (c) => ESCAPES[c];
const escCache = new Map();
function escapeHtml(s) {
  if (!ESC_RE.test(s)) return s;
  if (s.length > 200) return s.replace(ESC_G, escFn);
  let r = escCache.get(s);
  if (r === undefined) {
    r = s.replace(ESC_G, escFn);
    escCache.set(s, r);
  }
  return r;
}

const slugCache = new Map();
const NONASCII = /[^\x00-\x7f]/;
function slugify(text) {
  let r = slugCache.get(text);
  if (r !== undefined) return r;
  const plain = NONASCII.test(text) ? text.normalize('NFKD').replace(/\p{M}/gu, '') : text;
  let out = '';
  let gap = false;
  for (let i = 0; i < plain.length; i++) {
    const c = plain.charCodeAt(i);
    let keep;
    if (c >= 65 && c <= 90) keep = c + 32;
    else if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) keep = c;
    else {
      gap = out.length > 0;
      continue;
    }
    if (gap) out += '-';
    gap = false;
    out += String.fromCharCode(keep);
  }
  out = out.slice(0, 64).replace(/-+$/, '');
  r = out === '' ? 'untitled' : out;
  slugCache.set(text, r);
  return r;
}
function uniqueSlug(slug, taken) {
  let out = slug;
  for (let n = 2; taken.has(out); n++) out = `${slug}-${n}`;
  taken.add(out);
  return out;
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dateCache = new Map();
function longDate(date) {
  let r = dateCache.get(date);
  if (r === undefined) {
    const [y, m, d] = date.split('-');
    r = `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
    dateCache.set(date, r);
  }
  return r;
}
function isWs(c) {
  return (c >= 9 && c <= 13) || c === 32 || c === 160 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;
}
function wordsOf(t) {
  let n = 0;
  let inw = false;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    const ws = c < 128 ? c === 32 || (c >= 9 && c <= 13) : isWs(c);
    if (ws) inw = false;
    else if (!inw) {
      inw = true;
      n++;
    }
  }
  return n;
}

// ---- markdown
const BLANK = /^[ \t]*$/;
const FENCE_OPEN = /^```([A-Za-z0-9_+-]*)[ \t]*$/;
const FENCE_CLOSE = /^```[ \t]*$/;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*$/;
const HR = /^(?:---|\*\*\*)[ \t]*$/;
const BULLET = /^[-*] (.*)$/;
const ORDERED = /^(\d{1,9})\. (.*)$/;
const CONTINUED = /^ {2,}\S/;
const TRIM = /^[ \t]+|[ \t]+$/g;
const trimLine = (l) => {
  const c0 = l.charCodeAt(0), c1 = l.charCodeAt(l.length - 1);
  return c0 === 32 || c0 === 9 || c1 === 32 || c1 === 9 ? l.replace(TRIM, '') : l;
};
function headingOf(line) {
  if (line.charCodeAt(0) !== 35) return null;
  const m = HEADING.exec(line);
  return m === null || m[2] === '' ? null : m;
}
function endsParagraph(line) {
  const c = line.charCodeAt(0);
  if (c === 96) return FENCE_OPEN.test(line) || BLANK.test(line);
  if (c === 35) return headingOf(line) !== null || BLANK.test(line);
  if (c === 45 || c === 42) return HR.test(line) || BLANK.test(line);
  return BLANK.test(line);
}

const SPECIAL = /[\\`*\[]/;
const ESCAPABLE = new Set([92, 96, 42, 95, 91, 93, 40, 41, 35, 43, 45, 46, 33, 62]);
function findUnescaped(s, what, from) {
  const w0 = what.charCodeAt(0);
  const two = what.length === 2;
  for (let j = from; j <= s.length - what.length; j++) {
    const c = s.charCodeAt(j);
    if (c === 92 && j + 1 < s.length && ESCAPABLE.has(s.charCodeAt(j + 1))) {
      j++;
      continue;
    }
    if (c === w0 && (!two || s.charCodeAt(j + 1) === w0)) return j;
  }
  return -1;
}
function findSingleStar(s, from) {
  for (let j = from; j < s.length; j++) {
    const c = s.charCodeAt(j);
    if (c === 92 && j + 1 < s.length && ESCAPABLE.has(s.charCodeAt(j + 1))) {
      j++;
      continue;
    }
    if (c !== 42) continue;
    if (s.charCodeAt(j + 1) === 42) {
      j++;
      continue;
    }
    return j;
  }
  return -1;
}
const WS1 = /\s/;
function inline(s, link) {
  if (!SPECIAL.test(s)) return escapeHtml(s);
  let out = '';
  let i = 0;
  let run = 0; // start of pending plain text
  const n = s.length;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c !== 92 && c !== 96 && c !== 42 && c !== 91) {
      i++;
      continue;
    }
    if (c === 92) {
      if (i + 1 < n && ESCAPABLE.has(s.charCodeAt(i + 1))) {
        if (run < i) out += escapeHtml(s.slice(run, i));
        out += escapeHtml(s[i + 1]);
        i += 2;
        run = i;
      } else i++;
      continue;
    }
    if (c === 96) {
      const j = s.indexOf('`', i + 1);
      if (j > i + 1) {
        if (run < i) out += escapeHtml(s.slice(run, i));
        out += `<code>${escapeHtml(s.slice(i + 1, j))}</code>`;
        i = j + 1;
        run = i;
      } else i++;
      continue;
    }
    if (c === 42) {
      if (s.charCodeAt(i + 1) === 42) {
        const j = findUnescaped(s, '**', i + 2);
        if (j > i + 2) {
          if (run < i) out += escapeHtml(s.slice(run, i));
          out += `<strong>${inline(s.slice(i + 2, j), link)}</strong>`;
          i = j + 2;
          run = i;
        } else i += 2;
        continue;
      }
      const j = findSingleStar(s, i + 1);
      if (j > i + 1) {
        if (run < i) out += escapeHtml(s.slice(run, i));
        out += `<em>${inline(s.slice(i + 1, j), link)}</em>`;
        i = j + 1;
        run = i;
      } else i++;
      continue;
    }
    // [
    const k = findUnescaped(s, ']', i + 1);
    const m = k !== -1 && s.charCodeAt(k + 1) === 40 ? s.indexOf(')', k + 2) : -1;
    const target = m === -1 ? '' : s.slice(k + 2, m);
    if (target !== '' && !WS1.test(target)) {
      if (run < i) out += escapeHtml(s.slice(run, i));
      out += `<a href="${escapeHtml(link(target))}">${inline(s.slice(i + 1, k), link)}</a>`;
      i = m + 1;
      run = i;
    } else i++;
  }
  if (run < n) out += run === 0 ? escapeHtml(s) : escapeHtml(s.slice(run));
  return out;
}

function renderMarkdown(src, link) {
  const lines = src.split('\n');
  const ids = new Set();
  const toc = [];
  let excerpt = null;
  let html = '';
  let i = 0;
  const N = lines.length;
  while (i < N) {
    const line = lines[i];
    const c = line.charCodeAt(0);
    if (BLANK.test(line)) {
      i++;
      continue;
    }
    if (c === 96) {
      const fence = FENCE_OPEN.exec(line);
      if (fence !== null) {
        let body = '';
        i++;
        while (i < N && !FENCE_CLOSE.test(lines[i])) body += `${escapeHtml(lines[i++])}\n`;
        i++;
        const cls = fence[1] === '' ? '' : ` class="language-${escapeHtml(fence[1])}"`;
        html += `<pre><code${cls}>${body}</code></pre>\n`;
        continue;
      }
    }
    if (c === 35) {
      const h = headingOf(line);
      if (h !== null) {
        const depth = h[1].length;
        const id = uniqueSlug(slugify(h[2]), ids);
        const ih = inline(h[2], link);
        html += `<h${depth} id="${id}">${ih}</h${depth}>\n`;
        if (depth === 2 || depth === 3) toc.push({ level: depth, id, html: ih });
        i++;
        continue;
      }
    }
    if ((c === 45 || c === 42) && HR.test(line)) {
      html += '<hr>\n';
      i++;
      continue;
    }
    if (c === 62) {
      const body = [];
      while (i < N && lines[i].charCodeAt(0) === 62) {
        const l = lines[i++];
        body.push(trimLine(l.charCodeAt(1) === 32 ? l.slice(2) : l.slice(1)));
      }
      const ls = body.filter((l) => l !== '');
      html += ls.length === 0 ? '<blockquote>\n</blockquote>\n' : `<blockquote>\n<p>${inline(ls.join('\n'), link)}</p>\n</blockquote>\n`;
      continue;
    }
    const bullet = c === 45 || c === 42 ? BULLET.exec(line) : null;
    const ordered = bullet === null && c >= 48 && c <= 57 ? ORDERED.exec(line) : null;
    if (bullet !== null || ordered !== null) {
      const isOrdered = ordered !== null;
      const marker = isOrdered ? ORDERED : BULLET;
      const items = [];
      while (i < N) {
        const m = marker.exec(lines[i]);
        if (m !== null) {
          items.push(trimLine(isOrdered ? m[2] : m[1]));
          i++;
        } else if (CONTINUED.test(lines[i])) {
          items[items.length - 1] += `\n${trimLine(lines[i])}`;
          i++;
        } else break;
      }
      const tag = isOrdered ? 'ol' : 'ul';
      const start = isOrdered ? Number(ordered[1]) : 1;
      html += isOrdered && start !== 1 ? `<ol start="${start}">\n` : `<${tag}>\n`;
      for (const it of items) html += `<li>${inline(it, link)}</li>\n`;
      html += `</${tag}>\n`;
      continue;
    }
    let text = trimLine(line);
    i++;
    while (i < N && !endsParagraph(lines[i])) text += `\n${trimLine(lines[i++])}`;
    const ph = inline(text, link);
    if (excerpt === null) excerpt = ph;
    html += `<p>${ph}</p>\n`;
  }
  return { html, toc, excerpt: excerpt ?? '' };
}

// ---- templates (parsed once per distinct source)
const tplCache = new Map();
function parseCached(name, src) {
  const key = `${name}\u0000${src}`;
  let r = tplCache.get(key);
  if (r === undefined) {
    try {
      r = { nodes: parseTemplate(name, src) };
    } catch (err) {
      if (!(err instanceof TemplateError)) throw err;
      r = { error: err.message };
    }
    tplCache.set(key, r);
  }
  return r;
}

const hasOwn = Object.hasOwn;
function lookup(scope, path) {
  const p0 = path[0];
  let s = scope;
  while (s !== null && !hasOwn(s.vars, p0)) s = s.parent;
  if (s === null) return undefined;
  let v = s.vars[p0];
  for (let k = 1; k < path.length; k++) {
    if (v === null || typeof v !== 'object' || !hasOwn(v, path[k])) return undefined;
    v = v[path[k]];
  }
  return v;
}
function textOf(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    let o = '';
    for (let i = 0; i < v.length; i++) o += (i ? ', ' : '') + textOf(v[i]);
    return o;
  }
  return '';
}
function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== '' && v !== 0;
}
function renderNodes(nodes, scope, templates, depth) {
  let out = '';
  for (let a = 0; a < nodes.length; a++) {
    const n = nodes[a];
    switch (n.kind) {
      case 'text':
        out += n.text;
        break;
      case 'var':
        out += escapeHtml(textOf(lookup(scope, n.path)));
        break;
      case 'raw':
        out += textOf(lookup(scope, n.path));
        break;
      case 'if': {
        const v = truthy(lookup(scope, n.path));
        const branch = v !== n.not ? n.then : n.else;
        if (branch !== null) out += renderNodes(branch, scope, templates, depth);
        break;
      }
      case 'for': {
        const xs = lookup(scope, n.path);
        if (!Array.isArray(xs)) break;
        const len = xs.length;
        for (let k = 0; k < len; k++) {
          const vars = { [n.name]: xs[k], loop: { index: k + 1, first: k === 0, last: k === len - 1, length: len } };
          out += renderNodes(n.body, { vars, parent: scope }, templates, depth);
        }
        break;
      }
      case 'include': {
        const t = templates.get(n.name);
        if (t !== undefined && depth < 8) out += renderNodes(t, scope, templates, depth + 1);
        break;
      }
    }
  }
  return out;
}

// ---- build
const RESERVED = ['posts', 'tags', 'page'];
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

function resolvePath(dir, rel) {
  const parts = dir === '' ? [] : dir.split('/');
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
}
const dirOf = (p) => {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
};

export function run(input) {
  const templates = new Map();
  const report = [];
  const tnames = Object.keys(input.templates).sort(cmp);
  for (const name of tnames) {
    const r = parseCached(name, input.templates[name]);
    if (r.error !== undefined) report.push(r.error);
    else templates.set(name, r.nodes);
  }
  const base = input.site.base_url.replace(/\/+$/, '');
  const output = {};

  const files = input.files.slice().sort((x, y) => cmp(x.path, y.path));
  const statics = [];
  const staticPaths = new Set();
  let sources = [];
  for (const f of files) {
    if (f.path.endsWith('.md')) sources.push({ path: f.path, text: f.content.indexOf('\r') === -1 ? f.content : f.content.replace(/\r\n?/g, '\n') });
    else {
      statics.push(f);
      staticPaths.add(f.path);
    }
  }

  // front matter
  const kept = [];
  for (const s of sources) {
    const fm = parseFrontMatter(s.text);
    if ('error' in fm) {
      report.push(`refused ${s.path}: ${fm.error}`);
      continue;
    }
    s.data = fm.data;
    s.body = fm.body;
    s.post = s.path.startsWith('posts/');
    const own = s.path.startsWith('tags/') ? 'tags' : s.path.startsWith('page/') ? 'page' : undefined;
    if (own !== undefined) {
      report.push(`refused ${s.path}: ${own}/ is the generator's own`);
      continue;
    }
    if (s.post && !hasOwn(s.data, 'date')) {
      report.push(`refused ${s.path}: a post needs a date`);
      continue;
    }
    const layout = s.data.layout ?? (s.post ? 'post' : 'page');
    if (!templates.has(layout)) {
      report.push(`refused ${s.path}: layout "${layout}" is no template that parses`);
      continue;
    }
    s.layout = layout;
    if (s.data.draft === true) {
      report.push(`draft ${s.path}`);
      continue;
    }
    kept.push(s);
  }
  sources = kept;

  // permalinks
  const taken = new Map();
  const bySource = new Map();
  for (const s of sources) {
    const dir = s.post ? 'posts' : dirOf(s.path);
    let set = taken.get(dir);
    if (set === undefined) {
      set = new Set(dir === '' ? RESERVED : []);
      taken.set(dir, set);
    }
    const slug = uniqueSlug(s.data.slug ?? slugify(s.data.title), set);
    s.slug = slug;
    s.outDir = dir === '' ? slug : `${dir}/${slug}`;
    s.url = `${base}/${s.outDir}/`;
    bySource.set(s.path, s);
  }

  // markdown
  const broken = new Set();
  for (const s of sources) {
    const dir = dirOf(s.path);
    const link = (target) => {
      const c = target.charCodeAt(0);
      if (c === 47 || c === 35 || SCHEME.test(target)) return target;
      const hash = target.indexOf('#');
      const rel = hash === -1 ? target : target.slice(0, hash);
      const frag = hash === -1 ? '' : target.slice(hash);
      const path = rel === '' ? null : resolvePath(dir, rel);
      if (path !== null) {
        const t = bySource.get(path);
        if (t !== undefined) return `${t.url}${frag}`;
        if (staticPaths.has(path)) return `${base}/${path}${frag}`;
      }
      broken.add(`broken-link ${s.path} -> ${target}`);
      return target;
    };
    const md = renderMarkdown(s.body, link);
    s.html = md.html;
    s.toc = md.toc;
    s.excerpt = md.excerpt;
  }

  // collections
  const posts = sources.filter((s) => s.post);
  posts.sort((x, y) => cmp(y.data.date, x.data.date) || cmp(x.slug, y.slug));
  for (let k = 0; k < posts.length; k++) {
    posts[k].newer = k === 0 ? null : posts[k - 1];
    posts[k].older = k === posts.length - 1 ? null : posts[k + 1];
  }

  // tags
  const bySlug = new Map();
  const ownTags = (s) => {
    const list = s.data.tags;
    if (list === undefined) return [];
    const seen = new Set();
    const res = [];
    for (const name of list) {
      const sl = slugify(name);
      if (!seen.has(sl)) {
        seen.add(sl);
        res.push(name);
      }
    }
    return res;
  };
  for (const p of posts) {
    p.tagRefs = [];
    for (const name of ownTags(p)) {
      const slug = slugify(name);
      let tag = bySlug.get(slug);
      if (tag === undefined) {
        tag = { name, slug, url: `${base}/tags/${slug}/`, posts: [] };
        bySlug.set(slug, tag);
      }
      tag.posts.push(p);
      p.tagRefs.push(tag);
    }
  }
  for (const s of sources) {
    if (s.post) continue;
    s.tagRefs = ownTags(s).map((name) => bySlug.get(slugify(name)) ?? { name, slug: slugify(name), url: '', posts: [] });
  }
  const tags = [...bySlug.values()].sort((x, y) => y.posts.length - x.posts.length || cmp(x.slug, y.slug));

  // layouts
  const linkOf = (s) => (s === null ? null : { title: s.data.title, url: s.url, date: s.data.date ?? '', date_long: s.data.date === undefined ? '' : longDate(s.data.date) });
  const cardOf = (s) => ({
    title: s.data.title,
    url: s.url,
    date: s.data.date ?? '',
    date_long: s.data.date === undefined ? '' : longDate(s.data.date),
    summary: s.data.summary ?? '',
    excerpt: s.excerpt,
    reading_minutes: Math.max(1, Math.ceil(wordsOf(s.body) / 200)),
    tags: s.tagRefs.map((t) => ({ name: t.name, slug: t.slug, url: t.url })),
  });
  const cards = new Map();
  for (const p of posts) cards.set(p, cardOf(p));
  const site = { title: input.site.title, base_url: base };
  const allTags = tags.map((t) => ({ name: t.name, slug: t.slug, url: t.url, count: t.posts.length }));
  const recent = posts.slice(0, input.site.recent).map((p) => cards.get(p));
  const render = (name, vars) => {
    const nodes = templates.get(name);
    if (nodes === undefined) return null;
    vars.site = site;
    vars.tags = allTags;
    vars.recent = recent;
    return renderNodes(nodes, { vars, parent: null }, templates, 0);
  };
  for (const s of sources) {
    const c0 = cards.get(s) ?? cardOf(s);
    const card = { ...c0, slug: s.slug, content: s.html, toc: s.toc, newer: linkOf(s.newer ?? null), older: linkOf(s.older ?? null), is_post: s.post };
    output[`${s.outDir}/index.html`] = render(s.layout, { page: card });
  }
  const per = input.site.per_page;
  const pages = Math.max(1, Math.ceil(posts.length / per));
  const indexUrl = (k) => (k === 1 ? `${base}/` : `${base}/page/${k}/`);
  for (let k = 1; k <= pages; k++) {
    const html = render('index', {
      posts: posts.slice((k - 1) * per, k * per).map((p) => cards.get(p)),
      pager: { number: k, total: pages, url: indexUrl(k), newer_url: k === 1 ? '' : indexUrl(k - 1), older_url: k === pages ? '' : indexUrl(k + 1) },
    });
    if (html !== null) output[k === 1 ? 'index.html' : `page/${k}/index.html`] = html;
  }
  for (const t of tags) {
    const html = render('tag', { tag: { name: t.name, slug: t.slug, url: t.url, count: t.posts.length, posts: t.posts.map((p) => cards.get(p)) } });
    if (html !== null) output[`tags/${t.slug}/index.html`] = html;
  }
  const tagsHtml = render('tags', {});
  if (tagsHtml !== null) output['tags/index.html'] = tagsHtml;
  for (const f of statics) {
    if (hasOwn(output, f.path)) report.push(`shadowed ${f.path}: a built page has its path`);
    else output[f.path] = f.content;
  }

  const lines = [...report, ...broken].sort(cmp);
  let np = 0;
  for (const s of sources) if (!s.post) np++;
  lines.push(`built ${np} pages, ${posts.length} posts, ${tags.length} tags and ${statics.length} static files`);
  output['build-report.txt'] = `${lines.join('\n')}\n`;
  return output;
}
