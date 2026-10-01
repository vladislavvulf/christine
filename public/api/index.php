<?php
/**
 * Christine — API.
 * Требования: PHP 7.4+ с PDO (pdo_sqlite или pdo_mysql). Никакого Node.js на сервере.
 *
 * Действия (?action=...):
 *   ping                       — проверка работы и БД
 *   config                     — публичные настройки (Google Client ID)
 *   google    POST {credential, progress?, xp?, avatar?} — вход через Google
 *   register  POST {username, password, progress?, xp?, avatar?}
 *   login     POST {username, password}
 *   logout    POST
 *   me        GET
 *   save      POST {progress, xpDelta, import?}
 *   leaderboard GET &period=week|all
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$config = require __DIR__ . '/config.php';

function out(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode(['ok' => $code < 400] + $data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $msg, int $code = 400): void
{
    out(['error' => $msg], $code);
}

set_exception_handler(function (Throwable $e) {
    error_log('[christine-api] ' . $e->getMessage());
    fail('Внутренняя ошибка сервера', 500);
});

/* ---------- База данных ---------- */
function db(): PDO
{
    static $pdo = null;
    global $config;
    if ($pdo) return $pdo;
    $c = $config['db'];

    if ($c['driver'] === 'mysql') {
        $m = $c['mysql'];
        $dsn = "mysql:host={$m['host']};port={$m['port']};dbname={$m['name']};charset={$m['charset']}";
        $pdo = new PDO($dsn, $m['user'], $m['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        migrate($pdo, 'mysql');
        return $pdo;
    }

    $path = null;
    foreach ($c['sqlite_paths'] as $p) {
        $dir = dirname($p);
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        if (is_dir($dir) && is_writable($dir)) { $path = $p; break; }
    }
    if (!$path) fail('Нет папки для базы данных с правами на запись. Создайте api/data и дайте права 775.', 500);

    $isNew = !file_exists($path);
    $pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA busy_timeout = 3000');
    // защита папки, если база лежит внутри сайта
    $ht = dirname($path) . '/.htaccess';
    if (!file_exists($ht)) {
        @file_put_contents($ht, "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n    Deny from all\n</IfModule>\n");
    }
    migrate($pdo, 'sqlite');
    if ($isNew) @chmod($path, 0664);
    return $pdo;
}

function migrate(PDO $pdo, string $driver): void
{
    $ai = $driver === 'mysql' ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $text = $driver === 'mysql' ? 'MEDIUMTEXT' : 'TEXT';
    $engine = $driver === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id $ai,
        username VARCHAR(32) NOT NULL,
        username_lc VARCHAR(32) NOT NULL UNIQUE,
        pass_hash VARCHAR(255) NOT NULL,
        avatar VARCHAR(16) NOT NULL DEFAULT '🐯',
        xp INT NOT NULL DEFAULT 0,
        week_xp INT NOT NULL DEFAULT 0,
        week_key VARCHAR(10) NOT NULL DEFAULT '',
        day_xp INT NOT NULL DEFAULT 0,
        day_key VARCHAR(10) NOT NULL DEFAULT '',
        streak INT NOT NULL DEFAULT 0,
        progress $text,
        created_at INT NOT NULL,
        updated_at INT NOT NULL
    )$engine");
    $pdo->exec("CREATE TABLE IF NOT EXISTS tokens (
        token_hash CHAR(64) PRIMARY KEY,
        user_id INT NOT NULL,
        created_at INT NOT NULL,
        last_used INT NOT NULL
    )$engine");
    // вход через Google — колонка добавляется и в уже существующую базу
    $cols = $driver === 'mysql'
        ? array_column($pdo->query("SHOW COLUMNS FROM users")->fetchAll(), 'Field')
        : array_column($pdo->query("PRAGMA table_info(users)")->fetchAll(), 'name');
    if (!in_array('google_sub', $cols, true)) {
        $pdo->exec("ALTER TABLE users ADD COLUMN google_sub VARCHAR(64) NULL");
        $pdo->exec("CREATE UNIQUE INDEX users_google_sub ON users (google_sub)");
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS attempts (
        ip VARCHAR(64) NOT NULL,
        ts INT NOT NULL
    )$engine");
}

/* ---------- Вспомогательное ---------- */
function input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') return [];
    if (strlen($raw) > 600000) fail('Слишком большой запрос', 413);
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function client_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? '0'), 0, 64);
}

function week_key(): string { return date('o-\WW'); }
function day_key(): string { return date('Y-m-d'); }

function header_token(): string
{
    $t = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if (!$t && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) if (strtolower($k) === 'x-auth-token') $t = $v;
    }
    return is_string($t) ? $t : '';
}

