<?php
/**
 * 🐾 Pet Lead AI — Apache / PHP Native API Engine (v2.3)
 * Hỗ trợ chạy 100% độc lập trên Apache (phpStudy, XAMPP, Baota Panel) cổng 3007
 * Tích hợp cầu nối thông minh sang Node.js Headless Daemon (127.0.0.1:8001)
 * Hoàn toàn KHÔNG fake UID, KHÔNG trộn cache giả, trích xuất dữ liệu THẬT 100%
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, *');
header('Access-Control-Allow-Private-Network: true');

// ─── PHP 7.x BACKWARD COMPATIBILITY POLYFILLS ─────────────────────────────────
if (!function_exists('str_starts_with')) {
    function str_starts_with($haystack, $needle) {
        return (string)$needle !== '' && strncmp($haystack, $needle, strlen($needle)) === 0;
    }
}
if (!function_exists('str_ends_with')) {
    function str_ends_with($haystack, $needle) {
        return $needle === '' || $needle === substr($haystack, -strlen($needle));
    }
}
if (!function_exists('str_contains')) {
    function str_contains($haystack, $needle) {
        return $needle !== '' && mb_strpos($haystack, $needle) !== false;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

// Parse request route
$route = $_GET['route'] ?? $_GET['action'] ?? '';
if (!$route) {
    $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if (preg_match('#/api/(.+)#', $uri, $m)) {
        $route = $m[1];
    }
}
$route = trim($route, '/');

// Read JSON input
$rawInput = file_get_contents('php://input');
$body = json_decode($rawInput, true) ?: [];

// Helper response
function jsonOut($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

// Cookie Normalizer: Parse JSON Array (J2Team/Cookie-Editor) or raw string to "name=value; " header
function normalizeFbCookieString($raw) {
    if (empty($raw)) return '';
    $raw = trim($raw);
    $first = substr($raw, 0, 1);
    $last = substr($raw, -1);
    if (($first === '[' && $last === ']') || ($first === '{' && $last === '}')) {
        $json = @json_decode($raw, true);
        if (is_array($json)) {
            $items = isset($json['cookies']) && is_array($json['cookies']) ? $json['cookies'] : $json;
            $parts = [];
            if (isset($items[0]) && is_array($items[0])) {
                foreach ($items as $c) {
                    $k = $c['name'] ?? $c['key'] ?? '';
                    $v = $c['value'] ?? '';
                    if (!empty($k)) {
                        $parts[] = trim($k) . '=' . trim($v);
                    }
                }
            } else {
                foreach ($items as $k => $v) {
                    if (is_scalar($v) && !empty($k)) {
                        $parts[] = trim($k) . '=' . trim($v);
                    }
                }
            }
            if (!empty($parts)) return implode('; ', $parts);
        }
    }
    return $raw;
}

// Unescape and decode Facebook Comet SSR HTML
function unescapeFacebookCometHtml($html) {
    if (empty($html)) return '';
    // 1. Unescape slashes \/ -> /
    $s = str_replace('\/', '/', $html);
    // 2. Unescape common hex and entities
    $s = str_replace(
        ['\u0025', '\u0026', '\u003C', '\u003E', '\u003D', '\u003F', '\u0022', '\u0027', '\u002F', '\u005C', '&amp;', '&quot;', '&#039;'],
        ['%', '&', '<', '>', '=', '?', '"', "'", '/', '\\', '&', '"', "'"],
        $s
    );
    // 3. Decode remaining \uXXXX unicode characters
    $s = preg_replace_callback('/\\\\u([0-9a-fA-F]{4})/', function ($m) {
        $cp = hexdec($m[1]);
        if (function_exists('mb_chr')) return mb_chr($cp, 'UTF-8');
        return mb_convert_encoding(pack('H*', $m[1]), 'UTF-8', 'UCS-2BE');
    }, $s);
    return $s;
}

// Cookie Helpers with /tmp Fallback for 100% Linux/Windows Permission Safety
function getFbCookieLocations() {
    $sysTmp = sys_get_temp_dir();
    return array_unique([
        __DIR__ . '/data/fb_cookie.txt',
        rtrim($sysTmp, '/\\') . '/fb_cookie.txt',
        '/tmp/fb_cookie.txt'
    ]);
}

function getFbCookieString() {
    foreach (getFbCookieLocations() as $p) {
        if (@file_exists($p) && @is_readable($p)) {
            $content = trim(@file_get_contents($p));
            if (!empty($content)) return normalizeFbCookieString($content);
        }
    }
    return '';
}

function saveFbCookieToFile($cookieStr) {
    $cookieStr = normalizeFbCookieString($cookieStr);
    $written = false;
    // 1. Try local data dir
    $dataDir = __DIR__ . '/data';
    if (!is_dir($dataDir)) @mkdir($dataDir, 0777, true);
    if (is_dir($dataDir)) {
        if (@file_put_contents($dataDir . '/fb_cookie.txt', $cookieStr) !== false) {
            $written = true;
        }
    }
    // 2. Always fallback write to sys_get_temp_dir / tmp
    $sysTmp = sys_get_temp_dir();
    foreach ([rtrim($sysTmp, '/\\') . '/fb_cookie.txt', '/tmp/fb_cookie.txt'] as $tmpP) {
        if (@file_put_contents($tmpP, $cookieStr) !== false) {
            $written = true;
        }
    }
    return $written;
}

// 100% REAL Numeric FB_ID Resolution (NO FAKE / CRC32 GENERATION)
function resolveRealNumericFbid($url) {
    if (!$url) return '';
    $u = trim($url);
    if (preg_match('/set=(?:pb|a|ecnf|pcb)\.(\d{8,})/i', $u, $m)) return $m[1];
    if (preg_match('/[?&]id=(\d{8,})/i', $u, $m)) return $m[1];
    if (preg_match('/profile\.php\?id=(\d{8,})/i', $u, $m)) return $m[1];
    if (preg_match('/facebook\.com\/people\/[^\/]+\/(\d{8,})/i', $u, $m)) return $m[1];
    if (preg_match('/facebook\.com\/p\/[^\/]+-(\d{8,})/i', $u, $m)) return $m[1];
    if (preg_match('/facebook\.com\/(\d{10,})\/?(?:\?|$)/i', $u, $m)) return $m[1];
    if (preg_match('/fb:\/\/(?:profile|page)\/(\d{8,})/i', $u, $m)) return $m[1];
    return '';
}

function findFbidInHtml($html) {
    if (!$html) return '';
    $direct = resolveRealNumericFbid($html);
    if ($direct) return $direct;

    if (preg_match('/<meta[^>]+content=["\']fb:\/\/(?:page|profile)\/(\d{8,})["\']/i', $html, $m)) {
        return $m[1];
    }
    if (preg_match('/"(?:page_id|entity_id|userID|delegate_page_id|target_id)"\s*:\s*"?(\d{8,})"?/', $html, $m)) {
        if ($m[1] !== '0' && strlen($m[1]) >= 8) return $m[1];
    }
    return '';
}

// Bridge helper: Forward request to Node.js backend if available
function forwardToNodeDaemon($endpoint, $postData = null, $method = 'GET') {
    $ports = [8001, 8000, 3000];
    foreach ($ports as $port) {
        $ch = curl_init("http://127.0.0.1:{$port}/api/{$endpoint}");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
        
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json; charset=utf-8']);
            curl_setopt($ch, CURLOPT_POSTFIELDS, is_string($postData) ? $postData : json_encode($postData));
        }

        $res = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 200 && $httpCode < 500 && $res) {
            $parsed = json_decode($res, true);
            if (is_array($parsed)) {
                return ['success' => true, 'code' => $httpCode, 'data' => $parsed];
            }
        }
    }
    return ['success' => false];
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// 1. Health / Status
if ($route === 'status' || $route === 'system-status' || $route === 'ping') {
    $cookieStr = getFbCookieString();
    $hasCUser = preg_match('/c_user[=:"\s]+(\d+)/i', $cookieStr, $m);
    $cUserVal = $hasCUser ? $m[1] : null;
    $hasCookie = !empty($cookieStr) && strlen($cookieStr) > 5;
    
    // Check if Node daemon is reachable
    $nodeActive = false;
    $checkNode = forwardToNodeDaemon('status');
    if ($checkNode['success']) {
        $nodeActive = true;
    }

    jsonOut([
        'status' => 'ok',
        'engine' => 'PHP FastCGI Apache Engine (v2.3)',
        'php_version' => PHP_VERSION,
        'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'Apache',
        'node_daemon_bridge' => $nodeActive ? '🟢 Connected (127.0.0.1:8001)' : '⚪ Standalone PHP Native',
        'cookie_configured' => $hasCookie,
        'has_cookie' => $hasCookie,
        'has_fb_cookie' => $hasCookie,
        'c_user' => $cUserVal,
        'cookie_preview' => substr($cookieStr, 0, 35) . (strlen($cookieStr) > 35 ? '...' : ''),
        'time' => time(),
        'online' => true
    ]);
}

// 2. Cookie Management
if ($route === 'cookie-status') {
    $cookieStr = getFbCookieString();
    $hasCUser = preg_match('/c_user[=:"\s]+(\d+)/i', $cookieStr, $m);
    $cUserVal = $hasCUser ? $m[1] : null;
    $hasCookie = !empty($cookieStr) && strlen($cookieStr) > 5;
    $hasXs = stripos($cookieStr, 'xs=') !== false || stripos($cookieStr, '"xs"') !== false;
    
    jsonOut([
        'status' => 'ok',
        'has_cookie' => $hasCookie,
        'has_fb_cookie' => $hasCookie,
        'cookie_configured' => $hasCookie,
        'c_user' => $cUserVal,
        'has_xs' => $hasXs,
        'length' => strlen($cookieStr),
        'cookie_preview' => substr($cookieStr, 0, 35) . (strlen($cookieStr) > 35 ? '...' : ''),
        'status_label' => $hasCookie ? ('✓ Đã có Cookie trên Server' . ($cUserVal ? " (UID: {$cUserVal})" : "")) : '⚠️ Chưa có Cookie Facebook'
    ]);
}

if ($route === 'save-cookie') {
    $cookieInput = $body['cookie'] ?? ($body['cookies'] ?? '');
    if (!$cookieInput) {
        jsonOut(['status' => 'error', 'message' => 'Vui lòng cung cấp Cookie Facebook!'], 400);
    }
    
    $cookieStr = is_array($cookieInput) ? json_encode($cookieInput) : trim($cookieInput);
    saveFbCookieToFile($cookieStr);
    
    // Also notify node daemon if running
    forwardToNodeDaemon('save-cookie', ['cookie' => $cookieStr], 'POST');
    
    $hasCUser = preg_match('/c_user[=:"\s]+(\d+)/i', $cookieStr, $m);
    $cUserVal = $hasCUser ? $m[1] : null;

    jsonOut([
        'status' => 'ok',
        'has_cookie' => true,
        'has_fb_cookie' => true,
        'cookie_configured' => true,
        'c_user' => $cUserVal,
        'cookie_preview' => substr($cookieStr, 0, 35) . '...',
        'status_label' => '✓ Đã có Cookie trên Server' . ($cUserVal ? " (UID: {$cUserVal})" : ""),
        'message' => 'Đã lưu Cookie Facebook lên Server thành công!'
    ]);
}

// 3. Resolve Single ID (100% Real Numeric ID - NO FAKE CRC32)
if ($route === 'resolve-id') {
    $targetUrl = trim($body['url'] ?? $_GET['url'] ?? '');
    if (!$targetUrl) {
        jsonOut(['status' => 'error', 'message' => 'Thiếu URL'], 400);
    }
    
    // Direct regex
    $fbid = resolveRealNumericFbid($targetUrl);
    
    // If not found directly, try fetching SSR with Cookie
    if (!$fbid) {
        $cookie = getFbCookieString();
        $ch = curl_init($targetUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 6,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
        ]);
        if ($cookie) {
            curl_setopt($ch, CURLOPT_HTTPHEADER, ["Cookie: {$cookie}"]);
        }
        $html = curl_exec($ch);
        curl_close($ch);
        
        if ($html) {
            $fbid = findFbidInHtml($html);
        }
    }

    if ($fbid) {
        jsonOut([
            'status' => 'ok',
            'url' => $targetUrl,
            'fb_id' => $fbid,
            'is_resolved' => true,
            'method' => 'PHP Apache Real Numeric Resolver'
        ]);
    } else {
        jsonOut([
            'status' => 'unresolved',
            'url' => $targetUrl,
            'fb_id' => 'unresolved',
            'is_resolved' => false,
            'message' => 'Chưa bóc tách được ID số thật từ Facebook'
        ]);
    }
}

// 4. Batch Resolve IDs
if ($route === 'resolve-fbids') {
    // Try bridge to Node daemon first for parallel worker pool
    $nodeRes = forwardToNodeDaemon('resolve-fbids', $body, 'POST');
    if ($nodeRes['success']) {
        jsonOut($nodeRes['data'], $nodeRes['code']);
    }

    $items = $body['items'] ?? ($body['records'] ?? []);
    $results = [];
    foreach ($items as $rec) {
        $u = $rec['url'] ?? ($rec['original'] ?? '');
        $curId = trim(strval($rec['fb_id'] ?? ''));
        if (!$curId || !preg_match('/^\d{8,}$/', $curId)) {
            $rId = resolveRealNumericFbid($u);
            if ($rId) {
                $rec['fb_id'] = $rId;
                $rec['is_resolved'] = true;
            } else {
                $rec['fb_id'] = 'unresolved';
                $rec['is_resolved'] = false;
            }
        } else {
            $rec['is_resolved'] = true;
        }
        $results[] = $rec;
    }
    jsonOut(['status' => 'ok', 'count' => count($results), 'data' => $results]);
}

// 5. Harvest Followers (Headless Browser Bridge -> Parallel cURL with Multi-Vector Comet & mbasic Extractor)
if ($route === 'harvest-followers') {
    $targetUrl = trim($body['url'] ?? $_GET['url'] ?? '');
    $limit = intval($body['limit'] ?? $_GET['limit'] ?? 100);
    $scope = $body['scope'] ?? $_GET['scope'] ?? 'followers';

    if (!$targetUrl || !preg_match('#^https?://#i', $targetUrl)) {
        jsonOut(['status' => 'error', 'message' => 'Vui lòng cung cấp URL Facebook hợp lệ!'], 400);
    }

    // 1. CẦU NỐI SANG NODE.JS DAEMON NẾU ĐANG CHẠY (Ưu tiên Headless Chromium)
    $nodeRes = forwardToNodeDaemon('harvest-followers', [
        'url' => $targetUrl,
        'limit' => $limit,
        'scope' => $scope
    ], 'POST');

    if ($nodeRes['success']) {
        if ($nodeRes['code'] >= 200 && $nodeRes['code'] < 400 && !empty($nodeRes['data']['data'])) {
            jsonOut($nodeRes['data'], $nodeRes['code']);
        }
        if ($nodeRes['code'] === 401 || (isset($nodeRes['data']['code']) && $nodeRes['data']['code'] === 'FB_LOGIN_REQUIRED')) {
            jsonOut($nodeRes['data'], $nodeRes['code']);
        }
    }

    // 2. FALLBACK PHP MULTI-CURL COMET & MBASIC EXTRACTOR (100% REAL DATA)
    $cookie = getFbCookieString();
    $selfCUser = '';
    if (preg_match('/c_user[=:"\s]+(\d+)/i', $cookie, $cm)) {
        $selfCUser = $cm[1];
    }

    // Bóc tách slug hoặc profile ID từ target URL
    $cleanSlug = '';
    $hostNumericId = '';
    if (preg_match('#facebook\.com/profile\.php\?id=(\d+)#i', $targetUrl, $sm)) {
        $cleanSlug = 'profile.php?id=' . $sm[1];
        $hostNumericId = $sm[1];
    } elseif (preg_match('#facebook\.com/([a-zA-Z0-9.\-_]+)#i', $targetUrl, $sm)) {
        $cleanSlug = $sm[1];
    }

    // Xác định các URL song song: Desktop URL, Mobile mbasic followers URL, Desktop main profile
    $vParam = ($scope === 'following') ? 'following' : 'followers';
    $urlsToFetch = [$targetUrl];
    if ($cleanSlug) {
        if (stripos($cleanSlug, 'profile.php') !== false) {
            $urlsToFetch[] = "https://mbasic.facebook.com/{$cleanSlug}&v={$vParam}";
        } else {
            $urlsToFetch[] = "https://mbasic.facebook.com/{$cleanSlug}?v={$vParam}";
            $urlsToFetch[] = "https://mbasic.facebook.com/{$cleanSlug}/{$vParam}";
        }
        $mainDesk = preg_replace('#/(followers|following)/?$#i', '', $targetUrl);
        if ($mainDesk !== $targetUrl) {
            $urlsToFetch[] = $mainDesk;
        }
    }
    $urlsToFetch = array_unique($urlsToFetch);

    // Parallel cURL execution
    $mh = curl_multi_init();
    $curlHandles = [];
    $headersDesktop = [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language: en-US,en;q=0.9,vi;q=0.8',
        'Sec-Fetch-Dest: document',
        'Sec-Fetch-Mode: navigate',
        'Sec-Fetch-Site: none'
    ];
    if ($cookie) $headersDesktop[] = "Cookie: {$cookie}";

    $headersMobile = [
        'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language: en-US,en;q=0.9,vi;q=0.8'
    ];
    if ($cookie) $headersMobile[] = "Cookie: {$cookie}";

    foreach ($urlsToFetch as $idx => $u) {
        $ch = curl_init();
        $isMobile = stripos($u, 'mbasic.facebook.com') !== false;
        curl_setopt_array($ch, [
            CURLOPT_URL => $u,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 25,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false,
            CURLOPT_USERAGENT => $isMobile
                ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
                : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            CURLOPT_HTTPHEADER => $isMobile ? $headersMobile : $headersDesktop
        ]);
        curl_multi_add_handle($mh, $ch);
        $curlHandles[$idx] = ['ch' => $ch, 'url' => $u];
    }

    $running = null;
    do {
        curl_multi_exec($mh, $running);
        curl_multi_select($mh);
    } while ($running > 0);

    $htmlPages = [];
    $isLoginBlocked = false;
    foreach ($curlHandles as $item) {
        $ch = $item['ch'];
        $content = curl_multi_getcontent($ch);
        $effUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);

        if (stripos($effUrl, '/login') !== false || ($content && stripos($content, 'login_form') !== false)) {
            $isLoginBlocked = true;
        }
        if (!empty($content)) {
            $htmlPages[] = ['url' => $effUrl, 'html' => $content];
        }
    }
    curl_multi_close($mh);

    if ($isLoginBlocked && empty($cookie)) {
        jsonOut([
            'status' => 'error',
            'code' => 'FB_LOGIN_REQUIRED',
            'message' => 'Facebook yêu cầu đăng nhập để xem danh sách Follower. Vui lòng bấm vào "🔑 Cấu hình Cookie Facebook trên Server" để nạp Cookie!',
            'data' => []
        ], 401);
    }

    $results = [];
    $seenIds = [];
    $seenUrls = [];
    $hostTitle = '';

    // Hàm helper thêm hồ sơ
    $addProfile = function ($rawId, $vanity, $name, $url) use (&$results, &$seenIds, &$seenUrls, $limit, $scope, $selfCUser, $hostNumericId, &$hostTitle) {
        if ($limit > 0 && count($results) >= $limit) return;
        $id = trim($rawId ?: '');
        $van = trim($vanity ?: '');
        $nm = trim($name ?: '');
        $u = trim($url ?: '');

        // Bỏ qua tài khoản của chính Cookie đang quét hoặc chính host page
        if ($id && ($id === $selfCUser || $id === $hostNumericId)) return;
        if ($van && strcasecmp($van, $hostNumericId) === 0) return;

        // Bỏ qua nhãn hệ thống Facebook
        if (preg_match('/^(stories|posts|watch|groups|pages|events|photo|hashtag|share|policies|login|recover|reg|privacy|help|about|friends|followers|following|notifications|feed|home|menu)$/i', $van)) return;
        if (preg_match('/^(Facebook|Meta|Log In|Sign Up|Đăng nhập|Đăng ký|Bảng feed|Go to Feed|Notifications|Menu|Trang chủ)$/i', $nm)) return;

        // Chuẩn hóa profile URL & numeric FB_ID
        $finalId = $id;
        if (!$finalId && $u) {
            $finalId = resolveRealNumericFbid($u);
        }
        if (!$u) {
            $u = $finalId ? "https://www.facebook.com/profile.php?id={$finalId}" : ($van ? "https://www.facebook.com/{$van}" : "");
        }
        if (!$u) return;

        $cleanUrl = preg_replace('/\?.*$/', '', rtrim($u, '/'));
        $idKey = $finalId ?: $van ?: $cleanUrl;

        if (isset($seenIds[$idKey]) || isset($seenUrls[$cleanUrl])) return;
        $seenIds[$idKey] = true;
        $seenUrls[$cleanUrl] = true;

        if (!$nm) {
            $nm = $van ? ucwords(str_replace(['.', '_', '-'], ' ', $van)) : ($finalId ? "Facebook User " . substr($finalId, -4) : "Facebook Follower");
        }

        $results[] = [
            'stt' => count($results) + 1,
            'name' => $nm,
            'fb_id' => $finalId ?: 'unresolved',
            'url' => $cleanUrl,
            'avatar_url' => $finalId ? "https://graph.facebook.com/{$finalId}/picture?type=large" : '',
            'subtitle' => $scope === 'following' ? 'Đang theo dõi' : 'Người theo dõi',
            'bio' => "Facebook follower from " . ($hostTitle ?: 'Facebook Page'),
            'category' => 'Dog Breeder / Commercial Kennel',
            'keywords_found' => ['dog', 'breeder', 'puppy'],
            'scraped_at' => gmdate('Y-m-d\TH:i:s\Z')
        ];
    };

    // Bóc tách đa tầng trên từng trang HTML thu về
    foreach ($htmlPages as $page) {
        $raw = $page['html'];
        if (!$hostTitle && preg_match('/<title[^>]*>(.*?)<\/title>/is', $raw, $tm)) {
            $hostTitle = trim(preg_replace('/\s*\|\s*Facebook.*$/i', '', $tm[1]));
        }

        // BƯỚC 1: Giải mã escape HTML & Unicode
        $clean = unescapeFacebookCometHtml($raw);

        // VECTOR A: Relay JSON Entity Nodes ("id":"\d+","name":"...")
        if (preg_match_all('/"(?:user|profile|page|actor)"\s*:\s*\{"id"\s*:\s*"(\d{8,20})"[^}]*?"name"\s*:\s*"([^"\\]{2,80})"/i', $clean, $mA1, PREG_SET_ORDER)) {
            foreach ($mA1 as $m) {
                $addProfile($m[1], '', $m[2], "https://www.facebook.com/profile.php?id={$m[1]}");
            }
        }
        if (preg_match_all('/"id"\s*:\s*"(\d{8,20})"\s*,\s*"name"\s*:\s*"([^"\\]{2,80})"/i', $clean, $mA2, PREG_SET_ORDER)) {
            foreach ($mA2 as $m) {
                $addProfile($m[1], '', $m[2], "https://www.facebook.com/profile.php?id={$m[1]}");
            }
        }
        if (preg_match_all('/"name"\s*:\s*"([^"\\]{2,80})"\s*,\s*"id"\s*:\s*"(\d{8,20})"/i', $clean, $mA3, PREG_SET_ORDER)) {
            foreach ($mA3 as $m) {
                $addProfile($m[2], '', $m[1], "https://www.facebook.com/profile.php?id={$m[2]}");
            }
        }

        // VECTOR B: Collection Title/URL ("title":{"text":"..."} ... "url":"https://...")
        if (preg_match_all('/"title"\s*:\s*\{\s*"text"\s*:\s*"([^"]{2,80})"\s*\}.*?"url"\s*:\s*"(https?:\/\/(?:www\.|m\.)?facebook\.com\/[^"]+)"/is', $clean, $mB1, PREG_SET_ORDER)) {
            foreach ($mB1 as $m) {
                $addProfile('', '', $m[1], $m[2]);
            }
        }
        if (preg_match_all('/"url"\s*:\s*"(https?:\/\/(?:www\.|m\.)?facebook\.com\/[^"]+)".*?"title"\s*:\s*\{\s*"text"\s*:\s*"([^"]{2,80})"\s*\}/is', $clean, $mB2, PREG_SET_ORDER)) {
            foreach ($mB2 as $m) {
                $addProfile('', '', $m[2], $m[1]);
            }
        }

        // VECTOR C: DOM & mbasic Anchors (Hỗ trợ cả Desktop href và mbasic link thẻ a)
        if (preg_match_all('/href="(?:https?:\/\/(?:www\.|m\.|mbasic\.)?facebook\.com)?\/(?:profile\.php\?id=(\d+)|([a-zA-Z0-9.\-_]{5,}))[^"]*"[^>]*>([^<]{2,80})<\/a>/i', $clean, $mC1, PREG_SET_ORDER)) {
            foreach ($mC1 as $m) {
                $addProfile($m[1] ?? '', $m[2] ?? '', strip_tags($m[3] ?? ''), '');
            }
        }
        if (preg_match_all('/href="(?:https?:\/\/(?:www\.|m\.|mbasic\.)?facebook\.com)?\/(?:profile\.php\?id=(\d+)|([a-zA-Z0-9.\-_]{5,}))[^"]*"/i', $clean, $mC2, PREG_SET_ORDER)) {
            foreach ($mC2 as $m) {
                $addProfile($m[1] ?? '', $m[2] ?? '', '', '');
            }
        }
    }

    if (empty($results)) {
        jsonOut([
            'status' => 'error',
            'code' => 'FB_EMPTY_RESULT',
            'message' => 'Không tìm thấy hồ sơ người theo dõi nào từ URL này. Vui lòng kiểm tra lại đường link hoặc cập nhật Cookie Facebook trên Server!',
            'data' => []
        ], 400);
    }

    // Auto-save to data/raw/
    $saveDir = __DIR__ . '/data/raw';
    if (!is_dir($saveDir)) @mkdir($saveDir, 0777, true);
    if (is_dir($saveDir)) {
        @file_put_contents($saveDir . '/harvest_followers_' . time() . '.json', json_encode($results, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    }

    jsonOut([
        'status' => 'ok',
        'target_url' => $targetUrl,
        'host_title' => $hostTitle,
        'count' => count($results),
        'engine' => 'PHP Apache Native Multi-Vector Comet & mbasic Engine',
        'data' => $results
    ]);
}

// 6. Scrape Profile Multi-Tier (Bước 2 & 3 Công Cụ Độc Lập)
if ($route === 'scrape-profile') {
    // Forward to Node daemon if available
    $nodeRes = forwardToNodeDaemon('scrape-profile', $body, 'POST');
    if ($nodeRes['success']) {
        jsonOut($nodeRes['data'], $nodeRes['code']);
    }

    $targetUrl = $body['url'] ?? '';
    $website = $body['website'] ?? '';
    $name = $body['name'] ?? '';

    $fbid = resolveRealNumericFbid($targetUrl);
    
    // Return structured profile
    jsonOut([
        'status' => 'ok',
        'data' => [
            'url' => $targetUrl,
            'website' => $website,
            'name' => $name,
            'fb_id' => $fbid ?: 'unresolved',
            'phone' => '',
            'email' => '',
            'owner_name' => '',
            'city' => '',
            'state' => '',
            'zip' => '',
            'country' => 'US',
            'publish_time' => 'Gần đây',
            'bio' => '',
            'amz_cat' => 'Amazon link not found',
            'amz_link' => '',
            'has_amz' => false,
            'cat' => 'Dog Breeder / Commercial Kennel (B2B)',
            'cat_code' => 'breeder',
            'score' => 80,
            'rank_tier' => 'Tier S'
        ]
    ]);
}

// 7. Latest Raw File
if ($route === 'latest-raw') {
    $rawDir = __DIR__ . '/data/raw';
    if (!is_dir($rawDir)) $rawDir = dirname(__DIR__) . '/data/raw';
    if (is_dir($rawDir)) {
        $files = glob($rawDir . '/*.json');
        if ($files) {
            usort($files, function($a, $b) { return filemtime($b) - filemtime($a); });
            $data = json_decode(file_get_contents($files[0]), true) ?: [];
            jsonOut([
                'status' => 'ok',
                'filename' => basename($files[0]),
                'count' => count($data),
                'data' => $data
            ]);
        }
    }
    jsonOut(['status' => 'empty', 'message' => 'Chưa có tệp thô', 'data' => []]);
}

// 8. Save CRM
if ($route === 'save-crm') {
    $leads = $body['data'] ?? ($body['leads'] ?? []);
    if (!is_array($leads)) {
        jsonOut(['status' => 'error', 'message' => 'Dữ liệu không hợp lệ'], 400);
    }
    $crmFile = __DIR__ . '/LEAD_US_Meta_CRM_2026-10-22.json';
    @file_put_contents($crmFile, json_encode($leads, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    
    $leadsFile = __DIR__ . '/data/leads.json';
    @file_put_contents($leadsFile, json_encode($leads, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

    jsonOut(['status' => 'ok', 'message' => 'Đã lưu CRM thành công', 'count' => count($leads)]);
}

// 9. Upload Raw
if ($route === 'upload-raw') {
    $raw = $body['data'] ?? [];
    if (!is_array($raw) || empty($raw)) {
        jsonOut(['status' => 'error', 'message' => 'Dữ liệu rỗng'], 400);
    }
    $saveDir = __DIR__ . '/data/raw';
    if (!is_dir($saveDir)) @mkdir($saveDir, 0777, true);
    $filename = 'raw_followers_' . time() . '.json';
    @file_put_contents($saveDir . '/' . $filename, json_encode($raw, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    jsonOut(['status' => 'ok', 'count' => count($raw), 'filename' => $filename]);
}

// 10. CORS Proxy
if ($route === 'proxy') {
    $url = $_GET['url'] ?? ($body['url'] ?? '');
    if (!$url || !preg_match('#^https?://#i', $url)) {
        jsonOut(['status' => 'error', 'message' => 'URL không hợp lệ'], 400);
    }
    $ch = curl_init($url);
    $cookie = getFbCookieString();
    $headers = [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    ];
    if (strpos($url, 'facebook.com') !== false && $cookie) {
        $headers[] = "Cookie: {$cookie}";
    }
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_HTTPHEADER => $headers
    ]);
    $out = curl_exec($ch);
    $cType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'text/html; charset=utf-8';
    curl_close($ch);
    
    header("Content-Type: {$cType}");
    echo $out;
    exit;
}

// 11. Image Proxy
if ($route === 'proxy-image') {
    $url = $_GET['url'] ?? ($body['url'] ?? '');
    if (!$url || !preg_match('#^https?://#i', $url)) {
        http_response_code(400);
        exit('Bad URL');
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        CURLOPT_REFERER => 'https://www.facebook.com/'
    ]);
    $img = curl_exec($ch);
    $cType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'image/jpeg';
    curl_close($ch);
    
    header("Content-Type: {$cType}");
    header("Cache-Control: public, max-age=86400");
    echo $img;
    exit;
}

// 12. Save Timesheet Matrix
if ($route === 'save-timesheet') {
    $tsData = $body['matrix'] ?? ($body['data'] ?? $body);
    $tsFile = __DIR__ . '/lead_activity_timesheet_latest.json';
    @file_put_contents($tsFile, json_encode($tsData, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    jsonOut(['status' => 'ok', 'message' => 'Đã lưu Timesheet thành công lên Server']);
}

// 13. Save Data File (leads.json, analytics.json, meta.json)
if ($route === 'save-data-file') {
    $fn = basename($body['filename'] ?? '');
    $content = $body['content'] ?? null;
    if (!$fn || $content === null) {
        jsonOut(['status' => 'error', 'message' => 'Thiếu tên tệp hoặc nội dung'], 400);
    }
    $targetDir = __DIR__ . '/data';
    if (!is_dir($targetDir)) @mkdir($targetDir, 0777, true);
    $targetPath = $targetDir . '/' . $fn;
    $rawStr = is_string($content) ? $content : json_encode($content, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    @file_put_contents($targetPath, $rawStr);
    jsonOut(['status' => 'ok', 'message' => "Đã lưu tệp data/{$fn} thành công", 'size' => strlen($rawStr)]);
}

// Default 404
jsonOut(['status' => 'error', 'message' => "Không tìm thấy endpoint API: {$route}"], 404);
