import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import Epub from "epubjs";
import { bookFileType, epubReferencePages } from "../domain/bookMetadata";
import { readBookBytes } from "./book-files";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
const cleanText = (value) =>
  typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, 500)
    : "";

async function thumbnail(url) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const scale = Math.min(
    1,
    360 / image.naturalWidth,
    540 / image.naturalHeight,
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  // Keep a small persistent thumbnail; a temporary blob URL expires on restart.
  return canvas.toDataURL("image/jpeg", 0.86);
}

async function pdfMetadata(bytes) {
  const task = getDocument({ data: bytes });
  let pdf;
  try {
    pdf = await task.promise;
    const result = {
      totalPages: pdf.numPages,
      pageCountSource: "pdf",
      warnings: [],
    };
    try {
      const { info, metadata } = await pdf.getMetadata();
      result.title = cleanText(metadata?.get("dc:title") || info?.Title);
      const creators = metadata?.get("dc:creator");
      result.author = cleanText(
        Array.isArray(creators) ? creators.join(", ") : info?.Author,
      );
    } catch {
      /* Optional metadata must not prevent counting or opening a PDF. */
    }
    try {
      const firstPage = await pdf.getPage(1);
      const original = firstPage.getViewport({ scale: 1 });
      const viewport = firstPage.getViewport({
        scale: Math.min(360 / original.width, 540 / original.height),
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await firstPage.render({
        canvasContext: canvas.getContext("2d"),
        viewport,
        background: "#ffffff",
      }).promise;
      result.coverUrl = canvas.toDataURL("image/jpeg", 0.86);
    } catch {
      result.warnings.push(
        "Não foi possível gerar a capa da primeira página. Você pode escolher uma imagem.",
      );
    }
    return result;
  } finally {
    await task.destroy();
  }
}

async function epubMetadata(bytes) {
  const book = Epub();
  try {
    await book.open(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "binary",
    );
    await book.loaded.navigation;
    const metadata = await book.loaded.metadata;
    const totalPages = epubReferencePages(book.pageList?.pages);
    const result = {
      title: cleanText(metadata?.title),
      author: cleanText(metadata?.creator),
      totalPages,
      pageCountSource: totalPages ? "epub-reference" : "unknown",
      warnings: [],
    };
    try {
      const cover = await book.coverUrl();
      if (cover) result.coverUrl = await thumbnail(cover);
      else
        result.warnings.push(
          "Este EPUB não inclui uma capa. Você pode escolher uma imagem.",
        );
    } catch {
      result.warnings.push(
        "A capa interna não pôde ser lida. Você pode escolher uma imagem.",
      );
    }
    if (!totalPages)
      result.warnings.push(
        "EPUB com texto adaptável: o progresso será mostrado em porcentagem.",
      );
    return result;
  } finally {
    book.destroy();
  }
}

export async function extractBookMetadata(source, name) {
  let fileName =
    name ||
    (typeof source === "string" ? source.split(/[\\/]/).pop() : source.name);
  if (
    typeof source === "string" &&
    /^(?:https?:|book-file:|safe-file:|file:)/i.test(source)
  ) {
    try {
      fileName = decodeURIComponent(fileName.split(/[?#]/)[0]);
    } catch {
      /* A literal percent sign is a valid file name. */
    }
  }
  const fileType = bookFileType(fileName);
  if (!fileType) throw new Error("Escolha um arquivo PDF ou EPUB.");
  const bytes = await readBookBytes(source);
  try {
    const result = await (fileType === "pdf"
      ? pdfMetadata(bytes)
      : epubMetadata(bytes));
    return {
      ...result,
      fileName,
      fileType,
      title:
        result.title && !/^untitled$/i.test(result.title)
          ? result.title
          : fileName.replace(/\.(pdf|epub)$/i, ""),
    };
  } catch (error) {
    if (error?.name === "PasswordException")
      throw new Error(
        "O PDF está protegido por senha. Use uma cópia desbloqueada ou preencha o livro manualmente.",
      );
    throw new Error(
      "Não foi possível ler os dados deste livro. Verifique se o arquivo abre normalmente e tente novamente.",
    );
  }
}
