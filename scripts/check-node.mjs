// Sunucu açılmadan önce Node.js sürümünü denetler ve anlaşılır bir uyarı yazar.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 18) {
  console.error(`Node.js ${process.versions.node} çok eski. En az Node.js 22.5 gerekir: https://nodejs.org`);
  process.exit(1);
}
if (major < 22 || (major === 22 && minor < 5)) {
  console.warn(`Uyarı: Node.js ${process.versions.node} ile çok oyunculu masalar çalışmaz (Node.js 22.5+ gerekir). Antrenman masası yine çalışır.`);
}