function current_user(bool $required = true): ?array
{
    global $config;
    $t = header_token();
    if (!preg_match('/^[a-f0-9]{64}$/', $t)) {
        if ($required) fail('Нужно войти', 401);
        return null;
    }
    $st = db()->prepare('SELECT u.* , t.last_used FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?');
    $st->execute([hash('sha256', $t)]);
    $u = $st->fetch();
    if (!$u || $u['last_used'] < time() - $config['token_ttl_days'] * 86400) {
        if ($required) fail('Сессия истекла, войдите снова', 401);
        return null;
    }
    if ($u['last_used'] < time() - 3600) {
        db()->prepare('UPDATE tokens SET last_used = ? WHERE token_hash = ?')->execute([time(), hash('sha256', $t)]);
    }
    return $u;
}

function issue_token(int $userId): string
{
    $t = bin2hex(random_bytes(32));
    db()->prepare('INSERT INTO tokens (token_hash, user_id, created_at, last_used) VALUES (?, ?, ?, ?)')
        ->execute([hash('sha256', $t), $userId, time(), time()]);
    return $t;
}

function public_user(array $u): array
{
    return ['id' => (int)$u['id'], 'username' => $u['username'], 'avatar' => $u['avatar']];
}

function clean_avatar($a): string
{
    $a = is_string($a) ? $a : '';
    return preg_match('/^a_[a-z]{2,12}$/', $a) ? $a : 'a_tiger';
}

