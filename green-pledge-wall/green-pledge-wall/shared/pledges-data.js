/* =====================================================================
   Green Pledge Wall – shared data
   Used by the pledge page, the wall and the admin page.
   Edit presets, topics, colours and wording here only.
   Arabic text: to be reviewed manually before launch.
   ===================================================================== */
(function () {
  "use strict";

  // Topics of the preset pledges. "interest: true" = shown in
  // "Which topic interests you most?". Colour = leaf colour on the wall.
  // "custom" is used for pledges students write themselves (they pick the colour).
  var TOPICS = [
    { id: "water",       color: "#1E9E93", interest: true,  en: "Water",                ar: "الماء" },
    { id: "waste",       color: "#D98E1F", interest: true,  en: "Waste",                ar: "النفايات" },
    { id: "coasts",      color: "#3478C6", interest: true,  en: "Wildlife & coasts",    ar: "الحياة البرية والسواحل" },
    { id: "environment", color: "#D4AE1E", interest: true,  en: "Healthy environments", ar: "بيئات صحية" },
    { id: "farming",     color: "#4FA33A", interest: true,  en: "Food & farming",       ar: "الغذاء والزراعة" },
    { id: "science",     color: "#8A6AD6", interest: false, en: "Science",              ar: "العلوم" },
    { id: "custom",      color: null,      interest: false, en: "In their own words",   ar: "بكلماتهم" }
  ];

  // Leaf colours a student can pick for a custom pledge (#RRGGBB).
  var SWATCHES = [
    { color: "#2E7D4F", en: "Forest green", ar: "أخضر غابي" },
    { color: "#5DAE4B", en: "Leaf green",   ar: "أخضر ورقي" },
    { color: "#9CC43B", en: "Lime",         ar: "ليموني" },
    { color: "#1E9E93", en: "Teal",         ar: "فيروزي" },
    { color: "#3A8FD6", en: "Sky blue",     ar: "أزرق سماوي" },
    { color: "#2C5FA8", en: "Ocean blue",   ar: "أزرق محيطي" },
    { color: "#E6B422", en: "Sun yellow",   ar: "أصفر شمسي" },
    { color: "#E08A1E", en: "Amber",        ar: "كهرماني" },
    { color: "#C9512B", en: "Autumn red",   ar: "أحمر خريفي" },
    { color: "#8A5BC9", en: "Plum",         ar: "بنفسجي" }
  ];

  // Preset pledges (90 characters or fewer). id: lowercase letters, digits, dashes.
  var PRESETS = [
    { id: "water-save", topic: "water",
      en: "I'll save water on campus and at home: every drop counts in the UAE.",
      ar: "سأوفّر الماء في الجامعة وفي البيت، فكل قطرة مهمة في الإمارات." },
    { id: "refill", topic: "water",
      en: "I'll carry a refillable bottle and say no to single-use plastic.",
      ar: "سأحمل قارورة قابلة لإعادة التعبئة وأرفض البلاستيك أحادي الاستخدام." },
    { id: "food-waste", topic: "waste",
      en: "I'll prevent food waste first: I'll take only what I'll eat.",
      ar: "سأمنع هدر الطعام أولاً، وآخذ فقط ما سآكله." },
    { id: "reuse", topic: "waste",
      en: "I'll reuse and repair before I recycle.",
      ar: "سأعيد الاستخدام وأصلح الأشياء قبل أن أعيد تدويرها." },
    { id: "sort", topic: "waste",
      en: "I'll sort my waste so recycling can work.",
      ar: "سأفرز نفاياتي لتنجح عملية إعادة التدوير." },
    { id: "coast", topic: "coasts",
      en: "I'll keep beaches litter-free to protect coastal life and mangroves.",
      ar: "سأحافظ على نظافة الشواطئ لحماية الحياة الساحلية وأشجار القرم." },
    { id: "energy", topic: "environment",
      en: "I'll switch off lights and devices I'm not using.",
      ar: "سأطفئ الأضواء والأجهزة التي لا أستخدمها." },
    { id: "air", topic: "environment",
      en: "I'll walk or share rides to help keep our air cleaner.",
      ar: "سأمشي أو أشارك التنقل ليبقى هواؤنا أنظف." },
    { id: "farm", topic: "farming",
      en: "I'll choose food grown with care for soil and water.",
      ar: "سأختار طعاماً يُزرع بعناية بالتربة والماء." },
    { id: "evidence", topic: "science",
      en: "I'll check the facts before I share environmental claims.",
      ar: "سأتحقق من المعلومات قبل أن أشارك أي ادعاء بيئي." },
    { id: "learn", topic: "science",
      en: "I'll learn how science can protect nature where I live.",
      ar: "سأتعلم كيف يساعد العلم في حماية الطبيعة من حولي." }
  ];

  var CUSTOM_MAX = 90;

  // Approved consent line (shown under the submit button and saved with each lead).
  var CONSENT = {
    en: "By submitting, you agree to be contacted about suitable programmes.",
    ar: "بإرسال بياناتك، توافق على التواصل معك بشأن البرامج المناسبة لك."
  };

  // Interface text.
  var UI = {
    en: {
      brand: "Green Pledge",
      stepPledge: "Your pledge",
      stepDetails: "Your details",
      title: "Make a green pledge",
      intro: "Pick a pledge or write your own. It will appear as a leaf on the big screen.",
      ownGroup: "Your own words",
      writeOwn: "Write my own pledge",
      customLabel: "Your pledge",
      customPlaceholder: "I will…",
      colourLabel: "Pick a colour for your leaf",
      previewLabel: "Your leaf",
      continue: "Continue",
      detailsTitle: "Your details",
      detailsIntro: "Only your first name appears on the wall.",
      change: "Change",
      name: "Full name",
      phone: "Phone / WhatsApp",
      email: "Email",
      interest: "Which topic interests you most?",
      submit: "Put my leaf on the wall",
      sending: "Sending…",
      doneTitle: "Your leaf is on the wall!",
      doneBody: "Look for it on the big screen at the booth.",
      doneQueued: "Saved on this tablet. Your leaf will appear on the wall when the connection is back.",
      nextPerson: "Next person",
      paused: "Pledging is paused right now. Please visit the booth.",
      errPick: "Pick a pledge or write your own.",
      errCustom: "Write your pledge (up to 90 characters).",
      errColour: "Pick a colour for your leaf.",
      errName: "Enter your full name.",
      errPhone: "Enter a valid phone number, for example +971 50 123 4567.",
      errEmail: "Enter a valid email address, for example name@example.com.",
      errInterest: "Choose the topic that interests you most.",
      errNetwork: "Couldn't send your pledge. Check your connection and try again.",
      errServer: "Your details weren't accepted. Check each field and try again.",
      errWait: "You just made a pledge. Wait a few seconds before making another.",
      notConfigured: "This page isn't connected to the database yet. Fill in config.js."
    },
    ar: {
      brand: "التعهّد الأخضر",
      stepPledge: "تعهّدك",
      stepDetails: "بياناتك",
      title: "قدّم تعهّدك الأخضر",
      intro: "اختر تعهّداً أو اكتب تعهّدك الخاص، وسيظهر كورقة شجر على الشاشة الكبيرة.",
      ownGroup: "بكلماتك",
      writeOwn: "اكتب تعهّدك الخاص",
      customLabel: "تعهّدك",
      customPlaceholder: "أتعهّد بأن…",
      colourLabel: "اختر لوناً لورقتك",
      previewLabel: "ورقتك",
      continue: "متابعة",
      detailsTitle: "بياناتك",
      detailsIntro: "يظهر اسمك الأول فقط على الشاشة.",
      change: "تغيير",
      name: "الاسم الكامل",
      phone: "الهاتف / واتساب",
      email: "البريد الإلكتروني",
      interest: "ما الموضوع الذي يهمّك أكثر؟",
      submit: "أضف ورقتي إلى الشاشة",
      sending: "جارٍ الإرسال…",
      doneTitle: "ورقتك على الشاشة الآن!",
      doneBody: "ابحث عنها على الشاشة الكبيرة في الجناح.",
      doneQueued: "تم الحفظ على هذا الجهاز، وستظهر ورقتك على الشاشة عند عودة الاتصال.",
      nextPerson: "الشخص التالي",
      paused: "التعهّدات متوقفة حالياً. يرجى زيارة الجناح.",
      errPick: "اختر تعهّداً أو اكتب تعهّدك الخاص.",
      errCustom: "اكتب تعهّدك (حتى 90 حرفاً).",
      errColour: "اختر لوناً لورقتك.",
      errName: "أدخل اسمك الكامل.",
      errPhone: "أدخل رقم هاتف صحيحاً، مثل ‎+971 50 123 4567.",
      errEmail: "أدخل بريداً إلكترونياً صحيحاً، مثل name@example.com.",
      errInterest: "اختر الموضوع الذي يهمّك أكثر.",
      errNetwork: "تعذّر إرسال تعهّدك. تحقّق من الاتصال وحاول مرة أخرى.",
      errServer: "لم تُقبل بياناتك. تحقّق من كل حقل وحاول مرة أخرى.",
      errWait: "لقد قدّمت تعهّداً للتو. انتظر قليلاً قبل تقديم تعهّد آخر.",
      notConfigured: "هذه الصفحة غير متصلة بقاعدة البيانات بعد. املأ ملف config.js."
    }
  };

  // One leaf shape, used everywhere (viewBox 0 0 100 100, tip at top-right).
  var LEAF_PATH = "M8 92 C8 46 38 10 92 8 C90 60 56 92 8 92 Z";
  var LEAF_VEIN = "M8 92 C34 66 58 40 88 12";

  // Same checks as the database, so most mistakes are caught before sending.
  var RULES = {
    phone: /^\+?[0-9 ()-]{7,20}$/,
    email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
    nameMin: 2, nameMax: 80, emailMax: 120
  };

  function topicById(id) {
    for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i].id === id) return TOPICS[i];
    return null;
  }
  function presetById(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return null;
  }
  // Text of a stored pledge row, in its own language.
  function pledgeText(row) {
    if (row.custom_text) return row.custom_text;
    var p = presetById(row.preset_id);
    if (!p) return "";
    return row.lang === "ar" ? p.ar : p.en;
  }
  function leafSVG(color, extraClass) {
    return '<svg class="leaf ' + (extraClass || "") + '" viewBox="0 0 100 100" aria-hidden="true">' +
      '<path d="' + LEAF_PATH + '" fill="' + color + '"/>' +
      '<path d="' + LEAF_VEIN + '" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="3" stroke-linecap="round"/>' +
      "</svg>";
  }

  window.PLEDGE_DATA = {
    TOPICS: TOPICS, SWATCHES: SWATCHES, PRESETS: PRESETS, CUSTOM_MAX: CUSTOM_MAX, CONSENT: CONSENT, UI: UI,
    LEAF_PATH: LEAF_PATH, LEAF_VEIN: LEAF_VEIN, RULES: RULES,
    topicById: topicById, presetById: presetById, pledgeText: pledgeText, leafSVG: leafSVG
  };
})();
