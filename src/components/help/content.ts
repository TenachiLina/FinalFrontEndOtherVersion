// ─────────────────────────────────────────────────────────────────────────
// Help page content: guides and FAQ in English, French and Arabic.
//
// `path` ties an entry to a page: it is only shown to people who can open
// that page (role + company features), so nobody reads about screens they
// don't have. Entries without `path` are shown to everyone.
// ─────────────────────────────────────────────────────────────────────────

export interface Text {
  en: string;
  fr: string;
  ar: string;
}

export interface Steps {
  en: string[];
  fr: string[];
  ar: string[];
}

export interface Guide {
  id: string;
  path?: string;
  title: Text;
  intro: Text;
  steps: Steps;
}

export interface Faq {
  id: string;
  path?: string;
  q: Text;
  a: Text;
}

export const GUIDES: Guide[] = [
  {
    id: "getting-started",
    title: { en: "Getting started", fr: "Premiers pas", ar: "البداية" },
    intro: {
      en: "The basics: signing in, finding your way around and personalising the app.",
      fr: "Les bases : se connecter, se repérer et personnaliser l'application.",
      ar: "الأساسيات: تسجيل الدخول والتنقل وتخصيص التطبيق.",
    },
    steps: {
      en: [
        "Sign in with the email and password your admin gave you. Use your company's own sign-in link if you have one.",
        "The Home page shows today at a glance and shortcuts to the tasks you can do.",
        "Use the menu on the side to open every page. On a phone, tap the menu button at the top.",
        "Pick your language (English, Français, العربية) with the globe button at the top. Your choice is remembered on this device.",
        "Switch between light and dark mode with the moon/sun button.",
        "Change your password from your name in the top corner → Change password.",
      ],
      fr: [
        "Connectez-vous avec l'e-mail et le mot de passe donnés par votre administrateur. Utilisez le lien de connexion de votre entreprise si vous en avez un.",
        "La page d'accueil résume la journée et propose des raccourcis vers vos tâches.",
        "Le menu latéral ouvre toutes les pages. Sur téléphone, touchez le bouton menu en haut.",
        "Choisissez votre langue (English, Français, العربية) avec le bouton globe en haut. Votre choix est mémorisé sur cet appareil.",
        "Passez du mode clair au mode sombre avec le bouton lune/soleil.",
        "Changez votre mot de passe depuis votre nom en haut → Changer le mot de passe.",
      ],
      ar: [
        "سجّل الدخول بالبريد الإلكتروني وكلمة المرور اللذين أعطاك إياهما المدير. استخدم رابط الدخول الخاص بشركتك إن وُجد.",
        "تعرض الصفحة الرئيسية ملخص اليوم واختصارات للمهام المتاحة لك.",
        "تفتح القائمة الجانبية كل الصفحات. على الهاتف، اضغط زر القائمة في الأعلى.",
        "اختر لغتك (English أو Français أو العربية) من زر الكرة الأرضية في الأعلى. يُحفظ اختيارك على هذا الجهاز.",
        "بدّل بين الوضع الفاتح والداكن بزر القمر/الشمس.",
        "غيّر كلمة المرور من اسمك في الأعلى ← تغيير كلمة المرور.",
      ],
    },
  },
  {
    id: "plan-week",
    path: "/calendar/DoPlanning",
    title: { en: "Plan the week", fr: "Planifier la semaine", ar: "تخطيط الأسبوع" },
    intro: {
      en: "Assign employees to shifts and posts, day by day, then copy the plan to other days.",
      fr: "Affectez les employés aux créneaux et aux postes, jour par jour, puis copiez le planning sur d'autres jours.",
      ar: "عيّن الموظفين في الفترات والمناصب يومًا بيوم، ثم انسخ التخطيط إلى أيام أخرى.",
    },
    steps: {
      en: [
        "Open Planning → New Planning and choose a day in the calendar.",
        "Click a cell (a post and a shift) to add an assignment.",
        "Type the main employee's name or number. Optionally add backup employees who can replace them.",
        "To split the shift, add tasks with a start time, end time and name.",
        "Click Save to keep the plan for this day only.",
        "Use “Save to every …” to repeat it on the same weekday, or “Copy Month” to copy a whole month.",
        "You can also import a day's planning from an Excel or PDF file, or copy it from another date.",
      ],
      fr: [
        "Ouvrez Planning → Nouveau planning et choisissez un jour dans le calendrier.",
        "Cliquez sur une case (un poste et un créneau) pour ajouter une affectation.",
        "Saisissez le nom ou le numéro de l'employé principal. Ajoutez si besoin des remplaçants.",
        "Pour découper le créneau, ajoutez des tâches avec heure de début, heure de fin et nom.",
        "Cliquez sur Enregistrer pour garder le planning de ce jour uniquement.",
        "Utilisez « Enregistrer pour chaque … » pour le répéter le même jour de la semaine, ou « Copier le mois » pour copier un mois entier.",
        "Vous pouvez aussi importer le planning d'un jour depuis un fichier Excel ou PDF, ou le copier depuis une autre date.",
      ],
      ar: [
        "افتح التخطيط ← تخطيط جديد واختر يومًا من التقويم.",
        "اضغط على خانة (منصب وفترة) لإضافة تعيين.",
        "اكتب اسم الموظف الرئيسي أو رقمه، وأضف بدلاء إن أردت.",
        "لتقسيم الفترة، أضف مهامًا بوقت بداية ووقت نهاية واسم.",
        "اضغط «حفظ» لحفظ التخطيط لهذا اليوم فقط.",
        "استخدم «حفظ لكل يوم …» لتكراره في نفس يوم الأسبوع، أو «نسخ الشهر» لنسخ شهر كامل.",
        "يمكنك أيضًا استيراد تخطيط يوم من ملف Excel أو PDF، أو نسخه من تاريخ آخر.",
      ],
    },
  },
  {
    id: "view-planning",
    path: "/calendar/ViewPlanning",
    title: { en: "View and export the planning", fr: "Consulter et exporter le planning", ar: "عرض التخطيط وتصديره" },
    intro: {
      en: "See who works when, and share the planning as PDF or Excel.",
      fr: "Voyez qui travaille quand et partagez le planning en PDF ou Excel.",
      ar: "اعرف من يعمل ومتى، وشارك التخطيط بصيغة PDF أو Excel.",
    },
    steps: {
      en: [
        "Open Planning → View Planning and pick a day in the calendar.",
        "Click a name to see the employee's details and backups.",
        "Use Export Day for one day, or the weekly exports (manager or employees version).",
        "Choose PDF to print or Excel to edit.",
      ],
      fr: [
        "Ouvrez Planning → Voir le planning et choisissez un jour.",
        "Cliquez sur un nom pour voir les détails de l'employé et ses remplaçants.",
        "Utilisez Exporter le jour pour une journée, ou les exports hebdomadaires (version responsable ou employés).",
        "Choisissez PDF pour imprimer ou Excel pour modifier.",
      ],
      ar: [
        "افتح التخطيط ← عرض التخطيط واختر يومًا.",
        "اضغط على اسم لرؤية تفاصيل الموظف وبدلائه.",
        "استخدم «تصدير اليوم» ليوم واحد، أو التصدير الأسبوعي (نسخة المسؤول أو الموظفين).",
        "اختر PDF للطباعة أو Excel للتعديل.",
      ],
    },
  },
  {
    id: "shifts",
    path: "/calendar/ShiftsManagment",
    title: { en: "Manage shifts", fr: "Gérer les créneaux", ar: "إدارة الفترات" },
    intro: {
      en: "Shifts are the time slots used in the planning (for example 08:00 – 16:00).",
      fr: "Les créneaux sont les plages horaires utilisées dans le planning (par exemple 08:00 – 16:00).",
      ar: "الفترات هي الأوقات المستخدمة في التخطيط (مثل 08:00 – 16:00).",
    },
    steps: {
      en: [
        "Open Planning → Shifts Management.",
        "Click Add Shift and enter the start and end times. Night shifts can end after midnight.",
        "Archive shifts you don't use this season; restore them later from the Archived tab.",
        "Delete only shifts you will never use again.",
      ],
      fr: [
        "Ouvrez Planning → Gestion des créneaux.",
        "Cliquez sur Ajouter un créneau et saisissez les heures de début et de fin. Un créneau de nuit peut finir après minuit.",
        "Archivez les créneaux inutilisés cette saison ; restaurez-les plus tard depuis l'onglet Archivés.",
        "Ne supprimez que les créneaux que vous n'utiliserez plus jamais.",
      ],
      ar: [
        "افتح التخطيط ← إدارة الفترات.",
        "اضغط «إضافة فترة» وأدخل وقت البداية والنهاية. يمكن لفترة الليل أن تنتهي بعد منتصف الليل.",
        "أرشف الفترات غير المستخدمة هذا الموسم، واستعدها لاحقًا من تبويب المؤرشفة.",
        "لا تحذف إلا الفترات التي لن تستخدمها مجددًا.",
      ],
    },
  },
  {
    id: "kiosk",
    path: "/kiosk",
    title: { en: "Clock in with the kiosk", fr: "Pointer avec la borne", ar: "تسجيل الحضور عبر الجهاز" },
    intro: {
      en: "A tablet at the entrance where staff clock themselves in and out.",
      fr: "Une tablette à l'entrée où le personnel pointe son arrivée et son départ.",
      ar: "جهاز لوحي عند المدخل يسجّل فيه الموظفون حضورهم وانصرافهم.",
    },
    steps: {
      en: [
        "An admin creates a user with the role “Clock-in kiosk” on the Users page.",
        "Sign in with that account on the tablet. It only shows the kiosk.",
        "Staff find their name (or number) and tap it.",
        "They press Clock in when they arrive and Clock out when they leave.",
        "The time is recorded by the server, so it can't be changed on the tablet.",
        "Admins and managers can also open the kiosk from Clock In/Out → Clock-in kiosk.",
      ],
      fr: [
        "Un administrateur crée un utilisateur avec le rôle « Borne de pointage » dans la page Utilisateurs.",
        "Connectez-vous avec ce compte sur la tablette. Elle n'affiche que la borne.",
        "Le personnel cherche son nom (ou numéro) et le touche.",
        "Il appuie sur Arrivée en arrivant et sur Départ en partant.",
        "L'heure est enregistrée par le serveur : impossible de la modifier sur la tablette.",
        "Les administrateurs et responsables peuvent aussi ouvrir la borne depuis Pointage → Borne de pointage.",
      ],
      ar: [
        "ينشئ المدير مستخدمًا بدور «جهاز تسجيل الحضور» في صفحة المستخدمين.",
        "سجّل الدخول بهذا الحساب على الجهاز اللوحي، فلن يعرض إلا شاشة الحضور.",
        "يبحث الموظف عن اسمه (أو رقمه) ويضغط عليه.",
        "يضغط «تسجيل الحضور» عند الوصول و«تسجيل الانصراف» عند المغادرة.",
        "يُسجَّل الوقت من الخادم، فلا يمكن تغييره من الجهاز.",
        "يمكن للمدير والمسؤول أيضًا فتح الجهاز من تسجيل الحضور ← جهاز تسجيل الحضور.",
      ],
    },
  },
  {
    id: "history",
    path: "/clockinpagehistory",
    title: { en: "Check and correct clock-ins", fr: "Vérifier et corriger les pointages", ar: "مراجعة تسجيلات الحضور وتصحيحها" },
    intro: {
      en: "All clock-ins from the machine and the kiosk, with tools to fix mistakes.",
      fr: "Tous les pointages de la pointeuse et de la borne, avec des outils pour corriger les erreurs.",
      ar: "كل تسجيلات الحضور من الجهاز والشاشة، مع أدوات لتصحيح الأخطاء.",
    },
    steps: {
      en: [
        "Open Clock In/Out → Clock In/Out History and choose the dates.",
        "Search for an employee to see only their clock-ins.",
        "Double-click a time to change it, or double-click an empty clock-out to add one.",
        "Use Add clock-in for a forgotten clock-in; worked hours, lateness and overtime are recalculated.",
        "Select rows and press Delete to remove wrong clock-ins.",
      ],
      fr: [
        "Ouvrez Pointage → Historique des pointages et choisissez les dates.",
        "Recherchez un employé pour ne voir que ses pointages.",
        "Double-cliquez sur une heure pour la modifier, ou sur un départ vide pour l'ajouter.",
        "Utilisez Ajouter un pointage pour un oubli ; heures travaillées, retard et heures sup. sont recalculés.",
        "Sélectionnez des lignes et appuyez sur Supprimer pour retirer les pointages erronés.",
      ],
      ar: [
        "افتح تسجيل الحضور ← سجل الحضور والانصراف واختر التواريخ.",
        "ابحث عن موظف لرؤية تسجيلاته فقط.",
        "انقر مرتين على وقت لتعديله، أو على انصراف فارغ لإضافته.",
        "استخدم «إضافة تسجيل» عند النسيان، فتُعاد حساب ساعات العمل والتأخر والساعات الإضافية.",
        "حدّد الصفوف واضغط «حذف» لإزالة التسجيلات الخاطئة.",
      ],
    },
  },
  {
    id: "machine",
    path: "/clockinfacerecognitionpage",
    title: { en: "Face-recognition machine", fr: "Pointeuse à reconnaissance faciale", ar: "جهاز التعرف على الوجه" },
    intro: {
      en: "Use a ZKTeco machine so staff clock in with their face.",
      fr: "Utilisez une pointeuse ZKTeco pour que le personnel pointe avec son visage.",
      ar: "استخدم جهاز ZKTeco ليسجّل الموظفون حضورهم بوجوههم.",
    },
    steps: {
      en: [
        "Ask support to register your machine's serial number for your company.",
        "On the machine, each employee's number must match their employee number in the app.",
        "Clock-ins arrive automatically. Open Clock In/Out with Face recognition to see today's hours.",
        "If the machine's clock uses another time zone, set it in Company settings.",
      ],
      fr: [
        "Demandez au support d'enregistrer le numéro de série de votre pointeuse pour votre entreprise.",
        "Sur la pointeuse, le numéro de chaque employé doit correspondre à son numéro d'employé dans l'application.",
        "Les pointages arrivent automatiquement. Ouvrez Pointage par reconnaissance faciale pour voir les heures du jour.",
        "Si l'horloge de la pointeuse utilise un autre fuseau horaire, réglez-le dans Paramètres de l'entreprise.",
      ],
      ar: [
        "اطلب من الدعم تسجيل الرقم التسلسلي لجهازك لشركتك.",
        "على الجهاز، يجب أن يطابق رقم كل موظف رقمه في التطبيق.",
        "تصل التسجيلات تلقائيًا. افتح «تسجيل الحضور بالتعرف على الوجه» لرؤية ساعات اليوم.",
        "إذا كانت ساعة الجهاز على منطقة زمنية أخرى، اضبطها في إعدادات الشركة.",
      ],
    },
  },
  {
    id: "employees",
    path: "/addEmployeeForm",
    title: { en: "Add and manage employees", fr: "Ajouter et gérer les employés", ar: "إضافة الموظفين وإدارتهم" },
    intro: {
      en: "Every person who works shifts needs an employee record.",
      fr: "Chaque personne qui travaille sur des créneaux a besoin d'une fiche employé.",
      ar: "كل من يعمل في الفترات يحتاج إلى سجل موظف.",
    },
    steps: {
      en: [
        "Open Employees Management → Add Employee.",
        "Enter a unique employee number. Use the same number as on the clocking machine.",
        "Fill in the name and base salary; address, phone and photo are optional.",
        "Edit or delete employees from Employees Management → View Employees.",
      ],
      fr: [
        "Ouvrez Gestion des employés → Ajouter un employé.",
        "Saisissez un numéro d'employé unique, le même que sur la pointeuse.",
        "Renseignez le nom et le salaire de base ; adresse, téléphone et photo sont facultatifs.",
        "Modifiez ou supprimez des employés depuis Gestion des employés → Voir les employés.",
      ],
      ar: [
        "افتح إدارة الموظفين ← إضافة موظف.",
        "أدخل رقم موظف فريدًا، وهو نفس الرقم المسجل على جهاز الحضور.",
        "املأ الاسم والراتب الأساسي؛ العنوان والهاتف والصورة اختيارية.",
        "عدّل الموظفين أو احذفهم من إدارة الموظفين ← عرض الموظفين.",
      ],
    },
  },
  {
    id: "payroll",
    path: "/reporting/monthly-payroll",
    title: { en: "Payroll and advances", fr: "Paie et avances", ar: "الرواتب والتسبيقات" },
    intro: {
      en: "Pay is calculated from worked hours, minus penalties, consumption and advances, plus bonuses.",
      fr: "La paie est calculée à partir des heures travaillées, moins pénalités, consommation et avances, plus les primes.",
      ar: "يُحسب الأجر من ساعات العمل، ناقص الغرامات والاستهلاك والتسبيقات، زائد المكافآت.",
    },
    steps: {
      en: [
        "Each week, open Reporting → Weekly Advances to see the advance each employee can get, and give it.",
        "At the end of the month, open Reporting → Monthly Payroll and pick the month.",
        "Check each line: hours, advances, consumption, penalties, bonuses, gross and net pay.",
        "Click Details on an employee to see their days one by one.",
        "Payroll rules (hours per day, working days, advance %) are set in Company settings.",
      ],
      fr: [
        "Chaque semaine, ouvrez Rapports → Avances hebdomadaires pour voir l'avance possible de chaque employé et l'accorder.",
        "En fin de mois, ouvrez Rapports → Paie mensuelle et choisissez le mois.",
        "Vérifiez chaque ligne : heures, avances, consommation, pénalités, primes, brut et net.",
        "Cliquez sur Détails pour voir les jours d'un employé un par un.",
        "Les règles de paie (heures par jour, jours travaillés, % d'avance) se règlent dans Paramètres de l'entreprise.",
      ],
      ar: [
        "كل أسبوع، افتح التقارير ← التسبيقات الأسبوعية لرؤية التسبيق المتاح لكل موظف ومنحه.",
        "في نهاية الشهر، افتح التقارير ← الرواتب الشهرية واختر الشهر.",
        "راجع كل سطر: الساعات والتسبيقات والاستهلاك والغرامات والمكافآت والخام والصافي.",
        "اضغط «التفاصيل» لرؤية أيام الموظف يومًا بيوم.",
        "تُضبط قواعد الرواتب (ساعات اليوم، أيام العمل، نسبة التسبيق) في إعدادات الشركة.",
      ],
    },
  },
  {
    id: "bonuses",
    path: "/reporting/bonuses/give",
    title: { en: "Give bonuses", fr: "Accorder des primes", ar: "منح المكافآت" },
    intro: {
      en: "Reward employees; bonuses are added to the month's net pay.",
      fr: "Récompensez les employés ; les primes s'ajoutent au net du mois.",
      ar: "كافئ الموظفين؛ تُضاف المكافآت إلى صافي أجر الشهر.",
    },
    steps: {
      en: [
        "Open Reporting → Bonuses → Give Bonuses.",
        "Click Give Bonus next to an employee, enter the amount, date and reason.",
        "See or cancel past bonuses in Bonuses → History.",
      ],
      fr: [
        "Ouvrez Rapports → Primes → Donner des primes.",
        "Cliquez sur Accorder une prime à côté d'un employé, saisissez le montant, la date et le motif.",
        "Consultez ou annulez les primes passées dans Primes → Historique.",
      ],
      ar: [
        "افتح التقارير ← المكافآت ← منح المكافآت.",
        "اضغط «منح مكافأة» بجانب الموظف، وأدخل المبلغ والتاريخ والسبب.",
        "اطّلع على المكافآت السابقة أو ألغها من المكافآت ← السجل.",
      ],
    },
  },
  {
    id: "users",
    path: "/users",
    title: { en: "Users and roles", fr: "Utilisateurs et rôles", ar: "المستخدمون والأدوار" },
    intro: {
      en: "Decide who can sign in and what they can see.",
      fr: "Décidez qui peut se connecter et ce qu'il peut voir.",
      ar: "حدّد من يمكنه تسجيل الدخول وما يمكنه رؤيته.",
    },
    steps: {
      en: [
        "Open Users and click Add user.",
        "Admin: full access. Manager: planning, shifts and clock-in, but no payroll or employee management. Clock-in kiosk: only the kiosk.",
        "Give them a temporary password; they can change it after signing in.",
        "Disable a user to block access without deleting them; use Reset password if they forget theirs.",
      ],
      fr: [
        "Ouvrez Utilisateurs et cliquez sur Ajouter un utilisateur.",
        "Administrateur : accès complet. Responsable : planning, créneaux et pointage, sans paie ni gestion des employés. Borne de pointage : uniquement la borne.",
        "Donnez un mot de passe temporaire ; la personne pourra le changer après connexion.",
        "Désactivez un utilisateur pour bloquer l'accès sans le supprimer ; utilisez Réinitialiser le mot de passe en cas d'oubli.",
      ],
      ar: [
        "افتح المستخدمون واضغط «إضافة مستخدم».",
        "المدير: صلاحيات كاملة. المسؤول: التخطيط والفترات والحضور دون الرواتب وإدارة الموظفين. جهاز الحضور: شاشة الحضور فقط.",
        "أعطه كلمة مرور مؤقتة يمكنه تغييرها بعد تسجيل الدخول.",
        "عطّل المستخدم لمنع الدخول دون حذفه؛ واستخدم «إعادة تعيين كلمة المرور» عند النسيان.",
      ],
    },
  },
  {
    id: "settings",
    path: "/company-settings",
    title: { en: "Company settings", fr: "Paramètres de l'entreprise", ar: "إعدادات الشركة" },
    intro: {
      en: "Adapt the app to how your company works.",
      fr: "Adaptez l'application au fonctionnement de votre entreprise.",
      ar: "كيّف التطبيق مع طريقة عمل شركتك.",
    },
    steps: {
      en: [
        "Open Company settings.",
        "Set the default language for people who haven't picked one.",
        "Set the currency shown next to amounts and the clocking machine's time zone.",
        "Set the payroll rules, then click Save settings. They apply to all reports.",
      ],
      fr: [
        "Ouvrez Paramètres de l'entreprise.",
        "Choisissez la langue par défaut pour ceux qui n'en ont pas choisi.",
        "Réglez la devise affichée et le fuseau horaire de la pointeuse.",
        "Réglez les règles de paie, puis cliquez sur Enregistrer les paramètres. Elles s'appliquent à tous les rapports.",
      ],
      ar: [
        "افتح إعدادات الشركة.",
        "حدّد اللغة الافتراضية لمن لم يختر لغة.",
        "حدّد العملة المعروضة والمنطقة الزمنية لجهاز الحضور.",
        "اضبط قواعد الرواتب ثم اضغط «حفظ الإعدادات». تُطبَّق على كل التقارير.",
      ],
    },
  },
];