/** Проверка ID-токена Google через официальный endpoint tokeninfo */
function verify_google_token(string $jwt, string $clientId): array
{
    if (!preg_match('/^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/', $jwt)) fail('Неверный токен Google', 400);
    $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($jwt);
    $body = false;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_SSL_VERIFYPEER => true]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code !== 200) $body = false;
    } elseif (ini_get('allow_url_fopen')) {
        $body = @file_get_contents($url, false, stream_context_create(['http' => ['timeout' => 10]]));
    } else {
        fail('Сервер не может обратиться к Google (нужен cURL или allow_url_fopen)', 500);
    }
    $info = $body ? json_decode($body, true) : null;
    if (!is_array($info)) fail('Google не подтвердил вход', 401);
    if (($info['aud'] ?? '') !== $clientId) fail('Токен выдан для другого приложения', 401);
    if (!in_array($info['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)) fail('Неверный издатель токена', 401);
    if ((int)($info['exp'] ?? 0) < time()) fail('Токен Google истёк', 401);
    if (empty($info['sub'])) fail('Нет идентификатора пользователя Google', 401);
    return $info;
}

/** Свободное имя пользователя на основе имени из Google */
function unique_username(string $base): string
{
    $base = preg_replace('/[^\p{L}\p{N}_.\-]+/u', '_', trim($base));
    $base = trim((string)$base, '_.-');
    if (mb_strlen($base) < 3) $base = 'user';
    $base = mb_substr($base, 0, 16);
    $name = $base;
    for ($i = 0; $i < 50; $i++) {
        $st = db()->prepare('SELECT 1 FROM users WHERE username_lc = ?');
        $st->execute([mb_strtolower($name)]);
        if (!$st->fetch()) return $name;
        $name = $base . random_int(10, 9999);
    }
    return 'user' . random_int(100000, 999999);
}

function clean_progress($p): ?string
{
    if (!is_array($p)) return null;
    $json = json_encode($p, JSON_UNESCAPED_UNICODE);
    if ($json === false || strlen($json) > 500000) fail('Прогресс слишком большой', 413);
    return $json;
}

function rate_limit(): void
{
    global $config;
    $pdo = db();
    $since = time() - $config['login_window_min'] * 60;
    $pdo->prepare('DELETE FROM attempts WHERE ts < ?')->execute([$since]);
    $st = $pdo->prepare('SELECT COUNT(*) FROM attempts WHERE ip = ?');
    $st->execute([client_ip()]);
    if ((int)$st->fetchColumn() >= $config['login_attempts']) fail('Слишком много попыток. Подождите несколько минут.', 429);
    $pdo->prepare('INSERT INTO attempts (ip, ts) VALUES (?, ?)')->execute([client_ip(), time()]);
}

/** Начислить XP с ограничениями от накруток */
function grant_xp(array $u, int $delta, int $cap): array
{
    global $config;
    $wk = week_key();
    $dk = day_key();
    $week = $u['week_key'] === $wk ? (int)$u['week_xp'] : 0;
    $day = $u['day_key'] === $dk ? (int)$u['day_xp'] : 0;
    $delta = max(0, min($delta, $cap, $config['max_xp_per_day'] - $day));
    return ['xp' => (int)$u['xp'] + $delta, 'week_xp' => $week + $delta, 'week_key' => $wk, 'day_xp' => $day + $delta, 'day_key' => $dk];
}

/* ---------- Маршруты ---------- */
$action = $_GET['action'] ?? 'ping';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') out([]);

switch ($action) {
    case 'ping':
        db();
        out(['service' => 'christine', 'php' => PHP_VERSION, 'db' => $config['db']['driver']]);

    case 'config':
        out(['googleClientId' => (string)($config['google_client_id'] ?? '')]);

    case 'google': {
        if ($method !== 'POST') fail('Нужен POST', 405);
        $clientId = (string)($config['google_client_id'] ?? '');
        if ($clientId === '') fail('Вход через Google не настроен на сервере', 400);
        rate_limit();
        $in = input();
        $info = verify_google_token((string)($in['credential'] ?? ''), $clientId);
        $st = db()->prepare('SELECT * FROM users WHERE google_sub = ?');
        $st->execute([$info['sub']]);
        $u = $st->fetch();
        if ($u) {
            out(['user' => public_user($u), 'token' => issue_token((int)$u['id']), 'progress' => $u['progress'] ? json_decode($u['progress'], true) : null, 'created' => false]);
        }
        // новый пользователь: переносим гостевой прогресс, как при обычной регистрации
        $name = unique_username((string)($info['given_name'] ?? $info['name'] ?? 'user'));
        $progress = clean_progress($in['progress'] ?? null);
        $base = ['xp' => 0, 'week_xp' => 0, 'week_key' => '', 'day_xp' => 0, 'day_key' => ''];
        $xp = grant_xp($base, (int)($in['xp'] ?? 0), $config['import_xp_cap']);
        $streak = is_array($in['progress'] ?? null) ? (int)($in['progress']['streak']['count'] ?? 0) : 0;
        $now = time();
        db()->prepare('INSERT INTO users (username, username_lc, pass_hash, avatar, xp, week_xp, week_key, day_xp, day_key, streak, progress, created_at, updated_at, google_sub)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$name, mb_strtolower($name), '', clean_avatar($in['avatar'] ?? ''), $xp['xp'], $xp['week_xp'], $xp['week_key'],
                $xp['day_xp'], $xp['day_key'], min($streak, 10000), $progress, $now, $now, $info['sub']]);
        $id = (int)db()->lastInsertId();
        $st = db()->prepare('SELECT * FROM users WHERE id = ?');
        $st->execute([$id]);
        out(['user' => public_user($st->fetch()), 'token' => issue_token($id), 'progress' => null, 'created' => true]);
    }

    case 'register': {
        if ($method !== 'POST') fail('Нужен POST', 405);
        rate_limit();
        $in = input();
        $name = trim((string)($in['username'] ?? ''));
        $pass = (string)($in['password'] ?? '');
        if (!preg_match('/^[\p{L}\p{N}_.\-]{3,20}$/u', $name)) fail('Имя: 3–20 символов (буквы, цифры, _ . -)');
        if (mb_strlen($pass) < 6) fail('Пароль — минимум 6 символов');
        if (mb_strlen($pass) > 200) fail('Слишком длинный пароль');
        $lc = mb_strtolower($name);
        $st = db()->prepare('SELECT id FROM users WHERE username_lc = ?');
        $st->execute([$lc]);
        if ($st->fetch()) fail('Это имя уже занято');

        $progress = clean_progress($in['progress'] ?? null);
        $now = time();
        $base = ['xp' => 0, 'week_xp' => 0, 'week_key' => '', 'day_xp' => 0, 'day_key' => ''];
        $xp = grant_xp($base, (int)($in['xp'] ?? 0), $config['import_xp_cap']);
        $streak = is_array($in['progress'] ?? null) ? (int)($in['progress']['streak']['count'] ?? 0) : 0;
        db()->prepare('INSERT INTO users (username, username_lc, pass_hash, avatar, xp, week_xp, week_key, day_xp, day_key, streak, progress, created_at, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$name, $lc, password_hash($pass, PASSWORD_DEFAULT), clean_avatar($in['avatar'] ?? ''),
                $xp['xp'], $xp['week_xp'], $xp['week_key'], $xp['day_xp'], $xp['day_key'], min($streak, 10000), $progress, $now, $now]);
        $id = (int)db()->lastInsertId();
        $st = db()->prepare('SELECT * FROM users WHERE id = ?');
        $st->execute([$id]);
        $u = $st->fetch();
        out(['user' => public_user($u), 'token' => issue_token($id), 'progress' => null]);
    }

    case 'login': {
        if ($method !== 'POST') fail('Нужен POST', 405);
        rate_limit();
        $in = input();
        $st = db()->prepare('SELECT * FROM users WHERE username_lc = ?');
        $st->execute([mb_strtolower(trim((string)($in['username'] ?? '')))]);
        $u = $st->fetch();
        if ($u && $u['pass_hash'] === '' && !empty($u['google_sub'])) fail('Этот аккаунт создан через Google — нажмите «Войти через Google»', 401);
        if (!$u || !password_verify((string)($in['password'] ?? ''), $u['pass_hash'])) fail('Неверное имя или пароль', 401);
        if (password_needs_rehash($u['pass_hash'], PASSWORD_DEFAULT)) {
            db()->prepare('UPDATE users SET pass_hash = ? WHERE id = ?')->execute([password_hash((string)$in['password'], PASSWORD_DEFAULT), $u['id']]);
        }
        out(['user' => public_user($u), 'token' => issue_token((int)$u['id']), 'progress' => $u['progress'] ? json_decode($u['progress'], true) : null]);
    }

    case 'logout': {
        $t = header_token();
        if ($t) db()->prepare('DELETE FROM tokens WHERE token_hash = ?')->execute([hash('sha256', $t)]);
        out([]);
    }

    case 'me': {
        $u = current_user();
        out(['user' => public_user($u), 'xp' => (int)$u['xp'], 'progress' => $u['progress'] ? json_decode($u['progress'], true) : null]);
    }

    case 'save': {
        if ($method !== 'POST') fail('Нужен POST', 405);
        $u = current_user();
        $in = input();
        $progress = clean_progress($in['progress'] ?? null);
        $cap = !empty($in['import']) && (int)$u['xp'] === 0 ? $config['import_xp_cap'] : $config['max_xp_per_request'];
        $xp = grant_xp($u, (int)($in['xpDelta'] ?? 0), $cap);
        $p = $in['progress'] ?? [];
        $streak = is_array($p) ? (int)($p['streak']['count'] ?? 0) : (int)$u['streak'];
        $avatar = is_array($p) ? clean_avatar($p['avatar'] ?? $u['avatar']) : $u['avatar'];
        db()->prepare('UPDATE users SET xp=?, week_xp=?, week_key=?, day_xp=?, day_key=?, streak=?, avatar=?, progress=COALESCE(?, progress), updated_at=? WHERE id=?')
            ->execute([$xp['xp'], $xp['week_xp'], $xp['week_key'], $xp['day_xp'], $xp['day_key'], min($streak, 10000), $avatar, $progress, time(), $u['id']]);
        out(['xp' => $xp['xp'], 'weekXp' => $xp['week_xp']]);
    }

    case 'leaderboard': {
        $me = current_user(false);
        $period = ($_GET['period'] ?? 'week') === 'all' ? 'all' : 'week';
        $col = $period === 'all' ? 'xp' : 'week_xp';
        $where = $period === 'all' ? 'xp > 0' : 'week_key = :wk AND week_xp > 0';
        $params = $period === 'all' ? [] : [':wk' => week_key()];

        $st = db()->prepare("SELECT id, username, avatar, $col AS score, streak FROM users WHERE $where ORDER BY $col DESC, updated_at ASC LIMIT 50");
        $st->execute($params);
        $rows = [];
        $i = 0;
        foreach ($st->fetchAll() as $r) {
            $rows[] = ['rank' => ++$i, 'username' => $r['username'], 'avatar' => $r['avatar'], 'xp' => (int)$r['score'],
                'streak' => (int)$r['streak'], 'me' => $me && (int)$r['id'] === (int)$me['id']];
        }
        $cnt = db()->prepare("SELECT COUNT(*) FROM users WHERE $where");
        $cnt->execute($params);
        $total = (int)$cnt->fetchColumn();

        $mine = null;
        if ($me) {
            $score = $period === 'all' ? (int)$me['xp'] : ($me['week_key'] === week_key() ? (int)$me['week_xp'] : 0);
            $r = db()->prepare("SELECT COUNT(*) FROM users WHERE $where AND $col > :score");
            $r->execute($params + [':score' => $score]);
            $mine = ['rank' => (int)$r->fetchColumn() + 1, 'username' => $me['username'], 'avatar' => $me['avatar'], 'xp' => $score, 'streak' => (int)$me['streak'], 'me' => true];
        }
        out(['rows' => $rows, 'me' => $mine, 'total' => $total, 'period' => $period]);
    }

    default:
        fail('Неизвестное действие', 404);
}
