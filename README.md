# codex-advisor

Herhangi bir projeye **Codex, GitHub Copilot ve Claude Code** için model advisor
skill ve ajanlarını kuran CLI. Copilot dosyaları hem **VS Code** hem **Visual Studio**
için ortak biçimdedir. Node.js 20+ gerekir; CLI ek npm bağımlılığı veya API anahtarı istemez.
AI araçları için kendi hesabınız, aboneliğiniz ve model erişiminiz gerekir.

## Model yönlendirmesi

| İş | Copilot / Claude Code ajanı | Model | Düşünme tercihi |
| --- | --- | --- | --- |
| Küçük düzeltme, arama, yeniden adlandırma | `fast-worker` | Claude Haiku 5.5 | low |
| Normal geliştirme, test, yerel refactor | `standard-worker` | Claude Sonnet 5.5 | medium |
| Copilot koordinasyonu; planlama, mimari karar, yüksek düşünce | `advisor` | Claude Opus 5.5 | high |
| Zor hata, güvenlik, eşzamanlılık incelemesi | `deep-expert` | Claude Opus 5.5 | high |

Copilot'ta başlangıçta bir kez `advisor` seçilir; sonraki görevlerde uygun alt ajanı
kendisi çağırır ve sonucu doğrular. Planlamayı kendisi, normal uygulamayı
`standard-worker`, basit işleri `fast-worker`, zor incelemeleri `deep-expert` yürütür.
Claude Code'da `advisor` inceleme ve planlama rolünü korur.
Kısa işlerde alt ajan maliyeti gereksizse ana oturum devam eder.
Claude Code dosyalarında tam model kimlikleri ve `effort` alanı bulunur.
Copilot dosyalarında model adları belirtilir; düşünme tercihi editörün desteklediği
kontrollerle sınırlıdır. Desteklenmeyen bir Copilot düşünme ayarı üretilmez.

Codex'in mevcut tercihleri korunur: `fast_worker` → `gpt-6-luna` / low,
`standard_worker` → `gpt-6-sol` / medium, `deep_expert` → `gpt-6.1-sol` / high;
kritik işlerde destekleniyorsa xhigh önerilir.

Bunlar araçların yerel ajan yapılandırmaları ve yönlendirme talimatlarıdır.
Ana sohbetin modelini zorla değiştirmez; her isteğin otomatik delege edileceğini
garanti etmez. Model yoksa sınırlama belirtilir; Sonnet 5.5 yerine sessizce başka
bir sürüm seçilmez. CLI model erişiminizi sorgulamaz ve AI çağrısı yapmaz.

## Kurulum ve kullanım

Bu repo klasöründe:

```bash
npm install -g .
```

Hedef projede kullanacağınız aracı seçin (Copilot, Codex ve Claude Code ayrı araçlardır):

```bash
cd /projenin/yolu
# Codex
advisor init --target codex

# GitHub Copilot: VS Code ve Visual Studio için aynı kurulum
advisor init --target copilot

# Claude Code
advisor init --target claude

# Üçünü birlikte isteyenler için
advisor init --target all

advisor status
```

Global kurulum olmadan:

```bash
node /codex-advisor/reposunun/yolu/bin/advisor.js init --target copilot --path /projenin/yolu
```

Yeni kurulumda `--target` verilmezse yalnızca **Codex** kurulur. Mevcut kurulumda
seçim manifestten hatırlanır. `init --target <araç>` mevcut kuruluma o aracı ekler;
diğer araçları kaldırmaz veya güncellemez. Skill ve ajanlar yalnızca seçilen
aracın dizinine yazılır. `.advisor/context.json` ve manifest ortak tutulur.
`--dry-run` seçilen kurulumun önizlemesini verir.

Varsayılan proje klasörü, bulunulan klasörden yukarı doğru ilk Git köküdür; worktree
desteklenir. Git dışında bulunulan klasör kullanılır. `--path` doğrudan verilen
klasörü hedefler; klasör önceden var olmalıdır. Windows'ta da Node.js CLI kullanılır;
boşluk içeren yolları tırnak içine alın.

### VS Code ve Visual Studio / GitHub Copilot

1. Hedef projede `advisor init --target copilot` çalıştırın ve projeyi editörde açın.
2. Copilot Chat ajan listesinden başlangıçta bir kez **advisor** seçin. Aynı
   sohbette sonraki görevleri doğrudan yazın; her işte ajan/model seçmeniz gerekmez.
   `advisor`, yerel alt ajan aracı varsa işin türüne göre uygun ajanı otomatik çağırır,
   sonuçları birleştirir ve uygulamayı doğrulamaya kadar tamamlar. Yalnızca plan
   veya inceleme istendiğinde o kapsamda kalır.