export const FAQ: Faq[] = [
  {
    id: "forgot-password",
    q: { en: "I forgot my password. What do I do?", fr: "J'ai oublié mon mot de passe. Que faire ?", ar: "نسيت كلمة المرور. ماذا أفعل؟" },
    a: {
      en: "Ask an admin of your company: they can set a new one from Users → Reset password. Then sign in and change it.",
      fr: "Demandez à un administrateur de votre entreprise : il peut en définir un nouveau depuis Utilisateurs → Réinitialiser le mot de passe. Connectez-vous ensuite et changez-le.",
      ar: "اطلب من مدير شركتك: يمكنه تعيين كلمة جديدة من المستخدمون ← إعادة تعيين كلمة المرور. ثم سجّل الدخول وغيّرها.",
    },
  },
  {
    id: "forgot-clock-out",
    path: "/clockinpagehistory",
    q: { en: "An employee forgot to clock out.", fr: "Un employé a oublié de pointer son départ.", ar: "نسي موظف تسجيل انصرافه." },
    a: {
      en: "Open Clock-in history, find the day, and double-click the empty clock-out to add the right time. On the kiosk, they can still clock in the next day.",
      fr: "Ouvrez l'historique des pointages, trouvez le jour et double-cliquez sur le départ vide pour ajouter la bonne heure. Sur la borne, il pourra quand même pointer le lendemain.",
      ar: "افتح سجل الحضور، وابحث عن اليوم، وانقر مرتين على الانصراف الفارغ لإضافة الوقت الصحيح. ويمكنه تسجيل الحضور في اليوم التالي عبر الجهاز كالمعتاد.",
    },
  },
  {
    id: "wrong-time",
    path: "/clockinpagehistory",
    q: { en: "A clock-in time is wrong.", fr: "Une heure de pointage est fausse.", ar: "وقت تسجيل الحضور خاطئ." },
    a: {
      en: "In Clock-in history, double-click the time and enter the correct one. Worked hours, lateness and overtime are recalculated.",
      fr: "Dans l'historique des pointages, double-cliquez sur l'heure et saisissez la bonne. Heures travaillées, retard et heures sup. sont recalculés.",
      ar: "في سجل الحضور، انقر مرتين على الوقت وأدخل الوقت الصحيح، فتُعاد حساب ساعات العمل والتأخر والساعات الإضافية.",
    },
  },
  {
    id: "not-on-kiosk",
    path: "/kiosk",
    q: { en: "An employee isn't on the kiosk list.", fr: "Un employé n'apparaît pas sur la borne.", ar: "موظف لا يظهر في قائمة الجهاز." },
    a: {
      en: "They must first be added as an employee (Employees Management → Add Employee). The list refreshes every 30 seconds.",
      fr: "Il doit d'abord être ajouté comme employé (Gestion des employés → Ajouter un employé). La liste se met à jour toutes les 30 secondes.",
      ar: "يجب إضافته أولًا كموظف (إدارة الموظفين ← إضافة موظف). تتحدث القائمة كل 30 ثانية.",
    },
  },
  {
    id: "machine-missing",
    path: "/clockinfacerecognitionpage",
    q: { en: "Clock-ins from the machine don't appear.", fr: "Les pointages de la pointeuse n'apparaissent pas.", ar: "تسجيلات الجهاز لا تظهر." },
    a: {
      en: "Check that the machine is online and that its serial number is registered for your company (ask support). Also check the employee numbers match.",
      fr: "Vérifiez que la pointeuse est en ligne et que son numéro de série est enregistré pour votre entreprise (demandez au support). Vérifiez aussi que les numéros d'employés correspondent.",
      ar: "تأكد من اتصال الجهاز بالإنترنت ومن تسجيل رقمه التسلسلي لشركتك (اسأل الدعم)، ومن تطابق أرقام الموظفين.",
    },
  },
  {
    id: "missing-menu",
    q: { en: "Why can't I see some menus (like Payroll)?", fr: "Pourquoi certains menus (comme la Paie) n'apparaissent pas ?", ar: "لماذا لا أرى بعض القوائم (مثل الرواتب)؟" },
    a: {
      en: "Menus depend on your role: managers don't see payroll, reports or employee management. Some features may also be switched off for your company.",
      fr: "Les menus dépendent de votre rôle : les responsables ne voient pas la paie, les rapports ni la gestion des employés. Certaines fonctionnalités peuvent aussi être désactivées pour votre entreprise.",
      ar: "تعتمد القوائم على دورك: لا يرى المسؤول الرواتب والتقارير وإدارة الموظفين. وقد تكون بعض الميزات غير مفعّلة لشركتك.",
    },
  },
  {
    id: "language",
    q: { en: "How do I change the language?", fr: "Comment changer de langue ?", ar: "كيف أغيّر اللغة؟" },
    a: {
      en: "Use the globe button at the top of the page. Admins can set the default language in Company settings.",
      fr: "Utilisez le bouton globe en haut de la page. Les administrateurs peuvent définir la langue par défaut dans Paramètres de l'entreprise.",
      ar: "استخدم زر الكرة الأرضية أعلى الصفحة. ويمكن للمدير تحديد اللغة الافتراضية في إعدادات الشركة.",
    },
  },
  {
    id: "incomplete-totals",
    path: "/reporting/monthly-payroll",
    q: { en: "A message says the totals may be incomplete.", fr: "Un message indique que les totaux peuvent être incomplets.", ar: "تظهر رسالة بأن المجاميع قد تكون ناقصة." },
    a: {
      en: "Advances or bonuses couldn't be loaded, usually because of the connection. Refresh the page before paying anyone.",
      fr: "Les avances ou primes n'ont pas pu être chargées, souvent à cause de la connexion. Actualisez la page avant de payer qui que ce soit.",
      ar: "تعذّر تحميل التسبيقات أو المكافآت، غالبًا بسبب الاتصال. حدّث الصفحة قبل دفع أي أجر.",
    },
  },
  {
    id: "phone-clock",
    path: "/kiosk",
    q: { en: "Can the kiosk run on a phone?", fr: "La borne fonctionne-t-elle sur un téléphone ?", ar: "هل يعمل جهاز الحضور على الهاتف؟" },
    a: {
      en: "Yes. Any device with a browser works; a tablet near the entrance is the most practical. The time always comes from the server.",
      fr: "Oui. Tout appareil avec un navigateur convient ; une tablette près de l'entrée est le plus pratique. L'heure vient toujours du serveur.",
      ar: "نعم. يعمل أي جهاز به متصفح، والأنسب جهاز لوحي قرب المدخل. والوقت يأتي دائمًا من الخادم.",
    },
  },
];

/** Support contacts, set in the frontend's environment (.env). */
export const SUPPORT = {
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "",
  phone: process.env.NEXT_PUBLIC_SUPPORT_PHONE || "",
  whatsapp: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "",
  hours: process.env.NEXT_PUBLIC_SUPPORT_HOURS || "",
};
