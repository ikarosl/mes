import { code128Geometry } from './code128.js';
import { checkBarcodeLabel, checkLabelSize } from './label-settings.js';
import type { BarcodeLabel, LabelPrintSettings } from './label-settings.js';
import { LodopPrintError } from './print-error.js';

export const DEFAULT_LABEL_DPI = 203;

export interface RenderedLabelImage {
  readonly pngDataUrl: string;
  readonly widthMm: number;
  readonly heightMm: number;
}

const MAX_CANVAS_PIXELS = 12_000_000;
const BARCODE_HEIGHT_MODULES = 33;
const GAP_MODULES = 4;
const TEXT_FONT_SIZE_PT = 7;
const MIN_TEXT_FONT_SIZE_PT = 4;
const TEXT_FONT_FAMILY = 'Arial, "Microsoft YaHei", "Noto Sans SC", sans-serif';

interface TextLine {
  value: string;
  width: number;
  left: number;
  ascent: number;
  descent: number;
}

interface TextLayout {
  lines: TextLine[];
  fontSize: number;
  lineHeight: number;
  ascent: number;
  height: number;
}

function measureLine(context: CanvasRenderingContext2D, value: string): TextLine {
  const metrics = context.measureText(value);
  const left = Math.max(0, Math.ceil(metrics.actualBoundingBoxLeft));
  return {
    value,
    width: Math.ceil(Math.max(metrics.width, metrics.actualBoundingBoxRight) + left),
    left,
    ascent: Math.max(0, Math.ceil(metrics.actualBoundingBoxAscent)),
    descent: Math.max(0, Math.ceil(metrics.actualBoundingBoxDescent)),
  };
}

function measureTextLines(
  context: CanvasRenderingContext2D,
  text: string,
  width: number,
  allowWrap: boolean,
): TextLine[] | undefined {
  const singleLine = measureLine(context, text);
  if (singleLine.width <= width) return [singleLine];
  if (!allowWrap) return undefined;
  const lines: TextLine[] = [];
  let value = '';
  let measured: TextLine | undefined;
  for (const character of Array.from(text)) {
    const candidate = measureLine(context, value + character);
    if (candidate.width <= width) {
      value += character;
      measured = candidate;
      continue;
    }
    if (!measured) return undefined;
    lines.push(measured);
    value = character;
    measured = measureLine(context, value);
    if (measured.width > width) return undefined;
  }
  if (measured) lines.push(measured);
  return lines;
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  pixelsPerMm: number,
): TextLayout | undefined {
  const minFontSize = Math.max(1, Math.ceil((MIN_TEXT_FONT_SIZE_PT * 25.4 * pixelsPerMm) / 72));
  const maxFontSize = Math.max(
    minFontSize,
    Math.round((TEXT_FONT_SIZE_PT * 25.4 * pixelsPerMm) / 72),
  );
  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 1) {
    context.font = `${fontSize}px ${TEXT_FONT_FAMILY}`;
    const lines = measureTextLines(context, text, width - 2, fontSize === minFontSize);
    if (!lines) continue;
    const ascent = Math.max(...lines.map((line) => line.ascent));
    const descent = Math.max(...lines.map((line) => line.descent));
    const lineHeight = Math.max(Math.ceil(fontSize * 1.4), ascent + descent + 2);
    const requiredHeight = ascent + descent + (lines.length - 1) * lineHeight + 2;
    if (requiredHeight <= height) {
      return { lines, fontSize, lineHeight, ascent, height: requiredHeight };
    }
  }
  return undefined;
}

function canvasSize(
  paper: Pick<LabelPrintSettings, 'widthMm' | 'heightMm'>,
  dpi: number,
): { width: number; height: number; pixelsPerMm: number } {
  // Large sheets keep their physical dimensions while bounding one live RGBA bitmap to 48 MB.
  const pixelsPerMm = Math.min(
    dpi / 25.4,
    Math.sqrt(MAX_CANVAS_PIXELS / (paper.widthMm * paper.heightMm)),
  );
  let width = Math.max(1, Math.round(paper.widthMm * pixelsPerMm));
  let height = Math.max(1, Math.round(paper.heightMm * pixelsPerMm));
  if (width * height > MAX_CANVAS_PIXELS) {
    const ratio = Math.sqrt(MAX_CANVAS_PIXELS / (width * height));
    width = Math.max(1, Math.floor(width * ratio));
    height = Math.max(1, Math.floor(height * ratio));
  }
  return {
    width,
    height,
    pixelsPerMm: Math.min(width / paper.widthMm, height / paper.heightMm),
  };
}

