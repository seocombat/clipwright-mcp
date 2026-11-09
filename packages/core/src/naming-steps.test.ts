import { describe, expect, it } from "vitest";
import { namedThings } from "./explainer-fit.js";
import { explainerObjectCeiling } from "./faceless-price.js";
import { namesThing, namingLanguageOf } from "./naming.js";
import { scriptLanguageOf } from "./caption-language.js";

// #1285: steps that open on a verb no list holds name nothing. Before, 24 of these 25 how-tos quoted 4 or 5 pictures each.

const tail = " You will see the difference in the first week, and it will stick with you.";
const HOW_TOS: Record<string, string[]> = {
  en: [
    "Duplicate the sheet, then rename it. Rename tabs, keep them short. Archive old files, they slow you down. Toggle dark mode, it saves your eyes. Merge cells, then center the title. That's the whole routine.",
    `Bookmark tabs, sort them by project. Pin messages, the team sees them first. Snooze alerts, until lunch. Mute threads, then catch up later. Export reports, every Friday.${tail}`,
    "Clone repos, then branch off main. Stage changes, review the diff. Squash commits, keep history clean. Rebase branches, before the merge. Tag releases, push the tag.",
    `Crop photos, square works best. Blur faces, for privacy. Watermark images, bottom right. Compress files, under two megabytes. Batch exports, one click is enough.${tail}`,
    `Schedule posts, mornings work best. Queue drafts, three a week. Recycle evergreen posts, every month. Tag partners, they reshare. Track clicks, in the dashboard.${tail}`,
  ],
  es: [
    "Duplica la hoja, luego renómbrala. Archiva los correos viejos, ocupan espacio. Fusiona celdas, centra el título. Silencia los grupos, por la tarde. Exporta informes, cada viernes de la semana.",
    "Etiqueta clientes, por región. Prioriza tareas, las urgentes primero. Programa envíos, a las nueve de la mañana. Agrupa pestañas, por proyecto. Respalda archivos, cada semana en la nube.",
    "Recorta fotos, las cuadradas funcionan mejor. Comprime archivos, menos de dos megas. Difumina caras, por la privacidad. Rota imágenes, si salen torcidas. Renombra carpetas, con la fecha del día.",
    "Clona el repositorio, luego crea una rama. Confirma cambios, con mensajes cortos. Fusiona ramas, después de la revisión. Etiqueta versiones, y súbelas. Revierte errores, sin miedo a la historia.",
    "Fija mensajes, el equipo los ve primero. Pospón alertas, hasta el almuerzo. Archiva hilos, cuando terminen. Marca favoritos, para la tarde. Filtra correos, por el remitente de la lista.",
  ],
  it: [
    "Duplica il foglio, poi rinominalo. Archivia le email vecchie, occupano spazio. Unisci celle, centra il titolo. Silenzia i gruppi, la sera. Esporta report, ogni venerdì per il team.",
    "Etichetta clienti, per regione. Ordina attività, prima le urgenti. Programma invii, alle nove per il team. Raggruppa schede, per progetto. Salva backup, ogni settimana e controlla il file.",
    "Ritaglia foto, quadrate vanno meglio. Comprimi file, sotto due mega. Sfoca volti, per la privacy. Ruota immagini, se sono storte. Rinomina cartelle, con la data e il nome.",
    "Clona il repository, poi crea un ramo. Conferma modifiche, con messaggi brevi. Unisci rami, dopo la revisione. Etichetta versioni, e caricale. Annulla errori, senza paura per il codice.",
    "Fissa messaggi, il team li vede prima. Posticipa avvisi, fino a pranzo. Archivia thread, quando finiscono. Segna preferiti, per dopo. Filtra email, per il mittente e la data.",
  ],
  pt: [
    "Duplique a planilha, depois renomeie. Arquive e-mails antigos, ocupam espaço. Mescle células, centralize o título. Silencie grupos, à tarde. Exporte relatórios, toda sexta com a equipe.",
    "Etiquete clientes, por região. Priorize tarefas, as urgentes primeiro. Agende envios, às nove da manhã. Agrupe abas, por projeto. Faça backup, toda semana com o arquivo. Você vai ver a diferença e o resultado na primeira semana.",
    "Recorte fotos, as quadradas funcionam melhor. Comprima arquivos, abaixo de dois megas. Desfoque rostos, por privacidade. Gire imagens, se ficarem tortas. Renomeie pastas, com a data do dia.",
    "Clone o repositório, depois crie um ramo. Confirme mudanças, com mensagens curtas. Mescle ramos, depois da revisão. Marque versões, e envie o pacote. Reverta erros, sem medo do código.",
    "Fixe mensagens, a equipe vê primeiro. Adie alertas, até o almoço. Arquive conversas, quando terminarem. Marque favoritos, para depois. Filtre e-mails, por remetente e por data.",
  ],
  tr: [
    "Sohbeti kaydet, sonra yeniden adlandır. Sekmeleri arşivle, yer açılsın. Hücreleri birleştir, başlığı ortala. Grupları sessize al, akşam saatlerinde. Raporları dışa aktar, her cuma.",
    "Müşterileri etiketle, bölgeye göre. Görevleri sırala, acil olanlar önce. Gönderimleri planla, saat dokuzda. Sekmeleri grupla, projeye göre. Dosyaları yedekle, her hafta.",
    "Fotoğrafları kırp, kare daha iyi. Dosyaları sıkıştır, iki megabaytın altına. Yüzleri bulanıklaştır, gizlilik için. Görselleri döndür, eğri çıkarsa. Klasörleri yeniden adlandır, tarihle.",
    "Depoyu klonla, sonra bir dal aç. Değişiklikleri onayla, kısa mesajlarla. Dalları birleştir, incelemeden sonra. Sürümleri etiketle, ve yükle. Hataları geri al, korkmadan.",
    "Mesajları sabitle, ekip önce görsün. Uyarıları ertele, öğlene kadar. Konuşmaları arşivle, bitince. Favorileri işaretle, sonrası için. E-postaları filtrele, gönderene göre.",
  ],
};

