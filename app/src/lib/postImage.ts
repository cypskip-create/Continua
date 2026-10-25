// Temporary previews are uploaded to owned media storage before post rows are saved.
import {prepareImage} from './imagePreparation.js';
export const MAX_POST_IMAGE_BYTES = 20*1024*1024;

export interface ImageReadResult {
  dataUrl?: string;
  error?: string;
}

/** Prepare a bounded raster preview; original camera photos may be resized. */
export async function readPostImage(file: File): Promise<ImageReadResult> {
  if (file.size > MAX_POST_IMAGE_BYTES) {
    const maxMb = (MAX_POST_IMAGE_BYTES / (1024*1024)).toFixed(0);
    return Promise.resolve({
      error: `Image is too large (max ${maxMb}MB). Try a smaller photo or compress it first.`,
    });
  }

  let prepared:Blob;try{prepared=await prepareImage(file);}catch(error){return {error:error instanceof Error?error.message:'This photo could not be read.'};}
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve({ dataUrl: reader.result as string });
    reader.onerror = () => resolve({ error: "Couldn't read that image. Please try another file." });
    reader.readAsDataURL(prepared);
  });
}