/** Render one complete physical label; callers reuse this same PNG for preview, export and printing. */
export function renderBarcodeLabel(
  label: BarcodeLabel,
  paper: Pick<LabelPrintSettings, 'widthMm' | 'heightMm'>,
  dpi: number = DEFAULT_LABEL_DPI,
): RenderedLabelImage {
  checkLabelSize(paper);
  checkBarcodeLabel(label);
  if (!Number.isInteger(dpi) || dpi < 72 || dpi > 1200) {
    throw new LodopPrintError('INVALID_SETTINGS', '标签图像分辨率须为 72 至 1200 DPI 的整数');
  }
  if (typeof document === 'undefined') {
    throw new LodopPrintError('RENDERING_UNAVAILABLE', '当前环境无法生成标签图像，请使用浏览器');
  }

  let canvas: HTMLCanvasElement | undefined;
  try {
    const { width, height, pixelsPerMm } = canvasSize(paper, dpi);
    const margin = Math.round(Math.min(3, paper.widthMm / 10, paper.heightMm / 10) * pixelsPerMm);
    const contentWidth = width - margin * 2;
    const contentHeight = height - margin * 2;
    const geometry = code128Geometry(label.barcode);
    const widthModuleDots = Math.floor(contentWidth / geometry.width);
    if (widthModuleDots < 1) {
      throw new LodopPrintError('INVALID_LABELS', '当前纸张无法容纳条码及静区，请增大标签宽度');
    }
    // A shallow sheet also bounds the scale; widening the paper must not create an enormous bar height.
    const moduleDots = Math.min(
      widthModuleDots,
      Math.max(1, Math.floor(contentHeight / (BARCODE_HEIGHT_MODULES + GAP_MODULES + 11))),
    );
    const gap = GAP_MODULES * moduleDots;
    let barcodeHeight = BARCODE_HEIGHT_MODULES * moduleDots;

    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new LodopPrintError('RENDERING_UNAVAILABLE', '当前浏览器无法生成标签图像');
    }
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.direction = 'ltr';
    let textLayout = fitText(
      context,
      label.text,
      contentWidth,
      contentHeight - barcodeHeight - gap,
      pixelsPerMm,
    );
    if (!textLayout) {
      // Keep every character on short sheets, allowing the bars to shorten before rejecting the label.
      const minBarcodeHeight = Math.min(barcodeHeight, moduleDots * 11);
      textLayout = fitText(
        context,
        label.text,
        contentWidth,
        contentHeight - minBarcodeHeight - gap,
        pixelsPerMm,
      );
      if (!textLayout) {
        throw new LodopPrintError('INVALID_LABELS', '当前纸张无法完整容纳标签文字，请增大标签尺寸');
      }
      barcodeHeight = Math.min(barcodeHeight, contentHeight - textLayout.height - gap);
    }

    context.fillStyle = 'white';
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'black';
    const barcodeLeft = Math.floor((width - geometry.width * moduleDots) / 2);
    const groupTop = Math.floor((height - barcodeHeight - gap - textLayout.height) / 2);
    for (const bar of geometry.bars) {
      context.fillRect(
        barcodeLeft + bar.x * moduleDots,
        groupTop,
        bar.width * moduleDots,
        barcodeHeight,
      );
    }
    const textTop = groupTop + barcodeHeight + gap;
    context.font = `${textLayout.fontSize}px ${TEXT_FONT_FAMILY}`;
    textLayout.lines.forEach((line, index) => {
      const x = Math.floor((width - line.width) / 2) + line.left;
      context.fillText(
        line.value,
        x,
        textTop + 1 + textLayout.ascent + index * textLayout.lineHeight,
      );
    });
    const pngDataUrl = canvas.toDataURL('image/png');
    if (!pngDataUrl.startsWith('data:image/png;base64,')) {
      throw new LodopPrintError('RENDERING_FAILED', '浏览器未能生成有效的标签 PNG 图像');
    }
    return { pngDataUrl, widthMm: paper.widthMm, heightMm: paper.heightMm };
  } catch (error) {
    if (error instanceof LodopPrintError) throw error;
    throw new LodopPrintError('RENDERING_FAILED', '标签图像生成失败，请调整标签尺寸后重试');
  } finally {
    // Printing can render up to 1,000 pages sequentially; release each bitmap after encoding.
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
