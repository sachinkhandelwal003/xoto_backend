import { GetObjectCommand } from "@aws-sdk/client-s3";
import PDFDocument from "pdfkit";
import { s3 } from "../../utils/s3.js";

export const downloadImageAsPDF = async (req, res) => {
  try {
    const { key } = req.query;

    if (!key) {
      return res.status(400).json({
        success: false,
        message: "Key is required"
      });
    }

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key
    });

    const s3Response = await s3.send(command);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=image.pdf"
    );

    const doc = new PDFDocument();
    doc.pipe(res);

    const chunks = [];
    for await (const chunk of s3Response.Body) {
      chunks.push(chunk);
    }

    const imageBuffer = Buffer.concat(chunks);

    doc.image(imageBuffer, {
      fit: [500, 700],
      align: "center",
      valign: "center"
    });

    doc.end();

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

