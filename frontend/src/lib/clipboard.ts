/**
 * Copies text to the clipboard, falling back to a hidden textarea when the async Clipboard API
 * is unavailable (older browsers, or any non-secure origin).
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const clipboardArea = document.createElement("textarea");
  clipboardArea.value = text;
  clipboardArea.style.position = "fixed";
  clipboardArea.style.opacity = "0";
  document.body.appendChild(clipboardArea);
  clipboardArea.select();
  document.execCommand("copy");
  document.body.removeChild(clipboardArea);
}
