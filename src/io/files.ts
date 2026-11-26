// Ponte entre arquivos do usuário e o app (só no navegador).

/** Dispara o download de um arquivo gerado no navegador (sem servidor). */
export function downloadFile(data: BlobPart, fileName: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Dá tempo ao navegador (Safari em especial) de iniciar o download antes de liberar a URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const WAV_MIME = 'audio/wav';
export const JSON_MIME = 'application/json';

export function readFileAsArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

export function readFileAsText(file: Blob): Promise<string> {
  return file.text();
}
