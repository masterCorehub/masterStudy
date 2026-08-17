import { ViewPlugin, Decoration, WidgetType } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";

const hideMark = Decoration.replace({});

const MARKUP_NODES = new Set([
  "HeaderMark",
  "EmphasisMark",
  "StrongEmphasisMark",
  "StrikethroughMark",
  "ListMark",
  "QuoteMark",
]);

class ImageWidget extends WidgetType {
  constructor(url, alt) {
    super();
    this.url = url;
    this.alt = alt;
  }
  eq(other) {
    return other.url === this.url && other.alt === this.alt;
  }
  toDOM() {
    const container = document.createElement("div");
    container.className = "cm-image-widget";
    container.style.display = "flex";
    container.style.justifyContent = "center";
    container.style.margin = "10px 0";
    
    const img = document.createElement("img");
    img.src = this.url.startsWith("http") || this.url.startsWith("file://") || this.url.startsWith("data:") 
      ? this.url 
      : `local://${this.url}`; // Handle local paths if needed, but usually they are absolute or data URIs.
    img.alt = this.alt;
    img.style.maxWidth = "100%";
    img.style.maxHeight = "400px";
    img.style.borderRadius = "8px";
    img.style.boxShadow = "var(--shadow-sm)";
    
    container.appendChild(img);
    return container;
  }
}

class WikilinkWidget extends WidgetType {
  constructor(target, alias, onLinkClick) {
    super();
    this.target = target;
    this.alias = alias;
    this.onLinkClick = onLinkClick;
  }
  eq(other) {
    return other.target === this.target && other.alias === this.alias;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-wikilink-widget";
    span.textContent = this.alias || this.target;
    span.style.color = "var(--primary)";
    span.style.cursor = "pointer";
    span.style.textDecoration = "none";
    span.style.backgroundColor = "color-mix(in srgb, var(--primary) 10%, transparent)";
    span.style.padding = "2px 6px";
    span.style.borderRadius = "4px";
    span.style.fontWeight = "500";
    span.style.transition = "background-color 0.2s";
    
    span.onmouseenter = () => {
      span.style.backgroundColor = "color-mix(in srgb, var(--primary) 20%, transparent)";
    };
    span.onmouseleave = () => {
      span.style.backgroundColor = "color-mix(in srgb, var(--primary) 10%, transparent)";
    };
    
    span.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    span.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.onLinkClick) {
        this.onLinkClick(this.target);
      }
    };
    return span;
  }
}

export const createLivePreviewPlugin = (onWikilinkClick) => {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = this.buildDecorations(view);
      }
      update(update) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }
      buildDecorations(view) {
        const builder = new RangeSetBuilder();
        const state = view.state;
        const selection = state.selection.main;
        const activeLine = state.doc.lineAt(selection.head);
        
        const decos = [];

        // Hide simple markup marks
        for (let { from, to } of view.visibleRanges) {
          syntaxTree(state).iterate({
            from,
            to,
            enter(node) {
              const isOnActiveLine = node.from >= activeLine.from && node.to <= activeLine.to;
              if (isOnActiveLine) return;
              if (MARKUP_NODES.has(node.name)) {
                decos.push({ pos: node.from, end: node.to, deco: hideMark });
              }
            },
          });
        }

        // Replace specific patterns with widgets
        let pos = view.viewport.from;
        while (pos < view.viewport.to) {
          const line = view.state.doc.lineAt(pos);
          const isOnActiveLine = line.number === activeLine.number;
          const text = line.text;
          
          if (!isOnActiveLine) {
            // Wikilinks [[target|alias]]
            const wikiRegex = /\[\[(.*?)\]\]/g;
            let match;
            while ((match = wikiRegex.exec(text)) !== null) {
              const inner = match[1];
              const [target, alias] = inner.includes('|') ? inner.split('|', 2) : [inner, inner];
              const start = line.from + match.index;
              const end = start + match[0].length;
              decos.push({
                pos: start,
                end: end,
                deco: Decoration.replace({
                  widget: new WikilinkWidget(target, alias, onWikilinkClick),
                  inclusive: false
                })
              });
            }

            // Images ![alt](url)
            const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
            while ((match = imgRegex.exec(text)) !== null) {
              const alt = match[1];
              const url = match[2];
              const start = line.from + match.index;
              const end = start + match[0].length;
              decos.push({
                pos: start,
                end: end,
                deco: Decoration.replace({
                  widget: new ImageWidget(url, alt),
                  inclusive: false
                })
              });
            }
          }
          
          pos = line.to + 1;
        }

        // Apply all decorations in order
        decos.sort((a, b) => a.pos - b.pos);
        for (const d of decos) {
          // Avoid overlapping replacements
          try {
            builder.add(d.pos, d.end, d.deco);
          } catch(e) {}
        }
        
        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
};
