const AdmZip = require("adm-zip");
const fetch = require("node-fetch");

exports.handler = async (event) => {
  try {
    const boundary = event.headers["content-type"].split("boundary=")[1];
    const buffer = Buffer.from(event.body, "base64");

    // Parse multipart form data
    const files = parseMultipart(buffer, boundary);
    const zip = new AdmZip();
    let siteName = null;

    for (const file of files) {
      if (file.filename) {
        zip.addFile(file.filename, file.content);
      } else if (file.name === "site_name") {
        siteName = file.content.toString().trim().toLowerCase().replace(/\s+/g, "-");
      }
    }

    const zippedBuffer = zip.toBuffer();

    // Check if site name is available
    let nameIsAvailable = false;
    if (siteName) {
      const check = await fetch(`https://api.netlify.com/api/v1/sites/${siteName}`, {
        headers: {
          Authorization: `Bearer nfp_nkaUFvvihs48EPfZocKuCxe5CZZkT6iGe800`
        }
      });
      if (check.status === 404) nameIsAvailable = true;
    }

    // Create site
    const createSite = await fetch("https://api.netlify.com/api/v1/sites", {
      method: "POST",
      headers: {
        Authorization: `Bearer nfp_nkaUFvvihs48EPfZocKuCxe5CZZkT6iGe800`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(
        nameIsAvailable && siteName ? { name: siteName } : {}
      )
    });

    const site = await createSite.json();

    // Deploy the zipped project
    const deploy = await fetch(`https://api.netlify.com/api/v1/sites/${site.site_id}/deploys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer nfp_nkaUFvvihs48EPfZocKuCxe5CZZkT6iGe800`,
        "Content-Type": "application/zip"
      },
      body: zippedBuffer
    });

    const result = await deploy.json();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        url: result.ssl_url || result.url,
        usedCustomName: nameIsAvailable,
        message: nameIsAvailable
          ? `Deployed using custom name: ${siteName}`
          : `Custom name '${siteName}' not available. Deployed with random name instead.`
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};

// Minimal multipart/form-data parser
function parseMultipart(buffer, boundary) {
  const result = [];
  const parts = buffer.toString().split(`--${boundary}`);

  for (const part of parts) {
    if (part.includes("Content-Disposition")) {
      const nameMatch = /name="([^"]+)"/.exec(part);
      const fileMatch = /filename="([^"]+)"/.exec(part);
      const contentStart = part.indexOf("\r\n\r\n") + 4;
      const content = part.slice(contentStart, -2); // remove trailing \r\n

      result.push({
        name: nameMatch?.[1],
        filename: fileMatch?.[1],
        content: Buffer.from(content)
      });
    }
  }
  return result;
}
