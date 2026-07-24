const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const s3 = require('../../../../config/s3Client');
const { generateNarrative } = require('../../../../utils/groq.util');
const Presentation = require('../model/presentation.model');
const Developer = require('../../Developer/models/developer.model');

const TRANSLATIONS = {
  English: {
    propertyGallery: "Property Gallery",
    financialInventory: "Financial Inventory",
    relevantPropertyDetails: "Relevant Property Details",
    project: "Project",
    company: "Company",
    primaryContact: "Primary Contact",
    location: "Location",
    completion: "Completion",
    website: "Website",
    developerInformation: "Developer Information",
    luxuryPortfolio: "Xoto GRID Luxury Portfolio",
    executiveOverview: "Executive Overview",
    projectSpecifications: "Project Specifications",
    lifestyleFeatures: "Lifestyle Features",
    locationCommunity: "Location & Community",
    investmentAngle: "Investment Angle",
    commercialStructure: "Commercial Structure",
    paymentPlan: "Payment Plan",
    locationPaymentPlan: "Location & Payment Plan",
    startingPrice: "Starting Price",
    propertyType: "Property Type",
    developer: "Developer",
    timeline: "Timeline",
    reservation: "Reservation",
    flexiblePaymentTerms: "Flexible payment terms available through the advisor.",
    contactAdvisorForBooking: "Contact advisor for booking amount and next steps.",
    onRequest: "On Request",
    unitNumber: "Unit Number",
    bedroomType: "Bedroom Type",
    area: "Area",
    price: "Price",
    status: "Status",
    sqft: "sqft",
    developerName: "Developer Name",
    community: "Community",
    subCommunity: "Sub Community",
    serviceCharge: "Service Charge",
    ownership: "Ownership",
    saleType: "Sale Type",
    permitNumber: "Permit Number",
    reraPermit: "RERA Permit",
    dldPermitNumber: "DLD Permit Number",
    referenceNumber: "Reference Number",
    projectName: "Project Name",
    floors: "Floors",
    handover: "Handover",
    furnishing: "Furnishing",
    parking: "Parking",
    masterVision: "The Master Vision",
    visualPerspective: "Visual Perspective",
    inventoryStatus: "Inventory Status",
    additionalDetails: "Additional Details",
    developerProfile: "Developer Profile",
    amenitiesFacilities: "Amenities & Facilities",
    contactAdvisorForAmenityDetails: "Contact advisor for full amenity details",
    locationPlan: "Location & Plan",
    paymentNote: "Final instalments and payment milestones should be confirmed with the advisor before client commitment.",
    nextSteps: "Next Steps",
    contactSubtitle: "Ready to secure your place in this landmark development?",
    whatsapp: "WhatsApp",
    preparedBy: "Prepared by {type}",
    propertyAgent: "Property Agent",
    portfolioAdvisor: "Portfolio Advisor",
    developerRepresentative: "Developer Representative",
    referralPartner: "Referral Partner",
    agent: "Agent",
    advisor: "Advisor",
    noInventoryFound: "No inventory rows found.",
    curatedPropertyBrief: "Curated Property Brief",
    presentation: "Presentation",
    agency: "Agency",
    unit: "Unit",
    pricing: "Pricing",
    imagesUnavailable: "Property images are currently unavailable."
  },
  Arabic: {
    propertyGallery: "معرض العقار",
    financialInventory: "البيانات المالية للوحدات",
    relevantPropertyDetails: "تفاصيل العقار ذات الصلة",
    project: "المشروع",
    company: "الشركة",
    primaryContact: "جهة الاتصال الرئيسية",
    location: "الموقع",
    completion: "تاريخ الانتهاء",
    website: "الموقع الإلكتروني",
    developerInformation: "معلومات المطور",
    luxuryPortfolio: "محفظة زوتو جريد الفاخرة",
    executiveOverview: "ملخص تنفيذي",
    projectSpecifications: "مواصفات المشروع",
    lifestyleFeatures: "ميزات نمط الحياة",
    locationCommunity: "الموقع والمجتمع",
    investmentAngle: "رؤية الاستثمار",
    commercialStructure: "الهيكل التجاري",
    paymentPlan: "خطة الدفع",
    locationPaymentPlan: "الموقع وخطة الدفع",
    startingPrice: "السعر المبدئي",
    propertyType: "نوع العقار",
    developer: "المطور",
    timeline: "الجدول الزمني",
    reservation: "الحجز",
    flexiblePaymentTerms: "خطط دفع مرنة متاحة من خلال المستشار.",
    contactAdvisorForBooking: "اتصل بالمستشار لمعرفة مبلغ الحجز والخطوات التالية.",
    onRequest: "عند الطلب",
    unitNumber: "رقم الوحدة",
    bedroomType: "نوع غرفة النوم",
    area: "المساحة",
    price: "السعر",
    status: "الحالة",
    sqft: "قدم مربع",
    developerName: "اسم المطور",
    community: "المجتمع",
    subCommunity: "المجتمع الفرعي",
    serviceCharge: "رسوم الخدمة",
    ownership: "الملكية",
    saleType: "نوع البيع",
    permitNumber: "رقم التصريح",
    reraPermit: "تصريح ريرا",
    dldPermitNumber: "رقم تصريح دائرة الأراضي والأملاك",
    referenceNumber: "رقم المرجع",
    projectName: "اسم المشروع",
    floors: "الطوابق",
    handover: "التسليم",
    furnishing: "التأثيث",
    parking: "مواقف السيارات",
    masterVision: "الرؤية الرئيسية",
    visualPerspective: "المنظور البصري",
    inventoryStatus: "حالة الوحدات",
    additionalDetails: "تفاصيل إضافية",
    developerProfile: "ملف المطور",
    amenitiesFacilities: "المرافق والخدمات",
    contactAdvisorForAmenityDetails: "اتصل بالمستشار للحصول على التفاصيل الكاملة للمرافق",
    locationPlan: "الموقع وخطة الدفع",
    paymentNote: "يجب تأكيد الدفعات النهائية ومراحل السداد مع المستشار قبل الالتزام.",
    nextSteps: "الخطوات التالية",
    contactSubtitle: "هل أنت جاهز لتأمين مكانك في هذا المشروع المتميز؟",
    whatsapp: "واتساب",
    preparedBy: "تم الإعداد بواسطة {type}",
    propertyAgent: "وكيل عقاري",
    portfolioAdvisor: "مستشار محفظة عقارية",
    developerRepresentative: "ممثل المطور",
    referralPartner: "شريك إحالة",
    agent: "وكيل",
    advisor: "مستشار",
    noInventoryFound: "لم يتم العثور على وحدات متوفرة.",
    curatedPropertyBrief: "نبذة عقارية منسقة",
    presentation: "العرض التقديمي",
    agency: "الوكالة",
    unit: "الوحدة",
    pricing: "التسعير",
    imagesUnavailable: "صور العقار غير متوفرة حالياً."
  },
  Russian: {
    propertyGallery: "Галерея Недвижимости",
    financialInventory: "Финансовый реестр",
    relevantPropertyDetails: "Характеристики объекта",
    project: "Проект",
    company: "Компания",
    primaryContact: "Основной контакт",
    location: "Расположение",
    completion: "Срок сдачи",
    website: "Веб-сайт",
    developerInformation: "Информация о застройщике",
    luxuryPortfolio: "Портфолио Xoto GRID Luxury",
    executiveOverview: "Краткое описание",
    projectSpecifications: "Спецификации проекта",
    lifestyleFeatures: "Преимущества и стиль жизни",
    locationCommunity: "Район и сообщество",
    investmentAngle: "Инвестиционная привлекательность",
    commercialStructure: "Коммерческая структура",
    paymentPlan: "План оплаты",
    locationPaymentPlan: "Район и План Оплаты",
    startingPrice: "Начальная цена",
    propertyType: "Тип недвижимости",
    developer: "Застройщик",
    timeline: "Сроки сдачи",
    reservation: "Бронирование",
    flexiblePaymentTerms: "Гибкие условия оплаты доступны через консультанта.",
    contactAdvisorForBooking: "Свяжитесь с консультантом для получения информации о сумме бронирования.",
    onRequest: "По запросу",
    unitNumber: "Номер юнита",
    bedroomType: "Комнатность",
    area: "Площадь",
    price: "Цена",
    status: "Статус",
    sqft: "кв. фут",
    developerName: "Имя застройщика",
    community: "Район",
    subCommunity: "Микрорайон",
    serviceCharge: "Сервисный сбор",
    ownership: "Право собственности",
    saleType: "Тип продажи",
    permitNumber: "Номер разрешения",
    reraPermit: "Разрешение RERA",
    dldPermitNumber: "Разрешение DLD",
    referenceNumber: "Референтный номер",
    projectName: "Название проекта",
    floors: "Этажность",
    handover: "Сдача",
    furnishing: "Меблировка",
    parking: "Парковка",
    masterVision: "Главная концепция",
    visualPerspective: "Визуальная перспектива",
    inventoryStatus: "Статус реестра",
    additionalDetails: "Дополнительные детали",
    developerProfile: "Профиль застройщика",
    amenitiesFacilities: "Удобства и удобства",
    contactAdvisorForAmenityDetails: "Свяжитесь с консультантом для получения полной информации об удобствах",
    locationPlan: "Расположение и план",
    paymentNote: "Окончательные платежи и этапы оплаты должны быть подтверждены консультантом до принятия обязательств.",
    nextSteps: "Следующие шаги",
    contactSubtitle: "Готовы обеспечить себе место в этом знаковом проекте?",
    whatsapp: "WhatsApp",
    preparedBy: "Подготовлено: {type}",
    propertyAgent: "Агент по недвижимости",
    portfolioAdvisor: "Портфельный консультант",
    developerRepresentative: "Представитель застройщика",
    referralPartner: "Партнер-референт",
    agent: "Агент",
    advisor: "Консультант",
    noInventoryFound: "Юниты не найдены.",
    curatedPropertyBrief: "Курируемый обзор недвижимости",
    presentation: "Презентация",
    agency: "Агентство",
    unit: "Юнит",
    pricing: "Цена",
    imagesUnavailable: "Фотографии объекта временно недоступны."
  },
  Chinese: {
    propertyGallery: "房产图集",
    financialInventory: "财务清单",
    relevantPropertyDetails: "相关房产细节",
    project: "项目",
    company: "公司",
    primaryContact: "主要联系人",
    location: "位置",
    completion: "交房时间",
    website: "网站",
    developerInformation: "开发商信息",
    luxuryPortfolio: "Xoto GRID 奢华组合",
    executiveOverview: "执行概述",
    projectSpecifications: "项目规格",
    lifestyleFeatures: "生活方式特色",
    locationCommunity: "位置与社区",
    investmentAngle: "投资视角",
    commercialStructure: "商业结构",
    paymentPlan: "付款计划",
    locationPaymentPlan: "位置与付款计划",
    startingPrice: "起价",
    propertyType: "物业类型",
    developer: "开发商",
    timeline: "时间线",
    reservation: "预订",
    flexiblePaymentTerms: "顾问可提供灵活的付款条件。",
    contactAdvisorForBooking: "联系顾问获取预订金额及后续步骤。",
    onRequest: "根据要求",
    unitNumber: "单元号",
    bedroomType: "户型",
    area: "面积",
    price: "价格",
    status: "状态",
    sqft: "平方英尺",
    developerName: "开发商名称",
    community: "社区",
    subCommunity: "子社区",
    serviceCharge: "物业费",
    ownership: "产权",
    saleType: "销售类型",
    permitNumber: "许可证号",
    reraPermit: "RERA 许可证",
    dldPermitNumber: "DLD 许可证号",
    referenceNumber: "参考号",
    projectName: "项目名称",
    floors: "楼层数",
    handover: "交付",
    furnishing: "装修情况",
    parking: "停车位",
    masterVision: "大师愿景",
    visualPerspective: "视觉透视图",
    inventoryStatus: "清单状态",
    additionalDetails: "附加细节",
    developerProfile: "开发商简介",
    amenitiesFacilities: "配套设施",
    contactAdvisorForAmenityDetails: "联系顾问获取完整设施详情",
    locationPlan: "位置与规划",
    paymentNote: "最终付款和付款节点应在客户做出决定前与顾问进行确认。",
    nextSteps: "后续步骤",
    contactSubtitle: "准备好在这个地标性项目中预留您的位置了吗？",
    whatsapp: "微信/WhatsApp",
    preparedBy: "由{type}准备",
    propertyAgent: "房产中介",
    portfolioAdvisor: "投资组合顾问",
    developerRepresentative: "开发商代表",
    referralPartner: "推荐合作伙伴",
    agent: "中介",
    advisor: "顾问",
    noInventoryFound: "未找到清单记录。",
    curatedPropertyBrief: "精心策划的房产简报",
    presentation: "演示文稿",
    agency: "机构",
    unit: "单元",
    pricing: "定价",
    imagesUnavailable: "房产图片暂不可用。"
  },
  French: {
    propertyGallery: "Galerie de Propriétés",
    financialInventory: "Inventaire Financier",
    relevantPropertyDetails: "Détails de la Propriété",
    project: "Projet",
    company: "Entreprise",
    primaryContact: "Contact Principal",
    location: "Emplacement",
    completion: "Livraison",
    website: "Site Web",
    developerInformation: "Informations Promoteur",
    luxuryPortfolio: "Portfolio de Luxe Xoto GRID",
    executiveOverview: "Résumé Exécutif",
    projectSpecifications: "Spécifications du Projet",
    lifestyleFeatures: "Caractéristiques de Style de Vie",
    locationCommunity: "Emplacement & Communauté",
    investmentAngle: "Angle d'Investissement",
    commercialStructure: "Structure Commerciale",
    paymentPlan: "Échéancier de Paiement",
    locationPaymentPlan: "Emplacement & Échéancier",
    startingPrice: "Prix de Départ",
    propertyType: "Type de Propriété",
    developer: "Promoteur",
    timeline: "Calendrier",
    reservation: "Réservation",
    flexiblePaymentTerms: "Conditions de paiement flexibles disponibles via le conseiller.",
    contactAdvisorForBooking: "Contactez le conseiller pour le montant de réservation et les étapes suivantes.",
    onRequest: "Sur Demande",
    unitNumber: "Numéro de l'unité",
    bedroomType: "Chambres",
    area: "Surface",
    price: "Prix",
    status: "Statut",
    sqft: "sqft",
    developerName: "Nom du promoteur",
    community: "Communauté",
    subCommunity: "Sous-communauté",
    serviceCharge: "Charges de copropriété",
    ownership: "Propriété",
    saleType: "Type de vente",
    permitNumber: "Numéro de permis",
    reraPermit: "Permis RERA",
    dldPermitNumber: "Numéro de permis DLD",
    referenceNumber: "Numéro de référence",
    projectName: "Nom du Projet",
    floors: "Étages",
    handover: "Remise des clés",
    furnishing: "Ameublement",
    parking: "Parking",
    masterVision: "La Vision Globale",
    visualPerspective: "Perspective Visuelle",
    inventoryStatus: "Statut de l'Inventaire",
    additionalDetails: "Détails Supplémentaires",
    developerProfile: "Profil Promoteur",
    amenitiesFacilities: "Équipements & Installations",
    contactAdvisorForAmenityDetails: "Contactez votre conseiller pour les détails complets des équipements",
    locationPlan: "Emplacement & Plan",
    paymentNote: "Les versements finaux et les jalons de paiement doivent être confirmés avec le conseiller avant l'engagement du client.",
    nextSteps: "Prochaines Étapes",
    contactSubtitle: "Prêt à sécuriser votre place dans ce projet emblématique ?",
    whatsapp: "WhatsApp",
    preparedBy: "Préparé par {type}",
    propertyAgent: "Agent Immobilier",
    portfolioAdvisor: "Conseiller en Portefeuille",
    developerRepresentative: "Représentant Promoteur",
    referralPartner: "Partenaire de Parrainage",
    agent: "Agent",
    advisor: "Conseiller",
    noInventoryFound: "Aucune unité disponible trouvée.",
    curatedPropertyBrief: "Fiche Propriété Personnalisée",
    presentation: "Présentation",
    agency: "Agence",
    unit: "Unité",
    pricing: "Tarification",
    imagesUnavailable: "Les images de la propriété ne sont pas disponibles actuellement."
  },
  German: {
    propertyGallery: "Immobilien-Galerie",
    financialInventory: "Finanzübersicht Einheiten",
    relevantPropertyDetails: "Immobiliendetails",
    project: "Projekt",
    company: "Unternehmen",
    primaryContact: "Hauptkontakt",
    location: "Lage",
    completion: "Fertigstellung",
    website: "Webseite",
    developerInformation: "Entwicklerinformationen",
    luxuryPortfolio: "Xoto GRID Luxus-Portfolio",
    executiveOverview: "Zusammenfassung",
    projectSpecifications: "Projekt-Spezifikationen",
    lifestyleFeatures: "Lifestyle-Merkmale",
    locationCommunity: "Lage & Gemeinschaft",
    investmentAngle: "Investment-Perspektive",
    commercialStructure: "Kommerzielle Struktur",
    paymentPlan: "Zahlungsplan",
    locationPaymentPlan: "Lage & Zahlungsplan",
    startingPrice: "Abpreis",
    propertyType: "Immobilienart",
    developer: "Bauträger",
    timeline: "Zeitplan",
    reservation: "Reservierung",
    flexiblePaymentTerms: "Flexible Zahlungsbedingungen über den Berater verfügbar.",
    contactAdvisorForBooking: "Kontaktieren Sie den Berater bezüglich des Reservierungsbetrags und der nächsten Schritte.",
    onRequest: "Auf Anfrage",
    unitNumber: "Einheitsnummer",
    bedroomType: "Zimmertyp",
    area: "Fläche",
    price: "Preis",
    status: "Status",
    sqft: "sqft",
    developerName: "Entwicklername",
    community: "Gemeinschaft",
    subCommunity: "Untergemeinschaft",
    serviceCharge: "Servicegebühr",
    ownership: "Eigentumsform",
    saleType: "Verkaufsart",
    permitNumber: "Genehmigungsnummer",
    reraPermit: "RERA-Genehmigung",
    dldPermitNumber: "DLD-Genehmigungsnummer",
    referenceNumber: "Referenznummer",
    projectName: "Projektname",
    floors: "Etagen",
    handover: "Übergabe",
    furnishing: "Möblierung",
    parking: "Parkplatz",
    masterVision: "Die Master-Vision",
    visualPerspective: "Visuelle Perspektive",
    inventoryStatus: "Bestandsstatus",
    additionalDetails: "Zusätzliche Details",
    developerProfile: "Entwicklerprofil",
    amenitiesFacilities: "Ausstattung & Einrichtungen",
    contactAdvisorForAmenityDetails: "Kontaktieren Sie den Berater für vollständige Ausstattungsdetails",
    locationPlan: "Lage & Plan",
    paymentNote: "Die endgültigen Raten und Meilensteine sollten vor der Zusage des Kunden mit dem Berater bestätigt werden.",
    nextSteps: "Nächste Schritte",
    contactSubtitle: "Sind Sie bereit, sich Ihren Platz in diesem wegweisenden Projekt zu sichern?",
    whatsapp: "WhatsApp",
    preparedBy: "Vorbereitet von {type}",
    propertyAgent: "Immobilienmakler",
    portfolioAdvisor: "Portfolioberater",
    developerRepresentative: "Entwicklervertreter",
    referralPartner: "Empfehlungspartner",
    agent: "Makler",
    advisor: "Berater",
    noInventoryFound: "Keine Einheiten im Bestand gefunden.",
    curatedPropertyBrief: "Kuratierte Immobilienübersicht",
    presentation: "Präsentation",
    agency: "Agentur",
    unit: "Einheit",
    pricing: "Preise",
    imagesUnavailable: "Immobilienbilder sind derzeit nicht verfügbar."
  },
  Spanish: {
    propertyGallery: "Galería de Propiedades",
    financialInventory: "Inventario Financiero",
    relevantPropertyDetails: "Detalles de la Propiedad",
    project: "Proyecto",
    company: "Compañía",
    primaryContact: "Contacto Principal",
    location: "Ubicación",
    completion: "Fecha de Entrega",
    website: "Sitio Web",
    developerInformation: "Información del Desarrollador",
    luxuryPortfolio: "Portafolio de Lujo Xoto GRID",
    executiveOverview: "Resumen Ejecutivo",
    projectSpecifications: "Especificaciones del Proyecto",
    lifestyleFeatures: "Características de Estilo de Vida",
    locationCommunity: "Ubicación & Comunidad",
    investmentAngle: "Perspectiva de Inversión",
    commercialStructure: "Estructura Comercial",
    paymentPlan: "Plan de Pago",
    locationPaymentPlan: "Ubicación & Plan de Pago",
    startingPrice: "Precio Inicial",
    propertyType: "Tipo de Propiedad",
    developer: "Desarrollador",
    timeline: "Cronograma",
    reservation: "Reserva",
    flexiblePaymentTerms: "Condiciones de pago flexibles disponibles a través del asesor.",
    contactAdvisorForBooking: "Contacte al asesor para el monto de la reserva y los siguientes pasos.",
    onRequest: "Bajo Petición",
    unitNumber: "Número de unidad",
    bedroomType: "Dormitorios",
    area: "Área",
    price: "Precio",
    status: "Estado",
    sqft: "sqft",
    developerName: "Nombre del Desarrollador",
    community: "Comunidad",
    subCommunity: "Subcomunidad",
    serviceCharge: "Gastos de comunidad",
    ownership: "Propiedad",
    saleType: "Tipo de venta",
    permitNumber: "Número de permiso",
    reraPermit: "Permiso RERA",
    dldPermitNumber: "Número de permiso DLD",
    referenceNumber: "Número de referencia",
    projectName: "Nombre del Proyecto",
    floors: "Pisos",
    handover: "Entrega de llaves",
    furnishing: "Amueblado",
    parking: "Estacionamiento",
    masterVision: "La Gran Visión",
    visualPerspective: "Perspectiva Visual",
    inventoryStatus: "Estado del Inventario",
    additionalDetails: "Detalles Adicionales",
    developerProfile: "Perfil del Desarrollador",
    amenitiesFacilities: "Servicios & Instalaciones",
    contactAdvisorForAmenityDetails: "Contacte al asesor para detalles completos de los servicios",
    locationPlan: "Ubicación & Plan",
    paymentNote: "Las cuotas finales y los hitos de pago deben ser confirmados con el asesor antes del compromiso del cliente.",
    nextSteps: "Siguientes Pasos",
    contactSubtitle: "¿Listo para asegurar su lugar en este emblemático desarrollo?",
    whatsapp: "WhatsApp",
    preparedBy: "Preparado por {type}",
    propertyAgent: "Agente de la Propiedad",
    portfolioAdvisor: "Asesor de Cartera",
    developerRepresentative: "Representante del Desarrollador",
    referralPartner: "Socio de Referencia",
    agent: "Agente",
    advisor: "Asesor",
    noInventoryFound: "No se encontraron unidades en el inventario.",
    curatedPropertyBrief: "Dossier de Propiedad Exclusivo",
    presentation: "Presentación",
    agency: "Agencia",
    unit: "Unidad",
    pricing: "Precios",
    imagesUnavailable: "Las imágenes de la propiedad no están disponibles actualmente."
  },
  Hindi: {
    propertyGallery: "संपत्ति गैलरी",
    financialInventory: "वित्तीय सूची",
    relevantPropertyDetails: "प्रासंगिक संपत्ति विवरण",
    project: "परियोजना",
    company: "कंपनी",
    primaryContact: "मुख्य संपर्क",
    location: "स्थान",
    completion: "निर्माण पूरा होना",
    website: "वेबसाइट",
    developerInformation: "डेवलपर की जानकारी",
    luxuryPortfolio: "ज़ोटो ग्रिड लक्ज़री पोर्टफोलियो",
    executiveOverview: "कार्यकारी सारांश",
    projectSpecifications: "परियोजना विनिर्देश",
    lifestyleFeatures: "जीवन शैली की विशेषताएं",
    locationCommunity: "स्थान और समुदाय",
    investmentAngle: "निवेश दृष्टिकोण",
    commercialStructure: "व्यावसायिक संरचना",
    paymentPlan: "भुगतान योजना",
    locationPaymentPlan: "स्थान और भुगतान योजना",
    startingPrice: "शुरुआती कीमत",
    propertyType: "संपत्ति का प्रकार",
    developer: "डेवलपर",
    timeline: "समयसीमा",
    reservation: "आरक्षण",
    flexiblePaymentTerms: "सलाहकार के माध्यम से लचीली भुगतान शर्तें उपलब्ध हैं।",
    contactAdvisorForBooking: "आरक्षण राशि और अगले कदमों के लिए सलाहकार से संपर्क करें।",
    onRequest: "अनुरोध पर",
    unitNumber: "यूनिट नंबर",
    bedroomType: "बेडरुम का प्रकार",
    area: "क्षेत्रफल",
    price: "कीमत",
    status: "स्थिति",
    sqft: "वर्ग फुट",
    developerName: "डेवलपर का नाम",
    community: "समुदाय",
    subCommunity: "उप समुदाय",
    serviceCharge: "सेवा शुल्क",
    ownership: "स्वामित्व",
    saleType: "बिक्री का प्रकार",
    permitNumber: "परमिट संख्या",
    reraPermit: "रेरा परमिट",
    dldPermitNumber: "डीएलडी परमिट संख्या",
    referenceNumber: "संदर्भ संख्या",
    projectName: "परियोजना का नाम",
    floors: "मंजिलें",
    handover: "हस्तांतरण",
    furnishing: "फर्नीचर",
    parking: "पार्किंग",
    masterVision: "मुख्य विजन",
    visualPerspective: "दृश्य परिप्रेक्ष्य",
    inventoryStatus: "इन्वेंट्री की स्थिति",
    additionalDetails: "अतिरिक्त विवरण",
    developerProfile: "डेवलपर प्रोफ़ाइल",
    amenitiesFacilities: "सुविधाएं और साधन",
    contactAdvisorForAmenityDetails: "पूर्ण सुविधा विवरण के लिए सलाहकार से संपर्क करें",
    locationPlan: "स्थान और योजना",
    paymentNote: "अंतिम किश्तों और भुगतान के चरणों की पुष्टि ग्राहक की प्रतिबद्धता से पहले सलाहकार के साथ की जानी चाहिए।",
    nextSteps: "अगले कदम",
    contactSubtitle: "क्या आप इस ऐतिहासिक विकास में अपना स्थान सुरक्षित करने के लिए तैयार हैं?",
    whatsapp: "व्हाट्सएप",
    preparedBy: "{type} द्वारा तैयार",
    propertyAgent: "संपत्ति एजेंट",
    portfolioAdvisor: "पोर्टफोलियो सलाहकार",
    developerRepresentative: "डेवलपर प्रतिनिधि",
    referralPartner: "रेफरल पार्टनर",
    agent: "एजेंट",
    advisor: "सलाहकार",
    noInventoryFound: "कोई सूची उपलब्ध नहीं मिली।",
    curatedPropertyBrief: "चुनिंदा संपत्ति विवरण",
    presentation: "प्रस्तुति",
    agency: "एजेंसी",
    unit: "यूनिट",
    pricing: "मूल्य निर्धारण",
    imagesUnavailable: "संपत्ति के चित्र वर्तमान में उपलब्ध नहीं हैं।"
  },
  Urdu: {
    propertyGallery: "پراپرٹی گیلری",
    financialInventory: "مالیاتی فہرست",
    relevantPropertyDetails: "پراپرٹی کی تفصیلات",
    project: "پروجیکٹ",
    company: "کمپنی",
    primaryContact: "بنیادی رابطہ",
    location: "مقام",
    completion: "تکمیل کی تاریخ",
    website: "ویب سائٹ",
    developerInformation: "ڈویلپر کی معلومات",
    luxuryPortfolio: "زوٹو گرڈ لگژری پورٹ فولیو",
    executiveOverview: "خلاصہ",
    projectSpecifications: "پروجیکٹ کی تفصیلات",
    lifestyleFeatures: "طرز زندگی کی خصوصیات",
    locationCommunity: "مقام اور کمیونٹی",
    investmentAngle: "سرمایہ کاری کا پہلو",
    commercialStructure: "تجارتی ڈھانچہ",
    paymentPlan: "ادائیگی کا منصوبہ",
    locationPaymentPlan: "مقام اور ادائیگی کا منصوبہ",
    startingPrice: "ابتدائی قیمت",
    propertyType: "پراپرٹی کی قسم",
    developer: "ڈویلپر",
    timeline: "ٹائم لائن",
    reservation: "بکنگ",
    flexiblePaymentTerms: "مشیر کے ذریعے ادائیگی کی لچکدار شرائط دستیاب ہیں۔",
    contactAdvisorForBooking: "بکنگ کی رقم اور اگلے مراحل کے لیے مشیر سے رابطہ کریں۔",
    onRequest: "درخواست پر",
    unitNumber: "یونٹ نمبر",
    bedroomType: "بیڈ روم کی قسم",
    area: "رقبہ",
    price: "قیمت",
    status: "حالت",
    sqft: "مربع فٹ",
    developerName: "ڈویلپر کا نام",
    community: "کمیونٹی",
    subCommunity: "ذیلی کمیونٹی",
    serviceCharge: "سروس چارجز",
    ownership: "ملکیت",
    saleType: "فروخت کی قسم",
    permitNumber: "پرمٹ نمبر",
    reraPermit: "ریرا پرمٹ",
    dldPermitNumber: "ڈی ایل ڈی پرمٹ نمبر",
    referenceNumber: "حوالہ نمبر",
    projectName: "پروجیکٹ کا نام",
    floors: "منزلیں",
    handover: "حوالگی",
    furnishing: "فرنشنگ",
    parking: "پارکنگ",
    masterVision: "بنیادی تصور",
    visualPerspective: "بصری نقطہ نظر",
    inventoryStatus: "فہرست کی حالت",
    additionalDetails: "اضافی تفصیلات",
    developerProfile: "ڈویلپر کا خاکہ",
    amenitiesFacilities: "سہولیات اور خدمات",
    contactAdvisorForAmenityDetails: "سہولیات کی مکمل تفصیلات کے لیے مشیر سے رابطہ کریں",
    locationPlan: "مقام اور منصوبہ",
    paymentNote: "حتمی اقساط اور ادائیگی کے مراحل کی تصدیق گاہک کے عزم سے پہلے مشیر سے کر لینی چاہیے۔",
    nextSteps: "اگلے مراحل",
    contactSubtitle: "کیا آپ اس تاریخی منصوبے میں اپنا مقام محفوظ کرنے کے لیے تیار ہیں؟",
    whatsapp: "واٹس ایپ",
    preparedBy: "{type} کی طرف سے تیار کردہ",
    propertyAgent: "پراپرٹی ایجنٹ",
    portfolioAdvisor: "پورٹ فولیو مشیر",
    developerRepresentative: "ڈویلپر کا نمائندہ",
    referralPartner: "ریفرل پارٹنر",
    agent: "ایجنٹ",
    advisor: "مشیر",
    noInventoryFound: "کوئی ریکارڈ نہیں ملا۔",
    curatedPropertyBrief: "پراپرٹی کا منتخب خلاصہ",
    presentation: "پریزنٹیشن",
    agency: "ایجنسی",
    unit: "یونٹ",
    pricing: "قیمتوں کا تعین",
    imagesUnavailable: "پراپرٹی کی تصاویر فی الحال دستیاب نہیں ہیں۔"
  },
  Persian: {
    propertyGallery: "گالری تصاویر",
    financialInventory: "لیست مالی واحدها",
    relevantPropertyDetails: "جزئیات ملک",
    project: "پروژه",
    company: "شرکت",
    primaryContact: "رابط اصلی",
    location: "موقعیت",
    completion: "تاریخ تکمیل",
    website: "وب‌سایت",
    developerInformation: "اطلاعات سازنده",
    luxuryPortfolio: "سبد لوکس زوتو گرید",
    executiveOverview: "خلاصه مدیریتی",
    projectSpecifications: "مشخصات پروژه",
    lifestyleFeatures: "ویژگی‌های سبک زندگی",
    locationCommunity: "موقعیت و جامعه",
    investmentAngle: "زاویه سرمایه‌گذاری",
    commercialStructure: "ساختار تجاری",
    paymentPlan: "برنامه پرداخت",
    locationPaymentPlan: "موقعیت و برنامه پرداخت",
    startingPrice: "قیمت پایه",
    propertyType: "نوع ملک",
    developer: "سازنده",
    timeline: "جدول زمانی",
    reservation: "رزرو",
    flexiblePaymentTerms: "شرایط پرداخت انعطاف‌پذیر از طریق مشاور در دسترس است.",
    contactAdvisorForBooking: "جهت اطلاع از مبلغ رزرو و مراحل بعدی با مشاور تماس بگیرید.",
    onRequest: "به درخواست مشتری",
    unitNumber: "شماره واحد",
    bedroomType: "نوع اتاق خواب",
    area: "متراژ",
    price: "قیمت",
    status: "وضعیت",
    sqft: "فوت مربع",
    developerName: "نام سازنده",
    community: "محله",
    subCommunity: "زیر محله",
    serviceCharge: "شارژ خدمات",
    ownership: "مالکیت",
    saleType: "نوع فروش",
    permitNumber: "شماره مجوز",
    reraPermit: "مجوز RERA",
    dldPermitNumber: "مجوز DLD",
    referenceNumber: "شماره مرجع",
    projectName: "نام پروژه",
    floors: "طبقات",
    handover: "تحویل",
    furnishing: "مبلمان",
    parking: "پارکینگ",
    masterVision: "چشم‌انداز اصلی",
    visualPerspective: "چشم‌انداز بصری",
    inventoryStatus: "وضعیت واحدها",
    additionalDetails: "جزئیات تکمیلی",
    developerProfile: "پروفایل سازنده",
    amenitiesFacilities: "امکانات ও تسهیلات",
    contactAdvisorForAmenityDetails: "برای اطلاعات کامل امکانات با مشاور تماس بگیرید",
    locationPlan: "موقعیت و برنامه پرداخت",
    paymentNote: "اقساط نهایی و مراحل پرداخت باید قبل از تعهد مشتری با مشاور تأیید شود.",
    nextSteps: "مراحل بعدی",
    contactSubtitle: "برای رزرو واحد خود در این پروژه بی‌نظیر آماده‌اید؟",
    whatsapp: "واتس‌اپ",
    preparedBy: "تهیه شده توسط {type}",
    propertyAgent: "مشاور املاک",
    portfolioAdvisor: "مشاور سبد سرمایه‌گذاری",
    developerRepresentative: "نماینده سازنده",
    referralPartner: "همکار ارجاعی",
    agent: "نماینده",
    advisor: "مشاور",
    noInventoryFound: "هیچ واحدی در لیست یافت نشد.",
    curatedPropertyBrief: "خلاصه ملک اختصاصی",
    presentation: "معرفی ملک",
    agency: "آژانس",
    unit: "واحد",
    pricing: "قیمت‌گذاری",
    imagesUnavailable: "تصاویر ملک در حال حاضر در دسترس نیست."
  }
};

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const contentTypeFromKey = (key) => {
  const ext = String(key || '').split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
  return 'image/jpeg';
};

