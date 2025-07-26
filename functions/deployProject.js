const fs = require('fs');
const path = require('path');
const os = require('os');
const Busboy = require('busboy');
const archiver = require('archiver');
const axios = require('axios');

const NETLIFY_AUTH_TOKEN = "nfp_nkaUFvvihs48EPfZocKuCxe5CZZkT6iGe800";

exports.handler = async (event) => {
  return new Promise((resolve, reject) => {
    if (event.httpMethod !== 'POST') {
      return resolve({ statusCode: 405, body: 'Method Not Allowed' });
    }

    const busboy = new Busboy({ headers: event.headers });
    const files = {};
    let siteName = '';
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-'));

    busboy.on('field', (fieldname, val) => {
      if (fieldname === 'siteName') siteName = val;
    });

    busboy.on('file', (fieldname, file, filename) => {
      const savePath = path.join(tmpDir, filename);
      files[filename] = savePath;
      const dir = path.dirname(savePath);
      fs.mkdirSync(dir, { recursive: true });
      file.pipe(fs.createWriteStream(savePath));
    });

    busboy.on('finish', async () => {
      const zipPath = path.join(os.tmpdir(), `${Date.now()}.zip`);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', async () => {
        try {
          const siteRes = await axios.post(
            'https://api.netlify.com/api/v1/sites',
            siteName ? { name: siteName } : {},
            { headers: { Authorization: `Bearer ${NETLIFY_AUTH_TOKEN}` } }
          );

          const deployRes = await axios.post(
            `https://api.netlify.com/api/v1/sites/${siteRes.data.id}/deploys`,
            fs.createReadStream(zipPath),
            {
              headers: {
                'Content-Type': 'application/zip',
                Authorization: `Bearer ${NETLIFY_AUTH_TOKEN}`,
              },
            }
          );

          resolve({
            statusCode: 200,
            body: JSON.stringify({ url: deployRes.data.deploy_ssl_url }),
          });
        } catch (err) {
          resolve({
            statusCode: 500,
            body: JSON.stringify({ error: err.response?.data?.message || err.message }),
          });
        }
      });

      archive.directory(tmpDir, false);
      archive.pipe(output);
      archive.finalize();
    });

    busboy.end(Buffer.from(event.body, 'base64'));
  });
};
