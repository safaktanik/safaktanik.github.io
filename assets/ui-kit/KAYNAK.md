# Oyun arayüz seti

Kaynak: Freepik — "Hand drawn video game set elements" (dosya no. 8837930), https://www.freepik.com

Freepik'in ücretsiz lisansı **atıf ister** ("Designed by Freepik"); atıf oyunda Ayarlar ekranında ve README'de yer alır.
Freepik Premium aboneliğiyle indirildiyse atıf zorunlu değildir.

Bu klasördeki WebP dosyaları, orijinal `.ai` dosyasının "Objects" katmanından (arka plan ve yazılar kapalı)
`scripts/ui-kit/` betikleriyle kesildi:

1. `cut_kit.py <8837930.ai> <çıkış>` — vektörü 3000×2000 işler, parçaları kırpar.
2. `clean_gems.py <çıkış>` — jeton/elmas/taşların arkasındaki gri sayaç kutusunu ayıklar.
3. `strip_lines.py <çıkış>` — kutunun ince çerçeve çizgilerini siler.
4. `largest.py <çıkış> coin diamond gem-green gem-purple gem-red gem-blue` — kırıntıları temizler.

Gereken: Python 3, `pymupdf`, `pillow`.

Setin fontu (Changa One) Türkçe ş/ğ/İ harflerini içermediği için kullanılmadı; oyun Baloo 2 ile devam eder.