const getS3ImageMeta = (src) => {
  if (!src || src.startsWith('data:')) return null;
  try {
    const urlToParse = /^https?:\/\//i.test(src) ? src : `http://dummy-origin.com${src.startsWith('/') ? '' : '/'}${src}`;
    const parsed = new URL(urlToParse);
    const proxyKey = parsed.searchParams.get('key');
    if (proxyKey) return { bucket: process.env.AWS_S3_BUCKET, key: decodeURIComponent(proxyKey) };
    if (parsed.hostname.includes('.s3.')) return { bucket: parsed.hostname.split('.s3.')[0], key: decodeURIComponent(parsed.pathname.replace(/^\//, '')) };
  } catch (err) {
    return { bucket: process.env.AWS_S3_BUCKET, key: String(src).replace(/^\//, '') };
  }
  return null;
};

const imageSrcToDataUri = async (src) => {
  const s3Meta = getS3ImageMeta(src);
  const optimizeImageBuffer = async (buffer, contentType) => {
    if (!buffer?.length || contentType === 'image/svg+xml') return { buffer, contentType };
    if (buffer.length < 80 * 1024) return { buffer, contentType };
    try {
      const sharp = require('sharp');
      const optimized = await sharp(buffer).rotate().flatten({ background: '#ffffff' }).resize({ width: 960, height: 540, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 48, mozjpeg: true, progressive: false, chromaSubsampling: '4:2:0' }).toBuffer();
      return { buffer: optimized, contentType: 'image/jpeg' };
    } catch (err) {
      console.warn('PDF image optimization skipped:', err.message);
      return { buffer, contentType };
    }
  };

  const dataUriMatch = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(src || '');
  if (dataUriMatch) {
    try {
      const contentType = dataUriMatch[1];
      const buffer = Buffer.from(dataUriMatch[2], 'base64');
      const optimized = await optimizeImageBuffer(buffer, contentType);
      return `data:${optimized.contentType};base64,${optimized.buffer.toString('base64')}`;
    } catch (err) { return src; }
  }

  if (s3Meta?.bucket && s3Meta?.key) {
    const response = await s3.send(new GetObjectCommand({ Bucket: s3Meta.bucket, Key: s3Meta.key }));
    const buffer = await streamToBuffer(response.Body);
    const contentType = response.ContentType || contentTypeFromKey(s3Meta.key);
    const optimized = await optimizeImageBuffer(buffer, contentType);
    return `data:${optimized.contentType};base64,${optimized.buffer.toString('base64')}`;
  }

  if (/^https?:\/\//i.test(src) && typeof fetch === 'function') {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`Image fetch failed ${response.status}: ${src}`);
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || contentTypeFromKey(src);
    const optimized = await optimizeImageBuffer(Buffer.from(arrayBuffer), contentType);
    return `data:${optimized.contentType};base64,${optimized.buffer.toString('base64')}`;
  }

  return src;
};

const inlinePresentationImages = async (htmlContent) => {
  const imageSources = [...htmlContent.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]).filter(Boolean);
  const uniqueSources = [...new Set(imageSources)];
  const replacements = new Map();
  const concurrency = 3;

  for (let i = 0; i < uniqueSources.length; i += concurrency) {
    const batch = uniqueSources.slice(i, i + concurrency);
    await Promise.all(batch.map(async (src) => {
      try { replacements.set(src, await imageSrcToDataUri(src)); }
      catch (err) { console.warn(`PDF image inline failed for ${src}:`, err.message); replacements.set(src, src); }
    }));
    if (global.gc) { try { global.gc(); } catch (err) {} }
  }

  return htmlContent.replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi, (match, before, src, after) => `${before}${replacements.get(src) || src}${after}`);
};

const preparePresentationHtmlForPdf = async (htmlContent) => {
  const inlinedHtml = await inlinePresentationImages(htmlContent);
  return inlinedHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
};

const PRESENTATION_PDF_WIDTH = 1280;
const PRESENTATION_PDF_HEIGHT = 720;
const PRESENTATION_PDF_IMAGE_QUALITY = 74;

const buildRasterPdf = (slideImages) => new Promise((resolve, reject) => {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ autoFirstPage: false, margin: 0, compress: true, info: { Title: 'Xoto Presentation', Creator: 'Xoto GRID', Producer: 'Xoto GRID' } });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  doc.on('error', reject);
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  slideImages.forEach((imageBuffer) => {
    doc.addPage({ size: [PRESENTATION_PDF_WIDTH, PRESENTATION_PDF_HEIGHT], margin: 0 });
    doc.image(imageBuffer, 0, 0, { width: PRESENTATION_PDF_WIDTH, height: PRESENTATION_PDF_HEIGHT });
  });
  doc.end();
});

const generatePresentationNarrative = async (property, clientNotes, settings) => {
  return await generateNarrative(property, clientNotes, settings);
};

const generatePdfFromPresentation = async (trackingToken) => {
  const puppeteer = require('puppeteer');
  let browser;
  const presentation = await Presentation.findOne({ trackingToken });
  if (!presentation) throw new Error('Presentation not found');

  const s3Response = await s3.send(new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: presentation.s3Key }));
  const htmlContent = (await streamToBuffer(s3Response.Body)).toString('utf-8');
  const printableHtmlContent = await preparePresentationHtmlForPdf(htmlContent);

  browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    headless: 'new',
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none'
    ]
});

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      const url = request.url();
      if ((resourceType === 'font' || resourceType === 'stylesheet') && /googleapis|gstatic|cdnjs/i.test(url)) { request.abort(); return; }
      request.continue();
    });

    await page.setViewport({ width: PRESENTATION_PDF_WIDTH, height: PRESENTATION_PDF_HEIGHT, deviceScaleFactor: 1 });
    await page.setContent(printableHtmlContent, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction('Array.from(document.images).every(img => img.complete)', { timeout: 5000 }).catch(() => {});

    await page.addStyleTag({
      content: `
      @page { size: ${PRESENTATION_PDF_WIDTH}px ${PRESENTATION_PDF_HEIGHT}px; margin: 0; }
      *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
      html, body { width: ${PRESENTATION_PDF_WIDTH}px !important; height: ${PRESENTATION_PDF_HEIGHT}px !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: #fff !important; }
      #pdf-fab, #download-fab-wrap, .controls, .hint-text, #play-status { display: none !important; }
      #deck-container { width: ${PRESENTATION_PDF_WIDTH}px !important; height: ${PRESENTATION_PDF_HEIGHT}px !important; position: fixed !important; inset: 0 !important; overflow: hidden !important; background: #fff !important; }
      .slide { position: fixed !important; inset: 0 !important; width: ${PRESENTATION_PDF_WIDTH}px !important; height: ${PRESENTATION_PDF_HEIGHT}px !important; display: flex !important; opacity: 0 !important; visibility: hidden !important; transform: none !important; z-index: 0 !important; }
      .slide.pdf-current-slide { opacity: 1 !important; visibility: visible !important; z-index: 1 !important; }
      .slide-inner { width: ${PRESENTATION_PDF_WIDTH}px !important; height: ${PRESENTATION_PDF_HEIGHT}px !important; transform: none !important; }
      `,
    });

    const slideCount = await page.$$eval('.slide', slides => slides.length);
    if (!slideCount) throw new Error('No slides found in presentation');

    const slideImages = [];
    for (let index = 0; index < slideCount; index += 1) {
      await page.evaluate((currentIndex) => {
        document.querySelectorAll('.slide').forEach((slide, slideIndex) => {
          slide.classList.toggle('pdf-current-slide', slideIndex === currentIndex);
        });
      }, index);
      const slide = await page.$('.slide.pdf-current-slide');
      if (!slide) continue;
      const imageBuffer = await slide.screenshot({ type: 'jpeg', quality: PRESENTATION_PDF_IMAGE_QUALITY, captureBeyondViewport: false });
      slideImages.push(Buffer.from(imageBuffer));
      await slide.dispose();
    }

    if (!slideImages.length) throw new Error('Unable to render presentation slides');
    const pdfBuffer = await buildRasterPdf(slideImages);
    slideImages.length = 0;
    return pdfBuffer;
  } catch (err) {
    console.error('PDF render failed:', err.message);
    throw err;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};

