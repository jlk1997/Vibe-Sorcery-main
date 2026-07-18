/** Generate QR code data URL locally (avoids leaking payment URLs to third parties). */

export async function generateQrDataUrl(text: string, size = 200): Promise<string> {
  if (typeof document === "undefined") {
    return "";
  }
  try {
    const QRCode = await import("qrcode");
    return await QRCode.toDataURL(text, {
      width: size,
      margin: 1,
      color: { dark: "#050508", light: "#ffffff" },
    });
  } catch {
    return "";
  }
}
