<?php
/**
 * Custom Editor – settings for your site.
 *
 * editor_allowed() decides who may use api.php (save documents, upload images/videos).
 * On an admin website, return true only for logged-in admins, for example:
 *
 *   if (session_status() === PHP_SESSION_NONE) session_start();
 *   return !empty($_SESSION['admin_id']);          // use your own login check here
 *
 * Until you change it, everyone who can open the site may upload files.
 */
declare(strict_types=1);

if (!function_exists('editor_allowed')) {
    function editor_allowed(): bool
    {
        return true;
    }
}
