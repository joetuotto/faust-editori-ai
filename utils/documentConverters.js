// Document conversion utility functions
// These functions can be tested independently of Electron

const { Document, Packer, Paragraph, TextRun } = require('docx');

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

const convertToDocx = async (content, title) => {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [new TextRun(title)]
        }),
        ...content.split('\n').map(line => new Paragraph({
          children: [new TextRun(line)]
        }))
      ]
    }]
  });
  const buffer = await Packer.toBuffer(doc);
  return buffer;
};

module.exports = {
  convertToRTF,
  convertToHTML,
  convertToDocx
};
