<?php
/**
 * Custom Editor – JSON API
 *
 * GET  api.php?action=list                 -> list documents
 * GET  api.php?action=load&id=<id>         -> load one document
 * POST api.php?action=save    {id?,title,html}
 * POST api.php?action=delete  {id}
 * POST api.php?action=upload  multipart "file" (+ kind=image|video)
 *
 * POST requests must send the header "X-Requested-With: CustomEditor"
 * (a cheap CSRF guard: other sites cannot add custom headers cross-origin).
 */
declare(strict_types=1);

require __DIR__ . '/sanitize.php';   // sanitize_html(), word_count()
require __DIR__ . '/config.php';     // editor_allowed(): who may save / upload

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

const DOC_DIR    = __DIR__ . '/data/docs';
const UPLOAD_DIR = __DIR__ . '/uploads';
// web path of uploads/, e.g. /editor/custom-editor/uploads – works from any page on the site
define('UPLOAD_URL', rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/api.php')), '/') . '/uploads');
const MAX_UPLOAD = 5 * 1024 * 1024;   // 5 MB per image
const MAX_VIDEO  = 50 * 1024 * 1024;  // 50 MB per video (PHP upload_max_filesize must allow it)
const MAX_DOC    = 5 * 1024 * 1024;   // 5 MB of HTML per document

foreach ([DOC_DIR, UPLOAD_DIR] as $dir) {
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        fail("Cannot create directory: $dir", 500);
    }
}

/* ---------------------------------------------------------------- helpers */

function out(array $data, int $code = 200): never
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $msg, int $code = 400): never
{
    out(['ok' => false, 'error' => $msg], $code);
}

function valid_id(mixed $id): string
{
    if (!is_string($id) || !preg_match('/^[a-f0-9]{16}$/', $id)) {
        fail('Invalid document id');
    }
    return $id;
}

function doc_path(string $id): string
{
    return DOC_DIR . "/$id.json";
}

function read_doc(string $id): ?array
{
    $path = doc_path($id);
    if (!is_file($path)) return null;
    $data = json_decode((string) file_get_contents($path), true);
    return is_array($data) ? $data : null;
}

function write_atomic(string $path, string $contents): void
{
    $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($tmp, $contents, LOCK_EX) === false || !rename($tmp, $path)) {
        @unlink($tmp);
        fail('Could not write file', 500);
    }
}

function json_body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if (strlen($raw) > MAX_DOC + 65536) fail('Document too large', 413);
    $data = json_decode($raw, true);
    if (!is_array($data)) fail('Invalid JSON body');
    return $data;
}

/* ---------------------------------------------------------------- routing */

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if (!editor_allowed()) {
    fail('Not allowed – please log in', 403);
}

if ($method === 'POST' && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'CustomEditor') {
    fail('Missing request header', 403);
}

switch ("$method $action") {

    case 'GET list':
        $docs = [];
        foreach (glob(DOC_DIR . '/*.json') ?: [] as $file) {
            $d = json_decode((string) file_get_contents($file), true);
            if (!is_array($d)) continue;
            $docs[] = [
                'id'      => $d['id'],
                'title'   => $d['title'] ?? 'Untitled',
                'updated' => $d['updated'] ?? 0,
                'words'   => $d['words'] ?? 0,
            ];
        }
        usort($docs, fn($a, $b) => $b['updated'] <=> $a['updated']);
        out(['ok' => true, 'docs' => $docs]);

    case 'GET load':
        $id = valid_id($_GET['id'] ?? null);
        $d = read_doc($id);
        if (!$d && !empty($_GET['optional'])) out(['ok' => true, 'doc' => null]);
        if (!$d) fail('Document not found', 404);
        out(['ok' => true, 'doc' => $d]);

    case 'POST save':
        $body = json_body();
        $html = (string) ($body['html'] ?? '');
        if (strlen($html) > MAX_DOC) fail('Document too large', 413);
        $title = trim(mb_substr(strip_tags((string) ($body['title'] ?? '')), 0, 200));
        $id = isset($body['id']) && $body['id'] !== '' ? valid_id($body['id']) : bin2hex(random_bytes(8));
        $existing = read_doc($id);
        $clean = sanitize_html($html);
        $doc = [
            'id'      => $id,
            'title'   => $title !== '' ? $title : 'Untitled',
            'html'    => $clean,
            'words'   => word_count($clean),
            'created' => $existing['created'] ?? time(),
            'updated' => time(),
        ];
        write_atomic(doc_path($id), json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
        out(['ok' => true, 'id' => $id, 'updated' => $doc['updated'], 'title' => $doc['title'], 'words' => $doc['words']]);

    case 'POST delete':
        $id = valid_id(json_body()['id'] ?? null);
        $path = doc_path($id);
        if (!is_file($path)) fail('Document not found', 404);
        if (!unlink($path)) fail('Could not delete document', 500);
        out(['ok' => true]);

    case 'POST upload':
        $f = $_FILES['file'] ?? null;
        if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            $code = $f['error'] ?? 'none';
            fail($code === UPLOAD_ERR_INI_SIZE ? 'File is larger than PHP upload_max_filesize allows' : "Upload failed (code $code)");
        }
        $isVideo = ($_POST['kind'] ?? 'image') === 'video';
        if ($f['size'] > ($isVideo ? MAX_VIDEO : MAX_UPLOAD)) fail($isVideo ? 'Video is larger than 50 MB' : 'Image is larger than 5 MB', 413);
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
        $types = $isVideo
            ? ['video/mp4' => 'mp4', 'video/webm' => 'webm', 'video/ogg' => 'ogv']
            : ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'];
        $ext = $types[$mime] ?? null;
        if (!$ext) fail($isVideo ? 'Only MP4, WEBM and OGG videos are allowed' : 'Only JPG, PNG, GIF and WEBP images are allowed');
        $sub = date('Y/m');
        $dir = UPLOAD_DIR . "/$sub";
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) fail('Cannot create upload folder', 500);
        $name = bin2hex(random_bytes(8)) . ".$ext";
        if (!move_uploaded_file($f['tmp_name'], "$dir/$name")) fail('Could not store upload', 500);
        out(['ok' => true, 'url' => UPLOAD_URL . "/$sub/$name"]);

    default:
        fail('Unknown action', 404);
}
