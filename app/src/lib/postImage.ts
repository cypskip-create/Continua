// Keep in sync with the DB constraint `posts_image_url_length` in
// supabase/migrations/20260813090000_*.sql (2,500,000 chars for the base64
// data URL). Base64 expands binary size by ~4/3, so cap the *source* file
// well under that so the encoded string always lands under the DB limit.
export const MAX_POST_IMAGE_BYTES = 1_800_000; // ~1.8MB

export interface ImageReadResult {
  dataUrl?: string;
  error?: string;
}

/** Reads a File as a data URL, rejecting anything too large to fit the
 *  server-side limit instead of letting the insert fail later with a
 *  confusing database error. */
export function readPostImage(file: File): Promise<ImageReadResult> {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    return Promise.resolve({ error: 'Choose a JPEG, PNG, WebP or GIF image.' });
  }
  if (file.size > MAX_POST_IMAGE_BYTES) {
    const maxMb = (MAX_POST_IMAGE_BYTES / 1_000_000).toFixed(1);
    return Promise.resolve({
      error: `Image is too large (max ${maxMb}MB). Try a smaller photo or compress it first.`,
    });
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve({ dataUrl: reader.result as string });
    reader.onerror = () => resolve({ error: "Couldn't read that image. Please try another file." });
    reader.readAsDataURL(file);
  });
}
