# Custom Editor

**Lightweight rich-text editor for PHP & Laravel**

A dependency-free rich-text (WYSIWYG) editor for PHP projects: plain JavaScript and CSS in the browser, plus a few small PHP files for uploads and HTML sanitizing. It turns any `<textarea>` into an editor, so it fits into a normal form in **plain PHP**, **Laravel**, or any other PHP project, and you can use it as many times as you like on a page.

- Two toolbars: **basic** (typography) and **advanced** (tables, images, video, source view, print …)
- No jQuery, no npm, no build step
- Server-side HTML sanitizer included
- Image and video uploads
- MIT licensed

## Quick start

```bash
# inside your project's public web folder (Laravel: public/)
git clone --depth 1 https://github.com/femishhin/custom-editor.git editor
rm -rf editor/.git            # don't leave a .git folder in a public directory
```

```html
<link rel="stylesheet" href="/editor/assets/editor.css">

<textarea name="content" data-rte="advanced"></textarea>

<script src="/editor/assets/editor.js"></script>
```

```php
require_once __DIR__ . '/editor/sanitize.php';
$content = sanitize_html($_POST['content'] ?? '');   // store this
```

Read on for the full developer guide.

---

## Contents

1. [Requirements](#1-requirements)
2. [Files in this package](#2-files-in-this-package)
3. [Install it in a project](#3-install-it-in-a-project)
4. [Add an editor to a page](#4-add-an-editor-to-a-page)
5. [Save the content on the server](#5-save-the-content-on-the-server)
6. [Show the content on the website](#6-show-the-content-on-the-website)
7. [Laravel](#7-laravel)
8. [Plain PHP](#8-plain-php)
9. [Many editors on one page, and editors added later](#9-many-editors-on-one-page-and-editors-added-later)
10. [JavaScript API](#10-javascript-api)
11. [Image and video uploads](#11-image-and-video-uploads)
12. [Security checklist (before going live)](#12-security-checklist-before-going-live)
13. [Customising](#13-customising)
14. [Updating to a new version](#14-updating-to-a-new-version)
15. [Toolbars, shortcuts and features](#15-toolbars-shortcuts-and-features)
16. [Troubleshooting](#16-troubleshooting)
17. [License](#17-license)

---

## 1. Requirements

| | |
|---|---|
| PHP | 8.1 or newer |
| PHP extensions | `dom` and `fileinfo` (both on by default in WAMP/XAMPP/most hosts) |
| Web server | Apache (the `.htaccess` files protect `data/` and `uploads/`) – see [nginx](#nginx) if you use nginx |
| Browser | Current Chrome, Edge, Firefox or Safari |
| JavaScript libraries | None – no jQuery, no build step, no npm |

---

## 2. Files in this package

```
custom-editor/
├── assets/
│   ├── editor.js      ← the editor (include on every page that has an editor)
│   └── editor.css     ← the editor's styles
├── api.php            ← handles image / video uploads (called by editor.js)
├── sanitize.php       ← sanitize_html(): clean the HTML before you store it
├── config.php         ← editor_allowed(): who may upload files  ⚠ edit before going live
├── uploads/           ← uploaded images and videos land here (scripts can't run here)
│   └── .htaccess
├── data/              ← storage used by the example page only (not web-readable)
│   └── .htaccess
├── index.php          ← example page: create / view / edit / delete entries
├── LICENSE            ← MIT
└── README.md          ← this guide
```

**What each project needs:** `assets/`, `api.php`, `sanitize.php`, `config.php` and `uploads/`.
`index.php` and `data/` are only the example and can be left out of a real project.

---

## 3. Install it in a project

Put a copy of the editor **into every project** that uses it. Each project then has its own uploads and its own `config.php` login check.

### Get the files

**Option A – download:** on GitHub click **Code → Download ZIP**, unzip, and copy the folder into your project.

**Option B – git clone** (Laravel example; use your web root for plain PHP):

```bash
cd your-laravel-app
git clone --depth 1 https://github.com/femishhin/custom-editor.git public/editor
rm -rf public/editor/.git
```

> ⚠ **Never leave a `.git` folder inside a public web folder** – anyone could download your repository history from it. Remove it as above, or, if you want to keep it to update with `git pull`, block it in the web server:
>
> ```apache
> # Apache (.htaccess in the web root, or the vhost)
> RedirectMatch 404 /\.git
> ```
> ```nginx
> # nginx
> location ~ /\.git { deny all; }
> ```

> Don't load the editor from one shared URL for several sites. Uploads only work from the **same website** the page is on (browsers block the upload request across domains), and each site needs its own login check.

### Where to put it

| Project type | Copy the folder to | Script URL |
|---|---|---|
| Laravel | `public/editor/` | `{{ asset('editor/assets/editor.js') }}` |
| Plain PHP site | e.g. `/editor/` in the web root | `/editor/assets/editor.js` |
| WAMP (this copy) | `D:\wamp64\www\editor\custom-editor\` | `/editor/custom-editor/assets/editor.js` |

You can rename the folder (`editor`, `rte`, `vendor/custom-editor` …). **Nothing inside needs changing**: `editor.js` finds `api.php` by itself (it looks next to its own `assets/` folder), and uploaded files get a site-wide path such as `/editor/uploads/2026/11/ab12….png`, which works on every page of the site.

### Folder permissions

The web server must be able to write to `uploads/` (and to `data/` if you keep the example page). On Linux hosting:

```bash
chmod -R 775 public/editor/uploads
chown -R www-data:www-data public/editor/uploads   # your web server's user
```

---

## 4. Add an editor to a page

Three things: the CSS, one `<textarea data-rte>` per editor, and the script **once**, at the end of the page.

```html
<link rel="stylesheet" href="/editor/assets/editor.css">

<form method="post" action="/admin/posts/save">
  <label for="summary">Summary</label>
  <textarea id="summary" name="summary" data-rte="basic"></textarea>

  <label for="content">Content</label>
  <textarea id="content" name="content" data-rte="advanced" data-height="500" required></textarea>

  <button type="submit">Save</button>
</form>

<script src="/editor/assets/editor.js"></script>
```

That's all. Each textarea is hidden and replaced by an editor. The editor keeps the textarea filled with the HTML, so when the form is submitted the HTML arrives in `$_POST['content']` like any other field.

### Textarea attributes

| Attribute | Values | What it does |
|---|---|---|
| `data-rte` | `basic` or `advanced` | **Required.** Which toolbar to show (see [section 15](#15-toolbars-shortcuts-and-features)). |
| `name` | any | The form field name the HTML is posted as. |
| `id` | any | Lets a `<label for="…">` focus the editor, and lets you find it with `CustomEditor.get('id')`. |
| `data-height` | `400`, `60vh`, `30rem` … | Editor height. A plain number means pixels. Default: 380px (basic) / 620px (advanced). |
| `placeholder` | text | Shown while the editor is empty. |
| `required` | – | Stops the form and shows a message if the editor is empty. |

### Editing existing content

Put the saved HTML **inside** the textarea, escaped:

```php
<textarea name="content" data-rte="advanced"><?= htmlspecialchars($post['content'] ?? '') ?></textarea>
```

(In Blade, `{{ $post->content }}` escapes for you.)

### Cache busting

Browsers cache `editor.js` and `editor.css`. After you update them, add or change a version number so everyone gets the new files:

```html
<link rel="stylesheet" href="/editor/assets/editor.css?v=13">
<script src="/editor/assets/editor.js?v=13"></script>
```

---

## 5. Save the content on the server

**Always** run editor HTML through `sanitize_html()` before you store it. It keeps the formatting and removes anything dangerous (scripts, `onclick=` and other event attributes, `javascript:` links, unknown tags, unsafe styles).

```php
require_once '/path/to/editor/sanitize.php';

$summary = sanitize_html($_POST['summary'] ?? '');
$content = sanitize_html($_POST['content'] ?? '');

// store $summary / $content in your database
```

For example, `<p onclick="steal()">Hi<script>alert(1)</script></p>` is stored as `<p>Hi</p>`.

**Database column:** use `TEXT`, or `MEDIUMTEXT`/`LONGTEXT` if content can contain big tables. In a Laravel migration: `$table->longText('content')->nullable();`

---

## 6. Show the content on the website

Because the HTML was sanitized when it was saved, print it **without** escaping:

```php
<div class="article"><?= $post['content'] ?></div>
```

```blade
<div class="article">{!! $post->content !!}</div>
```

Only do this with content that went through `sanitize_html()`. To match the editor's look on the public site you can include `editor.css` and wrap the content in `<div class="rte-content">`, or write your own styles for `h1–h6`, `blockquote`, `table`, `img` and so on.

---

## 7. Laravel

### 7.1 Copy the files

```
your-laravel-app/
└── public/
    └── editor/          ← copy assets/, api.php, sanitize.php, config.php, uploads/ here
```

Apache serves real files in `public/` directly, so `public/editor/api.php` works without a Laravel route.

### 7.2 Load the helper (once)

`sanitize_html()` is a plain PHP function. Load it with Composer so it's available everywhere. In `composer.json`:

```json
"autoload": {
    "files": ["public/editor/sanitize.php"]
}
```

Then run `composer dump-autoload`. (Or call `require_once public_path('editor/sanitize.php');` where you need it.)

### 7.3 Blade views

Put the CSS and JS in your admin layout once:

```blade
{{-- resources/views/layouts/admin.blade.php --}}
<head>
    …
    <link rel="stylesheet" href="{{ asset('editor/assets/editor.css') }}?v=13">
</head>
<body>
    @yield('content')

    <script src="{{ asset('editor/assets/editor.js') }}?v=13"></script>
    @stack('scripts')
</body>
```

A form using it (create and edit share the same view):

```blade
{{-- resources/views/admin/posts/form.blade.php --}}
@extends('layouts.admin')

@section('content')
<form method="POST" action="{{ $post->exists ? route('admin.posts.update', $post) : route('admin.posts.store') }}">
    @csrf
    @if($post->exists) @method('PUT') @endif

    <label for="title">Title</label>
    <input id="title" name="title" value="{{ old('title', $post->title) }}" required>

    <label for="summary">Summary</label>
    <textarea id="summary" name="summary" data-rte="basic" data-height="260">{{ old('summary', $post->summary) }}</textarea>

    <label for="content">Content</label>
    <textarea id="content" name="content" data-rte="advanced" data-height="520" required>{{ old('content', $post->content) }}</textarea>
    @error('content') <div class="error">{{ $message }}</div> @enderror

    <button type="submit">Save</button>
</form>
@endsection
```

An optional Blade component keeps every form short:

```blade
{{-- resources/views/components/editor.blade.php --}}
@props(['name', 'value' => '', 'mode' => 'advanced', 'height' => null])
<textarea id="{{ $name }}" name="{{ $name }}" data-rte="{{ $mode }}"
          @if($height) data-height="{{ $height }}" @endif
          {{ $attributes }}>{{ old($name, $value) }}</textarea>
```

```blade
<x-editor name="content" :value="$post->content" height="520" required />
<x-editor name="summary" :value="$post->summary" mode="basic" />
```

### 7.4 Controller

```php
public function update(Request $request, Post $post)
{
    $data = $request->validate([
        'title'   => 'required|string|max:200',
        'summary' => 'nullable|string',
        'content' => 'required|string',
    ]);

    $data['summary'] = sanitize_html($data['summary'] ?? '');
    $data['content'] = sanitize_html($data['content']);

    $post->update($data);

    return redirect()->route('admin.posts.edit', $post)->with('status', 'Saved');
}
```

Tip: sanitize in a model mutator instead, so it can never be forgotten:

```php
// app/Models/Post.php
use Illuminate\Database\Eloquent\Casts\Attribute;

protected function content(): Attribute
{
    return Attribute::make(set: fn ($value) => sanitize_html((string) $value));
}
```

### 7.5 Protect uploads in Laravel

`api.php` runs outside Laravel, so it can't see Laravel's login. Until you change something, anyone could upload files. Options:

- **Simplest:** protect `/editor/api.php` with your web server (for example HTTP basic auth), or
- **Recommended:** handle uploads with a Laravel route behind your `auth` middleware and point the editor at it:

```html
<script src="{{ asset('editor/assets/editor.js') }}" data-api="{{ url('admin/editor-api') }}"></script>
```

The route must answer like `api.php` does: `POST ?action=upload` with a `file` field (and `kind=image|video`), returning JSON `{"ok": true, "url": "/storage/…"}` or `{"ok": false, "error": "…"}`. The editor sends the header `X-Requested-With: CustomEditor` but no CSRF token, so exclude that route from CSRF verification and rely on the `auth` middleware plus that header check.

---

## 8. Plain PHP

`index.php` in this folder is a complete working example (create, list, view, edit, delete). The essentials:

```php
<?php
require __DIR__ . '/editor/sanitize.php';
session_start();
$_SESSION['csrf'] ??= bin2hex(random_bytes(16));
$id = (int) ($_GET['id'] ?? 0);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($_SESSION['csrf'], $_POST['csrf'] ?? '')) exit('Bad token');

    $content = sanitize_html($_POST['content'] ?? '');
    $pdo->prepare('UPDATE pages SET content = ? WHERE id = ?')->execute([$content, $id]);

    header('Location: edit.php?id=' . $id . '&saved=1');   // redirect after POST
    exit;
}
$stmt = $pdo->prepare('SELECT * FROM pages WHERE id = ?');
$stmt->execute([$id]);
$page = $stmt->fetch();
?>
<link rel="stylesheet" href="/editor/assets/editor.css">
<form method="post">
  <input type="hidden" name="csrf" value="<?= htmlspecialchars($_SESSION['csrf']) ?>">
  <textarea name="content" data-rte="advanced"><?= htmlspecialchars($page['content'] ?? '') ?></textarea>
  <button>Save</button>
</form>
<script src="/editor/assets/editor.js"></script>
```

---

## 9. Many editors on one page, and editors added later

**Many editors:** add as many `<textarea data-rte>` fields as you need, in one form or in several forms. Each one gets its own toolbar, content, word count and fullscreen. Popups (link, image, video, print) always insert into the editor that opened them. Include `editor.js` **only once** per page.

```html
<textarea name="intro"   data-rte="basic"></textarea>
<textarea name="body"    data-rte="advanced"></textarea>
<textarea name="sidebar" data-rte="basic" data-height="200"></textarea>
<textarea name="footer"  data-rte="basic" data-height="200"></textarea>
```

**Fields added after the page loaded** (modals, tabs loaded with AJAX, "add another section" buttons, Livewire/Alpine re-renders): call `CustomEditor.init()` with the new container. Fields that are already editors are skipped, so calling it twice is safe.

```js
// after inserting new HTML into a modal
modal.innerHTML = html;
CustomEditor.init(modal);
```

```js
// "Add section" button
const ta = document.createElement('textarea');
ta.name = 'sections[]';
ta.dataset.rte = 'basic';
container.append(ta);
CustomEditor.attach(ta);
```

Array names such as `sections[]` work: PHP receives `$_POST['sections']` as an array, so sanitize each item.

---

## 10. JavaScript API

`editor.js` creates a global `window.CustomEditor`:

| Call | Returns / does |
|---|---|
| `CustomEditor.editors` | Array of all editors on the page |
| `CustomEditor.get(key)` | The editor for a textarea – `key` is the textarea element, its `id` or its `name`; `null` if not found |
| `CustomEditor.init(root = document)` | Starts every `textarea[data-rte]` inside `root` that isn't an editor yet |
| `CustomEditor.attach(textarea)` | Starts one textarea |

Each editor object:

| Property / method | |
|---|---|
| `getHTML()` | The current clean HTML |
| `setHTML(html)` | Replace the content (the textarea is updated too) |
| `element` | The editor's outer `<div class="rte">` |
| `textarea` | The original (hidden) textarea |

Examples:

```js
const html = CustomEditor.get('content').getHTML();
CustomEditor.get('content').setHTML('<p>Template text…</p>');

// react to changes – the editor fires "input" on its textarea
document.getElementById('content').addEventListener('input', e => {
  console.log('changed', e.target.value.length);
});
```

**Submitting with AJAX/fetch:** the textarea is always up to date, so `new FormData(form)` already contains the HTML:

```js
form.addEventListener('submit', async e => {
  e.preventDefault();
  await fetch(form.action, { method: 'POST', body: new FormData(form) });
});
```

**Custom API location** (if `api.php` isn't next to `assets/`):

```html
<script>window.CustomEditorConfig = { api: '/somewhere/else/api.php' };</script>
<script src="/editor/assets/editor.js"></script>
<!-- or -->
<script src="/editor/assets/editor.js" data-api="/somewhere/else/api.php"></script>
```

---

## 11. Image and video uploads

Images are added with the image button, by **pasting** or by **dragging** a file into the editor. Videos are added with the video button (advanced toolbar) from a YouTube/Vimeo/MP4 link or a file.

| | Allowed | Max size (in `api.php`) |
|---|---|---|
| Images | JPG, PNG, GIF, WEBP | 5 MB (`MAX_UPLOAD`) |
| Videos | MP4, WEBM, OGG | 50 MB (`MAX_VIDEO`) |
| Embeds | YouTube and Vimeo only | – |

- Files are stored in `uploads/YEAR/MONTH/` with random names, and the real file type is checked (a renamed `.php` file is rejected).
- **Large videos:** PHP's own limits must also allow them. In `php.ini` (WAMP: left-click the tray icon → PHP → php.ini):
  ```ini
  upload_max_filesize = 64M
  post_max_size = 64M
  ```
  Restart the web server afterwards.
- Uploaded files are not deleted automatically when you remove them from the content.

---

## 12. Security checklist (before going live)

- [ ] **`config.php`:** allow uploads only for logged-in admins:
  ```php
  function editor_allowed(): bool {
      if (session_status() === PHP_SESSION_NONE) session_start();
      return !empty($_SESSION['admin_id']);   // your own login check
  }
  ```
  (Laravel: see [7.5](#75-protect-uploads-in-laravel).)
- [ ] **Sanitize on save** with `sanitize_html()` – every field, every time.
- [ ] Print saved content raw (`<?= $html ?>` / `{!! !!}`) **only** if it was sanitized.
- [ ] Keep the `.htaccess` files in `uploads/` and `data/`.
- [ ] Use CSRF protection on your forms (`@csrf` in Laravel).
- [ ] Remove `index.php` and `data/` from production if you don't use the example page.

### nginx

nginx ignores `.htaccess`. Add equivalent rules:

```nginx
location ^~ /editor/data/ { deny all; }
location ~* ^/editor/uploads/.*\.(php\d?|phtml|phar|html?|svg|js)$ { deny all; }
```

---

## 13. Customising

All in `assets/editor.js` unless noted. Bump the `?v=` number after changing anything (see [Cache busting](#cache-busting)).

| What | Where |
|---|---|
| Which buttons each toolbar shows, and their order | `const LAYOUTS = { basic: […], advanced: […] }` – `'|'` pushes the following buttons to the right |
| Add another toolbar (e.g. `data-rte="minimal"`) | Add a `minimal: [...]` entry to `LAYOUTS` |
| Font list | `const FONTS` |
| Font sizes | `const SIZES` |
| Line heights | `const LINE_HEIGHTS` |
| Colour palette | `const COLORS` |
| Default heights | `editor.css`: `.rte` (advanced) and `.rte[data-mode="basic"]` |
| Colours of the editor UI | `editor.css`: the variables at the top (`--accent`, `--border` …) |
| Upload size limits | `api.php`: `MAX_UPLOAD`, `MAX_VIDEO` |
| Allowed HTML tags / styles | `sanitize.php`: `$allowed`, `$tagAttrs`, and `safe_style()` |

Button names you can use in `LAYOUTS`:

`paragraph`, `fontName`, `fontSize`, `lineHeight`, `bold`, `italic`, `underline`, `strikeThrough`, `superscript`, `subscript`, `foreColor`, `backColor`, `justifyLeft`, `justifyCenter`, `justifyRight`, `justifyFull`, `orderedList`, `unorderedList`, `outdent`, `indent`, `blockquote`, `link`, `emoji`, `symbols`, `table`, `image`, `video`, `hr`, `removeFormat`, `source`, `fullscreen`, `newDoc`, `download`, `print`

Also available but not shown by default: `undo`, `redo`, `find`, `inlineCode`, `upperCase`, `lowerCase`, `titleCase`, `checklist`, `codeBlock`.

Example – a minimal toolbar:

```js
minimal: [
  { items: [['bold', 'italic', 'underline'], ['link'], ['orderedList', 'unorderedList']] },
],
```

```html
<textarea name="note" data-rte="minimal"></textarea>
```

---

## 14. Updating to a new version

1. Replace `assets/editor.js`, `assets/editor.css`, `api.php` and `sanitize.php` in each project with the files from the latest version on GitHub.
2. **Keep** your own `config.php` and the `uploads/` folder.
3. Change the `?v=` number on the CSS and JS links.

If you kept the `.git` folder (and blocked it in the web server, see [section 3](#get-the-files)), you can update with `git pull` instead – but commit or back up your own `config.php` changes first, and never commit the contents of `uploads/`.

Saved content doesn't need converting – it's plain HTML.

---

## 15. Toolbars, shortcuts and features

### Basic (`data-rte="basic"`) – one row

Text style (Normal, Heading 1–6, Quote) · Font · Size · Bold · Italic · Underline · Strikethrough · Text colour · Background colour · Align left / centre / right / justify · Numbered list (1. a. A. i. I.) · Bulleted list (disc, circle, square) · Quote · Link · Emoji · Fullscreen

### Advanced (`data-rte="advanced"`) – two rows

- **Row 1:** Bold · Italic · Underline · Strikethrough · Superscript · Subscript · Text colour · Background colour · Align ×4 · Numbered list · Bulleted list · Outdent · Indent · Quote · Emoji · Text style · Font · Size · Line height
- **Row 2:** Clear formatting · Link · Special characters (Ω) · Table · Image · Video · Horizontal line · HTML source · Fullscreen · New document · Download as HTML · Print (opens a print preview popup)

**Tables:** click in a table to get a floating bar – add or delete rows and columns, header row, delete table. `Tab` / `Shift+Tab` moves between cells (`Tab` in the last cell adds a row).

**Images:** click an image – 25 / 50 / 75 / 100 % width, float left or right, centre, alt text, remove.

### Keyboard shortcuts

| Keys | Action |
|---|---|
| Ctrl+B / Ctrl+I / Ctrl+U | Bold / italic / underline |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Ctrl+K | Insert or edit a link (Ctrl+click opens a link) |
| Ctrl+S | Submit the editor's form |
| Tab / Shift+Tab | Indent in lists, move between table cells |
| Esc | Close a popup, leave fullscreen |

### Typing shortcuts (at the start of an empty line, followed by a space)

`#` `##` `###` `####` → headings · `>` → quote · `-` or `*` → bulleted list · `1.` → numbered list · `[]` → checklist · `---` → horizontal line

### Paste

Content pasted from Word, Google Docs or web pages is cleaned automatically: bold, italic, underline, lists, tables and links are kept; fonts, classes and scripts are dropped. Pasted images are uploaded.

---

## 16. Troubleshooting

| Problem | Fix |
|---|---|
| Editor doesn't appear, plain textarea shows | `editor.js` isn't loaded (check the path in the browser's Network tab), or the textarea has no `data-rte` attribute. Include the script **after** the textareas, at the end of `<body>`. |
| Toolbar has no styling | The `editor.css` path is wrong. |
| Old toolbar / changes not visible | Browser cache – change the `?v=` number, or press Ctrl+F5. |
| Upload error "Not allowed – please log in" | `editor_allowed()` in `config.php` returned false – you're not logged in, or the check is wrong. |
| Upload error "Server error … is PHP running?" | `api.php` wasn't found next to `assets/`, or it has a PHP error – open `…/editor/api.php?action=list` in the browser to see it. Set `data-api` if `api.php` lives elsewhere. |
| "File is larger than PHP upload_max_filesize allows" | Raise `upload_max_filesize` and `post_max_size` in `php.ini`. |
| Upload fails on Linux hosting | `uploads/` isn't writable by the web server – fix the [folder permissions](#folder-permissions). |
| Formatting lost after saving | Something on the server strips HTML (e.g. `strip_tags`, or a middleware that escapes input). Use only `sanitize_html()`. |
| Content shows as `&lt;p&gt;` on the website | You escaped it when printing – use `<?= $html ?>` / `{!! $html !!}` for sanitized content. |
| Content shows as raw `<p>` text inside the editor | You didn't escape it inside the textarea – use `htmlspecialchars()` / `{{ }}` there. |
| "The content field is required" although there is text | The name in `$request->validate()` doesn't match the textarea's `name`. |
| Editor inside a modal doesn't start | Call `CustomEditor.init(modalElement)` after the modal's HTML is added. |

---

## 17. License

[MIT](LICENSE) © 2026 Femish H.
