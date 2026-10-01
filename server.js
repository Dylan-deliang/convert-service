/* F186 云端格式转换服务：POST multipart(file 字段) -> LibreOffice 转 .docx -> 返回 docx 字节
   部署：CloudBase 云托管（CloudBase Run）Docker 容器，详见 README_部署指引.md */
const http = require('http');
const { execFile } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const busboy = require('busboy');

const PORT = parseInt(process.env.PORT || '80', 10);
const MAX_BYTES = 30 * 1024 * 1024; /* 与教师端送审文本上限 12 万字对应，源文件 30MB 封顶 */
const CONVERT_TIMEOUT_MS = 90 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS));
  res.end(body);
}

/* LibreOffice 可用的目标扩展名 -> 一律转 docx */
const ALLOWED_SRC = new Set(['doc', 'wps', 'rtf', 'odt', 'pdf', 'dot', 'docm', 'html', 'htm', 'txt', 'xml', 'wpd']);

function convertOne(srcPath, outDir) {
  return new Promise((resolve, reject) => {
    const args = ['--headless', '--norestore', '--invisible', '--nocrashreport', '--nodefault',
      '--convert-to', 'docx:MS Word 2007 XML', '--outdir', outDir, srcPath];
    execFile('soffice', args, { timeout: CONVERT_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error('soffice: ' + (err.message || String(err))));
      fs.readdir(outDir, (e2, files) => {
        if (e2) return reject(e2);
        const hit = files.find(f => f.toLowerCase().endsWith('.docx'));
        if (!hit) return reject(new Error('未产出 .docx（' + String(stderr || stdout).slice(0, 120) + '）'));
        resolve(path.join(outDir, hit));
      });
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method === 'GET' && (req.url === '/' || req.url === '/healthz')) {
    return json(res, 200, { ok: true, service: 'lunwen-convert', ver: 'F186' });
  }
  if (req.method !== 'POST' || !(req.url === '/' || req.url === '/convert')) {
    return json(res, 404, { ok: false, error: 'not found' });
  }
  let size = 0; let aborted = false;
  const bb = busboy({ headers: req.headers, limits: { fileSize: MAX_BYTES, files: 1 } });
  bb.on('file', (field, file, info) => {
    const tmp = path.join(os.tmpdir(), 'lunwen_' + crypto.randomBytes(6).toString('hex') + path.extname(info.filename || 'f.doc'));
    const ws = fs.createWriteStream(tmp);
    file.on('data', d => { size += d.length; if (size > MAX_BYTES) { aborted = true; file.resume(); ws.end(); try { fs.unlinkSync(tmp); } catch (e) {} json(res, 413, { ok: false, error: '文件超过 30MB 上限' }); } });
    file.on('limit', () => { if (!aborted) { aborted = true; try { ws.end(); fs.unlinkSync(tmp); } catch (e) {} json(res, 413, { ok: false, error: '文件超过 30MB 上限' }); } });
    file.pipe(ws);
    ws.on('finish', () => {
      if (aborted) return;
      const ext = path.extname(tmp).slice(1).toLowerCase();
      if (!ALLOWED_SRC.has(ext)) {
        try { fs.unlinkSync(tmp); } catch (e) {}
        return json(res, 400, { ok: false, error: '不支持的源格式：' + ext });
      }
      const outDir = path.join(os.tmpdir(), 'lunwen_out_' + crypto.randomBytes(4).toString('hex'));
      fs.mkdir(outDir, err => {
        if (err) { try { fs.unlinkSync(tmp); } catch (e) {} return json(res, 500, { ok: false, error: '临时目录创建失败' }); }
        convertOne(tmp, outDir).then(docxPath => {
          const buf = fs.readFileSync(docxPath);
          try { fs.unlinkSync(tmp); fs.rmSync(outDir, { recursive: true, force: true }); } catch (e) {}
          res.writeHead(200, Object.assign({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Length': buf.length,
            'X-Converted-From': ext,
          }, CORS));
          res.end(buf);
        }).catch(e => {
          try { fs.unlinkSync(tmp); fs.rmSync(outDir, { recursive: true, force: true }); } catch (e2) {}
          json(res, 422, { ok: false, error: '转换失败：' + String(e.message || e).slice(0, 160) });
        });
      });
    });
    ws.on('error', () => { if (!aborted) { aborted = true; json(res, 500, { ok: false, error: '临时文件写入失败' }); } });
  });
  bb.on('error', () => { if (!aborted) { aborted = true; json(res, 400, { ok: false, error: 'multipart 解析失败' }); } });
  bb.on('finish', () => { /* 无文件字段时由 file 回调负责响应，这里只兜底连接关闭 */ });
  req.pipe(bb);
});

server.listen(PORT, () => console.log('[lunwen-convert] listening on ' + PORT));
