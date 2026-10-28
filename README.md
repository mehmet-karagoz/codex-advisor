# codex-advisor

Herhangi bir projeye Codex advisor skill ve ajanlarını kuran, yöneten CLI.
Node.js 20 veya üzeri gerekir. Ek npm bağımlılığı ve API anahtarı gerekmez.

## Kurulum ve kullanım

Bu repoyu indirdikten sonra repo klasöründe:

```bash
npm install -g .
```

Ardından hedef projede:

```bash
cd /projenin/yolu
advisor init --dry-run
advisor init
advisor status
```

Global kurulum yapmadan da çalıştırabilirsiniz:

```bash
node /codex-advisor/reposunun/yolu/bin/advisor.js init --path /projenin/yolu
```

Varsayılan hedef, bulunulan klasörden yukarı doğru ilk Git köküdür (worktree
desteklenir). Git dışında bulunulan klasör kullanılır. `--path` verilirse o
klasör doğrudan hedeflenir; klasörün önceden var olması gerekir.

## Komutlar

| Komut | Davranış |
| --- | --- |
| `advisor init` | Temel advisor paketini kurar; tekrar çalıştırılması kopya oluşturmaz. |
| `advisor status` | Kurulum sürümünü, eksik/değişmiş/güncel olmayan dosyaları ve teknolojileri gösterir. |
| `advisor update` | Kurulu paketi çalıştırılan CLI içindeki şablonlarla günceller; eksik dosyaları onarır ve proje bağlamını yeniler. |
| `advisor remove` | Advisor'ın eklediği dosyaları ve `AGENTS.md` bölümünü kaldırır. |

`--dry-run` değişiklikleri dosya yazmadan gösterir. `--json` makine tarafından
okunabilir çıktı verir. `--help` ve `--version` desteklenir.
Başarılı işlemler 0, çakışmalar/hatalar 1 çıkış kodu döndürür. `status`, kurulum
yoksa veya müdahale/güncelleme gerekiyorsa 1 döndürür. Hata mesajları stderr'e yazılır;
`--json` başarılı plan ve durum çıktılarını yapılandırır.

`update` internetten paket indirmez. Yeni CLI sürümünü edindikten sonra önce
CLI kurulumunu, ardından hedef projede advisor kurulumunu güncelleyin.

## Projeye eklenenler

```text
.agents/skills/model-advisor/SKILL.md
.codex/agents/fast-worker.toml
.codex/agents/standard-worker.toml
.codex/agents/deep-expert.toml
.advisor/context.json
.advisor/manifest.json
AGENTS.md içindeki işaretli advisor bölümü
```

Codex içinde `$model-advisor` ile açıkça çağırabilirsiniz. `AGENTS.md` bölümünde
geliştirme planlamasında bu skill'in kullanılması istenir. Skill görünmezse
Codex oturumunu yeniden açın. Kurulum, her istekte skill'in çalışacağını veya
belirli bir modelin hesabınızda kullanılabileceğini garanti etmez. Ana oturumun
modeli değiştirilmez; ajan tercihlerinin uygulanması ortamın model ve alt ajan
desteğine bağlıdır. Skill ve ajanlar için [resmî skill belgelerine](https://learn.chatgpt.com/docs/build-skills)
ve [alt ajan belgelerine](https://learn.chatgpt.com/docs/agent-configuration/subagents) bakın.

İlk sürüm yalnızca `base` paketini kurar. JavaScript/TypeScript, Python, Go,
Rust ve bazı diğer ekosistemlerin kök dosyalarını; JavaScript paketlerindeki
yaygın framework'leri ve doğrulama script'lerini tespit edip `context.json` içine
yazar. Bu dosya Codex için ipucudur; komutlar çalıştırılmaz. Henüz teknolojiye
göre ek skill üretmez veya indirmez. Monorepolarda belirli bir alt projeyi
hedeflemek için `--path` kullanın.

## Mevcut dosyaların korunması

- Farklı içerikte mevcut bir skill/ajan dosyası varsa tüm işlem durur; hiçbir dosya değiştirilmez.
- Şablonla aynı içerikte bulunan dosyalar kullanıcıya ait olarak kaydedilir ve kaldırılmaz.
- Advisor'ın eklediği dosya veya yönerge bölümü sonradan değişmişse güncelleme ve kaldırma durur. Değişikliklerinizi yedekleyip dosyayı kurulu sürümdeki içeriğine döndürün ve işlemi tekrarlayın.
- `AGENTS.md` içindeki advisor bölümü dışındaki düzenlemeler korunur. Boş olsa bile önceden mevcut olan `AGENTS.md` korunur.
- Kaldırma, diğer skill'leri, Codex ayarlarını veya dolu klasörleri silmez. Boş skill/ajan klasörleri kalabilir.
- Yönetilen yollardaki sembolik bağlantılara yazılmaz. İşlemler eşzamanlı çalışmayı engelleyen `.advisor/lock` kullanır. Bir işlem zorla kesildiyse, çalışan başka advisor olmadığını doğruladıktan sonra kalan kilidi kaldırın.

`.advisor/manifest.json` dosyasını elle düzenlemeyin; sürüm ve sahiplik kayıtları
güncelleme/kaldırmada kullanılır. Ekipçe paylaşılacak kurulumlarda manifest ve
bağlam dosyası dahil oluşturulan dosyaları birlikte sürüm kontrolüne alın.

## Geliştirme

```bash
npm test
npm run check
```

Dağıtılan kaynak şablonlar `templates/` altında bulunur. Repodaki `.agents/`
ve `.codex/` klasörleri bu projenin kendi Codex oturumunu yapılandırır.
Paket henüz npm'e yayımlanmamıştır; `private: true` yanlışlıkla yayımlamayı engeller.
