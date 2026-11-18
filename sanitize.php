<?php
/**
 * Custom Editor – HTML sanitizer (server side).
 *
 * Always run editor HTML through sanitize_html() before you store it or print it:
 *
 *   require __DIR__ . '/sanitize.php';
 *   $clean = sanitize_html($_POST['content'] ?? '');
 *
 * Needs PHP 8.1+ with the dom extension (on by default in WAMP).
 */
declare(strict_types=1);

if (!function_exists('sanitize_html')) {

function word_count(string $html): int
{
    $text = trim(html_entity_decode(strip_tags(preg_replace('/<(br|\/p|\/div|\/li|\/h\d|\/td|\/th)[^>]*>/i', ' $0', $html)), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    if ($text === '') return 0;
    return count(preg_split('/\s+/u', $text));
}

/* ------------------------------------------------------- HTML sanitizer */

/**
 * Allow-list sanitizer. Unknown tags are unwrapped (children kept),
 * dangerous tags are removed with their content, attributes are filtered.
 */
function sanitize_html(string $html): string
{
    if (trim($html) === '') return '';

    $allowed = [
        'p', 'br', 'hr', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'sub', 'sup', 'mark', 'small', 'font',
        'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'a', 'img', 'figure', 'figcaption',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
        'video', 'source', 'iframe',
    ];
    $drop = ['script', 'style', 'object', 'embed', 'form', 'input', 'button', 'select',
             'textarea', 'link', 'meta', 'base', 'svg', 'math', 'template', 'noscript', 'frame', 'frameset', 'applet'];
    $globalAttrs = ['style', 'class', 'title', 'dir', 'lang'];
    $tagAttrs = [
        'a'    => ['href', 'target', 'rel'],
        'img'  => ['src', 'alt', 'width', 'height'],
        'td'   => ['colspan', 'rowspan'],
        'th'   => ['colspan', 'rowspan', 'scope'],
        'col'  => ['span'],
        'ol'   => ['start', 'type'],
        'font' => ['color', 'face', 'size'],
        'pre'    => ['data-lang'],
        'video'  => ['src', 'controls', 'width', 'height', 'poster'],
        'source' => ['src', 'type'],
        'iframe' => ['src', 'width', 'height', 'allowfullscreen', 'frameborder', 'allow'],
    ];

    libxml_use_internal_errors(true);
    $doc = new DOMDocument('1.0', 'UTF-8');
    $doc->loadHTML('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div id="ce-root">'
        . $html . '</div></body></html>');
    libxml_clear_errors();

    $xpath = new DOMXPath($doc);
    $root = $xpath->query('//div[@id="ce-root"]')->item(0);
    if (!$root) return '';

    $walk = function (DOMNode $node) use (&$walk, $allowed, $drop, $globalAttrs, $tagAttrs): void {
        // copy list first – we mutate while iterating
        $children = [];
        foreach ($node->childNodes as $c) $children[] = $c;

        foreach ($children as $child) {
            if ($child instanceof DOMComment || $child instanceof DOMProcessingInstruction) {
                $node->removeChild($child);
                continue;
            }
            if (!($child instanceof DOMElement)) continue;

            $tag = strtolower($child->tagName);

            if (in_array($tag, $drop, true)) {
                $node->removeChild($child);
                continue;
            }

            $walk($child);

            if (!in_array($tag, $allowed, true)) {   // unwrap unknown tag
                while ($child->firstChild) $node->insertBefore($child->firstChild, $child);
                $node->removeChild($child);
                continue;
            }

            $ok = array_merge($globalAttrs, $tagAttrs[$tag] ?? []);
            $attrs = [];
            foreach ($child->attributes as $a) $attrs[] = $a->name;
            foreach ($attrs as $name) {
                $lname = strtolower($name);
                $value = $child->getAttribute($name);
                if (!in_array($lname, $ok, true)) {
                    $child->removeAttribute($name);
                    continue;
                }
                if ($lname === 'href' || $lname === 'src') {
                    if (!safe_url($value, $lname === 'src')) $child->removeAttribute($name);
                } elseif ($lname === 'style') {
                    $clean = safe_style($value);
                    $clean === '' ? $child->removeAttribute($name) : $child->setAttribute($name, $clean);
                }
            }
            if ($tag === 'iframe' && !preg_match('#^https://(www\.youtube(-nocookie)?\.com/embed/|player\.vimeo\.com/video/)#i', $child->getAttribute('src'))) {
                $node->removeChild($child);   // only YouTube / Vimeo embeds are allowed
                continue;
            }
            if ($tag === 'a' && $child->getAttribute('target') === '_blank') {
                $child->setAttribute('rel', 'noopener noreferrer');
            }
        }
    };
    $walk($root);

    $result = '';
    foreach ($root->childNodes as $c) $result .= $doc->saveHTML($c);
    return $result;
}

function safe_url(string $url, bool $isImage): bool
{
    $u = strtolower(preg_replace('/[\x00-\x20]+/', '', html_entity_decode($url)));
    if ($u === '') return false;
    if ($isImage && preg_match('#^data:image/(png|jpe?g|gif|webp);base64,#', $u)) return true;
    if (preg_match('#^[a-z][a-z0-9+.\-]*:#', $u)) {
        return (bool) preg_match('#^(https?|mailto|tel):#', $u);
    }
    return true; // relative URL, #anchor, /path
}

function safe_style(string $style): string
{
    $keep = [];
    foreach (explode(';', $style) as $decl) {
        if (!str_contains($decl, ':')) continue;
        [$prop, $val] = array_map('trim', explode(':', $decl, 2));
        $prop = strtolower($prop);
        if (!preg_match('/^(color|background-color|background|font-size|font-family|font-weight|font-style|'
            . 'text-decoration|text-decoration-line|text-align|line-height|margin-left|padding-left|width|height|max-width|'
            . 'float|margin|border|border-collapse|vertical-align|list-style-type|text-indent|display|aspect-ratio)$/', $prop)) continue;
        if (preg_match('/(expression|javascript:|url\s*\(|@import|behavior)/i', $val)) continue;
        $keep[] = "$prop: $val";
    }
    return implode('; ', $keep);
}

}
