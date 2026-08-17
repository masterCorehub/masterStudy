import createDOMPurify from "dompurify";

const purifier =
  typeof window !== "undefined"
    ? typeof createDOMPurify?.sanitize === "function"
      ? createDOMPurify
      : createDOMPurify(window)
    : null;

const HTML_TAGS = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

const HTML_ATTRIBUTES = [
  "aria-label",
  "class",
  "colspan",
  "data-math",
  "data-language",
  "href",
  "alt",
  "loading",
  "rel",
  "rowspan",
  "style",
  "target",
  "title",
  "src",
  "start",
];

const safeAnchorHref = (value = "") => {
  const href = String(value).trim();
  return (
    href.startsWith("#") ||
    /^(https?:|mailto:)/i.test(href)
  );
};

export function sanitizeUserHtml(value = "") {
  if (!purifier) return "";
  const clean = purifier.sanitize(String(value), {
    ALLOWED_TAGS: HTML_TAGS,
    ALLOWED_ATTR: HTML_ATTRIBUTES,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["form", "iframe", "object", "embed", "script", "style"],
    FORBID_ATTR: ["srcset"],
  });

  const template = document.createElement("template");
  template.innerHTML = clean;
  template.content.querySelectorAll("[style]").forEach((element) => {
    const style = element.getAttribute("style") || "";
    if (/url\s*\(|expression\s*\(|@import|behavior\s*:|javascript:/i.test(style)) {
      element.removeAttribute("style");
    }
  });
  template.content.querySelectorAll("a").forEach((anchor) => {
    const href = anchor.getAttribute("href") || "";
    if (!safeAnchorHref(href)) {
      anchor.removeAttribute("href");
      anchor.removeAttribute("target");
    } else if (/^https?:/i.test(href)) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    }
  });
  template.content.querySelectorAll("img").forEach((image) => {
    const src = image.getAttribute("src") || "";
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(src)) {
      image.remove();
    }
  });
  return template.innerHTML;
}

export const sanitizeGeneratedHtml = sanitizeUserHtml;

export function sanitizeSvg(value = "") {
  if (!purifier) return "";
  return purifier.sanitize(String(value), {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["foreignObject", "script", "style"],
    FORBID_ATTR: ["href", "xlink:href", "onload", "onclick", "onerror"],
  });
}
