import { Router } from "express";
import multer from "multer";
import { Readable } from "stream";
import type { UploadApiOptions } from "cloudinary";
import { cloudinary } from "../lib/cloudinary";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

type UploadType = "avatar" | "product" | "community";

function getUploadOptions(type: UploadType): UploadApiOptions {
  const base: UploadApiOptions = {
    quality: "auto",
    fetch_format: "auto",
    use_filename: false,
    unique_filename: true,
  };

  switch (type) {
    case "avatar":
      return {
        ...base,
        folder: "bizmtaani/avatars",
        transformation: [
          { width: 400, height: 400, crop: "fill", gravity: "face" },
        ],
      };
    case "product":
      return {
        ...base,
        folder: "bizmtaani/products",
        transformation: [{ width: 1200, height: 900, crop: "limit" }],
      };
    case "community":
      return {
        ...base,
        folder: "bizmtaani/community",
        transformation: [{ width: 1200, height: 900, crop: "limit" }],
      };
    default:
      return { ...base, folder: "bizmtaani/misc" };
  }
}

function uploadToCloudinary(
  buffer: Buffer,
  options: UploadApiOptions
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error || !result) {
        return reject(error ?? new Error("No result from Cloudinary"));
      }
      resolve(result.secure_url);
    });
    Readable.from(buffer).pipe(stream);
  });
}

router.post(
  "/upload",
  upload.single("image"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No image file provided" });
      return;
    }

    const uploadType = (
      (req.body as { uploadType?: string })?.uploadType ?? "product"
    ) as UploadType;

    try {
      const url = await uploadToCloudinary(
        req.file.buffer,
        getUploadOptions(uploadType)
      );
      res.json({ url });
    } catch (err) {
      req.log.error(err, "Cloudinary upload failed");
      res.status(500).json({ error: "Image upload failed — please try again" });
    }
  }
);

export default router;
