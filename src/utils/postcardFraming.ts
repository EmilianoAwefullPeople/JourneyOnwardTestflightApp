import type { PostcardPhotoTransform } from '../models/Postcard';

export function clampPostcardPhotoTransform(
  viewW: number,
  viewH: number,
  imgW: number,
  imgH: number,
  t: PostcardPhotoTransform,
  maxScale: number
): PostcardPhotoTransform {
  if (viewW <= 0 || viewH <= 0 || imgW <= 0 || imgH <= 0) {
    return { scale: 1, translateX: 0, translateY: 0 };
  }
  const scale = Math.min(maxScale, Math.max(1, t.scale));
  const base = Math.max(viewW / imgW, viewH / imgH);
  const w = imgW * base * scale;
  const h = imgH * base * scale;
  const maxTx = Math.max(0, (w - viewW) / 2);
  const maxTy = Math.max(0, (h - viewH) / 2);
  return {
    scale,
    translateX: Math.min(maxTx, Math.max(-maxTx, t.translateX)),
    translateY: Math.min(maxTy, Math.max(-maxTy, t.translateY)),
  };
}
