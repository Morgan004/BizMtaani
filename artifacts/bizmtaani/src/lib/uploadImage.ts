export type ImageUploadType = "avatar" | "product" | "community";

export async function uploadImage(
  file: File,
  type: ImageUploadType
): Promise<string> {
  const form = new FormData();
  form.append("image", file);
  form.append("uploadType", type);

  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Upload failed: ${text}`);
  }
  const data = (await res.json()) as { url: string };
  if (!data.url) throw new Error("No URL returned from upload service");
  return data.url;
}
