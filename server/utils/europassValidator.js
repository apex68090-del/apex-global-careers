const fs = require("fs");
const pdfParse = require("pdf-parse").default;

module.exports = async function validateEuropass(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  const text = data.text.toLowerCase();

  const requiredSections = [
    "work experience",
    "education",
    "language skills"
  ];

  return requiredSections.every(section =>
    text.includes(section)
  );
};
