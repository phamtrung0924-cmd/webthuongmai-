const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const TX_FILE = path.join(__dirname, 'transactions.json');

// Khởi tạo file lưu giao dịch nếu chưa có
if (!fs.existsSync(TX_FILE)) {
  fs.writeFileSync(TX_FILE, '[]', 'utf-8');
}

function readTransactions() {
  try {
    return JSON.parse(fs.readFileSync(TX_FILE, 'utf-8') || '[]');
  } catch {
    return [];
  }
}

function saveTransactions(list) {
  fs.writeFileSync(TX_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, ngrok-skip-browser-warning');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // 1. Endpoint nhận Webhook thật từ SePay (trả về HTTP 200 OK)
  if (pathname === '/api/sepay-webhook' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const amount = Number(data.transferAmount || data.amount || 0);
        const content = String(data.content || data.description || '');
        const txId = String(data.id || Date.now());
        const transferType = String(data.transferType || 'in').toLowerCase();

        console.log(`\n[SePay Webhook] Nhận giao dịch #${txId}: +${amount.toLocaleString('vi-VN')}đ | Nội dung: "${content}"`);

        if (transferType === 'in' || amount > 0) {
          const list = readTransactions();
          if (!list.some(t => String(t.id) === txId)) {
            list.unshift({
              id: txId,
              gateway: data.gateway || 'SePay',
              amount,
              content,
              received_at: new Date().toISOString()
            });
            saveTransactions(list);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('[SePay Webhook] Lỗi parse JSON:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 2. Endpoint cho web index.html hỏi trạng thái thanh toán
  if (pathname === '/api/check-payment' && req.method === 'GET') {
    const orderCode = (parsedUrl.searchParams.get('order_code') || '').trim().toUpperCase();
    const requiredAmount = Number(parsedUrl.searchParams.get('amount') || 0);
    const list = readTransactions();

    const matched = list.find(t => {
      const contentUpper = String(t.content || '').toUpperCase();
      return orderCode && contentUpper.includes(orderCode) && Number(t.amount) >= requiredAmount;
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ paid: Boolean(matched), transaction: matched || null }));
    return;
  }

  // 3. Xem nhanh danh sách giao dịch đã nhận (để kiểm tra)
  if (pathname === '/api/transactions' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(readTransactions(), null, 2));
    return;
  }

  // 4. Phục vụ file web tĩnh (index.html, admin.html)
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(__dirname, path.normalize(filePath).replace(/^(\.\.[\/\\])+/, ''));

  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(fullPath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`VOGUE & CO. Server dang chay tai: http://localhost:${PORT}`);
  console.log(`- Web Khach hang : http://localhost:${PORT}/`);
  console.log(`- Web Admin      : http://localhost:${PORT}/admin.html`);
  console.log(`- Webhook SePay  : POST /api/sepay-webhook`);
  console.log(`==================================================`);
  console.log(`Hay mo 1 cua so Terminal khac va chay: ngrok http ${PORT}`);
});
