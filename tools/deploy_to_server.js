const fs = require('fs');
const path = require('path');

async function deployToServer() {
  console.log('🚀 1. Đang tải lên script triển khai tạm thời lên server...');
  
  // Script PHP triển khai chạy trên server
  const deployerPhp = `<?php
header('Content-Type: application/json; charset=utf-8');
$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!$data || !isset($data['files'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'No files provided']);
    exit;
}

$rootDir = dirname(__DIR__); // C:\\TRIHO\\003\\FB-FS-2
$results = [];

foreach ($data['files'] as $name => $content) {
    // Chỉ cho phép cập nhật các file HTML hợp lệ
    $allowed = ['market_report.html', '4.html', 'step4_market_intelligence.html', 'index.html'];
    if (in_array($name, $allowed)) {
        $dest = $rootDir . '/' . $name;
        $ok = file_put_contents($dest, $content);
        $results[$name] = [
            'success' => ($ok !== false),
            'bytes' => $ok,
            'path' => $dest
        ];
    }
}

// Xóa file deployer sau khi hoàn thành để an toàn tuyệt đối
@unlink(__DIR__ . '/test_info.php');
@unlink(__DIR__ . '/deploy_html.php');

echo json_encode(['status' => 'ok', 'results' => $results]);
`;

  // Bước 1: Gửi deploy_html.php qua save-data-file
  const res1 = await fetch('http://43.156.237.143:3007/api.php?route=save-data-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: 'deploy_html.php', content: deployerPhp })
  });
  console.log('Deployer upload result:', await res1.json());

  // Bước 2: Đọc file local cần triển khai
  const localHtml = fs.readFileSync(path.join(__dirname, '../FB-FS-2/market_report.html'), 'utf8');
  console.log('Local market_report.html size:', localHtml.length);

  // Bước 3: Gửi payload deploy
  console.log('🚀 2. Đang đồng bộ file HTML lên Server C:\\TRIHO\\003\\FB-FS-2...');
  const res2 = await fetch('http://43.156.237.143:3007/data/deploy_html.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: {
        'market_report.html': localHtml,
        '4.html': localHtml,
        'step4_market_intelligence.html': localHtml
      }
    })
  });

  const deployResult = await res2.json();
  console.log('Deploy Result:', JSON.stringify(deployResult, null, 2));

  // Bước 4: Kiểm tra lại file trên server
  console.log('🚀 3. Đang kiểm tra lại file sau triển khai...');
  for (const fn of ['step4_market_intelligence.html', '4.html', 'market_report.html']) {
    const check = await fetch(`http://43.156.237.143:3007/${fn}?v=${Date.now()}`);
    const text = await check.text();
    console.log(`- ${fn}: Status ${check.status}, Size ${text.length}, Has active class in open modal: ${text.includes("modal.style.display = 'flex'")}`);
  }
}

deployToServer().catch(console.error);
