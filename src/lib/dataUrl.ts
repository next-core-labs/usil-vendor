/**
 * A picked file as a `data:` URL, for the JSON upload routes.
 *
 * Not `FileReader`: iOS Lockdown Mode («نمط المنع») removes it from Safari, so
 * `new FileReader()` throws "Can't find variable: FileReader" and the photo
 * never uploads. `Blob.arrayBuffer()` stays available there and everywhere else.
 */
export async function fileToDataUrl(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  // Chunked: spreading a multi-megabyte array into one call overflows the stack.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${file.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}