3. Ajan/model görünmüyorsa pencereyi yenileyin; editör sürümünü ve Copilot
   hesabınızdaki model erişimini kontrol edin.

Visual Studio'da özel ajanlar **18.4+** gerektirir. Daha eski sürümlerde
`.github/copilot-instructions.md` ile ortak talimatlar kullanılabilir;
özel ajan ve otomatik yönlendirme desteği varsayılmaz. Bu sürümlerde başlangıçta
mevcut ajan/model seçicisini kullanın. VS Code'da güncel Copilot sürümünü kullanın;
araç seçicisinde yerel alt ajan çağrısının etkin olduğundan emin olun.

Visual Studio'da özel ajan desteği, otomatik alt ajan çağrısının da bulunduğu
anlamına gelmez; resmi belgeler bu özelliği doğrulamıyor. `advisor`, bulunduğu
ortamın gerçekten sunduğu araçları kullanır. Alt ajan aracı yoksa veya tercih edilen
alt ajan modeli çalıştırılamıyorsa sınırlamayı belirtip işi mevcut modelle kendisi
sürdürür; yalnızca mevcut yetenekler yetersiz kalırsa elle geçiş önerir.
Bu durumda alt ajanlara göre otomatik model değişimi gerçekleşmez.

Ortak ajan dosyalarında `tools` kısıtlaması tanımlanmaz; böylece her editörün
sağladığı araçlar kullanılabilir. VS Code'a özgü `agents`/`handoffs` alanlarına veya
Visual Studio'da bulunmayabilecek araç adlarına dayanılmaz. Ana sohbet `advisor`
olarak kalır; model tercihleri çağrılan alt ajanların dosyalarından alınır.

Mevcut hedef projeye bu davranışı geçirmek için CLI'ı güncelledikten sonra
`advisor update --target copilot` çalıştırın ve `advisor` tanımını yeniden yüklemek
için yeni sohbet açın.

