import Taro from "@tarojs/taro";
import { drawMoodPoster, type MoodPosterInput } from "./drawMoodPoster";

export async function saveMoodPosterWeapp(canvasId: string, input: MoodPosterInput): Promise<void> {
  const w = 600;
  const h = 800;
  const tempPath = await new Promise<string>((resolve, reject) => {
    const query = Taro.createSelectorQuery();
    query
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        const node = res?.[0]?.node as WechatMiniprogram.Canvas | undefined;
        if (!node) {
          reject(new Error("canvas not found"));
          return;
        }
        const ctx = node.getContext("2d") as CanvasRenderingContext2D;
        const dpr = Taro.getSystemInfoSync().pixelRatio || 2;
        node.width = w * dpr;
        node.height = h * dpr;
        ctx.scale(dpr, dpr);
        drawMoodPoster(ctx, input, w, h);
        Taro.canvasToTempFilePath({
          canvas: node,
          width: w,
          height: h,
          destWidth: w,
          destHeight: h,
          fileType: "png",
          success: (r) => resolve(r.tempFilePath),
          fail: (e) => reject(e),
        });
      });
  });
  await Taro.saveImageToPhotosAlbum({ filePath: tempPath });
}
