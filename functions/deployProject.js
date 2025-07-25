const Busboy = require("busboy");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");
const archiver = require("archiver");
const fetch = require("node-fetch");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  return new Promise((resolve, reject) => {
    const busboy = new Busboy({
      headers: {
        "content-type": event.headers["content-type"] || event.headers["Content-Type"]
      }
    });

    const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "upload-"));
    const files = [];
    let siteName = "";

    busboy.on("field", (fieldname, val) => {
      if (fieldname === "siteName") siteName = val;
    });

    busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
      const savePath = path.join(uploadDir, filename);
      const dir = path.dirname(savePath);
      fs.mkdirSync(dir, { recursive: true });
      const writeStream = fs.createWriteStream(savePath);
      file.pipe(writeStream);
      files.push(savePath);
    });

    busboy.on("finish", async () => {
      try {
        // Create a zip
        const zipPath = path.join(os.tmpdir(), `${Date.now()}-project.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 9 } });

        output.on("close", async () => {
          const result = await deployToNetlify(zipPath, siteName);
          resolve({
            statusCode: 200,
            body: JSON.stringify(result)
          });
        });

        archive.on("error", err => reject({ statusCode: 500, body: err.message }));
        archive.pipe(output);
        archive.directory(uploadDir, false);
        archive.finalize();
      } catch (err) {
        reject({ statusCode: 500, body: err.message });
      }
    });

    // Feed body stream
    const buffer = Buffer.from(event.body, "base64");
    busboy.end(buffer);
  });
};

// Deploy using Netlify API
async function deployToNetlify(zipPath, siteName) {
  const NETLIFY_TOKEN = "nfp_nkaUFvvihs48EPfZocKuCxe5CZZkT6iGe800";
  const ZIP = fs.readFileSync(zipPath);

  const response = await fetch("https://api.netlify.com/api/v1/sites", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${NETLIFY_TOKEN}`,
      "Content-Type": "application/zip",
      "Content-Length": ZIP.length,
    },
    body: ZIP
  });

  return await response.json();
}
