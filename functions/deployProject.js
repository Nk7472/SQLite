const Busboy = require("busboy");
const fs = require("fs");
const os = require("os");
const path = require("path");
const archiver = require("archiver");
const fetch = require("node-fetch");
const { randomBytes } = require("crypto");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: event.headers });
    const uploads = {};
    let siteName = "";

    const tmpdir = os.tmpdir();
    const folderPath = path.join(tmpdir, `upload-${Date.now()}`);
    fs.mkdirSync(folderPath);

    busboy.on("field", (fieldname, value) => {
      if (fieldname === "siteName") {
        siteName = value.trim().replace(/\s+/g, "-").toLowerCase();
      }
    });

    busboy.on("file", (fieldname, file, filename) => {
      const filePath = path.join(folderPath, filename);
      uploads[filename] = filePath;
      const writeStream = fs.createWriteStream(filePath);
      file.pipe(writeStream);
    });

    busboy.on("finish", async () => {
      try {
        // Create zip file
        const zipPath = path.join(tmpdir, `project-${Date.now()}.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 9 } });

        archive.pipe(output);
        archive.directory(folderPath, false);
        await archive.finalize();

        output.on("close", async () => {
          const zipBuffer = fs.readFileSync(zipPath);

          const response = await fetch("https://api.netlify.com/api/v1/sites", {
            method: "POST",
            headers: {
              Authorization: `Bearer nfp_nkaUFvvihs48EPfZocKuCxe5CZZkT6iGe800`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              name: siteName || "site-" + randomBytes(4).toString("hex"),
            })
          });

          const siteData = await response.json();

          const deployResponse = await fetch(`https://api.netlify.com/api/v1/sites/${siteData.id}/deploys`, {
            method: "POST",
            headers: {
              Authorization: `Bearer nfp_nkaUFvvihs48EPfZocKuCxe5CZZkT6iGe800`,
              "Content-Type": "application/zip"
            },
            body: zipBuffer
          });

          const deployData = await deployResponse.json();

          resolve({
            statusCode: 200,
            body: JSON.stringify({
              siteName: siteData.name,
              siteUrl: deployData.deploy_ssl_url
            })
          });
        });
      } catch (err) {
        console.error(err);
        reject({
          statusCode: 500,
          body: JSON.stringify({ error: err.message })
        });
      }
    });

    busboy.end(Buffer.from(event.body, "base64"));
  });
};
