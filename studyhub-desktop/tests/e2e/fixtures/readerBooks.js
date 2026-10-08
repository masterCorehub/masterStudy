import JSZip from 'jszip';

// Small real documents exercise PDF.js and EPUB.js, rather than mocking them.
export function readerPdf({ metadata = false } = {}) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>'];
  for (let i = 1; i <= 3; i++) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Resources << /Font << /F1 9 0 R >> >> /Contents ${2 * i + 2} 0 R >>`);
    const stream = `BT /F1 24 Tf 40 510 Td (Chapter ${i}) Tj /F1 14 Tf 0 -45 Td (Reading is a journey. Page ${i}.) Tj ET`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  if (metadata) objects.push('<< /Title (A journey through books) /Author (MasterStudy Library) >>');
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${metadata ? "/Info 10 0 R" : ""} >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(pdf);
}
export async function readerEpub() {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('book.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">reader-fixture</dc:identifier><dc:title>A arte de ler</dc:title><dc:language>pt</dc:language><meta property="dcterms:modified">2026-10-07T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>');
  zip.file('nav.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Sumário</title></head><body><nav epub:type="toc"><ol><li><a href="one.xhtml">Um lugar para ler</a></li><li><a href="two.xhtml">Encontrar o seu ritmo</a></li></ol></nav></body></html>');
  for (const [file, title, text] of [['one', 'Um lugar para ler', 'Entre as páginas de um livro, há um espaço só seu. Ler é prestar atenção, descobrir caminhos e encontrar novas perguntas. Reserve um momento tranquilo, abra a janela e deixe que as palavras encontrem seu ritmo.'], ['two', 'Encontrar o seu ritmo', 'O segredo da leitura é a curiosidade. Uma jornada começa com uma pergunta e continua a cada descoberta.']]) {
    zip.file(file + '.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head><body><h1>${title}</h1>${Array.from({ length: 50 }, () => `<p>${text}</p>`).join('')}</body></html>`);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

export async function metadataEpub({ version = 3, pages = false, cover = true } = {}) {
  const zip = await JSZip.loadAsync(await readerEpub());
  let opf = await zip.file('book.opf').async('string');
  opf = opf.replace('<dc:language>', '<dc:creator>Biblioteca masterStudy</dc:creator><dc:language>');
  if (cover) {
    opf = opf.replace('</manifest>', '<item id="cover" href="cover.svg" media-type="image/svg+xml" ' + (version === 3 ? 'properties="cover-image"' : '') + '/></manifest>');
    zip.file('cover.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360"><rect width="240" height="360" fill="#41695a"/><rect x="16" y="16" width="208" height="328" rx="5" fill="none" stroke="#e4d6af" stroke-width="2"/><text x="120" y="95" text-anchor="middle" fill="#f7ecd8" font-size="30" font-family="serif">A arte de ler</text><path d="M80 160h80v90H80z" fill="#e4d6af"/></svg>');
    if (version === 2) opf = opf.replace('</metadata>', '<meta name="cover" content="cover"/></metadata>');
  }
  if (version === 2) {
    opf = opf.replace('version="3.0"', 'version="2.0"').replace('<spine>', '<spine toc="ncx">').replace('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>', '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>');
    zip.file('toc.ncx', '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head/><docTitle><text>A arte de ler</text></docTitle><navMap><navPoint id="one" playOrder="1"><navLabel><text>Um lugar para ler</text></navLabel><content src="one.xhtml"/></navPoint></navMap></ncx>');
  } else if (pages) {
    const nav = await zip.file('nav.xhtml').async('string');
    zip.file('nav.xhtml', nav.replace('</body>', '<nav epub:type="page-list"><ol><li><a href="one.xhtml">1</a></li><li><a href="two.xhtml">2</a></li></ol></nav></body>'));
  }
  zip.file('book.opf', opf);
  return zip.generateAsync({ type: 'nodebuffer' });
}
