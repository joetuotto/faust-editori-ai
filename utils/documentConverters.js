// Document conversion utility functions
// These functions can be tested independently of Electron

function convertToRTF(text) {
  const rtfHeader = '{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}';
  const rtfContent = text
    .split('\n')
    .map(line => line ? `\\par ${line}` : '\\par')
    .join('\n');
  return `${rtfHeader}\n${rtfContent}\n}`;
}

function convertToHTML(text, title) {
  const htmlContent = text
    .split('\n\n')
    .map(para => para.trim() ? `<p>${para.replace(/\n/g, '<br>')}</p>` : '')
    .join('\n');

  return `<!DOCTYPE html>
<html lang="fi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: 'Times New Roman', serif;
            line-height: 1.6;
            margin: 40px;
            max-width: 800px;
        }
        h1 {
            font-size: 24px;
            margin-bottom: 20px;
            text-align: center;
        }
        p {
            margin-bottom: 16px;
        }
    </style>
</head>
<body>
    <h1>${title}</h1>
    ${htmlContent}
</body>
</html>`;
}

function convertToDocx(text, title) {
  const paragraphs = text.split('\n\n');
  
  const xmlContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.map(para => `
      <w:p>
        <w:pPr>
          <w:pStyle w:val="Normal"/>
        </w:pPr>
        <w:r>
          <w:t>${para.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w:t>
        </w:r>
      </w:p>`).join('')}
  </w:body>
</w:document>`;

  return xmlContent;
}

module.exports = {
  convertToRTF,
  convertToHTML,
  convertToDocx
};
