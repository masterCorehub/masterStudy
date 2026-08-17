import { ViewPlugin, Decoration } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

export const createHashtagPlugin = () => {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = this.buildDecorations(view);
      }
      
      update(update) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.buildDecorations(update.view);
        }
      }
      
      buildDecorations(view) {
        const builder = new RangeSetBuilder();
        const regex = /(?:^|\s)(#[\w\u00C0-\u024F-]+)/g;
        const decos = [];

        let pos = view.viewport.from;
        while (pos < view.viewport.to) {
          const line = view.state.doc.lineAt(pos);
          const text = line.text;
          
          let match;
          while ((match = regex.exec(text)) !== null) {
            const tag = match[1];
            const startPos = line.from + match.index + (match[0].length - tag.length);
            const endPos = startPos + tag.length;
            
            decos.push({
              from: startPos,
              to: endPos,
              deco: Decoration.mark({ class: "cm-hashtag" })
            });
          }
          
          pos = line.to + 1;
        }

        decos.sort((a, b) => a.from - b.from);
        for (const d of decos) {
          builder.add(d.from, d.to, d.deco);
        }
        
        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
};
