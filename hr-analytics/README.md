# HR Analytics Platform - Xodimlar Davomati va Intizomi

Professional HR Analytics Platform - Excel asosida ishlaydigan, zamonaviy React dashboard.

## 🎯 Xususiyatlar

### Import & Update Logic
- **Excel/CSV Drag-and-Drop** - Fayllarni oson yuklash
- **Preview Table** - Import qilishdan oldin ko'rish
- **Auto-detect Mapping** - Ustunlarni avtomatik aniqlash
- **Error Validation** - Xatoliklarni tekshirish
- **Smart Update Strategy**:
  - Xodim ID + Sana mavjud → eski yozuv almashtiriladi
  - Xodim ID mavjud, sana yo'q → yangi yozuv qo'shiladi
  - Yangi xodim → yangi profil yaratiladi
  - Duplicate yozuvlar yo'q

### Hisob-kitob Logikasi
- **Ish vaqti**: 9:00 - 18:00
- **Kech qolish toleransi**: 5 daqiqa (9:05 gacha normal)
- **Erta ketish toleransi**: 10 daqiqa (17:50 dan keyin normal)
- **Avtomatik hisoblash**:
  - Late (kechikish daqiqalari)
  - Early leave (erta ketish daqiqalari)
  - Absent (kelmaganlik)
  - Work hours (ish soatlari)
  - Discipline score (KPI)

### Analitika
- Eng ko'p kech qolganlar TOP-10
- Eng ko'p erta ketganlar TOP-10
- Eng ko'p kelmaganlar TOP-10
- Eng tartibli xodimlar TOP-10
- Bo'limlar bo'yicha taqqoslash
- Qoidabuzarlik foizlari

### Vizualizatsiya
- **Pie Chart** - Davomat holati taqsimoti
- **Bar Chart** - Intizom ballari, qoidabuzarliklar
- **Area Chart** - Kunlik trend
- **Heatmap Calendar** - Oylik davomat
- Har bir grafik ostida jadval va export

### Admin Panel
- 🧹 Bazani tozalash (RESET ALL DATA)
- 🔄 Qayta import qilish
- ⏪ Import rollback (oxirgi yuklashni bekor qilish)
- 📦 Import history log

## 🛠 Texnologiyalar

- **React 18** + TypeScript
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **Radix UI** - Accessible components
- **Zustand** - State management
- **Recharts** - Charts
- **XLSX** - Excel parsing
- **date-fns** - Date utilities
- **Lucide React** - Icons

## 📦 O'rnatish

```bash
# Loyihaga o'ting
cd hr-analytics

# Dependencies o'rnating
npm install

# Development server
npm run dev

# Production build
npm run build
```

## 📂 Excel Fayl Formati

Import qilinadigan fayl quyidagi ustunlarga ega bo'lishi kerak:

| Ustun | Tavsif |
|-------|--------|
| Name | Xodim F.I.SH |
| ID | Unikal xodim ID |
| Department | Bo'lim |
| Sana ustunlari (12-01, 12-02, …) | Status kodlari (W, L, E, LE, A, NS, H) |

**Sana ustunlari DYNAMIC** - oyga qarab soni o'zgaradi.

### Status Kodlari

| Kod | Tavsif | Qoidabuzarlik |
|-----|--------|---------------|
| **W** | Well - Tartibli kelgan | ❌ Yo'q |
| **L** | Late - Kech qolgan | ✅ Ha |
| **E** | Early leave - Erta ketgan | ✅ Ha |
| **LE** | Late + Early - Ikkalasi | ✅ Ha |
| **A** | Absent - Kelmagan | ✅ Ha |
| **NS** | No Schedule - Ish kuni emas | ❌ Yo'q |
| **H** | Holiday - Bayram | ❌ Yo'q |

### Sana ustuni formatlari
- `12-01` yoki `12/01`
- `2025-12-01`
- `01.12` yoki `01.12.2025`

### Namuna fayl
```
Name              | ID    | Department           | 12-01 | 12-02 | 12-03 | ...
------------------|-------|----------------------|-------|-------|-------|----
FERUZA SOBIRJONOVA| 03765 | All Departments>ACC  | L     | A     | L     | ...
ZULAYXO PAZLIDDINOVA| 03261| All Departments>ACC | E     | E     | E     | ...
```

## 🎨 UI/UX

- Modern dashboard dizayni
- Responsive (mobile, tablet, desktop)
- Dark / Light mode
- Accessibility (WCAG)
- Import progress indicator
- Error & empty states
- Animated transitions

## 📊 Foydalanish

1. **Import** - Excel faylni yuklang
2. **Dashboard** - Umumiy statistikani ko'ring
3. **Xodimlar** - Batafsil ro'yxat va filter
4. **Grafiklar** - Vizual tahlil
5. **Sozlamalar** - Admin panel

## 📝 Litsenziya

MIT License

---

**HR Analytics Platform** © 2024
