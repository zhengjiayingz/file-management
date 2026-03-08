const http = require('http');
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
    console.log('1. Login...');
    const d = JSON.stringify({ username: 'user1', password: '09092639961300Zj' });
    const login = await req({ hostname: 'localhost', port: 3000, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': d.length } }, d);
    const lr = JSON.parse(login.body.toString());
    if (!lr.data?.accessToken) { console.log('Login failed:', login.body.toString().substring(0, 200)); return; }
    const token = lr.data.accessToken;
    console.log('Login OK');

    console.log('2. Get files...');
    const files = await req({ hostname: 'localhost', port: 3000, path: '/api/files', headers: { 'Authorization': 'Bearer ' + token } });
    const fl = JSON.parse(files.body.toString());
    const docx = fl.data.find(f => f.fileName.endsWith('.docx'));
    if (!docx) { console.log('No docx found:', fl.data.map(f => f.fileName)); return; }
    console.log('Found:', docx.fileName, 'ID:', docx.id);

    console.log('3. Preview (may take 15-30s)...');
    const t = Date.now();
    const preview = await req({ hostname: 'localhost', port: 3000, path: '/api/files/' + docx.id + '/preview', headers: { 'Authorization': 'Bearer ' + token } });
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
