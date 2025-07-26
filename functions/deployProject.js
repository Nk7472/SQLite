// deployProject.js
const AdmZip = require("adm-zip");
const fetch = require("node-fetch");
const { Readable } = require("stream");
const busboy = require("busboy");

function generateRandomSuffix(length = 5) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

exports.handler = async (event) => {
  try {
    const bb = busboy({ headers: event.headers });
    const zip = new AdmZip();
    let siteName = "";

    await new Promise((resolve, reject) => {
      const stream = Readable.from(event.body, { encoding: "base64" });
      stream.pipe(bb);

      bb.on("file", (fieldname, file, filename) => {
        const buffer = [];
        file.on("data", (data) => buffer.push(data));
        file.on("end", () => {
          zip.addFile(filename, Buffer.concat(buffer));
        });
      });

      bb.on("field", (name, value) => {
        if (name === "siteName") siteName = value.toLowerCase().replace(/\s+/g, "-");
      });

      bb.on("finish", resolve);
      bb.on("error", reject);
    });

    const zipBuffer = zip.toBuffer();
    const NETLIFY_TOKEN = "nfp_nkaUFvvihs48EPfZocKuCxe5CZZkT6iGe800";

    let finalSiteName = siteName;
    let attempt = 0;
    let siteData;

    while (true) {
      const res = await fetch(`https://api.netlify.com/api/v1/sites`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NETLIFY_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: finalSiteName }),
      });

      siteData = await res.json();

      if (!siteData.message) break;

      // If name taken, generate new variant
      attempt++;
      finalSiteName = `${siteName}-${generateRandomSuffix(4)}`;
      if (attempt > 5) throw new Error("Unable to generate unique site name.");
    }

    const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteData.id}/deploys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NETLIFY_TOKEN}`,
        "Content-Type": "application/zip",
      },
      body: zipBuffer,
    });

    const deployData = await deployRes.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        siteName: siteData.name,
        siteUrl:
          deployData.deploy_ssl_url ||
          deployData.url ||
          siteData.ssl_url ||
          `https://${siteData.name}.netlify.app`
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