Ajan biçimi ve model seçimi:
[GitHub](https://docs.github.com/en/copilot/reference/custom-agents-configuration),
[VS Code](https://code.visualstudio.com/docs/agent-customization/custom-agents),
[Visual Studio](https://learn.microsoft.com/en-us/visualstudio/ide/copilot-specialized-agents?view=visualstudio).
Alt ajan çağrısı ve modele ilişkin sınırlar:
[VS Code alt ajan belgeleri](https://code.visualstudio.com/docs/agents/run/subagents).
Model erişimi [Copilot planına ve istemciye](https://docs.github.com/en/copilot/reference/ai-models/supported-models) bağlıdır.

### Claude Code

`advisor init --target claude` sonrasında hedef projede yeni Claude Code oturumu açın.
`/model-advisor` ile skill'i çağırabilir veya doğrudan
“standard-worker ile uygula; planlama için advisor kullan” diyebilirsiniz.
`/agents` ile ajanları kontrol edin. `CLAUDE.md` ortak politikayı yükler.
Ajanlar `claude-haiku-5-5`, `claude-sonnet-5-5` ve `claude-opus-5-5` kimliklerini kullanır.

Yerel ajan çağrısında model geçersiz kılma parametresi verilmemesi istenir;
böylece dosyada sabitlenmiş sürüm kullanılır. Kurum politikaları veya ortam
model/effort değişkenleri bu tercihleri etkileyebilir.
[Claude Code ajan belgeleri](https://code.claude.com/docs/en/sub-agents).

### Codex

`advisor init --target codex` sonrasında `$model-advisor` ile açıkça çağırın. Skill görünmezse oturumu yeniden açın.
`AGENTS.md`, geliştirme planlamasında skill'in okunmasını ister.
Mevcut `.codex/config.toml` ve ana oturum modeli değiştirilmez.
[Codex ajan belgeleri](https://learn.chatgpt.com/docs/agent-configuration/subagents).

## Komutlar ve güncelleme

| Komut | Davranış |
| --- | --- |
| `advisor init --target <araç>` | Seçilen aracı kurar veya mevcut kuruluma ekler; tekrar çalıştırılması kopya oluşturmaz. |
| `advisor status` | Kurulu araçları ve dosya durumlarını gösterir; `--target` ile kontrol daraltılabilir. |
| `advisor update` | Yalnızca kurulu araçları günceller. `--target` ile tek araç seçilebilir. |
| `advisor remove` | Tüm kurulu araçları kaldırır; `--target` verilirse yalnızca o araç kaldırılır. |

Örnekler:

```bash
advisor update --target copilot
advisor remove --target claude
advisor status --target copilot
```

`update` yeni araç kurmaz; kurulu olmayan araç için `init --target <araç>` kullanın.
`update --target all` tüm **kurulu** araçları günceller. `remove --target all`
tüm kurulu araçları kaldırır. `status --target all` üçünün de durumunu kontrol eder;
kurulu olmayan varsa başarısız durum döndürür.
Tek araç kaldırılırken diğerlerinin dosyaları, sahiplik bilgileri ve ortak bağlam
korunur. Ortak dosyalar son araç kaldırıldığında temizlenir.

`--target codex|copilot|claude|all`, `--dry-run`, `--json`, `--help` ve `--version` desteklenir.
Başarı 0, hata/çakışma 1 çıkış kodudur. `status`, kurulum yoksa veya müdahale
gerekiyorsa 1 döndürür. Hatalar stderr'e yazılır.

**Eski kurulumlardan geçiş:** Bu CLI sürümünü edindikten sonra mevcut hedef projede
`advisor update --dry-run`, ardından `advisor update` çalıştırın. Manifest,
sahipliği korunarak sürüm 3 şemasına geçirilir. 0.1 kurulumları yalnızca Codex
olarak kalır; 0.2 kurulumlarında üç araç da kayıtlı tutulur. Yeni bir araç eklemek
için örneğin `advisor init --target copilot` çalıştırın.

Önceki üçlü kurulumdan yalnızca Copilot'a geçmek için:

```bash
advisor remove --target codex
advisor remove --target claude
```

`update` internetten paket indirmez. Önce CLI kurulumunu güncelleyin.

## Eklenen dosyalar

Aşağıdaki liste `--target all` içindir. Tek hedefte yalnızca ilgili araca ait
dosyalar, o aracın talimat bölümü ve ortak `.advisor/` dosyaları eklenir.

```text
.agents/skills/model-advisor/SKILL.md
.codex/agents/{fast-worker,standard-worker,deep-expert}.toml
.github/skills/model-advisor/SKILL.md
.github/agents/{advisor,fast-worker,standard-worker,deep-expert}.agent.md
.claude/skills/model-advisor/SKILL.md
.claude/agents/{advisor,fast-worker,standard-worker,deep-expert}.md
.advisor/context.json
.advisor/manifest.json
AGENTS.md                         (işaretli bölüm)
.github/copilot-instructions.md    (işaretli bölüm)
CLAUDE.md                         (işaretli bölüm)
```

Üç skill aynı kaynak şablondan üretilir. `context.json`, kökteki yaygın teknoloji
belirteçlerini, JavaScript framework'lerini ve doğrulama script'lerini içerir.
Komutlar tespit sırasında çalıştırılmaz. Monorepo alt projesi için `--path` kullanın.
Henüz teknolojiye göre ek skill üretilmez veya indirilmez.

## Mevcut dosyaların korunması

- Farklı içerikte mevcut skill/ajan dosyası varsa tüm işlem durur; kısmi kurulum yapılmaz.
- Şablonla aynı mevcut dosyalar ödünç alınır; kaldırmada silinmez.
- Yönetilen dosya veya işaretli bölüm sonradan değiştirilmişse güncelleme ve kaldırma durur. Değişiklikleri yedekleyip dosyayı kurulu sürümdeki içeriğine döndürün.
- `AGENTS.md`, `CLAUDE.md` ve Copilot talimatlarının işaretli bölüm dışındaki içeriği korunur. Önceden mevcut boş dosyalar da korunur.
- Kullanıcının diğer skill, ajan, editör ve sağlayıcı ayarları kaldırılmaz. Boş alt klasörler kalabilir.
- Yönetilen yollarda sembolik bağlantılara yazılmaz. `.advisor/lock` eşzamanlı yazmayı engeller. Kesilen işlemden kalan kilidi yalnızca başka advisor çalışmadığından emin olduğunuzda kaldırın.

`.advisor/manifest.json` dosyasını elle düzenlemeyin. Ekip kurulumlarında manifest
ve bağlam dahil oluşturulan dosyaları birlikte sürüm kontrolüne alın.

## Geliştirme

```bash
npm test
npm run check
```

Dağıtılan şablonlar `templates/` altındadır. Bu reponun `.agents/`, `.codex/`,
`.github/` ve `.claude/` dosyaları projenin kendi geliştirme araçları içindir.
Paket npm'e yayımlanmamıştır; `private: true` yanlışlıkla yayımlamayı engeller.
