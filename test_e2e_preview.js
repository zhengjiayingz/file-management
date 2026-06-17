const http = require('http');

const USERNAME = process.env.E2E_USERNAME || 'user1';
const PASSWORD = process.env.E2E_PASSWORD;
const BASE_HOST = process.env.E2E_HOST || 'localhost';
const BASE_PORT = Number(process.env.E2E_PORT || 3000);

function req(opts, body) {
    return new Promise((resolve, reject) => {
        const r = http.request(opts, res => {
            const chunks = [];
            res.on('data', d => chunks.push(d));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        });
        r.on('error', reject);
        r.setTimeout(120000);
        if (body) r.write(body);
        r.end();
    });
}

async function main() {
    if (!PASSWORD) {
        console.error('请设置环境变量 E2E_PASSWORD（可选 E2E_USERNAME，默认 user1）');
        process.exit(1);
    }

    console.log('1. Login...');
    const d = JSON.stringify({ username: USERNAME, password: PASSWORD });
    const login = await req({
        hostname: BASE_HOST,
        port: BASE_PORT,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': d.length },
    }, d);
    const lr = JSON.parse(login.body.toString());
    if (!lr.data?.accessToken) { console.log('Login failed:', login.body.toString().substring(0, 200)); return; }
    const token = lr.data.accessToken;
    console.log('Login OK');

    console.log('2. Get files...');
    const files = await req({
        hostname: BASE_HOST,
        port: BASE_PORT,
        path: '/api/files',
        headers: { 'Authorization': 'Bearer ' + token },
    });
    const fl = JSON.parse(files.body.toString());
    const docx = fl.data.find(f => f.fileName.endsWith('.docx'));
    if (!docx) { console.log('No docx found:', fl.data.map(f => f.fileName)); return; }
    console.log('Found:', docx.fileName, 'ID:', docx.id);

    console.log('3. Preview (may take 15-30s)...');
    const t = Date.now();
    const preview = await req({
        hostname: BASE_HOST,
        port: BASE_PORT,
        path: '/api/files/' + docx.id + '/preview',
        headers: { 'Authorization': 'Bearer ' + token },
    });
    const elapsed = Date.now() - t;
    console.log('Status:', preview.status, '| Size:', preview.body.length, 'bytes | Time:', elapsed, 'ms');
    console.log('Content-Type:', preview.headers['content-type']);
    if (preview.status === 200 && preview.body.slice(0, 5).toString() === '%PDF-') {
        console.log('SUCCESS! PDF received');
    } else {
        console.log('FAILED:', preview.body.toString().substring(0, 500));
    }
}
main().catch(e => console.error('Error:', e.message));