// ── 2. Build HTML Content ────────────────────────────────────────────────────
const buildHtmlPresentation = async (property, narrative, settings, agentProfile) => {
  const sections = settings.sections || {};
  const currency = settings.currency || 'AED';
  const areaUnit = settings.areaUnit || 'sqft';

  const lang = settings.language || 'English';
  const t = TRANSLATIONS[lang] || TRANSLATIONS.English;
  const isRTL = ['Arabic', 'Urdu', 'Persian'].includes(lang);

  const langCodeMap = { English: 'en', Arabic: 'ar', Russian: 'ru', Chinese: 'zh', French: 'fr', German: 'de', Spanish: 'es', Hindi: 'hi', Urdu: 'ur', Persian: 'fa' };
  const langCode = langCodeMap[lang] || 'en';

  const XOTO_LOGO = 'https://xotostaging.s3.me-central-1.amazonaws.com/properties/1778837544857-logogrid.png';

  const presentationApiBase = '/api/presentation';

  const toFullUrl = (url) => {
    if (!url) return null;
    const raw = typeof url === 'string' ? url : url?.url || url?.src || url?.key || url?.path || url?.location || url?.secure_url;
    if (!raw || typeof raw !== 'string') return null;
    if (raw.startsWith('data:')) return raw;
    let key;
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      try {
        const urlObj = new URL(raw);
        if (urlObj.searchParams.get('key') && urlObj.pathname.includes('/presentation/image-proxy')) return raw;
        if (!urlObj.hostname.includes('.s3.') && !urlObj.hostname.includes(String(process.env.AWS_S3_BUCKET || ''))) return raw;
        key = urlObj.pathname;
        if (key.startsWith('/')) key = key.slice(1);
      } catch (e) { return raw; }
    } else {
      key = raw;
      if (key.startsWith('/')) key = key.slice(1);
    }
    return `${presentationApiBase}/image-proxy?key=${encodeURIComponent(key)}`;
  };
  const xotoLogoUrl = toFullUrl(XOTO_LOGO) || XOTO_LOGO;

  const getDeveloperDocument = async () => {
    const candidate = property.developerId || property.developer_id || property.developer;
    if (!candidate || typeof candidate === 'object') return candidate || null;
    if (!/^[a-f\d]{24}$/i.test(String(candidate))) return null;
    try { return await Developer.findById(candidate).lean(); }
    catch (err) { console.warn('Developer lookup failed:', err.message); return null; }
  };
  const developerDoc = await getDeveloperDocument();

  const fmt = (n) => n > 0 ? Number(n).toLocaleString() : null;
  const price = fmt(property.price_min || property.priceRange?.from || property.price || 0);
  const priceMax = fmt(property.price_max || property.priceRange?.to || 0);
  const priceStr = price && priceMax ? `${currency} ${price} – ${priceMax}` : price ? `${currency} ${price}` : (t.onRequest || 'On Request');

  const areaStr = (() => {
    const min = fmt(property.builtUpArea_min || property.builtUpArea || 0);
    const max = fmt(property.builtUpArea_max || 0);
    if (min && max && min !== max) return `${min} - ${max}`;
    return min || null;
  })();

  const loc = [property.area, property.city, property.country].filter(Boolean).join(', ');
  const unitTypes = Array.isArray(property.unitTypes) ? property.unitTypes : [];
  const inventoryRows = (() => {
    if (Array.isArray(property.inventory) && property.inventory.length) return property.inventory;
    if (Array.isArray(property.units) && property.units.length) return property.units;
    if (Array.isArray(property.availableUnits) && property.availableUnits.length) return property.availableUnits;
    return unitTypes;
  })();

  const amenitiesList = (() => {
    const list = [];
    const pushAmenity = (value) => {
      if (!value) return;
      if (typeof value === 'string') { list.push(value); return; }
      if (Array.isArray(value)) { value.forEach(pushAmenity); return; }
      if (typeof value === 'object') { Object.entries(value).forEach(([k, v]) => { if (v === true) list.push(labelize(k)); else if (typeof v === 'string') list.push(v); }); }
    };
    pushAmenity(property.amenities); pushAmenity(property.amenity); pushAmenity(property.features); pushAmenity(property.amenitiesAndFacilities);
    if (property.facilities && typeof property.facilities === 'object') { Object.entries(property.facilities).forEach(([k, v]) => { if (v === true) list.push(labelize(k)); }); }
    return [...new Set(list)];
  })();

  const photos = (() => {
    const all = [];
    const pushImage = (value) => {
      if (!value) return;
      if (typeof value === 'string') { all.push(value); return; }
      if (Array.isArray(value)) { value.forEach(pushImage); return; }
      if (typeof value === 'object') {
        const direct = value.url || value.src || value.key || value.path || value.location || value.secure_url || value.image;
        if (direct && direct !== value) pushImage(direct);
      }
    };
    [property.mainImage, property.mainLogo, property.coverImage, property.thumbnail, property.logo, property.media?.mainLogo, property.images, property.photos, property.media?.architectureImages, property.media?.interiorImages, property.media?.lobbyImages, property.media?.otherImages, property.floorPlanImages, property.gallery, property.attachments].forEach(pushImage);
    if (Array.isArray(property.buildings)) property.buildings.forEach(building => pushImage(building?.image));
    return [...new Set(all.map(toFullUrl).filter(Boolean))];
  })();

  const labelize = (key) => String(key || '').replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim().replace(/^./, s => s.toUpperCase());
  const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const formatDateDDMMYY = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  };
  const formatCompletionDate = (completion) => {
    if (!completion) return t.onRequest || 'On Request';
    if (typeof completion === 'string' || completion instanceof Date) return formatDateDDMMYY(completion) || completion;
    const directDate = completion.fullDate || completion.date;
    if (directDate) return formatDateDDMMYY(directDate) || String(directDate);
    if (completion.quarter && completion.year) {
      const quarterEnd = { Q1: `03/31/${completion.year}`, Q2: `06/30/${completion.year}`, Q3: `09/30/${completion.year}`, Q4: `12/31/${completion.year}` }[String(completion.quarter).toUpperCase()];
      return formatDateDDMMYY(quarterEnd) || `${completion.quarter} ${completion.year}`;
    }
    return Object.values(completion).filter(Boolean).join(' ') || (t.onRequest || 'On Request');
  };
  const completionDate = formatCompletionDate(property.completionDate);
  const developerCompanyName = property.developerDetails?.companyName || property.developerCompanyName || developerDoc?.companyName || property.developer?.companyName || property.companyName;
  const developerPersonName = property.developerName || property.developer_name || developerDoc?.name || property.developer?.name || (typeof property.developer === 'string' ? property.developer : null);
  const developerName = developerCompanyName || developerPersonName || (t.developer || 'Developer');
  const developerImageRaw = property.developerProfileImage || property.developerProfileImg || property.developerLogo || property.developerImage || property.developerPhoto || developerDoc?.logo || property.developer?.profileImage || property.developer?.profile_image || property.developer?.logo || property.developer?.image;
  const developerImage = toFullUrl(developerImageRaw);
  const developerDescription = developerDoc?.description || property.developerDescription || property.developer?.description || `${developerName} is the developer behind ${property.propertyName || property.projectName || 'this project'}.`;
  const developerWebsite = developerDoc?.websiteUrl || property.developerWebsite || property.developer?.websiteUrl;
  const developerContact = developerDoc?.primaryContactName || property.primaryContactName || property.developer?.primaryContactName || (developerPersonName && developerPersonName !== developerName ? developerPersonName : null);

  const creatorName = `${agentProfile?.firstName || agentProfile?.first_name || ''} ${agentProfile?.lastName || agentProfile?.last_name || ''}`.trim() || agentProfile?.companyName || agentProfile?.fullName || agentProfile?.name || 'Xoto GRID Advisor';
  const creatorRoleRaw = agentProfile?.title || agentProfile?.designation || agentProfile?.userType || agentProfile?.role?.name || agentProfile?.role || 'Advisor';
  const creatorTitle = (() => {
    const value = typeof creatorRoleRaw === 'string' ? creatorRoleRaw : 'Advisor';
    const normalized = value.toLowerCase().replace(/[_-]/g, ' ');
    if (normalized.includes('agent')) return t.propertyAgent || 'Property Agent';
    if (normalized.includes('advisor')) return t.portfolioAdvisor || 'Portfolio Advisor';
    if (normalized.includes('developer')) return t.developerRepresentative || 'Developer Representative';
    if (normalized.includes('referral')) return t.referralPartner || 'Referral Partner';
    return value.replace(/\b\w/g, c => c.toUpperCase());
  })();
  const creatorType = (() => {
    const normalized = String(creatorRoleRaw || agentProfile?.userType || '').toLowerCase().replace(/[_-]/g, ' ');
    if (normalized.includes('agent')) return t.agent || 'Agent';
    if (normalized.includes('advisor')) return t.advisor || 'Advisor';
    return creatorTitle;
  })();
  const creatorAgencyName = agentProfile?.agencyName || agentProfile?.agency_name || agentProfile?.agency?.companyName || agentProfile?.agency?.agency_name || agentProfile?.agency?.agencyName || agentProfile?.companyName;

  const preparedByLabel = (t.preparedBy || 'Prepared by {type}').replace('{type}', creatorType);

  const headerBrand = `
    <div class="header-brand">
      <div class="header-presenter">
        <span class="header-presenter-label">${escapeHtml(preparedByLabel)}</span>
        <span class="header-presenter-name">${escapeHtml(creatorName)}</span>
        ${creatorType === (t.agent || 'Agent') && creatorAgencyName ? `<span class="header-presenter-agency">${escapeHtml(creatorAgencyName)}</span>` : ''}
      </div>
      <img class="header-logo" src="${xotoLogoUrl}" alt="Xoto">
    </div>`;

  const displayValue = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return value.toLocaleDateString('en-AE');
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return Number(value).toLocaleString();
    if (Array.isArray(value)) {
      const rendered = value.map(item => {
        if (item && typeof item === 'object') return Object.entries(item).map(([k, v]) => { const shown = displayValue(v); return shown ? `${labelize(k)}: ${shown}` : null; }).filter(Boolean).join(', ');
        return displayValue(item);
      }).filter(Boolean);
      return rendered.length ? rendered.join(' | ') : null;
    }
    if (typeof value === 'object') {
      if (value.date) return displayValue(value.date);
      const rendered = Object.entries(value).map(([k, v]) => { const shown = displayValue(v); return shown ? `${labelize(k)}: ${shown}` : null; }).filter(Boolean);
      return rendered.length ? rendered.join(', ') : null;
    }
    return String(value);
  };

  const detailItems = [
    [t.projectName || 'Project Name', property.propertyName], [t.developer || 'Developer', developerName], [t.propertyType || 'Property Type', property.propertyType || property.type],
    [t.location || 'Location', loc], [t.area || 'Area', areaStr ? `${areaStr} ${areaUnit}` : property.areaSize], [t.floors || 'Floors', property.floors],
    [t.completion || 'Completion', completionDate], [t.handover || 'Handover', property.handoverDate || property.handover || property.completionStatus],
    [t.furnishing || 'Furnishing', property.furnishing || property.furnished], [t.parking || 'Parking', property.parking || property.parkingSpaces],
  ].filter(([, value]) => displayValue(value));

  const paymentPlan = (() => {
    const source = property.paymentPlan || property.payment_plan || property.paymentPlans || property.payment_plan_details;
    if (!source) return [];
    if (Array.isArray(source)) return source;
    if (typeof source === 'string') return source.trim() ? [{ milestone: t.paymentPlan || 'Payment Plan', description: source }] : [];
    if (typeof source === 'object') return Object.entries(source).map(([key, value]) => ({ milestone: labelize(key), description: displayValue(value) }));
    return [];
  })();
  const paymentPlanFallback = displayValue(property.paymentPlanText || property.payment || property.payment_plan_text || property.paymentDescription);
  const overviewStats = [
    [t.startingPrice || 'Starting Price', priceStr], [t.propertyType || 'Property Type', property.propertyType || property.type || (t.onRequest || 'On Request')],
    [t.developer || 'Developer', developerName], [t.timeline || 'Timeline', completionDate || (t.onRequest || 'On Request')],
  ];
  const paymentPlanRows = paymentPlan.length
    ? paymentPlan.slice(0, 6).map((item, index) => ({ label: displayValue(item.milestone || item.stage || item.title || `${t.unit || 'Stage'} ${index + 1}`) || `${t.unit || 'Stage'} ${index + 1}`, value: displayValue(item.percentage || item.amount || item.description || item.value || item) || (t.onRequest || 'On Request') }))
    : [
        { label: t.paymentPlan || 'Payment Plan', value: paymentPlanFallback || (t.flexiblePaymentTerms || 'Flexible payment terms available through the advisor.') },
        { label: t.startingPrice || 'Starting Price', value: priceStr },
        { label: t.completion || 'Completion', value: completionDate || (t.onRequest || 'On Request') },
        { label: t.reservation || 'Reservation', value: (t.contactAdvisorForBooking || 'Contact advisor for booking amount and next steps.') },
      ];
  const chunk = (items, size) => { const chunks = []; for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size)); return chunks; };

  const neededExtraKeys = ['developer', 'developerName', 'community', 'subCommunity', 'serviceCharge', 'service_charge', 'ownership', 'saleType', 'permitNumber', 'reraPermit', 'dldPermitNumber', 'referenceNumber'];
  const appendixItems = neededExtraKeys.map(key => {
    const translationKey = key === 'developerName' ? 'developerName' :
                           key === 'service_charge' ? 'serviceCharge' :
                           key === 'permitNumber' ? 'permitNumber' :
                           key === 'reraPermit' ? 'reraPermit' :
                           key === 'dldPermitNumber' ? 'dldPermitNumber' :
                           key === 'referenceNumber' ? 'referenceNumber' :
                           key;
    const label = t[translationKey] || labelize(key);
    return [label, displayValue(property?.[key])];
  }).filter(([, value]) => value);

  const buildInventoryRow = (rawUnit) => {
    const row = typeof rawUnit === 'string' ? { unitType: rawUnit } : (rawUnit || {});
    const type = row.bedroomType || row.unitType || row.type || row.configuration || row.name || (t.unit || 'Unit');
    const rowAreaUnit = row.areaUnit || areaUnit;
    const rowArea = Number(row.area || row.builtUpArea || row.sqft || row.areaFrom || row.size || 0);
    const rowCurrency = row.currency || currency;
    const rowPrice = Number(row.price || row.startingPrice || row.priceFrom || row.amount || 0);
    const status = row.status || row.availability || 'Available';
    return { unitLabel: row.unitNumber || row.unit_no || row.unit || row.buildingName || (t.unit || 'Inventory'), type: displayValue(type), area: rowArea > 0 ? `${displayValue(rowArea)} ${lang === 'English' ? rowAreaUnit : (t.sqft || rowAreaUnit)}` : (t.onRequest || 'On Request'), areaValue: rowArea, areaUnit: rowAreaUnit, price: rowPrice > 0 ? `${rowCurrency} ${rowPrice.toLocaleString()}` : priceStr, priceValue: rowPrice, currency: rowCurrency, status: labelize(displayValue(status)) };
  };

  const inventoryDisplayRows = (() => {
    const rows = inventoryRows.map(buildInventoryRow);
    if (rows.length <= 8) return rows;
    const grouped = new Map();
    rows.forEach((row) => {
      const key = `${row.type}|${row.status}|${row.currency}|${row.areaUnit}`;
      const existing = grouped.get(key) || { unitLabel: '', type: row.type, status: row.status, currency: row.currency, areaUnit: row.areaUnit, count: 0, minArea: null, maxArea: null, minPrice: null, maxPrice: null };
      existing.count += 1;
      if (row.areaValue > 0) { existing.minArea = existing.minArea === null ? row.areaValue : Math.min(existing.minArea, row.areaValue); existing.maxArea = existing.maxArea === null ? row.areaValue : Math.max(existing.maxArea, row.areaValue); }
      if (row.priceValue > 0) { existing.minPrice = existing.minPrice === null ? row.priceValue : Math.min(existing.minPrice, row.priceValue); existing.maxPrice = existing.maxPrice === null ? row.priceValue : Math.max(existing.maxPrice, row.priceValue); }
      grouped.set(key, existing);
    });
    return [...grouped.values()].sort((a, b) => a.type.localeCompare(b.type) || a.status.localeCompare(b.status)).slice(0, 10).map((row) => {
      const area = row.minArea ? `${row.minArea.toLocaleString()}${row.maxArea && row.maxArea !== row.minArea ? ` - ${row.maxArea.toLocaleString()}` : ''} ${lang === 'English' ? row.areaUnit : (t.sqft || row.areaUnit)}` : (t.onRequest || 'On Request');
      const price = row.minPrice ? `${row.currency} ${row.minPrice.toLocaleString()}${row.maxPrice && row.maxPrice !== row.minPrice ? ` - ${row.maxPrice.toLocaleString()}` : ''}` : priceStr;
      return { unitLabel: `${row.count} ${t.unit || 'unit'}${row.count > 1 ? 's' : ''}`, type: row.type, area, price, status: row.status };
    });
  })();

  const gallerySlides = (photos.length ? chunk(photos, 5) : [[]]).map((items, index) => `
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">${escapeHtml(t.visualPerspective || 'Visual Perspective')}</h2>
                ${headerBrand}
            </div>
            <div class="content-area">
                ${items.length ? `
                <div class="gallery-grid">
                    <div class="g-img g-main"><img src="${items[0]}"></div>
                    ${items.slice(1, 5).map(p => `<div class="g-img"><img src="${p}"></div>`).join('')}
                </div>` : `<div class="narrative-panel">${escapeHtml(t.imagesUnavailable || 'Property images are currently unavailable.')}</div>`}
            </div>
            <div class="footer-strip">
                <span class="footer-brand">${escapeHtml(t.propertyGallery || 'Property Gallery')} ${index + 1}</span>
                <span class="footer-page">${String(3 + index).padStart(2, '0')}</span>
            </div>
        </div>
    </section>
  `).join('');

  const inventorySlides = `
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">${escapeHtml(t.inventoryStatus || 'Inventory Status')}</h2>
                ${headerBrand}
            </div>
            <div class="content-area">
                <table class="ppt-table inventory-table">
                    <thead><tr><th>${escapeHtml(t.unit || 'Unit')}</th><th>${escapeHtml(t.propertyType || 'Type')}</th><th>${escapeHtml(t.area || 'Area')}</th><th>${escapeHtml(t.pricing || 'Pricing')}</th><th>${escapeHtml(t.status || 'Status')}</th></tr></thead>
                    <tbody>
                        ${inventoryDisplayRows.length ? inventoryDisplayRows.map((row) => `
                            <tr>
                                <td>${escapeHtml(displayValue(row.unitLabel))}</td>
                                <td>${escapeHtml(displayValue(row.type))}</td>
                                <td>${escapeHtml(row.area)}</td>
                                <td class="price-text">${escapeHtml(row.price)}</td>
                                <td style="color: #22c55e; font-weight: 700;">${escapeHtml(row.status)}</td>
                            </tr>
                        `).join('') : `<tr><td colspan="5" style="text-align:center; padding: 40px; color: var(--muted)">${escapeHtml(t.noInventoryFound || 'No inventory rows found.')}</td></tr>`}
                    </tbody>
                </table>
            </div>
            <div class="footer-strip">
                <span class="footer-brand">${escapeHtml(t.financialInventory || 'Financial Inventory')}${inventoryRows.length > 8 ? ` • ${inventoryRows.length} units summarized` : ''}</span>
                <span class="footer-page">${String(3 + Math.max(photos.length ? Math.ceil(photos.length / 5) : 1, 1)).padStart(2, '0')}</span>
            </div>
        </div>
    </section>
  `;

  const appendixSlides = chunk(appendixItems, 12).map((items, index) => `
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">${escapeHtml(t.additionalDetails || 'Additional Details')}</h2>
                ${headerBrand}
            </div>
            <div class="content-area">
                <table class="data-table">
                    <tbody>${items.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody>
                </table>
            </div>
            <div class="footer-strip">
                <span class="footer-brand">${escapeHtml(t.relevantPropertyDetails || 'Relevant Property Details')}</span>
                <span class="footer-page">${String(8 + index).padStart(2, '0')}</span>
            </div>
        </div>
    </section>
  `).join('');

  const developerSlide = `
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">${escapeHtml(t.developerProfile || 'Developer Profile')}</h2>
                ${headerBrand}
            </div>
            <div class="content-area">
                <div class="developer-profile-layout">
                    <div class="developer-card developer-card-large">
                        ${developerImage ? `<img class="developer-logo developer-logo-large" src="${developerImage}">` : `<div class="developer-fallback developer-fallback-large">${escapeHtml(String(developerName || 'D')[0].toUpperCase())}</div>`}
                        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 3px; color: var(--accent); font-weight: 800; margin-bottom: 10px;">${escapeHtml(t.developer || 'Developer')}</div>
                        <div class="developer-name">${escapeHtml(developerName)}</div>
                    </div>
                    <div class="narrative-panel">
                        <div class="info-label">${escapeHtml(t.project || 'Project')}</div>
                        <div class="info-value" style="font-size: 30px; font-family: 'Cormorant Garamond', serif; color: var(--primary); margin-bottom: 24px;">${escapeHtml(property.propertyName || 'Property')}</div>
                        <div class="info-label">${escapeHtml(t.company || 'Company')}</div>
                        <div style="margin-bottom: 22px;">${escapeHtml(developerName)}</div>
                        ${developerContact ? `<div class="info-label">${escapeHtml(t.primaryContact || 'Primary Contact')}</div><div style="margin-bottom: 22px;">${escapeHtml(developerContact)}</div>` : ''}
                        <div class="info-label">${escapeHtml(t.location || 'Location')}</div>
                        <div style="margin-bottom: 22px;">${escapeHtml(loc || (t.onRequest || 'Location on request'))}</div>
                        <div class="info-label">${escapeHtml(t.completion || 'Completion')}</div>
                        <div style="margin-bottom: 22px;">${escapeHtml(completionDate)}</div>
                        ${developerWebsite ? `<div class="info-label">${escapeHtml(t.website || 'Website')}</div><div>${escapeHtml(developerWebsite)}</div>` : ''}
                        <div style="margin-top: 24px; font-size: 15px; line-height: 1.65;">${escapeHtml(developerDescription)}</div>
                    </div>
                </div>
            </div>
            <div class="footer-strip">
                <span class="footer-brand">${escapeHtml(t.developerInformation || 'Developer Information')}</span>
                <span class="footer-page">DEV</span>
            </div>
        </div>
    </section>
  `;

  // ── THE FULL HTML WITH MOBILE RESPONSIVE CSS ──
  return `<!DOCTYPE html>
<html lang="${langCode}" dir="${isRTL ? 'rtl' : 'ltr'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>${property.propertyName || 'Property'} — Xoto GRID</title>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,400&family=Plus+Jakarta+Sans:wght@200;300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        :root {
          --primary: #4A027C; --accent: #C5A059; --text: #17131f;
          --muted: #667085; --bg: #0c011a; --paper: #fbfaf8; --line: #e8e2d8;
          --slide-w: 1280; --slide-h: 720;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        html, body {
          width: 100%; height: 100%;
          font-family: 'Plus Jakarta Sans', sans-serif;
          background-color: var(--bg);
          overflow: hidden;
          touch-action: pan-y;
        }

        /* ── DECK WRAPPER ── */
        #deck-container {
          width: 100vw; height: 100vh;
          position: relative; overflow: hidden;
          display: flex; align-items: center; justify-content: center;
        }

        /* ── SLIDE ── */
        .slide {
          position: absolute; top: 0; left: 0;
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          opacity: 0; visibility: hidden;
          transition: opacity 0.7s ease, transform 0.7s ease;
          transform: scale(1.02);
          z-index: 1;
        }
        .slide.active {
          opacity: 1; visibility: visible;
          transform: scale(1); z-index: 10;
        }

        /* ── SLIDE INNER — scales to fit any screen ── */
        .slide-inner {
          width: 1280px; height: 720px;
          position: relative;
          display: flex; flex-direction: column;
          background:
            radial-gradient(circle at 6% 8%, rgba(197,160,89,0.10), transparent 24%),
            linear-gradient(135deg, #ffffff 0%, var(--paper) 100%);
          overflow: hidden;
          transform-origin: center center;
        }

        /* ── HEADER ── */
        .slide-header {
          min-height: 92px; padding: 22px 80px;
          display: flex; justify-content: space-between; align-items: center;
          gap: 30px; z-index: 10; position: relative;
          background: linear-gradient(90deg, var(--primary), #26003f);
          box-shadow: 0 16px 38px rgba(74,2,124,0.18); flex-shrink: 0;
        }
        .slide-header::after {
          content: ''; position: absolute; left: 80px; right: 80px; bottom: 0;
          height: 2px; background: linear-gradient(90deg, var(--accent), rgba(197,160,89,0.18));
        }
        .slide-title { font-family: 'Cormorant Garamond', serif; font-size: 42px; font-weight: 300; color: white; letter-spacing: 0; line-height: 1; }
        .slide-title em { font-style: italic; color: var(--accent); }
        .header-brand { display: flex; align-items: center; justify-content: flex-end; gap: 24px; min-width: 430px; max-width: 560px; }
        .header-presenter { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; min-width: 0; color: white; text-align: right; }
        .header-presenter-label { font-size: 9px; line-height: 1; font-weight: 800; letter-spacing: 1.7px; text-transform: uppercase; color: rgba(255,255,255,0.58); }
        .header-presenter-name { font-size: 14px; line-height: 1.15; font-weight: 800; color: #fff; max-width: 300px; overflow-wrap: anywhere; }
        .header-presenter-agency { font-size: 10px; line-height: 1.15; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--accent); max-width: 300px; overflow-wrap: anywhere; }
        .header-logo { height: 38px; max-width: 190px; object-fit: contain; opacity: 1; flex-shrink: 0; }

        .content-area { flex-grow: 1; padding: 34px 80px 100px; display: flex; flex-direction: column; justify-content: center; width: 100%; z-index: 5; overflow: hidden; }
        .footer-strip { position: absolute; bottom: 0; left: 0; width: 100%; padding: 22px 80px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--line); background: rgba(255,255,255,0.84); z-index: 10; }
        .footer-brand { font-size: 11px; letter-spacing: 3px; font-weight: 800; color: var(--primary); text-transform: uppercase; }
        .footer-page { font-size: 11px; font-weight: 600; color: var(--muted); }

        /* ── NAVIGATION CONTROLS ── */
        .controls {
          position: fixed; bottom: 24px; right: 24px;
          display: flex; gap: 12px; z-index: 1000;
        }
        .nav-btn {
          background: rgba(255,255,255,0.15); backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.2); color: white;
          width: 48px; height: 48px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.3s; font-size: 16px;
          appearance: none; -webkit-appearance: none;
        }
        .nav-btn:hover { background: var(--accent); color: var(--primary); }

        /* ── SLIDE DOTS ── */
        #slide-counter {
          position: fixed; bottom: 36px; left: 50%;
          transform: translateX(-50%);
          display: flex; gap: 8px; z-index: 1000;
        }
        .dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: rgba(255,255,255,0.3); cursor: pointer; transition: all 0.3s;
        }
        .dot:hover, .dot.active {
          background: var(--accent); transform: scale(1.3);
        }

        #play-status {
          position: fixed; top: 24px; left: 24px;
          background: rgba(0,0,0,0.6); color: white;
          padding: 8px 16px; border-radius: 20px; font-size: 11px;
          letter-spacing: 1px; text-transform: uppercase;
          display: none; z-index: 1000; font-weight: 800;
        }

        #hint-text {
          position: fixed; bottom: 60px; left: 50%;
          transform: translateX(-50%);
          color: rgba(255,255,255,0.4); font-size: 11px;
          letter-spacing: 1px; text-transform: uppercase;
          z-index: 1000; font-weight: 600; pointer-events: none;
          transition: opacity 0.5s;
        }

        /* ── TYPOGRAPHY & GENERAL LAYOUTS ── */
        .hero-title { font-family: 'Cormorant Garamond', serif; font-size: 64px; line-height: 1.05; color: white; font-weight: 300; margin-bottom: 24px; }
        .hero-title em { font-style: italic; font-weight: 400; color: var(--accent); }
        .hero-subtitle { font-size: 18px; line-height: 1.7; color: rgba(255,255,255,0.7); max-width: 600px; font-weight: 300; margin-bottom: 30px; }
        .price-badge { display: inline-block; padding: 12px 24px; background: rgba(197,160,89,0.15); border: 1px solid var(--accent); color: var(--accent); font-weight: 800; font-size: 18px; letter-spacing: 1px; margin-bottom: 34px; }
        .cover-meta { display: flex; gap: 16px; flex-wrap: wrap; }
        .cover-chip { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 800; color: white; background: rgba(255,255,255,0.08); padding: 10px 20px; border-radius: 4px; }

        .narrative-panel { border-left: 5px solid var(--primary); background: rgba(255,255,255,0.9); padding: 30px; font-size: 18px; line-height: 1.7; color: var(--muted); font-weight: 300; }
        .data-table { width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; background: rgba(255,255,255,0.9); border: 1px solid var(--line); }
        .data-table th { width: 28%; text-align: left; padding: 13px 16px; font-size: 10px; text-transform: uppercase; letter-spacing: 1.3px; color: var(--primary); border-bottom: 1px solid var(--line); vertical-align: top; background: #f7f3ee; }
        .data-table td { padding: 13px 16px; font-size: 13px; line-height: 1.45; color: var(--text); border-bottom: 1px solid var(--line); overflow-wrap: anywhere; vertical-align: top; }
        .payment-panel { height: 100%; min-height: 390px; background: rgba(255,255,255,0.92); border: 1px solid var(--line); border-top: 5px solid var(--accent); padding: 28px; display: flex; flex-direction: column; justify-content: space-between; gap: 18px; }
        .payment-panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
        .payment-kicker { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; font-weight: 900; color: var(--accent); margin-bottom: 8px; }
        .payment-title { font-family: 'Cormorant Garamond', serif; font-size: 34px; line-height: 1; color: var(--primary); font-weight: 400; }
        .payment-badge { border: 1px solid rgba(74,2,124,0.16); color: var(--primary); padding: 10px 14px; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; white-space: nowrap; }
        .payment-list { display: grid; gap: 12px; }
        .payment-row { display: grid; grid-template-columns: 130px 1fr; gap: 16px; align-items: center; padding: 14px 16px; background: #fbfaf8; border: 1px solid rgba(74,2,124,0.08); }
        .payment-row-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 900; color: var(--muted); }
        .payment-row-value { font-size: 14px; font-weight: 700; color: var(--primary); }
        .payment-note { font-size: 9px; line-height: 1.4; color: var(--muted); font-style: italic; }

        /* ── COVER TEMPLATE SPECIFICS ── */
        .cover-layout { width: 100%; height: 100%; position: relative; display: flex; align-items: center; padding: 0 100px; }
        .cover-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1; }
        .cover-bg-fallback { background: linear-gradient(135deg, #1b0132 0%, #08000f 100%); }
        .cover-scrim { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(90deg, rgba(12,1,26,0.96) 30%, rgba(12,1,26,0.7) 65%, rgba(12,1,26,0.2) 100%); z-index: 2; }
        .cover-accent-line { position: absolute; left: 0; top: 0; bottom: 0; width: 10px; background: var(--accent); z-index: 3; }
        .cover-text { position: relative; z-index: 3; display: flex; flex-direction: column; justify-content: space-between; height: 100%; padding: 80px 0; width: 100%; }
        .cover-logo { height: 46px; max-width: 220px; object-fit: contain; margin-bottom: 12px; }
        .cover-developer { font-size: 10px; text-transform: uppercase; letter-spacing: 3px; font-weight: 900; color: var(--accent); padding-left: 2px; }
        .exclusive-tag { font-size: 10px; text-transform: uppercase; letter-spacing: 4px; color: var(--accent); font-weight: 900; margin-bottom: 20px; }

        /* ── SPEC GRID ── */
        .specs-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
        .spec-item { padding: 24px 28px; background: rgba(255,255,255,0.85); border: 1px solid var(--line); border-bottom: 4px solid var(--primary); display: flex; flex-direction: column; gap: 8px; }
        .spec-val { font-family: 'Cormorant Garamond', serif; font-size: 32px; color: var(--primary); line-height: 1.1; font-weight: 400; }
        .spec-lab { font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 2px; }

        /* ── GALLERY GRID ── */
        .gallery-grid { display: grid; grid-template-columns: 2fr repeat(2, 1fr); grid-template-rows: repeat(2, 1fr); gap: 16px; height: 420px; }
        .g-img { position: relative; overflow: hidden; border: 1px solid var(--line); }
        .g-img img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.8s; }
        .g-img:hover img { transform: scale(1.06); }
        .g-main { grid-row: span 2; }

        /* ── TABLE STYLING ── */
        .ppt-table { width: 100%; border-collapse: separate; border-spacing: 0; background: rgba(255,255,255,0.9); border: 1px solid var(--line); }
        .ppt-table th { background: var(--primary); color: white; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 800; padding: 16px 20px; text-align: left; }
        .ppt-table td { padding: 16px 20px; border-bottom: 1px solid var(--line); font-size: 13px; color: var(--text); }
        .ppt-table tr:last-child td { border-bottom: none; }
        .price-text { font-weight: 800; color: var(--primary); }

        /* ── DETAILS GRID ── */
        .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px 48px; }
        .info-item { display: flex; flex-direction: column; gap: 6px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
        .info-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 1.5px; font-weight: 800; margin-bottom: 10px; }
        .info-value { font-size: 15px; font-weight: 600; color: var(--primary); }

        /* ── CHIP GRID ── */
        .chip-grid { display: flex; flex-wrap: wrap; gap: 14px; max-height: 400px; overflow-y: auto; padding-right: 10px; }
        .data-chip { background: white; border: 1px solid var(--line); padding: 14px 28px; border-radius: 4px; font-size: 12px; font-weight: 600; color: var(--primary); text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 10px rgba(0,0,0,0.02); }

        /* ── TWO COLUMN LOCATION/PAYMENT ── */
        .two-column { display: grid; grid-template-columns: 1.1fr 1fr; gap: 48px; align-items: start; }

        /* ── DEVELOPER SLIDE SPECIFICS ── */
        .developer-profile-layout { display: grid; grid-template-columns: 320px 1fr; gap: 48px; align-items: start; }
        .developer-card { background: white; border: 1px solid var(--line); border-top: 5px solid var(--accent); padding: 40px 30px; display: flex; flex-direction: column; align-items: center; text-align: center; }
        .developer-logo { max-width: 160px; max-height: 80px; object-fit: contain; margin-bottom: 24px; }
        .developer-fallback { width: 80px; height: 80px; border-radius: 50%; background: #f7f3ee; color: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 700; font-family: 'Cormorant Garamond', serif; border: 1px solid var(--line); margin-bottom: 24px; }
        .developer-name { font-family: 'Cormorant Garamond', serif; font-size: 28px; font-weight: 400; color: var(--primary); line-height: 1.2; }

        /* ── AGENT CARD ── */
        .agent-card { background: white; border: 1px solid var(--line); border-left: 6px solid var(--accent); padding: 40px; display: flex; gap: 40px; align-items: center; max-width: 800px; box-shadow: 0 10px 30px rgba(0,0,0,0.03); }
        .agent-avatar { width: 90px; height: 90px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 36px; font-weight: 700; font-family: 'Cormorant Garamond', serif; border: 2px solid var(--accent); flex-shrink: 0; }
        .agent-details { display: flex; flex-direction: column; justify-content: center; }

        /* ── FALLBACK FOR MISSING IMAGES ── */
        .image-missing { background: #f2ede4 !important; position: relative; }
        .image-missing::after { content: '✦'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 24px; color: var(--accent); }

        /* ── RTL LANGUAGE STYLING (Arabic, Urdu, Persian) ── */
        ${isRTL ? `
        body, html, .slide-inner {
          direction: rtl;
          text-align: right;
        }
        .slide-header, .footer-strip, .developer-profile-layout, .info-grid, .two-column, .payment-panel-head {
          direction: rtl;
        }
        .slide-title, .header-presenter, .footer-brand, .developer-name, .info-label, .payment-title {
          text-align: right;
        }
        .header-brand {
          flex-direction: row-reverse;
        }
        .header-presenter {
          align-items: flex-start;
          text-align: left;
        }
        .specs-grid, .info-grid, .payment-list {
          direction: rtl;
        }
        .spec-item, .info-item, .payment-row {
          text-align: right;
        }
        .payment-row {
          grid-template-columns: 1fr 130px;
        }
        .payment-row-label {
          order: 2;
          text-align: right;
        }
        .payment-row-value {
          order: 1;
          text-align: left;
        }
        .agent-card {
          flex-direction: row-reverse;
          text-align: right;
        }
        .agent-details {
          text-align: right;
        }
        .ppt-table th {
          text-align: right;
        }
        .data-table th {
          text-align: right;
        }
        ` : ''}

        /* ── MOBILE RESPONSIVE SCALING (Portrait & Small Screens) ── */
        @media (max-width: 1280px), (max-height: 720px) {
        }
    </style>
</head>
<body>

<div id="play-status">AUTO-PLAYING</div>
<div id="hint-text">Use Left/Right arrows or swipe to navigate</div>

<div class="controls">
    <button type="button" class="nav-btn" data-action="toggle-auto-play" title="Auto-Play"><i class="fa-solid fa-play"></i></button>
    <button type="button" class="nav-btn" data-action="prev-slide" title="Previous"><i class="fa-solid fa-chevron-left"></i></button>
    <button type="button" class="nav-btn" data-action="next-slide" title="Next"><i class="fa-solid fa-chevron-right"></i></button>
</div>

<div id="slide-counter"></div>

<div id="deck-container">

    <!-- SLIDE 1: COVER -->
    <section class="slide active">
        <div class="slide-inner" style="background: var(--primary);">
            <div class="cover-layout">
                ${photos[0] ? `<img class="cover-bg" src="${photos[0]}" alt="">` : '<div class="cover-bg cover-bg-fallback" style="position:absolute;inset:0"></div>'}
                <div class="cover-scrim"></div>
                <div class="cover-accent-line"></div>
                <div class="cover-text">
                    <div class="cover-top">
                        <img class="cover-logo" src="${xotoLogoUrl}">
                        <div class="cover-developer">${escapeHtml(developerName)}</div>
                    </div>
                    <div>
                        <div class="exclusive-tag">${escapeHtml(t.curatedPropertyBrief || 'Curated Property Brief')}</div>
                        <h1 class="hero-title">${escapeHtml(property.propertyName || property.projectName || 'Property')}<br><em>${escapeHtml(t.presentation || 'Presentation')}</em></h1>
                        <p class="hero-subtitle">${escapeHtml(narrative.propertyOverview || property.overview || `${loc || 'Prime location'} property opportunity curated for your client.`)}</p>
                        <div class="price-badge">${priceStr}</div>
                        <div class="cover-meta">
                            ${loc ? `<span class="cover-chip"><i class="fa-solid fa-location-dot" style="color:var(--accent)"></i> ${escapeHtml(loc)}</span>` : ''}
                            ${property.propertyType ? `<span class="cover-chip">${escapeHtml(property.propertyType)}</span>` : ''}
                            ${completionDate ? `<span class="cover-chip">${escapeHtml(t.completion || 'Completion')} ${escapeHtml(completionDate)}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>
            <div class="footer-strip" style="background:transparent;border:none;">
                <span class="footer-brand" style="color:rgba(255,255,255,0.4)">${escapeHtml(t.luxuryPortfolio || 'Xoto GRID Luxury Portfolio')}</span>
                <span class="footer-page" style="color:rgba(255,255,255,0.4)">01</span>
            </div>
        </div>
    </section>

    <!-- SLIDE 2: OVERVIEW -->
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">${escapeHtml(t.masterVision || 'The Master Vision')}</h2>
                ${headerBrand}
            </div>
            <div class="content-area">
                <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:80px;align-items:center;">
                    <div>
                        <div style="height:1px;width:80px;background:var(--accent);margin-bottom:30px;"></div>
                        <p style="font-size:20px;line-height:1.8;color:var(--muted);font-weight:300;">${narrative.propertyOverview || ''}</p>
                        <div style="margin-top:40px;display:flex;flex-wrap:wrap;gap:10px;">
                            ${amenitiesList.slice(0, 4).map(a => `<span style="border:1px solid var(--accent);color:var(--primary);padding:8px 20px;border-radius:100px;font-size:11px;font-weight:700;text-transform:uppercase;">✦ ${escapeHtml(a)}</span>`).join('')}
                        </div>
                    </div>
                    <div class="specs-grid">
                        ${overviewStats.map(([label, value]) => `
                            <div class="spec-item">
                                <div class="spec-val">${escapeHtml(displayValue(value) || (t.onRequest || 'On Request'))}</div>
                                <div class="spec-lab">${escapeHtml(label)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="footer-strip"><span class="footer-brand">${escapeHtml(t.executiveOverview || 'Executive Overview')}</span><span class="footer-page">02</span></div>
        </div>
    </section>

    ${gallerySlides}
    ${inventorySlides}

    <!-- SLIDE: PROPERTY DETAILS -->
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">${escapeHtml(t.propertyDetails || 'Property Details')}</h2>
                ${headerBrand}
            </div>
            <div class="content-area">
                <div class="info-grid">
                    ${detailItems.map(([label, value]) => `
                        <div class="info-item">
                            <div class="info-label">${escapeHtml(label)}</div>
                            <div class="info-value">${escapeHtml(displayValue(value))}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="footer-strip"><span class="footer-brand">${escapeHtml(t.projectSpecifications || 'Project Specifications')}</span><span class="footer-page">05</span></div>
        </div>
    </section>

    <!-- SLIDE: AMENITIES -->
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">${escapeHtml(t.amenitiesFacilities || 'Amenities & Facilities')}</h2>
                ${headerBrand}
            </div>
            <div class="content-area">
                <div class="chip-grid">
                    ${amenitiesList.length ? amenitiesList.map(a => `<span class="data-chip">${escapeHtml(a)}</span>`).join('') : `<span class="data-chip">${escapeHtml(t.contactAdvisorForAmenityDetails || 'Contact advisor for full amenity details')}</span>`}
                </div>
            </div>
            <div class="footer-strip"><span class="footer-brand">${escapeHtml(t.lifestyleFeatures || 'Lifestyle Features')}</span><span class="footer-page">06</span></div>
        </div>
    </section>

    <!-- SLIDE: LOCATION & PAYMENT -->
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">${escapeHtml(t.locationPlan || 'Location & Plan')}</h2>
                ${headerBrand}
            </div>
            <div class="content-area">
                <div class="two-column">
                    <div class="narrative-panel">
                        <div class="info-label">${escapeHtml(t.locationCommunity || 'Location & Community')}</div>
                        ${escapeHtml(narrative.locationCommunity || loc || (t.onRequest || 'Location details available on request.'))}
                        <div class="info-label" style="margin-top:24px;">${escapeHtml(t.investmentAngle || 'Investment Angle')}</div>
                        ${escapeHtml(narrative.investmentAngle || (t.onRequest || 'Investment details available on request.'))}
                    </div>
                    <div class="payment-panel">
                        <div class="payment-panel-head">
                            <div>
                                <div class="payment-kicker">${escapeHtml(t.commercialStructure || 'Commercial Structure')}</div>
                                <div class="payment-title">${escapeHtml(t.paymentPlan || 'Payment Plan')}</div>
                            </div>
                            <div class="payment-badge">${escapeHtml(currency)}</div>
                        </div>
                        <div class="payment-list">
                            ${paymentPlanRows.map(row => `
                                <div class="payment-row">
                                    <div class="payment-row-label">${escapeHtml(row.label)}</div>
                                    <div class="payment-row-value">${escapeHtml(row.value)}</div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="payment-note">${escapeHtml(t.paymentNote || 'Final instalments and payment milestones should be confirmed with the advisor before client commitment.')}</div>
                    </div>
                </div>
            </div>
            <div class="footer-strip"><span class="footer-brand">${escapeHtml(t.locationPaymentPlan || 'Location & Payment Plan')}</span><span class="footer-page">07</span></div>
        </div>
    </section>

    ${appendixSlides}
    ${developerSlide}

    <!-- SLIDE: CONTACT -->
    <section class="slide">
        <div class="slide-inner">
            <div class="slide-header">
                <h2 class="slide-title">${escapeHtml(t.nextSteps || 'Next Steps')}</h2>
                ${headerBrand}
            </div>
            <div class="content-area">
                <p style="font-size:20px;color:var(--muted);max-width:600px;margin-bottom:40px;font-weight:300;">${escapeHtml(t.contactSubtitle || 'Ready to secure your place in this landmark development?')}</p>
                <div class="agent-card">
                    <div class="agent-avatar">${(creatorName?.[0] || 'X').toUpperCase()}</div>
                    <div class="agent-details">
                        <div style="font-size:12px;text-transform:uppercase;letter-spacing:3px;color:var(--accent);font-weight:700;margin-bottom:5px;">${escapeHtml(creatorTitle)}</div>
                        <h3 style="font-family:'Cormorant Garamond',serif;font-size:42px;font-weight:400;color:var(--primary);">${escapeHtml(creatorName)}</h3>
                        ${creatorType === (t.agent || 'Agent') && creatorAgencyName ? `<div style="margin-top:8px;font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-weight:800;">${escapeHtml(t.agency || 'Agency')}: ${escapeHtml(creatorAgencyName)}</div>` : ''}
                        <div style="margin-top:25px;display:flex;gap:15px;flex-wrap:wrap;">
                            ${agentProfile?.phone ? `<span style="background:var(--primary);color:white;padding:12px 30px;border-radius:50px;font-size:12px;font-weight:700;">📞 ${escapeHtml(agentProfile.phone)}</span>` : ''}
                            <span style="background:#25D366;color:white;padding:12px 30px;border-radius:50px;font-size:12px;font-weight:700;">${escapeHtml(t.whatsapp || 'WhatsApp')}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="footer-strip" style="justify-content:center;border:none;">
                <img style="height:30px;opacity:0.2" src="${xotoLogoUrl}">
            </div>
        </div>
    </section>

</div>

<script>
    let currentIndex = 0;
    let autoPlayInterval = null;
    const slides = document.querySelectorAll('.slide');
    const playStatus = document.getElementById('play-status');
    const hintText = document.getElementById('hint-text');
    const counter = document.getElementById('slide-counter');

    slides.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = 'dot' + (i === 0 ? ' active' : '');
        dot.addEventListener('click', () => goTo(i));
        counter.appendChild(dot);
    });

    function scaleSlides() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const scaleX = vw / 1280;
        const scaleY = vh / 720;
        const scale = Math.min(scaleX, scaleY);
        document.querySelectorAll('.slide-inner').forEach(el => {
            el.style.transform       = 'scale(' + scale + ')';
            el.style.transformOrigin = 'top left';
            el.style.position        = 'absolute';
            el.style.top             = Math.max(0, (vh - 720 * scale) / 2) + 'px';
            el.style.left            = Math.max(0, (vw - 1280 * scale) / 2) + 'px';
            el.style.margin          = '0';
        });
    }

    scaleSlides();
    window.addEventListener('resize', scaleSlides);

    function updateUI() {
        slides.forEach((slide, i) => slide.classList.toggle('active', i === currentIndex));
        document.querySelectorAll('.dot').forEach((dot, i) => dot.classList.toggle('active', i === currentIndex));
        if (currentIndex > 0 && hintText) hintText.style.opacity = '0';
    }

    function goTo(index) {
        currentIndex = (index + slides.length) % slides.length;
        updateUI();
    }

    function nextSlide() { goTo(currentIndex + 1); }
    function prevSlide() { goTo(currentIndex - 1); }

    function toggleAutoPlay() {
        if (autoPlayInterval) {
            clearInterval(autoPlayInterval);
            autoPlayInterval = null;
            if (playStatus) playStatus.style.display = 'none';
            document.querySelector('[data-action="toggle-auto-play"] i').className = 'fa-solid fa-play';
        } else {
            autoPlayInterval = setInterval(nextSlide, 5000);
            if (playStatus) playStatus.style.display = 'block';
            document.querySelector('[data-action="toggle-auto-play"] i').className = 'fa-solid fa-pause';
            nextSlide();
        }
    }

    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            if (action === 'toggle-auto-play') toggleAutoPlay();
            if (action === 'prev-slide') prevSlide();
            if (action === 'next-slide') nextSlide();
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nextSlide(); }
        if (e.key === 'ArrowLeft') prevSlide();
        if (e.key === 'Escape' && autoPlayInterval) toggleAutoPlay();
    });

    let touchStartX = 0, touchStartY = 0;
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
            if (dx < 0) nextSlide(); else prevSlide();
        }
    }, { passive: true });

    document.querySelectorAll('img').forEach(img => {
        const markMissing = () => {
            img.style.display = 'none';
            const frame = img.closest('.g-img, .developer-card, .slide-header, .cover-top');
            if (frame) frame.classList.add('image-missing');
        };
        img.addEventListener('error', markMissing);
        if (img.complete && img.naturalWidth === 0) markMissing();
    });
</script>

</body>
</html>`;
};

// ── 3. Upload to S3 ──────────────────────────────────────────────────────────
const uploadToS3 = async (htmlContent, fileName) => {
  const key = `presentations/${fileName}.html`;
  await s3.send(new PutObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key, Body: htmlContent, ContentType: 'text/html' }));
  const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  return { key, url };
};

// ── 4. Save Presentation to DB ───────────────────────────────────────────────
const savePresentation = async ({ leadId, propertyId, agentId, settings, clientNotes, narrative, s3Key, s3Url, title }) => {
  const trackingToken = uuidv4();
  return await Presentation.create({ leadId, propertyId, agentId, settings, clientNotes, narrative, s3Key, s3Url, title, trackingToken, views: [], engagementScore: 0, status: 'active' });
};

const trackView = async (trackingToken, requestData) => {
  const axios = require('axios');
  const ua = requestData.userAgent || '';
  const device = /mobile/i.test(ua) ? 'Mobile' : /tablet/i.test(ua) ? 'Tablet' : 'Desktop';
  
  let country = 'Unknown';
  let ip = requestData.ip;
  if (ip && ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  
  if (ip && ip !== '::1' && ip !== '127.0.0.1' && ip !== 'localhost') {
    try {
      const geoRes = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 3000 });
      if (geoRes.data && geoRes.data.status === 'success') {
        country = geoRes.data.country || 'Unknown';
      }
    } catch (err) {
      console.error('[GeoIP Lookup Error]:', err.message);
    }
  }

  return await Presentation.findOneAndUpdate(
    { trackingToken },
    { 
      $push: { 
        views: { 
          timestamp: new Date(), 
          ip: requestData.ip, 
          device, 
          userAgent: ua,
          country: country 
        } 
      }, 
      $inc: { engagementScore: 15 } 
    },
    { new: true }
  );
};

// ── 6. Get Presentation Views ────────────────────────────────────────────────
const getPresentationViews = async (presentationId, agentId) => {
  return await Presentation.findOne({ _id: presentationId, agentId }).select('views engagementScore title trackingToken createdAt');
};

const getLeadPresentations = async (leadId, agentId) => {
  return await Presentation.find({ leadId, agentId })
    .sort({ createdAt: -1 })
    .select('title trackingToken views engagementScore status createdAt propertyId clientNotes settings')
    .lean();
};

module.exports = {
  generatePresentationNarrative,
  buildHtmlPresentation,
  uploadToS3,
  savePresentation,
  trackView,
  getPresentationViews,
  getLeadPresentations,
  generatePdfFromPresentation,
};
