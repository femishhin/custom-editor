/* Custom Editor – dependency-free WYSIWYG editor (RichTextEditor-style UI)
 * Every <div class="rte" data-doc="<16 hex>" data-mode="basic|advanced"> on the page
 * becomes an editor that saves its own document through api.php (autosave + Ctrl+S).
 */
(() => {
  'use strict';

  // api.php sits next to the assets/ folder, wherever this script is included from.
  // Override with <script src="…/editor.js" data-api="/path/api.php"> or window.CustomEditorConfig = { api: '…' }.
  const SCRIPT = document.currentScript;
  const API = (SCRIPT && SCRIPT.dataset.api)
    || (window.CustomEditorConfig && window.CustomEditorConfig.api)
    || (SCRIPT && SCRIPT.src ? new URL('../api.php', SCRIPT.src).href : 'api.php');
  const AUTOSAVE_MS = 2000;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // popover, dialogs and toast are shared by all editors; add them if the page doesn't have them
  if (!$('#pop')) document.body.insertAdjacentHTML('beforeend', `<!-- dropdown popover shared by both editors (content filled by JS) -->
<div class="pop" id="pop" hidden></div>

<!-- ================= Dialogs (shared) ================= -->
<dialog id="linkDialog" class="dlg">
  <form method="dialog">
    <h3>Insert link</h3>
    <label>Text <input id="linkText" placeholder="Link text"></label>
    <label>URL <input id="linkUrl" placeholder="https://example.com" required></label>
    <label class="row"><input type="checkbox" id="linkNewTab" checked> Open in new tab</label>
    <div class="dlg-actions">
      <button type="button" class="btn danger" id="linkRemove">Remove link</button>
      <span class="grow"></span>
      <button type="button" class="btn" data-close>Cancel</button>
      <button value="ok" class="btn btn-primary">Apply</button>
    </div>
  </form>
</dialog>

<dialog id="imageDialog" class="dlg">
  <form method="dialog">
    <h3>Insert image</h3>
    <div class="drop" id="imageDrop">
      Drop an image here or <label class="linkish">browse<input type="file" id="imageFile" accept="image/*" hidden></label>
    </div>
    <p class="muted center">— or —</p>
    <label>Image URL <input id="imageUrl" placeholder="https://…/photo.jpg"></label>
    <label>Alt text <input id="imageAlt" placeholder="Describe the image"></label>
    <div class="dlg-actions">
      <span class="grow"></span>
      <button type="button" class="btn" data-close>Cancel</button>
      <button value="ok" class="btn btn-primary">Insert</button>
    </div>
  </form>
</dialog>

<dialog id="videoDialog" class="dlg">
  <form method="dialog">
    <h3>Insert video</h3>
    <label>YouTube, Vimeo or MP4 link <input id="videoUrl" placeholder="https://www.youtube.com/watch?v=…"></label>
    <p class="muted center">— or —</p>
    <div class="drop" id="videoDrop">
      Drop a video file (MP4 / WEBM) or <label class="linkish">browse<input type="file" id="videoFile" accept="video/mp4,video/webm,video/ogg" hidden></label>
    </div>
    <div class="dlg-actions">
      <span class="grow"></span>
      <button type="button" class="btn" data-close>Cancel</button>
      <button value="ok" class="btn btn-primary">Insert</button>
    </div>
  </form>
</dialog>

<dialog id="previewDialog" class="dlg dlg-wide">
  <div class="preview-head">
    <h3>Print preview</h3>
    <span class="grow"></span>
    <button type="button" class="btn btn-primary" id="previewPrint">Print</button>
    <button type="button" class="btn" data-close>Close</button>
    <button type="button" class="dlg-x" data-close title="Close (Esc)" aria-label="Close">&times;</button>
  </div>
  <iframe id="previewFrame" title="Print preview"></iframe>
</dialog>

<div class="toast" id="toast" role="status" aria-live="polite"></div>`);

  const pop = $('#pop');
  const shared = { owner: null, last: null };   // editor that opened a dialog / was used last

  function createEditor(rte, cfg) {
    const me = {};
    rte.innerHTML = SHELL;
    const q = s => rte.querySelector(s);
    const section = rte.closest('.ed-section') || rte;
    const editor = q('.rte-content');
    const source = q('.rte-source');
    const toolbar = q('.rte-toolbar');
    const DUMMY = document.createElement('span');   // stands in for tools this layout doesn't show
    if (cfg.placeholder) editor.dataset.placeholder = cfg.placeholder;

    const state = {
      id: cfg.doc,
      dirty: false,
      saving: false,
      pendingSave: false,
      changeCounter: 0,
      sourceMode: false,
      savedRange: null,
      selectedEl: null,
      activeCell: null,
      autosaveTimer: null,
      foreColor: '#d93025',
      backColor: '#fbbc04',
    };

    document.execCommand('defaultParagraphSeparator', false, 'p');

    /* ================================================================ icons */

    const P = {
      bold: '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>',
      italic: '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>',
      underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/>',
      strike: '<path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" x2="20" y1="12" y2="12"/>',
      sup: '<path d="m4 19 8-8"/><path d="m12 19-8-8"/><path d="M20 12h-4c0-1.5.44-2 1.5-2.5S20 8.33 20 7c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07"/>',
      sub: '<path d="m4 5 8 8"/><path d="m12 5-8 8"/><path d="M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07"/>',
      alignLeft: '<line x1="21" x2="3" y1="6" y2="6"/><line x1="15" x2="3" y1="12" y2="12"/><line x1="17" x2="3" y1="18" y2="18"/>',
      alignCenter: '<line x1="21" x2="3" y1="6" y2="6"/><line x1="17" x2="7" y1="12" y2="12"/><line x1="19" x2="5" y1="18" y2="18"/>',
      alignRight: '<line x1="21" x2="3" y1="6" y2="6"/><line x1="21" x2="9" y1="12" y2="12"/><line x1="21" x2="7" y1="18" y2="18"/>',
      justify: '<line x1="3" x2="21" y1="6" y2="6"/><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="21" y1="18" y2="18"/>',
      ol: '<line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
      ul: '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
      indent: '<polyline points="3 8 7 12 3 16"/><line x1="21" x2="11" y1="12" y2="12"/><line x1="21" x2="11" y1="6" y2="6"/><line x1="21" x2="11" y1="18" y2="18"/>',
      outdent: '<polyline points="7 8 3 12 7 16"/><line x1="21" x2="11" y1="12" y2="12"/><line x1="21" x2="11" y1="6" y2="6"/><line x1="21" x2="11" y1="18" y2="18"/>',
      quote: '<path d="M7 7h3v5c0 2.5-1.5 4-4 4"/><path d="M7 7a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h3"/><path d="M16 7h3v5c0 2.5-1.5 4-4 4"/><path d="M16 7a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h3"/>',
      smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
      pilcrow: '<path d="M13 4v16"/><path d="M17 4v16"/><path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13"/>',
      font: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/>',
      size: '<path d="M3 19 8 6l5 13"/><path d="M4.6 15h6.8"/><path d="m14.5 19 3-7.5 3 7.5"/><path d="M15.6 16.5h3.8"/>',
      lineHeight: '<path d="m3 8 3-3 3 3"/><path d="M6 5v14"/><path d="m3 16 3 3 3-3"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
      clear: '<path d="M4 7V4h16v3"/><path d="M5 20h6"/><path d="M13 4 8 20"/><path d="m15 15 5 5"/><path d="m20 15-5 5"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
      link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
      omega: '<path d="M3 20h4.5a.5.5 0 0 0 .5-.5v-.28a.52.52 0 0 0-.25-.44 8 8 0 1 1 8.5 0 .52.52 0 0 0-.25.44v.28a.5.5 0 0 0 .5.5H21"/>',
      table: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>',
      image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
      video: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m10 8 5 4-5 4Z"/>',
      eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
      source: '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>',
      max: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
      min: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
      undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
      redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
      more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
      print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
      download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
      newDoc: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M12 18v-6"/>',
      hr: '<path d="M4 12h16"/>',
      checklist: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
      codeInline: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
      codeBlock: '<path d="m10 9-3 3 3 3"/><path d="m14 15 3-3-3-3"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
      caret: '<path d="m6 9 6 6 6-6"/>',
      highlighter: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
    };
    const svg = (name, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${P[name]}</svg>`;
    const txt = (t, small) => `<span class="txt${small ? ' small' : ''}">${t}</span>`;

    /* ============================================================ API, toast */

    async function api(action, { method = 'GET', params = {}, json, form } = {}) {
      const qs = new URLSearchParams({ action, ...params });
      const opts = { method, headers: {} };
      if (method === 'POST') opts.headers['X-Requested-With'] = 'CustomEditor';
      if (json) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(json); }
      if (form) opts.body = form;
      let res, data;
      try {
        res = await fetch(`${API}?${qs}`, opts);
        data = await res.json();
      } catch (e) {
        throw new Error(res ? `Server error (${res.status}) – is PHP running?` : 'Cannot reach server');
      }
      if (!data.ok) { const err = new Error(data.error || 'Request failed'); err.status = res.status; throw err; }
      return data;
    }

    let toastTimer;
    function toast(msg, isError = false) {
      const t = $('#toast');
      t.textContent = msg;
      t.className = 'toast show' + (isError ? ' error' : '');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (t.className = 'toast'), isError ? 4500 : 2200);
    }

    /* =========================================================== load / save */

    async function load() {
      if (cfg.textarea) {                      // form mode: start from the textarea's HTML
        editor.innerHTML = cfg.textarea.value;
        prepareContent();
        updateStats();
        return;
      }
      try {
        const { doc } = await api('load', { params: { id: state.id, optional: 1 } });
        if (!doc) { setClean('Not saved'); updateStats(); return; }
        editor.innerHTML = doc.html;
        prepareContent();
        setClean('Saved');
      } catch (e) {
        if (e.status === 404) { editor.innerHTML = ''; setClean('Not saved'); }
        else toast(e.message, true);
      }
      updateStats();
    }

    function docTitle() {
      const h = editor.querySelector('h1,h2,h3');
      const t = (h ? h.textContent : editor.innerText.split('\n').find(l => l.trim()) || '').trim();
      return t.slice(0, 80) || 'Untitled';
    }

    async function save({ silent = false } = {}) {
      if (cfg.textarea) { syncTextarea(); return true; }
      if (state.sourceMode) editor.innerHTML = source.value;
      if (state.saving) { state.pendingSave = true; return false; }
      state.saving = true;
      clearTimeout(state.autosaveTimer);
      setSaveState('Saving…');
      const at = state.changeCounter;
      try {
        await api('save', { method: 'POST', json: { id: state.id, title: docTitle(), html: cleanHTML() } });
        if (state.changeCounter === at) setClean('Saved'); else setSaveState('Unsaved changes', 'dirty');
        if (!silent) toast('Saved');
        return true;
      } catch (e) {
        setSaveState('Save failed', 'error');
        toast(e.message, true);
        return false;
      } finally {
        state.saving = false;
        if (state.pendingSave) { state.pendingSave = false; save({ silent: true }); }
      }
    }

    /** Form mode: copy the clean HTML into the hidden textarea so a normal form submit sends it. */
    function syncTextarea() {
      if (!cfg.textarea) return;
      cfg.textarea.value = state.sourceMode ? source.value : cleanHTML();
      cfg.textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function markDirty() {
      if (cfg.textarea) { syncTextarea(); return; }
      state.changeCounter++;
      state.dirty = true;
      setSaveState('Unsaved changes', 'dirty');
      clearTimeout(state.autosaveTimer);
      state.autosaveTimer = setTimeout(() => { if (state.dirty) save({ silent: true }); }, AUTOSAVE_MS);
    }
    function setClean(label) { state.dirty = false; clearTimeout(state.autosaveTimer); setSaveState(label); }
    function setSaveState(text, cls = '') {
      const s = section.querySelector('.save-state');
      if (s) { s.textContent = text; s.className = 'save-state ' + cls; }
    }

    /** Make embedded media non-editable inside the editor. */
    function prepareContent() {
      $$('.media', editor).forEach(m => m.setAttribute('contenteditable', 'false'));
    }

    /** Editor HTML without editor-only artifacts. */
    function cleanHTML() {
      const clone = editor.cloneNode(true);
      $$('mark.find-hit', clone).forEach(unwrap);
      $$('.selected, .cell-active', clone).forEach(el => el.classList.remove('selected', 'cell-active'));
      $$('[contenteditable]', clone).forEach(el => el.removeAttribute('contenteditable'));
      $$('[class=""]', clone).forEach(el => el.removeAttribute('class'));
      return clone.innerHTML.trim();
    }

    /* ===================================================== selection helpers */

    function saveSelection() {
      const sel = getSelection();
      if (sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        state.savedRange = sel.getRangeAt(0).cloneRange();
      }
    }
    function restoreSelection() {
      editor.focus({ preventScroll: true });
      if (!state.savedRange || !editor.contains(state.savedRange.commonAncestorContainer)) return;
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(state.savedRange);
    }
    function selectionNode() {
      const sel = getSelection();
      if (!sel.rangeCount) return null;
      let n = sel.getRangeAt(0).startContainer;
      if (n.nodeType === 3) n = n.parentNode;
      return editor.contains(n) ? n : null;
    }
    function closestInEditor(node, selector) {
      const el = node && node.closest ? node.closest(selector) : null;
      return el && editor.contains(el) && el !== editor ? el : null;
    }
    function placeCaret(el, atEnd = false) {
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(!atEnd);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
    /** Select from the start of the first node to the end of the last one. */
    function selectNodes(nodes) {
      nodes = nodes.filter(n => n.isConnected);
      if (!nodes.length) return;
      const r = document.createRange();
      r.setStartBefore(nodes[0]);
      r.setEndAfter(nodes[nodes.length - 1]);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      state.savedRange = r.cloneRange();
    }

    function unwrap(el) {
      const p = el.parentNode;
      while (el.firstChild) p.insertBefore(el.firstChild, el);
      p.removeChild(el);
      p.normalize();
    }
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const BLOCK_SEL = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th';
    /** Text blocks touched by the current selection. */
    function selectedBlocks() {
      restoreSelection();
      const sel = getSelection();
      if (!sel.rangeCount) return [];
      const r = sel.getRangeAt(0);
      let blocks = $$(BLOCK_SEL, editor).filter(b => r.intersectsNode(b) && !b.querySelector(BLOCK_SEL));
      if (!blocks.length) {
        document.execCommand('formatBlock', false, '<p>');
        const b = closestInEditor(selectionNode(), BLOCK_SEL);
        blocks = b ? [b] : [];
      }
      return blocks;
    }

    /* =============================================================== commands */

    function exec(cmd, value = null, css = false) {
      restoreSelection();
      document.execCommand('styleWithCSS', false, css);
      if (value == null) document.execCommand(cmd, false);   // a null value would end up as e.g. <hr id="null">
      else document.execCommand(cmd, false, value);
      document.execCommand('styleWithCSS', false, false);
      saveSelection();
      afterChange();
    }

    function afterChange() {
      normalizeBlocks();
      markDirty();
      updateToolbar();
      updateStats();
      placeBars();
    }

    /** Chrome nests lists inside <p> (<p><ul>…</ul></p>); split those paragraphs, keeping the caret. */
    const BLOCKS = 'ul,ol,table,p,h1,h2,h3,h4,h5,h6,blockquote,pre,div,hr,figure';
    function normalizeBlocks() {
      const bad = $$('p', editor).filter(p => [...p.children].some(c => c.matches(BLOCKS)));
      if (!bad.length) return;
      const sel = getSelection();
      const saved = sel.rangeCount ? [sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset] : null;
      for (const p of bad.reverse()) {
        const frag = document.createDocumentFragment();
        let run = null;
        for (const n of [...p.childNodes]) {
          if (n.nodeType === 1 && n.matches(BLOCKS)) { run = null; frag.append(n); continue; }
          if (!run) {
            if ((n.nodeType === 3 && !n.data.trim()) || n.nodeName === 'BR') continue;
            run = document.createElement('p');
            frag.append(run);
          }
          run.append(n);
        }
        p.replaceWith(frag);
      }
      if (saved && saved[0] && editor.contains(saved[0])) {
        try { sel.setBaseAndExtent(...saved); } catch { /* caret node vanished */ }
      }
    }

    /** Insert a block element at the caret's top-level block (replacing it when empty). */
    function insertBlockNode(el) {
      restoreSelection();
      let block = selectionNode();
      while (block && block.parentNode !== editor) block = block.parentNode;
      if (!block) editor.append(el);
      else if (block.matches && block.matches('p,h1,h2,h3,h4,h5,h6,div') && !block.textContent.trim() && !block.querySelector('img,iframe,video'))
        block.replaceWith(el);
      else block.after(el);
      if (!el.nextElementSibling) {
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        el.after(p);
      }
    }

    /** Wrap the selection using the <font face> trick so it works across nodes, then convert to <span style>. */
    function styleSelection(styles) {
      restoreSelection();
      if (getSelection().isCollapsed) { toast('Select some text first'); return false; }
      const marker = 'ce-mark-' + Date.now();
      document.execCommand('styleWithCSS', false, false);
      document.execCommand('fontName', false, marker);
      const made = [];
      $$(`font[face="${marker}"]`, editor).forEach(f => {
        const span = document.createElement('span');
        made.push(span);
        Object.assign(span.style, styles);
        while (f.firstChild) span.append(f.firstChild);
        f.replaceWith(span);
        if (!span.getAttribute('style')) span.setAttribute('data-ce-tmp', '');
        // remove the same property from nested spans so the new value wins
        $$('span[style]', span).forEach(inner => {
          for (const k of Object.keys(styles)) inner.style[k] = '';
          if (!inner.getAttribute('style')) unwrap(inner);
        });
      });
      const first = made[0] && made[0].firstChild, last = made.length && made[made.length - 1].lastChild;
      $$('span[data-ce-tmp]', editor).forEach(unwrap);
      if (first && last && first.isConnected && last.isConnected) selectNodes([first, last]);
      else selectNodes(made);
      afterChange();
      return true;
    }

    /** Apply fn() to the text of the selection, keeping formatting and the selection itself. */
    function transformText(fn) {
      restoreSelection();
      const sel = getSelection();
      if (!sel.rangeCount || sel.isCollapsed) { toast('Select some text first'); return; }
      const r = sel.getRangeAt(0);
      const [sc, so, ec, eo] = [r.startContainer, r.startOffset, r.endContainer, r.endOffset];
      const root = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) if (r.intersectsNode(walker.currentNode)) nodes.push(walker.currentNode);
      let prevChar = ' ';
      for (const n of nodes) {
        const s = n === sc ? so : 0;
        const e = n === ec ? eo : n.data.length;
        if (s >= e) continue;
        const part = n.data.slice(s, e);
        n.data = n.data.slice(0, s) + fn(part, prevChar) + n.data.slice(e);
        prevChar = part.slice(-1);
      }
      try { sel.setBaseAndExtent(sc, so, ec, eo); } catch { /* ignore */ }
      saveSelection();
      afterChange();
    }
    const titleCase = (t, prev) => t.toLowerCase().replace(/(^|[\s\-("'])(\p{L})/gu, (m, a, b, i) =>
      (i === 0 && a === '' && !/\s/.test(prev)) ? m : a + b.toUpperCase());

    function toggleInlineCode() {
      restoreSelection();
      const code = closestInEditor(selectionNode(), 'code');
      if (code && !code.closest('pre')) { unwrap(code); afterChange(); return; }
      const text = getSelection().toString();
      exec('insertHTML', text ? `<code>${esc(text)}</code>&#8203;` : '<code>&#8203;</code>');
    }

    function toggleChecklist() {
      restoreSelection();
      let ul = closestInEditor(selectionNode(), 'ul');
      if (ul && ul.classList.contains('checklist')) {
        ul.classList.remove('checklist');
        if (!ul.className) ul.removeAttribute('class');
      } else if (ul) {
        ul.classList.add('checklist');
      } else {
        let block = selectionNode();
        while (block && block.parentNode !== editor) block = block.parentNode;
        ul = document.createElement('ul');
        ul.className = 'checklist';
        const li = document.createElement('li');
        ul.append(li);
        if (block && block.nodeType === 1 && block.matches('p,div,h1,h2,h3,h4,h5,h6,blockquote')) {
          li.innerHTML = block.innerHTML || '<br>';
          block.replaceWith(ul);
        } else {
          li.innerHTML = '<br>';
          if (block) block.after(ul); else editor.append(ul);
        }
        placeCaret(li, true);
        saveSelection();
      }
      afterChange();
    }

    function insertCodeBlock() {
      restoreSelection();
      const pre = closestInEditor(selectionNode(), 'pre');
      if (pre) { exec('formatBlock', '<p>'); return; }
      const text = getSelection().toString();
      if (text.includes('\n')) {
        const el = document.createElement('pre');
        el.textContent = text;
        exec('delete');
        insertBlockNode(el);
        placeCaret(el, true);
        afterChange();
      } else {
        exec('formatBlock', '<pre>');
      }
    }

    function setList(type, style) {
      restoreSelection();
      const tag = type === 'ol' ? 'OL' : 'UL';
      let list = closestInEditor(selectionNode(), 'ol,ul');
      if (!list || list.tagName !== tag || list.classList.contains('checklist')) {
        if (list && list.classList.contains('checklist')) { list.classList.remove('checklist'); if (!list.className) list.removeAttribute('class'); }
        if (!list || list.tagName !== tag) exec(type === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
        list = closestInEditor(selectionNode(), 'ol,ul');
      }
      if (list && style) list.style.listStyleType = style;
      afterChange();
    }

    function setFontSize(size) {
      restoreSelection();
      if (getSelection().isCollapsed) {
        // no selection: size the whole current block
        selectedBlocks().forEach(b => (b.style.fontSize = size));
        afterChange();
        return;
      }
      exec('fontSize', '7');
      const made = [];
      $$('font[size="7"]', editor).forEach(f => {
        const span = document.createElement('span');
        made.push(span);
        span.style.fontSize = size;
        while (f.firstChild) span.append(f.firstChild);
        f.replaceWith(span);
        $$('span[style*="font-size"]', span).forEach(i => { i.style.fontSize = ''; if (!i.getAttribute('style')) unwrap(i); });
      });
      $$('span[style*="xxx-large"]', editor).forEach(s => { s.style.fontSize = size; made.push(s); });
      selectNodes(made);
      afterChange();
    }

    function applyColor(kind, color) {
      if (kind === 'fore') {
        state.foreColor = color || state.foreColor;
        if (color) exec('foreColor', color, true);
        else styleSelection({ color: '' }) || 0;
        q('.fore-bar').style.background = state.foreColor;
      } else {
        state.backColor = color || state.backColor;
        exec('hiliteColor', color || 'transparent', true);
        if (!color) $$('span[style*="background-color: transparent"]', editor).forEach(s => { s.style.backgroundColor = ''; if (!s.getAttribute('style')) unwrap(s); });
        q('.back-bar').style.background = state.backColor;
      }
    }

    function newDocument() {
      if (editor.textContent.trim() && !confirm('Start a new document? The current content will be cleared.')) return;
      exitModes();
      editor.innerHTML = '';
      afterChange();
      editor.focus();
    }

    /* ============================================================== toolbar */

    const COLORS = [
      '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
      '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
      '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
      '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
      '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0',
      '#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79',
      '#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130',
    ];
    const FONTS = [
      ['', 'Default'], ['Arial, Helvetica, sans-serif', 'Arial'], ['Georgia, serif', 'Georgia'],
      ["'Times New Roman', Times, serif", 'Times New Roman'], ['Verdana, Geneva, sans-serif', 'Verdana'],
      ['Tahoma, Geneva, sans-serif', 'Tahoma'], ["'Trebuchet MS', sans-serif", 'Trebuchet MS'],
      ["'Segoe UI', system-ui, sans-serif", 'Segoe UI'], ["'Courier New', Courier, monospace", 'Courier New'],
      ["Impact, 'Arial Black', sans-serif", 'Impact'], ["'Comic Sans MS', cursive", 'Comic Sans MS'],
    ];
    const SIZES = ['8px', '10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '48px', '72px'];
    const LINE_HEIGHTS = ['1', '1.15', '1.5', '1.75', '2', '2.5', '3'];
    const BLOCK_FORMATS = [
      ['p', 'Normal'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'],
      ['h4', 'Heading 4'], ['h5', 'Heading 5'], ['h6', 'Heading 6'], ['blockquote', 'Quote'],
    ];
    const EMOJI = {
      '😀': '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 😤 😡 😠 🤬',
      '👍': '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🙏 ✍️ 💪 🦾 🧠 👀 👁️ 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 👮 👷 💂 🕵️ 👩‍⚕️ 👨‍🎓 👩‍🏫 👨‍💻 👩‍🍳 🧑‍🚀 🦸 🧙 🧑‍🤝‍🧑 💃 🕺',
      '🐶': '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🐺 🐴 🦄 🐝 🦋 🐌 🐞 🐢 🐍 🐙 🐠 🐬 🐳 🦈 🌵 🌲 🌳 🌴 🌱 🌿 🍀 🍁 🍂 🌷 🌹 🌺 🌸 🌼 🌻 🌞 🌙 ⭐ 🌈 ☀️ ⛅ 🌧️ ⛄ ❄️ 🔥 💧 🌊',
      '🍎': '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🌽 🥕 🥔 🍞 🧀 🥚 🍳 🥞 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🍝 🍜 🍣 🍱 🍛 🍚 🍰 🎂 🧁 🍩 🍪 🍫 🍬 🍿 ☕ 🍵 🥤 🍺 🍷 🥂',
      '⚽': '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥅 ⛳ 🏹 🎣 🥊 🎽 🛹 ⛸️ 🎿 🏆 🥇 🥈 🥉 🎮 🎲 🎯 🎳 🎸 🎹 🎺 🎻 🥁 🎤 🎧 🎬 🎨 🚗 🚕 🚌 🚑 🚒 🚲 ✈️ 🚀 🛸 🚢 🏠 🏢 🏥 🏫 ⛪ 🗽 🗼',
      '💡': '💡 📱 💻 🖥️ ⌨️ 🖨️ 📷 🎥 📺 ⏰ ⌛ 🔋 🔌 💰 💳 💎 🔧 🔨 ⚙️ 🔒 🔑 📌 📎 ✂️ 📝 📁 📂 📅 📊 📈 📉 📋 📖 📚 ✉️ 📦 🎁 🎉 🎈 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 ✅ ❌ ⚠️ ❓ ❗ 💯 🔔 ⭕ 🚫 ➕ ➖ ✖️ ➡️ ⬅️ ⬆️ ⬇️',
    };
    const SYMBOLS = ('© ® ™ § ¶ † ‡ • · … ‰ ′ ″ ‹ › « » ‘ ’ “ ” – — ¡ ¿ ° ± × ÷ ≈ ≠ ≤ ≥ ∞ √ ∑ ∏ ∂ ∫ ∆ ∇ ∈ ∉ ∩ ∪ ⊂ ⊃ ∀ ∃ ¬ ∧ ∨ ⇒ ⇔ ← → ↑ ↓ ↔ ↕ ⇐ ⇑ ⇓ ½ ⅓ ¼ ¾ ⅛ ¹ ² ³ ⁴ ⁿ ₀ ₁ ₂ ₃ ' +
      '$ € £ ¥ ¢ ₹ ₽ ₩ ₺ ₿ α β γ δ ε ζ η θ λ μ π ρ σ τ φ χ ψ ω Γ Δ Θ Λ Π Σ Φ Ψ Ω ♠ ♣ ♥ ♦ ★ ☆ ✓ ✔ ✗ ✘ ☐ ☑ ☒ ♪ ♫ ☎ ✉ ☀ ☁ ☂ ☃ ⚑ ⚐').split(' ');

    /* Tool definitions -------------------------------------------------------- */
    const T = {
      bold: { title: 'Bold (Ctrl+B)', icon: svg('bold'), run: () => exec('bold'), state: 'bold' },
      italic: { title: 'Italic (Ctrl+I)', icon: svg('italic'), run: () => exec('italic'), state: 'italic' },
      underline: { title: 'Underline (Ctrl+U)', icon: svg('underline'), run: () => exec('underline'), state: 'underline' },
      foreColor: {
        title: 'Text color', split: true,
        icon: '<span class="color-ico"><span class="A">A</span><span class="bar fore-bar" style="background:#d93025"></span></span>',
        run: () => applyColor('fore', state.foreColor), menu: m => colorMenu(m, 'fore'),
      },
      backColor: {
        title: 'Highlight color', split: true,
        icon: `<span class="color-ico">${svg('highlighter')}<span class="bar back-bar" style="background:#fbbc04"></span></span>`,
        run: () => applyColor('back', state.backColor), menu: m => colorMenu(m, 'back'),
      },
      justifyLeft: { title: 'Align left', icon: svg('alignLeft'), run: () => exec('justifyLeft'), state: 'justifyLeft' },
      justifyCenter: { title: 'Align center', icon: svg('alignCenter'), run: () => exec('justifyCenter'), state: 'justifyCenter' },
      justifyRight: { title: 'Align right', icon: svg('alignRight'), run: () => exec('justifyRight'), state: 'justifyRight' },
      justifyFull: { title: 'Justify', icon: svg('justify'), run: () => exec('justifyFull'), state: 'justifyFull' },
      orderedList: {
        title: 'Numbered list', icon: svg('ol'), split: true, run: () => exec('insertOrderedList'), state: 'insertOrderedList',
        menu: m => listMenu(m, 'ol', [['decimal', '1. 2. 3.'], ['lower-alpha', 'a. b. c.'], ['upper-alpha', 'A. B. C.'], ['lower-roman', 'i. ii. iii.'], ['upper-roman', 'I. II. III.']]),
      },
      unorderedList: {
        title: 'Bulleted list', icon: svg('ul'), split: true, run: () => exec('insertUnorderedList'), state: 'insertUnorderedList',
        menu: m => listMenu(m, 'ul', [['disc', '● Disc'], ['circle', '○ Circle'], ['square', '■ Square']]),
      },
      outdent: { title: 'Decrease indent', icon: svg('outdent'), run: () => exec('outdent') },
      indent: { title: 'Increase indent', icon: svg('indent'), run: () => exec('indent') },
      blockquote: {
        title: 'Quote', icon: svg('quote'),
        run: () => exec('formatBlock', closestInEditor(selectionNode(), 'blockquote') ? '<p>' : '<blockquote>'),
      },
      emoji: { title: 'Emoji', icon: svg('smile'), menu: emojiMenu },
      paragraph: { title: 'Paragraph format', dd: true, icon: svg('pilcrow'), label: 'Normal', menu: paragraphMenu },
      fontName: { title: 'Font', dd: true, icon: svg('font'), label: 'Font', menu: fontMenu },
      fontSize: { title: 'Font size', dd: true, icon: svg('size'), label: 'Size', menu: sizeMenu },
      lineHeight: { title: 'Line height', dd: true, icon: svg('lineHeight'), menu: lineHeightMenu },

      removeFormat: { title: 'Clear formatting', icon: svg('clear'), run: () => { exec('removeFormat'); exec('unlink'); } },
      find: { title: 'Find & replace (Ctrl+F)', icon: svg('search'), run: () => openFind() },
      link: { title: 'Insert link (Ctrl+K)', icon: svg('link'), run: () => openLinkDialog() },
      symbols: { title: 'Special characters', icon: svg('omega'), menu: symbolMenu },
      table: { title: 'Insert table', icon: svg('table'), menu: tableMenu },
      image: { title: 'Insert image', icon: svg('image'), run: () => openImageDialog() },
      video: { title: 'Insert video', icon: svg('video'), run: () => openVideoDialog() },
      source: { title: 'HTML source', icon: svg('source'), run: () => toggleSource(), keep: true },
      fullscreen: { title: 'Fullscreen', icon: svg('max'), run: () => toggleFullscreen(), keep: true },
      undo: { title: 'Undo (Ctrl+Z)', icon: svg('undo'), run: () => exec('undo') },
      redo: { title: 'Redo (Ctrl+Y)', icon: svg('redo'), run: () => exec('redo') },
      more: { title: 'More options', icon: svg('more'), run: () => toggleMore(), keep: true },
      newDoc: { title: 'New document', icon: svg('newDoc'), run: () => newDocument() },
      download: { title: 'Download as HTML', icon: svg('download'), run: () => download(`${fileName()}.html`, exportHTML(), 'text/html') },
      print: { title: 'Print / Save as PDF', icon: svg('print'), run: () => openPrint() },

      strikeThrough: { title: 'Strikethrough', icon: svg('strike'), run: () => exec('strikeThrough'), state: 'strikeThrough' },
      superscript: { title: 'Superscript', icon: svg('sup'), run: () => exec('superscript'), state: 'superscript' },
      subscript: { title: 'Subscript', icon: svg('sub'), run: () => exec('subscript'), state: 'subscript' },
      inlineCode: { title: 'Inline code', icon: svg('codeInline'), run: toggleInlineCode },
      upperCase: { title: 'UPPERCASE', icon: txt('TT'), run: () => transformText(t => t.toUpperCase()) },
      lowerCase: { title: 'lowercase', icon: txt('tt'), run: () => transformText(t => t.toLowerCase()) },
      titleCase: { title: 'Title Case', icon: txt('Tt'), run: () => transformText(titleCase) },
      hr: { title: 'Horizontal line', icon: svg('hr'), run: () => exec('insertHorizontalRule') },
      checklist: { title: 'Checklist', icon: svg('checklist'), run: toggleChecklist },
      codeBlock: { title: 'Code block', icon: svg('codeBlock'), run: insertCodeBlock },
    };

    const LAYOUTS = {
      // typography only, one row
      basic: [
        { items: [['paragraph', 'fontName', 'fontSize'], ['bold', 'italic', 'underline', 'strikeThrough'],
          ['foreColor', 'backColor'], ['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'],
          ['orderedList', 'unorderedList', 'blockquote'], ['link', 'emoji'], '|', ['fullscreen']] },
      ],
      // every option, always visible
      advanced: [
        { items: [['bold', 'italic', 'underline', 'strikeThrough', 'superscript', 'subscript'], ['foreColor', 'backColor'],
          ['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'],
          ['orderedList', 'unorderedList', 'outdent', 'indent', 'blockquote'], ['emoji'],
          '|', ['paragraph', 'fontName', 'fontSize', 'lineHeight']] },
        { items: [['removeFormat'], ['link', 'symbols', 'table', 'image', 'video', 'hr'],
          ['source', 'fullscreen'],
          '|', ['newDoc', 'download', 'print']] },
      ],
    };
    const LAYOUT = LAYOUTS[cfg.mode] || LAYOUTS.advanced;

    function buildToolbar() {
      for (const row of LAYOUT) {
        const r = document.createElement('div');
        r.className = 'tb-row' + (row.more ? ' more' : '');
        for (const g of row.items) {
          if (g === '|') { r.insertAdjacentHTML('beforeend', '<span class="tb-spacer"></span>'); continue; }
          const grp = document.createElement('div');
          grp.className = 'tb-group';
          for (const name of g) {
            const t = T[name];
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tb-btn' + (t.dd ? ' dd' : '');
            b.dataset.tool = name;
            b.title = t.title;
            b.setAttribute('aria-label', t.title);
            if (t.keep) b.dataset.keep = '';
            b.innerHTML = t.icon + (t.dd ? `${t.label ? `<span class="lbl">${t.label}</span>` : ''}${svg('caret', 'caret')}` : '');
            if (!t.dd && t.menu && !t.split) b.innerHTML += svg('caret', 'caret');
            grp.append(b);
            if (t.split) {
              const c = document.createElement('button');
              c.type = 'button';
              c.className = 'tb-btn split-caret';
              c.dataset.tool = name;
              c.dataset.caret = '';
              c.title = t.title + ' options';
              c.innerHTML = svg('caret', 'caret');
              grp.append(c);
            }
          }
          r.append(grp);
        }
        toolbar.append(r);
      }
    }

    toolbar.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
    toolbar.addEventListener('click', e => {
      const b = e.target.closest('.tb-btn');
      if (!b) return;
      const t = T[b.dataset.tool];
      const wantsMenu = t.menu && (!t.split || 'caret' in b.dataset);
      if (wantsMenu) {
        if (pop.dataset.owner === cfg.doc + b.dataset.tool + ('caret' in b.dataset ? '^' : '') && !pop.hidden) { closePop(); return; }
        openPop(b, t.menu);
        return;
      }
      closePop();
      t.run && t.run();
    });

    /* ============================================================== popover */

    function openPop(anchor, build) {
      saveSelection();
      pop.innerHTML = '';
      pop.dataset.owner = cfg.doc + anchor.dataset.tool + ('caret' in anchor.dataset ? '^' : '');
      build(pop);
      pop.hidden = false;
      const a = anchor.getBoundingClientRect();
      const w = pop.offsetWidth, h = pop.offsetHeight;
      let left = Math.min(a.left, window.innerWidth - w - 8);
      let top = a.bottom + 4;
      if (top + h > window.innerHeight - 8) top = Math.max(8, a.top - h - 4);
      pop.style.left = Math.max(8, left) + 'px';
      pop.style.top = top + 'px';
    }
    function closePop() { pop.hidden = true; pop.dataset.owner = ''; }
    document.addEventListener('mousedown', e => {
      if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.tb-btn')) closePop();
    });
    pop.addEventListener('mousedown', e => { if (!e.target.closest('input')) e.preventDefault(); });
    window.addEventListener('resize', closePop);
    q('.rte-body').addEventListener('scroll', () => { closePop(); placeBars(); });
    window.addEventListener('resize', () => placeBars());

    function item(m, html, onClick, on = false, tag = 'button') {
      const b = document.createElement(tag);
      b.className = 'item' + (on ? ' on' : '');
      if (tag === 'button') b.type = 'button';
      b.innerHTML = html;
      b.addEventListener('click', () => { closePop(); onClick(); });
      m.append(b);
      return b;
    }

    function colorMenu(m, kind) {
      item(m, kind === 'fore' ? 'Automatic' : 'No color', () => applyColor(kind, ''));
      const grid = document.createElement('div');
      grid.className = 'swatches';
      for (const c of COLORS) {
        const s = document.createElement('button');
        s.type = 'button';
        s.style.background = c;
        s.title = c;
        s.addEventListener('click', () => { closePop(); applyColor(kind, c); });
        grid.append(s);
      }
      m.append(grid);
      const row = document.createElement('label');
      row.className = 'color-row';
      row.innerHTML = `<input type="color" value="${kind === 'fore' ? state.foreColor : state.backColor}"> Custom color…`;
      row.querySelector('input').addEventListener('change', e => { closePop(); applyColor(kind, e.target.value); });
      m.append(row);
    }

    function listMenu(m, type, styles) {
      const cur = closestInEditor(selectionNode(), type);
      for (const [v, label] of styles) {
        item(m, label, () => setList(type, v), cur && (cur.style.listStyleType || (type === 'ol' ? 'decimal' : 'disc')) === v);
      }
    }

    function paragraphMenu(m) {
      const cur = currentBlockTag();
      for (const [tag, label] of BLOCK_FORMATS) {
        item(m, label, () => {
          exec('formatBlock', `<${tag}>`);
          // a heading should use its own size, not one set on the old paragraph
          const b = closestInEditor(selectionNode(), 'h1,h2,h3,h4,h5,h6');
          if (b && b.style.fontSize) { b.style.fontSize = ''; if (!b.getAttribute('style')) b.removeAttribute('style'); afterChange(); }
        }, cur === tag, tag === 'pre' || tag === 'blockquote' ? 'button' : tag);
      }
    }

    function fontMenu(m) {
      for (const [v, label] of FONTS) {
        const b = item(m, label, () => {
          if (v) exec('fontName', v, true);
          else styleSelection({ fontFamily: '' });
        });
        if (v) b.style.fontFamily = v;
      }
    }

    function sizeMenu(m) {
      for (const s of SIZES) item(m, String(parseInt(s, 10)), () => setFontSize(s));
    }

    function lineHeightMenu(m) {
      const div = document.createElement('div');
      div.className = 'hint';
      div.textContent = 'Line spacing';
      m.append(div);
      item(m, 'Default', () => { selectedBlocks().forEach(b => (b.style.lineHeight = '')); afterChange(); });
      for (const v of LINE_HEIGHTS) item(m, v, () => { selectedBlocks().forEach(b => (b.style.lineHeight = v)); afterChange(); });
    }

    function emojiMenu(m) {
      const tabs = document.createElement('div');
      tabs.className = 'emoji-tabs';
      const grid = document.createElement('div');
      grid.className = 'char-grid';
      const show = key => {
        $$('button', tabs).forEach(b => b.classList.toggle('on', b.textContent === key));
        grid.innerHTML = '';
        for (const e of EMOJI[key].split(' ')) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = e;
          b.addEventListener('click', () => { closePop(); exec('insertText', e); });
          grid.append(b);
        }
      };
      for (const key of Object.keys(EMOJI)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = key;
        b.addEventListener('click', () => show(key));
        tabs.append(b);
      }
      m.append(tabs, grid);
      show(Object.keys(EMOJI)[0]);
    }

    function symbolMenu(m) {
      const grid = document.createElement('div');
      grid.className = 'char-grid symbols';
      for (const s of SYMBOLS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = s;
        b.title = 'U+' + s.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
        b.addEventListener('click', () => { closePop(); exec('insertText', s); });
        grid.append(b);
      }
      m.append(grid);
    }

    function tableMenu(m) {
      const grid = document.createElement('div');
      grid.className = 'grid-picker';
      const label = document.createElement('div');
      label.className = 'grid-label';
      label.textContent = 'Insert table';
      for (let r = 1; r <= 8; r++) for (let c = 1; c <= 10; c++) {
        const s = document.createElement('span');
        s.dataset.r = r; s.dataset.c = c;
        grid.append(s);
      }
      grid.addEventListener('mouseover', e => {
        const { r, c } = e.target.dataset;
        if (!r) return;
        $$('span', grid).forEach(s => s.classList.toggle('on', +s.dataset.r <= r && +s.dataset.c <= c));
        label.textContent = `${c} × ${r}`;
      });
      grid.addEventListener('click', e => {
        const { r, c } = e.target.dataset;
        if (!r) return;
        closePop();
        insertTable(+r, +c);
      });
      m.append(grid, label);
    }

    /* ========================================================= toolbar state */

    function currentBlockTag() {
      const b = closestInEditor(selectionNode(), 'h1,h2,h3,h4,h5,h6,pre,blockquote,p');
      return b ? b.tagName.toLowerCase() : 'p';
    }

    function updateToolbar() {
      const node = selectionNode();
      if (!node) return;
      for (const [name, t] of Object.entries(T)) {
        if (!t.state) continue;
        let on = false;
        try { on = document.queryCommandState(t.state); } catch { /* ignore */ }
        const b = $(`.tb-btn[data-tool="${name}"]:not([data-caret])`, toolbar);
        if (b) b.classList.toggle('active', on);
      }
      const inChecklist = !!closestInEditor(node, 'ul.checklist');
      (toolbar.querySelector('[data-tool="checklist"]') || DUMMY).classList.toggle('active', inChecklist);
      if (inChecklist) (toolbar.querySelector('[data-tool="unorderedList"]:not([data-caret])') || DUMMY).classList.remove('active');
      (toolbar.querySelector('[data-tool="link"]') || DUMMY).classList.toggle('active', !!closestInEditor(node, 'a'));
      (toolbar.querySelector('[data-tool="inlineCode"]') || DUMMY).classList.toggle('active', !!closestInEditor(node, 'code'));
      (toolbar.querySelector('[data-tool="blockquote"]') || DUMMY).classList.toggle('active', !!closestInEditor(node, 'blockquote'));
      (toolbar.querySelector('[data-tool="codeBlock"]') || DUMMY).classList.toggle('active', !!closestInEditor(node, 'pre'));

      const tag = currentBlockTag();
      (toolbar.querySelector('[data-tool="paragraph"] .lbl') || DUMMY).textContent = (BLOCK_FORMATS.find(f => f[0] === tag) || [0, 'Normal'])[1];
      const cs = getComputedStyle(node);
      const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      const known = FONTS.find(f => f[1].toLowerCase() === fam.toLowerCase());
      (toolbar.querySelector('[data-tool="fontName"] .lbl') || DUMMY).textContent = known ? known[1] : 'Font';
      (toolbar.querySelector('[data-tool="fontSize"] .lbl') || DUMMY).textContent = Math.round(parseFloat(cs.fontSize)) || 'Size';

      // table context
      const cell = closestInEditor(node, 'td,th');
      if (state.activeCell && state.activeCell !== cell) {
        state.activeCell.classList.remove('cell-active');
        if (!state.activeCell.className) state.activeCell.removeAttribute('class');
      }
      state.activeCell = cell;
      if (cell) cell.classList.add('cell-active');
      q('.table-bar').hidden = !cell;
      placeBars();

      q('.tag-chip').textContent = `<${node === editor ? 'p' : node.tagName.toLowerCase()}>`;
    }

    document.addEventListener('selectionchange', () => {
      if (state.sourceMode) return;
      if (selectionNode()) { saveSelection(); updateToolbar(); }
    });

    function updateStats() {
      const text = state.sourceMode ? source.value.replace(/<[^>]+>/g, ' ') : editor.innerText;
      const words = (text.trim().match(/\S+/g) || []).length;
      const chars = text.replace(/\n/g, '').length;
      q('.stats').textContent = `words: ${words.toLocaleString()} | characters: ${chars.toLocaleString()}`;
    }

    /* ============================================================= editing */

    editor.addEventListener('beforeinput', () => {
      if (!editor.firstChild || (editor.childNodes.length === 1 && editor.firstChild.nodeName === 'BR')) {
        editor.innerHTML = '<p><br></p>';
        placeCaret(editor.firstChild);
      }
    });
    editor.addEventListener('input', e => {
      if (e.inputType === 'insertText' && e.data === ' ') autoFormat();
      if (editor.innerHTML === '<p><br></p>' || editor.innerHTML === '<br>') editor.innerHTML = '';
      afterChange();
    });

    /** Markdown-style shortcuts typed at the start of an empty paragraph. */
    function autoFormat() {
      const block = closestInEditor(selectionNode(), 'p,div');
      if (!block || block.parentElement !== editor) return;
      const rule = {
        '# ': ['formatBlock', '<h1>'], '## ': ['formatBlock', '<h2>'], '### ': ['formatBlock', '<h3>'],
        '#### ': ['formatBlock', '<h4>'], '> ': ['formatBlock', '<blockquote>'],
        '- ': ['insertUnorderedList'], '* ': ['insertUnorderedList'], '1. ': ['insertOrderedList'],
        '[] ': ['checklist'], '--- ': ['insertHorizontalRule'],
      }[block.textContent.replace(/ /g, ' ')];
      if (!rule) return;
      block.innerHTML = '<br>';
      placeCaret(block);
      saveSelection();
      if (rule[0] === 'checklist') toggleChecklist();
      else exec(rule[0], rule[1] || null);
    }

    editor.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        const node = selectionNode();
        const cell = closestInEditor(node, 'td,th');
        if (cell) { e.preventDefault(); moveCell(cell, e.shiftKey ? -1 : 1); return; }
        if (closestInEditor(node, 'li')) { e.preventDefault(); exec(e.shiftKey ? 'outdent' : 'indent'); return; }
        if (!e.shiftKey) { e.preventDefault(); exec('insertText', '    '); }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        const node = selectionNode();
        if (closestInEditor(node, 'pre')) { e.preventDefault(); exec('insertText', '\n'); return; }
        const blk = closestInEditor(node, 'blockquote,h1,h2,h3,h4,h5,h6');
        if (blk && !blk.textContent.replace(/[\s​]/g, '')) { e.preventDefault(); saveSelection(); exec('formatBlock', '<p>'); return; }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedEl) {
        e.preventDefault();
        state.selectedEl.remove();
        selectEl(null);
        afterChange();
      }
    });

    editor.addEventListener('mousedown', e => {
      const li = e.target.closest('ul.checklist > li');
      if (li && e.offsetX < 22 && e.target === li) {
        e.preventDefault();
        li.classList.toggle('checked');
        if (!li.className) li.removeAttribute('class');
        afterChange();
      }
    });
    editor.addEventListener('click', e => {
      const a = e.target.closest('a');
      if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
      const el = e.target.closest('img, .media');
      selectEl(el && editor.contains(el) ? el : null);
    });
    editor.addEventListener('dblclick', e => { if (e.target.closest('a')) { saveSelection(); openLinkDialog(); } });

    /* ========================================================= paste & drop */

    editor.addEventListener('paste', e => {
      const dt = e.clipboardData;
      const files = [...dt.files].filter(f => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); saveSelection(); files.forEach(f => upload(f, 'image')); return; }
      if (closestInEditor(selectionNode(), 'pre')) { e.preventDefault(); exec('insertText', dt.getData('text/plain')); return; }
      const html = dt.getData('text/html');
      if (html) { e.preventDefault(); exec('insertHTML', cleanPastedHTML(html)); }
    });

    const body = q('.rte-body');
    body.addEventListener('mousedown', e => {
      if (e.target !== body || state.sourceMode) return;
      e.preventDefault();
      editor.focus();
      placeCaret(editor.lastElementChild || editor, true);
    });
    body.addEventListener('dragover', e => {
      if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); rte.classList.add('drag-over'); }
    });
    body.addEventListener('dragleave', e => { if (e.target === body) rte.classList.remove('drag-over'); });
    body.addEventListener('drop', e => {
      rte.classList.remove('drag-over');
      const files = [...e.dataTransfer.files].filter(f => /^(image|video)\//.test(f.type));
      if (!files.length) return;
      e.preventDefault();
      const pos = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
      if (pos && editor.contains(pos.startContainer)) state.savedRange = pos;
      files.forEach(f => upload(f, f.type.startsWith('video/') ? 'video' : 'image'));
    });

    function cleanPastedHTML(html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const allowed = new Set(['P', 'BR', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'DEL',
        'SUB', 'SUP', 'BLOCKQUOTE', 'PRE', 'CODE', 'UL', 'OL', 'LI', 'A', 'IMG', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH']);
      const drop = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT',
        'BUTTON', 'SELECT', 'TEXTAREA', 'SVG', 'TEMPLATE', 'NOSCRIPT']);
      const keepAttr = { A: ['href'], IMG: ['src', 'alt'], TD: ['colspan', 'rowspan'], TH: ['colspan', 'rowspan'] };
      const walk = node => {
        for (const child of [...node.childNodes]) {
          if (child.nodeType === 8) { child.remove(); continue; }
          if (child.nodeType !== 1) continue;
          const tag = child.tagName.toUpperCase();
          if (drop.has(tag) || /^[OWV]:/.test(tag)) { child.remove(); continue; }
          if (tag === 'B' && /font-weight:\s*normal/i.test(child.getAttribute('style') || '')) { walk(child); unwrap(child); continue; }
          let target = child;
          if (tag === 'SPAN' || tag === 'FONT') {
            const st = child.style;
            const wrap = [];
            if (/^(bold|[6-9]00)$/.test(st.fontWeight)) wrap.push('strong');
            if (st.fontStyle === 'italic') wrap.push('em');
            if (/underline/.test(st.textDecoration)) wrap.push('u');
            if (/line-through/.test(st.textDecoration)) wrap.push('s');
            if (st.verticalAlign === 'super') wrap.push('sup');
            if (st.verticalAlign === 'sub') wrap.push('sub');
            for (const w of wrap) {
              const el = doc.createElement(w);
              while (target.firstChild) el.append(target.firstChild);
              target.append(el);
              target = el;
            }
          }
          walk(child);
          if (!allowed.has(tag)) { unwrap(child); continue; }
          for (const a of [...child.attributes]) {
            if (!(keepAttr[tag] || []).includes(a.name)) child.removeAttribute(a.name);
            else if (/^\s*(javascript|vbscript|data:(?!image\/))/i.test(a.value)) child.removeAttribute(a.name);
          }
        }
      };
      walk(doc.body);
      return doc.body.innerHTML.replace(/<p>\s*<\/p>/g, '');
    }

    /* ============================================================== dialogs */

    document.addEventListener('click', e => {
      const c = e.target.closest('[data-close]');
      if (c) { c.closest('dialog').close('cancel'); return; }
      // a click on the dark backdrop lands on the <dialog> itself: close it
      if (e.target.matches('dialog.dlg[open]')) {
        const r = e.target.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) e.target.close('cancel');
      }
    });

    // ---- links
    const linkDialog = $('#linkDialog');
    let editingLink = null;
    function openLinkDialog() {
      shared.owner = me;
      saveSelection();
      restoreSelection();
      editingLink = closestInEditor(selectionNode(), 'a');
      const text = editingLink ? editingLink.textContent : getSelection().toString();
      $('#linkText').value = text;
      $('#linkText').parentElement.hidden = !!(!editingLink && text);
      $('#linkUrl').value = editingLink ? editingLink.getAttribute('href') : '';
      $('#linkNewTab').checked = editingLink ? editingLink.target === '_blank' : true;
      $('#linkRemove').hidden = !editingLink;
      linkDialog.showModal();
      $('#linkUrl').focus();
    }
    linkDialog.addEventListener('close', () => {
      if (shared.owner !== me) return;
      if (linkDialog.returnValue !== 'ok') { restoreSelection(); return; }
      let url = $('#linkUrl').value.trim();
      if (!url) return;
      if (!/^([a-z][a-z0-9+.-]*:|\/|#|\.)/i.test(url)) url = (/^[^\s@]+@[^\s@]+$/.test(url) ? 'mailto:' : 'https://') + url;
      if (/^\s*(javascript|vbscript|data):/i.test(url)) { toast('That URL is not allowed', true); return; }
      const newTab = $('#linkNewTab').checked;
      const text = $('#linkText').value.trim();
      const apply = a => {
        a.setAttribute('href', url);
        if (newTab) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } else { a.removeAttribute('target'); a.removeAttribute('rel'); }
      };
      if (editingLink) {
        apply(editingLink);
        if (text && text !== editingLink.textContent) editingLink.textContent = text;
        afterChange();
        return;
      }
      restoreSelection();
      const marker = 'ce-link-' + Date.now();
      if (getSelection().isCollapsed) exec('insertHTML', `<a href="${marker}">${esc(text || url)}</a>&nbsp;`);
      else exec('createLink', marker);
      $$(`a[href="${marker}"]`, editor).forEach(apply);
      afterChange();
    });
    $('#linkRemove').addEventListener('click', () => {
      if (shared.owner !== me) return;
      if (editingLink) { unwrap(editingLink); afterChange(); }
      linkDialog.close('cancel');
    });

    // ---- images
    const imageDialog = $('#imageDialog');
    function openImageDialog() {
      shared.owner = me;
      saveSelection();
      $('#imageUrl').value = '';
      $('#imageAlt').value = '';
      imageDialog.showModal();
    }
    imageDialog.addEventListener('close', () => {
      if (shared.owner !== me) return;
      if (imageDialog.returnValue !== 'ok') return;
      const url = $('#imageUrl').value.trim();
      if (url) insertImage(url, $('#imageAlt').value.trim());
    });
    $('#imageFile').addEventListener('change', e => {
      if (shared.owner !== me) return;
      const f = e.target.files[0];
      e.target.value = '';
      if (f) { imageDialog.close('cancel'); upload(f, 'image', $('#imageAlt').value.trim()); }
    });
    dropZone($('#imageDrop'), f => { if (shared.owner !== me) return; imageDialog.close('cancel'); upload(f, 'image', $('#imageAlt').value.trim()); }, 'image/');

    function insertImage(url, alt) {
      exec('insertHTML', `<img src="${esc(url)}" alt="${esc(alt || '')}">`);
    }

    // ---- video
    const videoDialog = $('#videoDialog');
    function openVideoDialog() {
      shared.owner = me;
      saveSelection();
      $('#videoUrl').value = '';
      videoDialog.showModal();
      $('#videoUrl').focus();
    }
    videoDialog.addEventListener('close', () => {
      if (shared.owner !== me) return;
      if (videoDialog.returnValue !== 'ok') return;
      const url = $('#videoUrl').value.trim();
      if (!url) return;
      const embed = videoEmbed(url);
      if (!embed) { toast('Use a YouTube, Vimeo or direct .mp4/.webm link', true); return; }
      insertMedia(embed);
    });
    $('#videoFile').addEventListener('change', e => {
      if (shared.owner !== me) return;
      const f = e.target.files[0];
      e.target.value = '';
      if (f) { videoDialog.close('cancel'); upload(f, 'video'); }
    });
    dropZone($('#videoDrop'), f => { if (shared.owner !== me) return; videoDialog.close('cancel'); upload(f, 'video'); }, 'video/');

    function videoEmbed(url) {
      let m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i);
      if (m) return `<iframe src="https://www.youtube.com/embed/${m[1]}" allowfullscreen allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>`;
      m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
      if (m) return `<iframe src="https://player.vimeo.com/video/${m[1]}" allowfullscreen allow="fullscreen; picture-in-picture"></iframe>`;
      if (/^(https?:\/\/|\/|uploads\/)[^\s"]+\.(mp4|webm|ogv|ogg)(\?.*)?$/i.test(url)) return `<video controls src="${esc(url)}"></video>`;
      return null;
    }
    function insertMedia(inner) {
      const fig = document.createElement('figure');
      fig.className = 'media';
      fig.setAttribute('contenteditable', 'false');
      fig.innerHTML = inner;
      insertBlockNode(fig);
      const next = fig.nextElementSibling;
      if (next) placeCaret(next);
      saveSelection();
      afterChange();
    }

    function dropZone(zone, onFile, prefix) {
      zone.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); zone.classList.add('over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('over'));
      zone.addEventListener('drop', e => {
        e.preventDefault(); e.stopPropagation();
        zone.classList.remove('over');
        const f = [...e.dataTransfer.files].find(x => x.type.startsWith(prefix));
        if (f) onFile(f);
      });
    }

    async function upload(file, kind, alt = '') {
      const limit = kind === 'video' ? 50 : 5;
      if (file.size > limit * 1024 * 1024) { toast(`${kind === 'video' ? 'Video' : 'Image'} is larger than ${limit} MB`, true); return; }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      toast(`Uploading ${kind}…`);
      try {
        const { url } = await api('upload', { method: 'POST', form: fd });
        if (kind === 'video') insertMedia(`<video controls src="${esc(url)}"></video>`);
        else insertImage(url, alt || file.name.replace(/\.[^.]+$/, ''));
        toast(`${kind === 'video' ? 'Video' : 'Image'} uploaded`);
      } catch (e) {
        toast(e.message, true);
      }
    }

    // ---- selected image / video
    function selectEl(el) {
      if (state.selectedEl && state.selectedEl !== el) {
        state.selectedEl.classList.remove('selected');
        if (!state.selectedEl.className) state.selectedEl.removeAttribute('class');
      }
      state.selectedEl = el;
      if (el) el.classList.add('selected');
      q('.image-bar').hidden = !el;
      if (el) {
        $('.ctx-label', q('.image-bar')).textContent = el.tagName === 'IMG' ? 'Image' : 'Video';
        q('[data-img="alt"]').hidden = el.tagName !== 'IMG';
      }
      placeBars();
    }

    /** Float the table / image bar just above (or below) the element it edits. */
    function placeBars() {
      const pairs = [
        [q('.table-bar'), state.activeCell && state.activeCell.isConnected ? state.activeCell.closest('table') : null],
        [q('.image-bar'), state.selectedEl && state.selectedEl.isConnected ? state.selectedEl : null],
      ];
      const box = rte.getBoundingClientRect();
      const view = q('.rte-body').getBoundingClientRect();
      for (const [bar, el] of pairs) {
        if (bar.hidden || !el) continue;
        const r = el.getBoundingClientRect();
        const h = bar.offsetHeight, w = bar.offsetWidth;
        let top = r.top - h - 6;
        if (top < view.top + 4) top = Math.min(r.bottom + 6, view.bottom - h - 4);  // no room above: go below
        top = Math.max(view.top + 4, top);                                          // keep inside the content area
        let left = Math.min(Math.max(r.left, view.left + 8), view.right - w - 8);
        bar.style.top = (top - box.top) + 'px';
        bar.style.left = Math.max(8, left - box.left) + 'px';
      }
    }
    q('.image-bar').addEventListener('mousedown', e => e.preventDefault());
    q('.image-bar').addEventListener('click', e => {
      const act = e.target.dataset.img;
      const el = state.selectedEl;
      if (!act || !el) return;
      const st = el.style;
      if (act.startsWith('w')) { st.width = act.slice(1) + '%'; el.removeAttribute('width'); el.removeAttribute('height'); }
      if (act === 'left' || act === 'right') { st.float = act; st.margin = act === 'left' ? '4px 16px 8px 0' : '4px 0 8px 16px'; st.display = ''; }
      if (act === 'center') { st.float = ''; st.display = 'block'; st.margin = '8px auto'; }
      if (act === 'alt') { const v = prompt('Alternative text (describes the image):', el.alt); if (v !== null) el.alt = v; }
      if (act === 'remove') { el.remove(); selectEl(null); }
      if (el.getAttribute('style') === '') el.removeAttribute('style');
      afterChange();
    });

    // ---- print popup: shows this editor's document, with Print and Close
    const previewDialog = $('#previewDialog');
    function openPrint() {
      shared.owner = me;
      exitModes();
      $('#previewFrame').srcdoc = exportHTML();
      previewDialog.showModal();
      $('#previewPrint').focus();
    }
    $('#previewPrint').addEventListener('click', () => { if (shared.owner === me) $('#previewFrame').contentWindow.print(); });

    /* =============================================================== tables */

    function insertTable(rows, cols) {
      const table = document.createElement('table');
      for (let r = 0; r < rows; r++) {
        const section = r === 0 ? table.createTHead() : (table.tBodies[0] || table.createTBody());
        const tr = section.insertRow();
        for (let c = 0; c < cols; c++) {
          const cell = document.createElement(r === 0 ? 'th' : 'td');
          cell.innerHTML = '<br>';
          tr.append(cell);
        }
      }
      insertBlockNode(table);
      placeCaret(table.rows[0].cells[0]);
      saveSelection();
      afterChange();
    }

    function moveCell(cell, dir) {
      const cells = $$('td,th', cell.closest('table'));
      const next = cells[cells.indexOf(cell) + dir];
      if (next) placeCaret(next, true);
      else if (dir > 0) tableOp('rowBelow');
    }

    function tableOp(op) {
      const cell = state.activeCell || closestInEditor(selectionNode(), 'td,th');
      if (!cell) return;
      const table = cell.closest('table');
      const row = cell.parentElement;
      const col = cell.cellIndex;
      const rows = [...table.rows];
      const newCell = (tag = 'td') => { const c = document.createElement(tag); c.innerHTML = '<br>'; return c; };
      switch (op) {
        case 'rowAbove':
        case 'rowBelow': {
          const tr = document.createElement('tr');
          for (let i = 0; i < row.cells.length; i++) tr.append(newCell());
          if (row.parentElement.tagName === 'THEAD') {
            const tb = table.tBodies[0] || table.appendChild(document.createElement('tbody'));
            tb.insertBefore(tr, tb.firstChild);
          } else row.parentElement.insertBefore(tr, op === 'rowAbove' ? row : row.nextSibling);
          placeCaret(tr.cells[Math.min(col, tr.cells.length - 1)]);
          break;
        }
        case 'colLeft':
        case 'colRight':
          for (const r of rows) {
            const ref = r.cells[col];
            const c = newCell(r.parentElement.tagName === 'THEAD' ? 'th' : 'td');
            if (!ref) r.append(c); else r.insertBefore(c, op === 'colLeft' ? ref : ref.nextSibling);
          }
          break;
        case 'delRow': {
          if (rows.length <= 1) { table.remove(); break; }
          const nextRow = row.nextElementSibling || row.previousElementSibling;
          row.remove();
          if (nextRow) placeCaret(nextRow.cells[Math.min(col, nextRow.cells.length - 1)]);
          $$('thead, tbody', table).forEach(s => { if (!s.rows.length) s.remove(); });
          break;
        }
        case 'delCol':
          if (row.cells.length <= 1) { table.remove(); break; }
          for (const r of rows) if (r.cells[col]) r.cells[col].remove();
          placeCaret(row.cells[Math.min(col, row.cells.length - 1)]);   // keep the cursor (and the table bar) in the table
          break;
        case 'toggleHeader': {
          const thead = table.tHead;
          if (thead) {
            const tb = table.tBodies[0] || table.appendChild(document.createElement('tbody'));
            for (const tr of [...thead.rows].reverse()) {
              for (const th of [...tr.cells]) { const td = newCell(); td.innerHTML = th.innerHTML; th.replaceWith(td); }
              tb.insertBefore(tr, tb.firstChild);
            }
            thead.remove();
          } else {
            const first = rows[0];
            const head = table.createTHead();
            for (const td of [...first.cells]) { const th = newCell('th'); th.innerHTML = td.innerHTML; td.replaceWith(th); }
            head.append(first);
          }
          const r0 = table.rows[0];
          if (r0 && r0.cells.length) placeCaret(r0.cells[Math.min(col, r0.cells.length - 1)]);
          break;
        }
        case 'delTable': {
          const p = document.createElement('p');
          p.innerHTML = '<br>';
          table.replaceWith(p);
          placeCaret(p);
          break;
        }
      }
      state.activeCell = null;
      afterChange();
    }
    q('.table-bar').addEventListener('mousedown', e => e.preventDefault());
    q('.table-bar').addEventListener('click', e => { if (e.target.dataset.tbl) tableOp(e.target.dataset.tbl); });

    /* ================================================= source / fullscreen / more */

    function toggleSource() {
      state.sourceMode = !state.sourceMode;
      if (state.sourceMode) {
        closeFind();
        selectEl(null);
        source.value = prettyHTML(cleanHTML());
        editor.hidden = true;
        source.hidden = false;
        source.focus();
      } else {
        editor.innerHTML = source.value;
        prepareContent();
        source.hidden = true;
        editor.hidden = false;
        editor.focus();
        afterChange();
      }
      rte.classList.toggle('source-mode', state.sourceMode);
      (toolbar.querySelector('[data-tool="source"]') || DUMMY).classList.toggle('active', state.sourceMode);
      q('.table-bar').hidden = true;
    }
    source.addEventListener('input', () => { markDirty(); updateStats(); });
    const prettyHTML = html => html
      .replace(/>\s*(<\/?(p|h[1-6]|ul|ol|li|table|thead|tbody|tr|blockquote|pre|hr|div|figure)\b)/gi, '>\n$1')
      .replace(/^\n/, '').trim();

    function toggleFullscreen() {
      const on = rte.classList.toggle('fullscreen');
      const b = (toolbar.querySelector('[data-tool="fullscreen"]') || DUMMY);
      b.innerHTML = svg(on ? 'min' : 'max');
      b.title = on ? 'Exit fullscreen (Esc)' : 'Fullscreen';
      b.classList.toggle('active', on);
      document.body.style.overflow = on ? 'hidden' : '';
    }

    function toggleMore() {
      const on = rte.classList.toggle('show-more');
      (toolbar.querySelector('[data-tool="more"]') || DUMMY).classList.toggle('active', on);
    }

    function exitModes() {
      if (state.sourceMode) toggleSource();
      closeFind();
      selectEl(null);
    }

    /* ======================================================= find & replace */

    const findBar = q('.find-bar');
    const findInput = q('.find-input');
    let hits = [];
    let hitIndex = -1;

    function openFind() {
      if (state.sourceMode) return;
      findBar.hidden = false;
      const sel = getSelection().toString();
      if (sel && sel.length < 80) findInput.value = sel;
      findInput.focus();
      findInput.select();
      highlight();
    }
    function closeFind() { findBar.hidden = true; clearHits(); }
    function clearHits() {
      $$('mark.find-hit', editor).forEach(unwrap);
      hits = []; hitIndex = -1;
      q('.find-count').textContent = '';
    }
    function highlight() {
      clearHits();
      const q = findInput.value;
      if (!q) return;
      const mc = q('.find-case').checked;
      const needle = mc ? q : q.toLowerCase();
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (let node of nodes) {
        let hay = mc ? node.data : node.data.toLowerCase();
        let i = hay.indexOf(needle);
        while (i !== -1) {
          const match = node.splitText(i);
          node = match.splitText(q.length);
          const mark = document.createElement('mark');
          mark.className = 'find-hit';
          match.replaceWith(mark);
          mark.append(match);
          hits.push(mark);
          hay = mc ? node.data : node.data.toLowerCase();
          i = hay.indexOf(needle);
        }
      }
      q('.find-count').textContent = hits.length ? `${hits.length} found` : 'No matches';
      if (hits.length) goHit(0);
    }
    function goHit(i) {
      if (!hits.length) return;
      hits.forEach(h => h.classList.remove('current'));
      hitIndex = (i + hits.length) % hits.length;
      hits[hitIndex].classList.add('current');
      hits[hitIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
      q('.find-count').textContent = `${hitIndex + 1} of ${hits.length}`;
    }
    findInput.addEventListener('input', highlight);
    q('.find-case').addEventListener('change', highlight);
    findInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); goHit(hitIndex + (e.shiftKey ? -1 : 1)); }
      if (e.key === 'Escape') closeFind();
    });
    q('.find-next').addEventListener('click', () => goHit(hitIndex + 1));
    q('.find-prev').addEventListener('click', () => goHit(hitIndex - 1));
    q('.find-close').addEventListener('click', closeFind);
    q('.replace-one').addEventListener('click', () => {
      if (hitIndex < 0) return;
      hits[hitIndex].replaceWith(document.createTextNode(q('.replace-input').value));
      hits.splice(hitIndex, 1);
      markDirty(); updateStats();
      if (hits.length) goHit(hitIndex); else q('.find-count').textContent = 'No more matches';
    });
    q('.replace-all').addEventListener('click', () => {
      const n = hits.length;
      const rep = q('.replace-input').value;
      hits.forEach(m => m.replaceWith(document.createTextNode(rep)));
      editor.normalize();
      hits = []; hitIndex = -1;
      q('.find-count').textContent = `Replaced ${n}`;
      if (n) { markDirty(); updateStats(); }
    });

    /* =============================================================== export */

    function fileName() {
      return docTitle().replace(/[\\/:*?"<>|]+/g, '').slice(0, 80) || 'document';
    }
    function exportHTML() {
      return `<!DOCTYPE html>
  <html lang="en">
  <head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(docTitle())}</title>
  <style>
  body{max-width:800px;margin:40px auto;padding:0 20px;font:15px/1.6 "Segoe UI",system-ui,Arial,sans-serif;color:#202124}
  h1,h2,h3,h4,h5,h6{line-height:1.25}
  img{max-width:100%;height:auto}
  blockquote{margin:1em 0;padding:.3em 1em;border-left:4px solid #dadce0;color:#5f6368}
  pre{background:#f8f9fa;border:1px solid #e8eaed;padding:12px 14px;border-radius:6px;overflow:auto;white-space:pre-wrap}
  code{background:#f1f3f4;padding:1px 5px;border-radius:4px;color:#c5221f}pre code{background:none;padding:0;color:inherit}
  table{border-collapse:collapse;width:100%}td,th{border:1px solid #dadce0;padding:6px 10px}th{background:#f8f9fa;text-align:left}
  .media{margin:1em 0;max-width:100%}.media iframe,.media video{display:block;width:100%;max-width:640px;aspect-ratio:16/9;height:auto;border:0}
  ul.checklist{list-style:none;padding-left:4px}ul.checklist li::before{content:"☐ "}ul.checklist li.checked::before{content:"☑ "}
  ul.checklist li.checked{text-decoration:line-through;color:#9aa0a6}
  </style>
  </head>
  <body>
  ${cleanHTML().replace(/(src|href)="((?:\/[^"]*)?uploads\/[^"]+)"/g, (m, a, p) => `${a}="${new URL(p, location.href).href}"`)}
  </body>
  </html>`;
    }
    function download(name, content, type) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([content], { type: type + ';charset=utf-8' }));
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    /* ======================================================== global keys */

    section.querySelector('.btn-save')?.addEventListener('click', () => save());
    if (cfg.textarea && cfg.textarea.form) {
      const ta = cfg.textarea;
      // capture phase: runs before any other submit handler on the form
      ta.form.addEventListener('submit', e => {
        syncTextarea();
        if (cfg.required && !editor.textContent.trim() && !editor.querySelector('img,iframe,video,table')) {
          e.preventDefault();
          e.stopImmediatePropagation();
          toast((cfg.label || 'This field') + ' is required', true);
          editor.focus();
        }
      }, true);
      ta.form.addEventListener('reset', () => setTimeout(() => { editor.innerHTML = ta.value; prepareContent(); updateStats(); }));
    }
    document.addEventListener('keydown', e => {
      if (shared.last !== me) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 's') { e.preventDefault(); if (cfg.textarea) { syncTextarea(); cfg.textarea.form?.requestSubmit(); } else save(); }
      else if (mod && k === 'k' && !state.sourceMode) { e.preventDefault(); openLinkDialog(); }
      else if (e.key === 'Escape') {
        if (!pop.hidden) closePop();
        else if (!findBar.hidden) closeFind();
        else if (rte.classList.contains('fullscreen')) toggleFullscreen();
      }
    });
    window.addEventListener('beforeunload', e => {
      if (state.dirty && !cfg.textarea) { save({ silent: true }); e.preventDefault(); e.returnValue = ''; }
    });

    buildToolbar();
    load();
    rte.addEventListener('focusin', () => (shared.last = me));
    rte.addEventListener('mousedown', () => (shared.last = me));
    me.getHTML = () => (state.sourceMode ? source.value : cleanHTML());
    me.setHTML = html => { editor.innerHTML = html; prepareContent(); afterChange(); };
    me.element = rte;
    return me;
  }

  /* ================================================================= boot */

  const SHELL = `
    <div class="rte-toolbar" role="toolbar" aria-label="Editor toolbar"></div>
    <div class="ctx-bar float table-bar" hidden>
      <span class="ctx-label">Table</span>
      <button type="button" data-tbl="rowAbove">+ Row above</button>
      <button type="button" data-tbl="rowBelow">+ Row below</button>
      <button type="button" data-tbl="colLeft">+ Column left</button>
      <button type="button" data-tbl="colRight">+ Column right</button>
      <button type="button" data-tbl="delRow">Delete row</button>
      <button type="button" data-tbl="delCol">Delete column</button>
      <button type="button" data-tbl="toggleHeader">Header row</button>
      <button type="button" data-tbl="delTable" class="danger">Delete table</button>
    </div>
    <div class="ctx-bar float image-bar" hidden>
      <span class="ctx-label">Image</span>
      <button type="button" data-img="w25">25%</button>
      <button type="button" data-img="w50">50%</button>
      <button type="button" data-img="w75">75%</button>
      <button type="button" data-img="w100">100%</button>
      <button type="button" data-img="left">Float left</button>
      <button type="button" data-img="center">Center</button>
      <button type="button" data-img="right">Float right</button>
      <button type="button" data-img="alt">Alt text…</button>
      <button type="button" data-img="remove" class="danger">Remove</button>
    </div>
    <div class="ctx-bar find-bar" hidden>
      <input class="find-input" placeholder="Find">
      <input class="replace-input" placeholder="Replace with">
      <label><input type="checkbox" class="find-case"> Match case</label>
      <button type="button" class="find-prev" title="Previous (Shift+Enter)">↑</button>
      <button type="button" class="find-next" title="Next (Enter)">↓</button>
      <button type="button" class="replace-one">Replace</button>
      <button type="button" class="replace-all">Replace all</button>
      <span class="find-count"></span>
      <button type="button" class="find-close" title="Close (Esc)">✕</button>
    </div>
    <div class="rte-body">
      <div class="rte-content" contenteditable="true" spellcheck="true" data-placeholder="Start writing…"></div>
      <textarea class="rte-source" spellcheck="false" hidden></textarea>
    </div>
    <div class="rte-footer">
      <span class="tag-chip">&lt;p&gt;</span>
      <span class="grow"></span>
      <span class="stats">words: 0 | characters: 0</span>
    </div>`;

  const editors = [];
  let fieldCount = 0;

  /** Turn one <textarea data-rte> into an editor (safe to call twice). */
  function attach(ta) {
    if (!ta || ta.dataset.rteReady) return null;
    ta.dataset.rteReady = '1';
    const box = document.createElement('div');
    box.className = 'rte';
    box.dataset.mode = ta.dataset.rte || 'advanced';
    if (ta.dataset.height) box.style.height = /^\d+$/.test(ta.dataset.height) ? ta.dataset.height + 'px' : ta.dataset.height;
    ta.after(box);
    ta.hidden = true;
    const required = ta.required;
    ta.required = false;                     // a hidden required field would block the browser's own validation
    const label = ta.id && $(`label[for="${CSS.escape(ta.id)}"]`);
    if (label) label.addEventListener('click', e => { e.preventDefault(); box.querySelector('.rte-content').focus(); });
    const ed = createEditor(box, {
      doc: 'field-' + (++fieldCount), mode: box.dataset.mode, placeholder: ta.placeholder, textarea: ta,
      required, label: label ? label.textContent.trim() : ta.name,
    });
    ed.textarea = ta;
    editors.push(ed);
    if (!shared.last) shared.last = ed;
    return ed;
  }

  /**
   * Start every editor inside `root` (default: the whole page). Call it again after you add
   * new fields with JavaScript, e.g. in a modal:  CustomEditor.init(modalElement)
   */
  function init(root = document) {
    // 1) stand-alone editors that save themselves:  <div class="rte" data-doc="…" data-mode="basic|advanced">
    $$('.rte[data-doc]', root).forEach(el => {
      if (el.dataset.rteReady) return;
      el.dataset.rteReady = '1';
      const ed = createEditor(el, { doc: el.dataset.doc, mode: el.dataset.mode || 'advanced', placeholder: el.dataset.placeholder });
      editors.push(ed);
      if (!shared.last) shared.last = ed;
    });
    // 2) form fields:  <textarea name="content" data-rte="basic|advanced">…html…</textarea>
    //    The textarea is hidden and kept in sync, so a normal form POST sends the HTML.
    $$('textarea[data-rte]', root).forEach(attach);
    return editors;
  }

  init();

  window.CustomEditor = {
    editors,                                  // every editor on the page
    init,                                     // CustomEditor.init(container) – start editors added later
    attach,                                   // CustomEditor.attach(textareaElement)
    /** Find an editor by its textarea (element, id or name):  CustomEditor.get('content').getHTML() */
    get(key) {
      return editors.find(e => e.textarea && (e.textarea === key || e.textarea.id === key || e.textarea.name === key)) || null;
    },
  };
})();
