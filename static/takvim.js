/* Türkçe takvim — tüm tarih/saat alanlarını flatpickr ile geliştirir.
   - Tarih alanları: dd.mm.yyyy gösterilir, sunucuya Y-m-d (ISO) gönderilir.
   - Saat alanları: 24 saat formatı (Türkiye saati).
   Sunucu tarafı değişmeden çalışır; sadece görünüm Türkçeleşir. */
(function () {
    if (!window.flatpickr) return;
    try { flatpickr.localize(flatpickr.l10ns.tr); } catch (e) {}

    var ortak = { locale: "tr", allowInput: true, disableMobile: true };

    // Tarih alanları
    document.querySelectorAll('input[type="date"]').forEach(function (el) {
        flatpickr(el, Object.assign({}, ortak, {
            dateFormat: "Y-m-d",     // sunucuya gönderilen değer (değişmez)
            altInput: true,          // kullanıcıya görünen alan
            altFormat: "d.m.Y",      // gg.aa.yyyy
            altInputClass: el.className + " tarih-alt",
            minDate: el.getAttribute("min") || null,
            maxDate: el.getAttribute("max") || null
        }));
    });

    // Saat alanları — 24 saat
    document.querySelectorAll('input[type="time"]').forEach(function (el) {
        flatpickr(el, Object.assign({}, ortak, {
            enableTime: true,
            noCalendar: true,
            dateFormat: "H:i",
            time_24hr: true,
            minuteIncrement: 5
        }));
    });
})();