describe("steps on verbs no list holds name nothing (#1285)", () => {
  /** Mutants: let a label name a thing where the verb comes first, or drop the Turkish object-then-verb test, and these quote 4–5 pictures each. */
  it.each(Object.entries(HOW_TOS))("reads every %s how-to as naming nothing, in its own language", (language, texts) => {
    for (const text of texts) {
      expect({ text: text.slice(0, 24), read: namingLanguageOf(text, scriptLanguageOf(text)), named: namedThings(text), ceiling: explainerObjectCeiling(text) })
        .toEqual({ text: text.slice(0, 24), read: language, named: 0, ceiling: 0 });
    }
  });

  /** The word order decides: in a verb-first language a label never names, whatever its word; in Turkish an object then its bare verb is a step,
   * a compound with its ending on the last word is a name, and one word alone is neither. */
  it("tells a Turkish step from a compound name by which word carries the case ending", () => {
    expect(["Cold brew: steep it overnight.", "Duplicate rows, then save."].map(s => namesThing(s, "en"))).toEqual([false, false]);
    expect(["Soğutma fanı, cihazı serin tutar.", "Isı sensörü, ısıyı ölçer.", "Dijital ekran, voltajı gösterir.", "Sohbeti kaydet, sonra kapat.",
      "Grupları sessize al, akşam.", "Fan, cihazı soğutur."].map(s => namesThing(s, "tr"))).toEqual([true, true, true, false, false, false]);
    // Codex r1: each of the four case vowels marks the object, on any word before the verb, and the old word checks still hold.
    expect(["Sekmeyi kapat, sonra aç.", "Raporları gönder, hemen.", "Depoyu klonla, sonra aç.", "Ütüyü kapat, sonra çık.", "Proje dosyasını arşivle, sonra kapat.",
      "Kontrol et, ardından devam et."].map(s => namesThing(s, "tr"))).toEqual([false, false, false, false, false, false]);
  });
});
