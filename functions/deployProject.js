const AdmZip = require("adm-zip");
const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const boundary = event.headers["content-type"].split("boundary=")[1];
    const buffer = Buffer.from(event.body, "base64");

    // Extract files and fields
    const parts = parseMultipart(buffer, boundary);
    const zip = new AdmZip();
    let siteName = "";

    for (const part of parts) {
      if (part.filename) {
        zip.addFile(part.filename, part.content);
      } else if (part.fieldname === "siteName") {
        siteName = part.content.toString().trim().toLowerCase().replace(/\s+/g, "-");
      }
    }

    const zippedBuffer = zip.toBuffer();
    const NETLIFY_TOKEN = "nfp_nkaUFvvihs48EPfZocKuCxe5CZZkT6iGe800";

    let createdSite = null;
    let attempt = 0;
    let finalName = siteName;

    while (!createdSite && attempt < 5) {
      const response = await fetch("https://api.netlify.com/api/v1/sites", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NETLIFY_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: finalName }),
      });

      const result = await response.json();

      if (!result.error) {
        createdSite = result;
        break;
      }

      // Name taken, retry with random suffix
      finalName = `${siteName}-${Math.random().toString(36).slice(2, 6)}`;
      attempt++;
    }

    if (!createdSite) {
      throw new Error("Could not create a unique site name after multiple attempts.");
    }

    await fetch(`https://api.netlify.com/api/v1/sites/${createdSite.id}/deploys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NETLIFY_TOKEN}`,
        "Content-Type": "application/zip"
      },
      body: zippedBuffer
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: createdSite.ssl_url || createdSite.url }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message }),
    };
  }
};

// Minimal multipart parser for small uploads
function parseMultipart(buffer, boundary) {
  const result = [];
  const parts = buffer.toString().split(`--${boundary}`);

  for (const part of parts) {
    if (part.includes("Content-Disposition")) {
      const filenameMatch = /name="([^"]+)"(?:; filename="([^"]+)")?/.exec(part);
      const fieldname = filenameMatch?.[1];
      const filename = filenameMatch?.[2] || null;
      const contentStart = part.indexOf("\r\n\r\n") + 4;
      const content = part.slice(contentStart, part.length - 2); // remove trailing \r\n

      result.push({ fieldname, filename, content: Buffer.from(content) });
    }
  }
  return result;
}
