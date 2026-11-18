<?php
/**
 * Custom Editor – normal <form> example (server side).
 *
 * The editors are plain <textarea data-rte="basic|advanced"> fields. editor.js
 * replaces each one with an editor and keeps the textarea updated, so the HTML
 * arrives in $_POST like any other field. Here it is sanitized and stored as
 * JSON in data/posts/ – swap save_post()/load_post() for your database.
 */
declare(strict_types=1);

require __DIR__ . '/sanitize.php';

session_start();
const POST_DIR = __DIR__ . '/data/posts';
if (!is_dir(POST_DIR)) mkdir(POST_DIR, 0775, true);

if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
$csrf = $_SESSION['csrf'];

function h(?string $s): string { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }
function post_path(string $id): string { return POST_DIR . "/$id.json"; }
function valid_post_id(?string $id): ?string { return $id && preg_match('/^[a-f0-9]{16}$/', $id) ? $id : null; }

function load_post(string $id): ?array
{
    $f = post_path($id);
    return is_file($f) ? json_decode((string) file_get_contents($f), true) : null;
}

function save_post(array $post): void
{
    file_put_contents(post_path($post['id']), json_encode($post, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    /* MySQL instead (table posts: id, title, summary, body, updated):
       $pdo->prepare('REPLACE INTO posts (id, title, summary, body, updated) VALUES (?, ?, ?, ?, NOW())')
           ->execute([$post['id'], $post['title'], $post['summary'], $post['body']]);  */
}

function all_posts(): array
{
    $list = [];
    foreach (glob(POST_DIR . '/*.json') ?: [] as $f) {
        $p = json_decode((string) file_get_contents($f), true);
        if (is_array($p)) $list[] = $p;
    }
    usort($list, fn($a, $b) => $b['updated'] <=> $a['updated']);
    return $list;
}

/* ------------------------------------------------------------ handle POST */
$errors = [];
$post = ['id' => '', 'title' => '', 'summary' => '', 'body' => ''];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($csrf, (string) ($_POST['csrf'] ?? ''))) {
        http_response_code(400);
        exit('Invalid form token – reload the page and try again.');
    }

    if (isset($_POST['delete']) && ($id = valid_post_id($_POST['id'] ?? null))) {
        @unlink(post_path($id));
        header('Location: index.php?deleted=1');
        exit;
    }

    $post = [
        'id'      => valid_post_id($_POST['id'] ?? null) ?? bin2hex(random_bytes(8)),
        'title'   => trim(mb_substr((string) ($_POST['title'] ?? ''), 0, 200)),
        'summary' => sanitize_html((string) ($_POST['summary'] ?? '')),   // basic editor
        'body'    => sanitize_html((string) ($_POST['body'] ?? '')),      // advanced editor
        'updated' => time(),
    ];
    if ($post['title'] === '') $errors[] = 'Title is required.';
    if (trim(strip_tags($post['body'], '<img><iframe><video><table>')) === '') $errors[] = 'Content is required.';

    if (!$errors) {
        save_post($post);
        header('Location: index.php?id=' . $post['id'] . '&saved=1');   // POST → redirect → GET
        exit;
    }
} elseif ($id = valid_post_id($_GET['id'] ?? null)) {
    $post = load_post($id) ?? $post;
}

$view = ($v = valid_post_id($_GET['view'] ?? null)) ? load_post($v) : null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Editor form example</title>
  <link rel="stylesheet" href="assets/editor.css?v=13">
  <style>
    .form-card { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin-bottom: 28px; }
    .field { margin-bottom: 18px; }
    .field > label { display: block; font-weight: 600; font-size: 14px; margin-bottom: 6px; }
    .field input[type=text] { width: 100%; padding: 9px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 15px; }
    .field .hint { font-size: 12px; color: var(--muted); margin-top: 4px; }
    .actions { display: flex; gap: 10px; align-items: center; }
    .alert { padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 14px; }
    .alert.ok { background: #e6f4ea; color: #137333; }
    .alert.err { background: #fce8e6; color: #c5221f; }
    table.list { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; }
    table.list th, table.list td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; }
    table.list td.act { white-space: nowrap; text-align: right; }
    table.list a { color: var(--accent); text-decoration: none; margin-left: 10px; }
    .view { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 22px 26px; margin-bottom: 28px; }
    .inline { display: inline; }
    .linkbtn { background: none; border: 0; color: var(--danger); cursor: pointer; font-size: 14px; margin-left: 10px; padding: 0; }
  </style>
</head>
<body>
<div class="page-wrap">
  <header class="page-head">
    <div>
      <h1>Form example</h1>
      <p class="sub">Editors inside a normal &lt;form&gt;: the HTML is posted, sanitized and stored by PHP.</p>
    </div>
  </header>

  <?php if (isset($_GET['saved'])): ?><div class="alert ok">Saved.</div><?php endif; ?>
  <?php if (isset($_GET['deleted'])): ?><div class="alert ok">Deleted.</div><?php endif; ?>
  <?php foreach ($errors as $e): ?><div class="alert err"><?= h($e) ?></div><?php endforeach; ?>

  <?php if ($view): ?>
    <h2><?= h($view['title']) ?></h2>
    <div class="view rte-content">
      <?= $view['summary'] /* already sanitized when saved */ ?>
      <hr>
      <?= $view['body'] ?>
    </div>
  <?php endif; ?>

  <form class="form-card" method="post" action="index.php">
    <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
    <input type="hidden" name="id" value="<?= h($post['id']) ?>">

    <div class="field">
      <label for="title">Title</label>
      <input type="text" id="title" name="title" value="<?= h($post['title']) ?>" required>
    </div>

    <div class="field">
      <label for="summary">Summary (basic editor)</label>
      <textarea id="summary" name="summary" data-rte="basic" data-height="260" placeholder="Short summary…"><?= h($post['summary']) ?></textarea>
    </div>

    <div class="field">
      <label for="body">Content (advanced editor)</label>
      <textarea id="body" name="body" data-rte="advanced" data-height="480" placeholder="Write the full content…" required><?= h($post['body']) ?></textarea>
      <div class="hint">Images and videos you add are uploaded to the uploads/ folder.</div>
    </div>

    <div class="actions">
      <button type="submit" class="btn btn-primary"><?= $post['id'] ? 'Update' : 'Save' ?></button>
      <?php if ($post['id']): ?><a class="btn" href="index.php">New</a><?php endif; ?>
    </div>
  </form>

  <h2>Saved entries</h2>
  <?php $list = all_posts(); if (!$list): ?>
    <p class="sub">Nothing saved yet.</p>
  <?php else: ?>
    <table class="list">
      <tr><th>Title</th><th>Updated</th><th></th></tr>
      <?php foreach ($list as $p): ?>
        <tr>
          <td><?= h($p['title']) ?></td>
          <td><?= h(date('Y-m-d H:i', (int) $p['updated'])) ?></td>
          <td class="act">
            <a href="index.php?view=<?= h($p['id']) ?>">View</a>
            <a href="index.php?id=<?= h($p['id']) ?>">Edit</a>
            <form class="inline" method="post" action="index.php" onsubmit="return confirm('Delete this entry?')">
              <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
              <input type="hidden" name="id" value="<?= h($p['id']) ?>">
              <button class="linkbtn" name="delete" value="1">Delete</button>
            </form>
          </td>
        </tr>
      <?php endforeach; ?>
    </table>
  <?php endif; ?>
</div>

<script src="assets/editor.js?v=13"></script>
</body>
</html>
